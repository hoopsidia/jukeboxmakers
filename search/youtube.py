import logging
from urllib.parse import quote

logger = logging.getLogger(__name__)


async def get_youtube_link(query: str) -> str:
    """Generate a YouTube search URL for a song. No API key needed."""
    return f"https://www.youtube.com/results?search_query={quote(query)}"
