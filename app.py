import asyncio
import hashlib
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import config
from database import init_db, get_top_songs, get_last_refresh
from scraper.aggregator import run_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def scheduled_refresh():
    """Background job that runs the scraping pipeline."""
    logger.info("Scheduled refresh starting...")
    try:
        count = await run_pipeline()
        logger.info(f"Scheduled refresh done. {count} songs updated.")
    except Exception as e:
        logger.error(f"Scheduled refresh failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialized")

    # Run initial fetch
    asyncio.create_task(scheduled_refresh())

    # Schedule periodic refresh
    scheduler.add_job(
        scheduled_refresh,
        "interval",
        hours=config.REFRESH_INTERVAL_HOURS,
        id="refresh_pipeline",
    )
    scheduler.start()
    logger.info(f"Scheduler started — refresh every {config.REFRESH_INTERVAL_HOURS}h")

    yield

    scheduler.shutdown()


app = FastAPI(title="TikTok Sport Edit Trends", lifespan=lifespan)

AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio_cache")
os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    songs = await get_top_songs(limit=config.TOP_N_SONGS)
    last_refresh_raw = await get_last_refresh()
    if last_refresh_raw:
        from datetime import datetime
        try:
            dt = datetime.fromisoformat(last_refresh_raw)
            last_refresh = dt.strftime("%H:%M")
        except Exception:
            last_refresh = last_refresh_raw
    else:
        last_refresh = None
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "songs": songs,
            "last_refresh": last_refresh,
        },
    )


@app.get("/api/songs")
async def api_songs(
    limit: int = Query(default=50, le=100),
    hashtag: str = Query(default=None),
):
    songs = await get_top_songs(limit=limit, hashtag_filter=hashtag)
    return {"songs": songs, "count": len(songs)}


@app.get("/api/search")
async def api_search(q: str = Query(...), limit: int = Query(default=20, le=50)):
    """Search songs via iTunes catalog (title/artist)."""
    import httpx
    from urllib.parse import quote

    if not q or len(q.strip()) < 2:
        return {"results": []}

    results = []
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                f"https://itunes.apple.com/search?term={quote(q.strip())}&media=music&limit={limit}&entity=song"
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("results", []):
                    title = item.get("trackName", "")
                    artist = item.get("artistName", "")
                    if title:
                        results.append({
                            "title": title,
                            "artist": artist,
                            "album": item.get("collectionName", ""),
                            "artworkUrl": "",
                            "duration": item.get("trackTimeMillis", 0) // 1000,
                            "source": "catalog",
                        })
    except Exception as e:
        logger.warning(f"iTunes search failed: {e}")
    return {"results": results}


@app.get("/api/lyrics")
async def api_lyrics(q: str = Query(...), limit: int = Query(default=20, le=50)):
    """Search songs by lyrics via Genius."""
    import httpx
    from urllib.parse import quote

    if not q or len(q.strip()) < 2:
        return {"results": []}

    results = []
    seen = set()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                f"https://genius.com/api/search/multi?q={quote(q.strip())}",
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": "https://genius.com/",
                }
            )
            if resp.status_code == 200:
                gdata = resp.json()
                sections = gdata.get("response", {}).get("sections", [])
                for section in sections:
                    if section.get("type") in ("song", "lyric"):
                        for hit in section.get("hits", []):
                            r = hit.get("result", {})
                            title = r.get("title", "")
                            artist = r.get("primary_artist", {}).get("name", "") or r.get("artist_names", "")
                            key = f"{title.lower()}_{artist.lower()}"
                            if key not in seen and title:
                                seen.add(key)
                                source = "lyrics" if section.get("type") == "lyric" else "title"
                                snippet = ""
                                highlights = hit.get("highlights", [])
                                for hl in highlights:
                                    val = hl.get("value") or ""
                                    if val:
                                        snippet = val.strip()
                                        break
                                if not snippet:
                                    snippet = r.get("lyrics_snippet", "")
                                results.append({
                                    "title": title,
                                    "artist": artist,
                                    "album": "",
                                    "artworkUrl": "",
                                    "duration": 0,
                                    "source": source,
                                    "snippet": snippet,
                                })
                            if len(results) >= limit:
                                break
    except Exception as e:
        logger.warning(f"Genius lyrics search failed: {e}")
    return {"results": results}


@app.get("/api/genre")
async def api_genre(genre: str = Query(...), limit: int = Query(default=50, le=100)):
    """Get top charts by genre via iTunes RSS feed."""
    import httpx

    if not genre or len(genre.strip()) < 2:
        return {"results": []}

    # iTunes genre IDs mapping
    genre_ids = {
        "hip-hop": 18, "trap": 18, "drill": 18,
        "r&b": 15, "soul": 15,
        "pop": 14,
        "rock": 21, "metal": 21,
        "electronic": 7, "house": 7, "ambient": 7,
        "latin": 12, "reggaeton": 12,
        "country": 6,
        "jazz": 11,
        "classical": 5,
        "dancehall": 24,
        "phonk": 18,
        "lo-fi": 7,
        "afrobeat": 15,
    }

    genre_id = genre_ids.get(genre.lower().strip(), 14)  # default to Pop

    results = []
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"https://itunes.apple.com/us/rss/topsongs/limit={limit}/genre={genre_id}/json"
            )
            if resp.status_code == 200:
                data = resp.json()
                entries = data.get("feed", {}).get("entry", [])
                for i, entry in enumerate(entries):
                    title = entry.get("im:name", {}).get("label", "")
                    artist = entry.get("im:artist", {}).get("label", "")
                    if title:
                        results.append({
                            "title": title,
                            "artist": artist,
                            "album": entry.get("im:collection", {}).get("im:name", {}).get("label", ""),
                            "artworkUrl": "",
                            "duration": 0,
                            "source": "chart",
                            "rank": i + 1,
                        })
    except Exception as e:
        logger.warning(f"Genre chart failed: {e}")
    return {"results": results}


def _clean_query(q: str) -> list[str]:
    """Return a list of search queries to try, from specific to broad."""
    import re
    # Remove parenthesized noise like (1034554), numbers, brackets
    clean = re.sub(r'\([^)]*\)', '', q)
    clean = re.sub(r'\[[^\]]*\]', '', clean)
    clean = re.sub(r'\b\d{4,}\b', '', clean)  # remove long numbers
    clean = ' '.join(clean.split()).strip()
    queries = [clean]
    # Also try just the first few words (title only, no artist clutter)
    words = clean.split()
    if len(words) > 3:
        queries.append(' '.join(words[:3]))
    return queries


def _yt_download(query: str):
    """Download full song from YouTube via yt-dlp. Tries multiple search variations."""
    from yt_dlp import YoutubeDL
    import re

    clean = re.sub(r'\([^)]*\)', '', query)
    clean = re.sub(r'\[[^\]]*\]', '', clean)
    clean = re.sub(r'\b\d{4,}\b', '', clean)
    clean = ' '.join(clean.split()).strip()
    file_key = hashlib.md5(clean.lower().encode()).hexdigest()
    out_path = os.path.join(AUDIO_DIR, file_key)

    # Return cached file if exists
    for ext in ['m4a', 'webm', 'mp4']:
        if os.path.exists(f"{out_path}.{ext}"):
            return {'key': file_key, 'ext': ext, 'file': f"{out_path}.{ext}"}

    # Build search variations: full query, title+artist, title only, with "audio"
    words = clean.split()
    search_queries = [clean]
    if len(words) > 2:
        search_queries.append(clean + " audio")
        search_queries.append(' '.join(words[:2]))
    if len(words) > 3:
        search_queries.append(' '.join(words[:3]) + " official audio")
    search_queries.append(clean + " lyrics")

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': 'bestaudio[ext=m4a]/bestaudio',
        'noplaylist': True,
        'default_search': 'ytsearch1',
        'outtmpl': out_path + '.%(ext)s',
    }

    for sq in search_queries:
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(sq, download=True)
                if info and 'entries' in info:
                    info = info['entries'][0] if info['entries'] else None
                if info:
                    ext = info.get('ext', 'm4a')
                    filepath = f"{out_path}.{ext}"
                    if os.path.exists(filepath):
                        return {
                            'key': file_key,
                            'ext': ext,
                            'file': filepath,
                            'title': info.get('title', ''),
                            'uploader': info.get('uploader', ''),
                            'thumbnail': info.get('thumbnail', ''),
                            'duration': info.get('duration', 0),
                        }
        except Exception as e:
            logger.warning(f"yt-dlp attempt failed for '{sq}': {e}")
            continue

    logger.warning(f"All search attempts failed for '{clean}'")
    return None


_audio_cache: dict = {}
_artwork_cache: dict = {}


@app.get("/api/artwork")
async def api_artwork(q: str = Query(...)):
    """Get album artwork URL from iTunes. Free, no API key."""
    import httpx
    from urllib.parse import quote

    cache_key = q.lower().strip()
    if cache_key in _artwork_cache:
        return _artwork_cache[cache_key]

    queries = _clean_query(q)
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            for query in queries:
                resp = await client.get(
                    f"https://itunes.apple.com/search?term={quote(query)}&media=music&limit=1"
                )
                data = resp.json()
                results = data.get("results", [])
                if results:
                    # Get higher res artwork (300x300 instead of 100x100)
                    art = results[0].get("artworkUrl100", "").replace("100x100", "300x300")
                    if art:
                        result = {"artworkUrl": art}
                        _artwork_cache[cache_key] = result
                        return result
    except Exception:
        pass
    return {"artworkUrl": ""}


@app.get("/api/preview")
async def api_preview(q: str = Query(...)):
    """Download the full song and return a local playable URL."""
    cache_key = q.lower().strip()
    if cache_key in _audio_cache:
        return _audio_cache[cache_key]

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _yt_download, q)
    if result and result.get('file') and os.path.exists(result['file']):
        data = {
            "previewUrl": f"/audio/{result['key']}.{result['ext']}",
            "trackName": result.get('title', ''),
            "artistName": result.get('uploader', ''),
            "artworkUrl": result.get('thumbnail', ''),
            "duration": result.get('duration', 0),
        }
        _audio_cache[cache_key] = data
        return data
    return {"previewUrl": ""}


@app.get("/api/download")
async def api_download(q: str = Query(...), filename: str = Query("song")):
    """Download the full song as M4A."""
    from fastapi.responses import FileResponse, JSONResponse

    safe_name = "".join(c for c in filename if c.isalnum() or c in " -_().").strip() or "song"

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _yt_download, q)
    if result and result.get('file') and os.path.exists(result['file']):
        ext = result.get('ext', 'm4a')
        return FileResponse(
            result['file'],
            media_type='audio/mp4',
            filename=f"{safe_name}.{ext}",
        )
    return JSONResponse({"error": "not found"}, status_code=404)


@app.post("/api/refresh")
async def api_refresh():
    asyncio.create_task(scheduled_refresh())
    return {"status": "refresh started"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=config.HOST, port=config.PORT, reload=False)
