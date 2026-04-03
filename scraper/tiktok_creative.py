import httpx
import asyncio
import json
import re
import logging

logger = logging.getLogger(__name__)

PAGE_URL_TEMPLATE = "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en?countryCode={country}&period={period}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Scrape multiple regions to get more sounds
REGIONS = ["US", "GB", "FR", "BR", "DE"]


def _parse_sound_from_page(sound: dict) -> dict:
    """Parse a sound from __NEXT_DATA__ format."""
    clip_id = str(sound.get("clipId", "") or sound.get("clip_id", ""))
    link = sound.get("link", "")
    if not link and clip_id:
        link = f"https://www.tiktok.com/music/-{clip_id}"

    # Determine trend direction from rankDiffType
    rank_diff_type = sound.get("rankDiffType", 0)
    if rank_diff_type == 4:
        trend = "new"
    elif rank_diff_type == 1:
        trend = "up"
    elif rank_diff_type == 2:
        trend = "down"
    else:
        trend = "stable"

    # Estimate usage from trend data (relative values)
    trend_data = sound.get("trend", [])
    latest_value = trend_data[-1].get("value", 0) if trend_data else 0
    rank = sound.get("rank", 99)

    return {
        "id": clip_id,
        "title": sound.get("title", "Unknown"),
        "artist": sound.get("author", "Unknown"),
        "cover_url": sound.get("cover", ""),
        "tiktok_url": link,
        "usage_count": int((1.0 / max(rank, 1)) * 10000 * max(latest_value, 0.1)),
        "trend_direction": trend,
    }


async def _scrape_page(client: httpx.AsyncClient, country: str = "US", period: int = 7) -> list[dict]:
    """Scrape __NEXT_DATA__ from the Creative Center page."""
    url = PAGE_URL_TEMPLATE.format(country=country, period=period)
    try:
        resp = await client.get(url, headers=HEADERS)
        resp.raise_for_status()

        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text, re.DOTALL)
        if not match:
            logger.warning(f"No __NEXT_DATA__ found for {country}")
            return []

        next_data = json.loads(match.group(1))
        props = next_data.get("props", {}).get("pageProps", {})
        data = props.get("data", {})
        sound_list = data.get("soundList", [])

        songs = [_parse_sound_from_page(s) for s in sound_list if s.get("clipId")]
        logger.info(f"Scraped {len(songs)} sounds from Creative Center ({country})")
        return songs

    except Exception as e:
        logger.error(f"Page scrape failed for {country}: {e}")
    return []


async def fetch_all_trending(period: int = 7, country_code: str = "FR", max_pages: int = 3) -> list[dict]:
    """Fetch trending sounds from multiple regions and periods via page scraping."""
    seen_ids = set()
    all_songs = []
    periods = [7, 30, 120]

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        regions = [country_code] + [r for r in REGIONS if r != country_code]

        for p in periods:
            for region in regions:
                songs = await _scrape_page(client, country=region, period=p)
                for song in songs:
                    if song["id"] and song["id"] not in seen_ids:
                        seen_ids.add(song["id"])
                        all_songs.append(song)
                await asyncio.sleep(0.3)

    logger.info(f"Fetched {len(all_songs)} unique trending sounds across {len(regions)} regions x {len(periods)} periods")
    return all_songs
