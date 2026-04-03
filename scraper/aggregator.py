import hashlib
import logging
import re
from scraper.tiktok_creative import fetch_all_trending
from scraper.youtube_source import fetch_sport_edit_songs
from scraper.seed_songs import get_seed_songs
from search.spotify import get_spotify_link
from search.youtube import get_youtube_link
from database import upsert_song
import config

logger = logging.getLogger(__name__)


async def run_pipeline():
    """Main pipeline: fetch trending sounds → find links → save."""
    logger.info("Starting pipeline...")

    all_songs = []
    seen_ids = set()

    # Source 1: TikTok Creative Center (top trending globally)
    trending = await fetch_all_trending(
        period=config.TIKTOK_PERIOD,
        country_code=config.TIKTOK_COUNTRY_CODE,
    )
    for song in trending:
        if song["id"] not in seen_ids:
            seen_ids.add(song["id"])
            song["hashtags"] = "trending"
            all_songs.append(song)
    logger.info(f"Source 1 (TikTok Creative Center): {len(trending)} sounds")

    # Source 2: YouTube compilations of sport edit songs
    yt_songs = await fetch_sport_edit_songs()
    seen_titles = set()
    for song in yt_songs:
        # Deduplicate by normalized title
        norm_title = re.sub(r'[^a-z0-9]', '', song['title'].lower())
        if norm_title in seen_titles or len(norm_title) < 3:
            continue
        seen_titles.add(norm_title)

        key = f"{song['title'].lower()}_{song['artist'].lower()}"
        song_id = hashlib.md5(key.encode()).hexdigest()[:16]
        if song_id not in seen_ids:
            seen_ids.add(song_id)
            all_songs.append({
                "id": song_id,
                "title": song["title"],
                "artist": song["artist"],
                "cover_url": "",
                "tiktok_url": "",
                "usage_count": 0,
                "trend_direction": "stable",
                "hashtags": "sportedit",
            })
    logger.info(f"Source 2 (YouTube compilations): {len(yt_songs)} songs")

    # Source 3: Curated seed list of popular sport edit songs
    seed_songs = get_seed_songs()
    seed_count = 0
    for song in seed_songs:
        norm_title = re.sub(r'[^a-z0-9]', '', song['title'].lower())
        if norm_title in seen_titles or len(norm_title) < 3:
            continue
        seen_titles.add(norm_title)

        key = f"{song['title'].lower()}_{song['artist'].lower()}"
        song_id = hashlib.md5(key.encode()).hexdigest()[:16]
        if song_id not in seen_ids:
            seen_ids.add(song_id)
            all_songs.append({
                "id": song_id,
                "title": song["title"],
                "artist": song["artist"],
                "cover_url": "",
                "tiktok_url": "",
                "usage_count": 0,
                "trend_direction": "stable",
                "hashtags": "sportedit",
            })
            seed_count += 1
    logger.info(f"Source 3 (Seed list): {seed_count} songs added")

    if not all_songs:
        logger.warning("No sounds fetched — pipeline aborted")
        return 0

    # Sort: TikTok trending first (by usage), then YouTube-sourced
    all_songs.sort(key=lambda s: s.get("usage_count", 0), reverse=True)
    all_songs = all_songs[:config.TOP_N_SONGS]

    # Find Spotify and YouTube links for all songs
    for song in all_songs:
        if song.get("title") and song["title"] != "Unknown":
            query = f"{song['title']} {song.get('artist', '')}".strip()
            if not song.get("spotify_url"):
                song["spotify_url"] = get_spotify_link(song["title"], song.get("artist", ""))
            if not song.get("youtube_url"):
                song["youtube_url"] = await get_youtube_link(query)

    # Save to database
    for song in all_songs:
        await upsert_song(song)

    logger.info(f"Pipeline complete. {len(all_songs)} songs saved.")
    return len(all_songs)
