import re
import logging
from youtubesearchpython import VideosSearch, Video

logger = logging.getLogger(__name__)

# Search queries to find compilation videos of sport edit songs
SEARCH_QUERIES = [
    "best tiktok sport edit songs 2025 2026",
    "tiktok football edit songs playlist",
    "viral tiktok sport edit music",
    "tiktok basketball edit songs",
    "tiktok mma ufc edit music",
    "sport edit song compilation tiktok",
    "tiktok edits songs trending sport",
    "sport edit phonk songs compilation",
    "best phonk songs for edits 2025",
    "tiktok edit songs list with names",
    "top 50 sport edit songs tiktok",
    "football edit music compilation with song names",
    "basketball edit songs with names 2025",
    "sport edit song names in description",
    "tiktok sport edits playlist 2024 2025",
    "best songs for football edits tiktok",
    "viral sport edit music with names",
    "tiktok gym edit songs compilation",
    "boxing edit songs tiktok 2025",
    "f1 edit songs compilation tiktok",
    "rugby edit songs tiktok",
    "tennis edit songs viral tiktok",
    "sport motivation edit songs tiktok",
    "best edit songs for sports 2025 with names",
    "tiktok soccer edit music playlist",
]


def _clean_text(text: str) -> str:
    """Remove @handles, timestamps, and other noise from text."""
    text = re.sub(r'@\S+', '', text).strip()
    text = re.sub(r'^\d{1,2}:\d{2}(?::\d{2})?\s*', '', text).strip()
    text = re.sub(r'\s*\d{1,2}:\d{2}(?::\d{2})?\s*$', '', text).strip()
    text = re.sub(r'[#]\S+', '', text).strip()
    return text


def _is_valid_song_part(text: str) -> bool:
    """Check if text looks like a valid song title or artist name."""
    if not text or len(text) < 2 or len(text) > 60:
        return False
    # Reject if it's just numbers/timestamps
    if re.match(r'^[\d:.\s]+$', text):
        return False
    # Reject if it starts with common non-song patterns
    skip_starts = ["end", "intro", "outro", "pt.", "part", "vol", "#", "song:", "video"]
    if any(text.lower().startswith(s) for s in skip_starts):
        return False
    # Reject video-related content (need 2+ matches to reject)
    video_words = [
        "edit", "edits", "goals", "skills", "fails", "best", "compilation",
        "hour", "football", "basketball", "soccer", "nba", "ufc",
        "mma", "tiktok", "viral", "trending", "highlights",
    ]
    text_lower = text.lower()
    if sum(1 for w in video_words if w in text_lower) >= 2:
        return False
    # Always reject tool/platform names
    reject_exact = ["soundcloud", "kinemaster", "capcut", "the art of"]
    if any(w in text_lower for w in reject_exact):
        return False
    # Reject if contains special unicode formatting
    if any(ord(c) > 0xFF00 for c in text):
        return False
    # Reject common non-latin fancy text
    if re.search(r'[𝐀-𝐳𝑨-𝒛]', text):
        return False
    return True


def _extract_songs_from_description(description: str) -> list[dict]:
    """Extract song titles from video descriptions that list songs."""
    songs = []
    lines = description.split("\n")

    for line in lines:
        line = line.strip()
        if not line or len(line) < 5 or len(line) > 150:
            continue

        # Skip non-song lines
        skip_keywords = [
            "subscribe", "follow", "instagram", "like", "comment",
            "http", "www.", "tiktok.com", "copyright", "disclaimer",
            "credit", "check out", "download", "link in", "turn on",
            "notification", "enjoy", "playlist", "compilation",
        ]
        if any(kw in line.lower() for kw in skip_keywords):
            continue

        # Remove timestamps at start: "00:00", "1:23:45"
        cleaned = re.sub(r'^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*', '', line).strip()

        # Remove numbering: "1.", "1)", "01."
        cleaned = re.sub(r'^\d+[\.\)]\s*', '', cleaned).strip()

        # Remove bullet points
        cleaned = re.sub(r'^[•\-\*\~]\s*', '', cleaned).strip()

        if not cleaned or len(cleaned) < 5:
            continue

        # Pattern: "Title - Artist" or "Artist - Title" with dash separator
        match = re.match(r'^(.+?)\s*[-–—]\s*(.+)$', cleaned)
        if match:
            part1 = _clean_text(match.group(1))
            part2 = _clean_text(match.group(2))

            if _is_valid_song_part(part1) and _is_valid_song_part(part2):
                songs.append({
                    "title": part1,
                    "artist": part2,
                })

    return songs


async def fetch_sport_edit_songs() -> list[dict]:
    """Search YouTube for sport edit song compilations and extract songs."""
    all_songs = []
    seen = set()

    for query in SEARCH_QUERIES:
        try:
            search = VideosSearch(query, limit=5)
            results = search.result()
            videos = results.get("result", [])

            for video in videos:
                video_link = video.get("link", "")

                # Try to get full description
                full_desc = ""
                try:
                    info = Video.getInfo(video_link)
                    full_desc = info.get("description", "")
                except Exception:
                    description = video.get("descriptionSnippet")
                    if description:
                        full_desc = " ".join([d.get("text", "") for d in description])

                if not full_desc:
                    continue

                # Only extract from descriptions (not titles)
                songs = _extract_songs_from_description(full_desc)

                for song in songs:
                    key = f"{song['title'].lower()}_{song['artist'].lower()}"
                    if key not in seen:
                        seen.add(key)
                        song["source"] = "youtube"
                        song["source_video"] = video_link
                        all_songs.append(song)

        except Exception as e:
            logger.warning(f"YouTube search failed for '{query}': {e}")

    logger.info(f"Found {len(all_songs)} unique songs from YouTube compilations")
    return all_songs
