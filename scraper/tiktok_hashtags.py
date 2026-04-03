import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)

HASHTAG_SOUNDS_URL = "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/sound"
HASHTAG_LIST_URL = "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
    "Origin": "https://ads.tiktok.com",
}


async def fetch_sounds_for_hashtag(hashtag: str, country_code: str = "FR") -> list[dict]:
    """Fetch sounds associated with a specific hashtag via Creative Center."""
    params = {
        "keyword": hashtag,
        "period": 7,
        "page": 1,
        "limit": 30,
        "country_code": country_code,
        "sort_by": "popular",
    }

    sounds = []
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(HASHTAG_SOUNDS_URL, params=params, headers=HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                sound_list = data.get("data", {}).get("sound_list", [])
                for sound in sound_list:
                    sounds.append({
                        "id": str(sound.get("clip_id", "")),
                        "title": sound.get("title", ""),
                        "artist": sound.get("author", ""),
                        "hashtag": hashtag,
                    })
    except Exception as e:
        logger.warning(f"Error fetching sounds for #{hashtag}: {e}")

    return sounds


async def get_sport_sound_ids(hashtags: list[str], country_code: str = "FR") -> dict[str, set[str]]:
    """Get sound IDs associated with sport edit hashtags.
    Returns a dict mapping sound_id -> set of matching hashtags.
    """
    sound_hashtags: dict[str, set[str]] = {}

    for hashtag in hashtags:
        sounds = await fetch_sounds_for_hashtag(hashtag, country_code)
        for sound in sounds:
            sid = sound["id"]
            if sid not in sound_hashtags:
                sound_hashtags[sid] = set()
            sound_hashtags[sid].add(hashtag)
        await asyncio.sleep(0.5)

    logger.info(f"Found {len(sound_hashtags)} unique sounds across {len(hashtags)} sport hashtags")
    return sound_hashtags
