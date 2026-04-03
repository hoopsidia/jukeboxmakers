from urllib.parse import quote


def get_spotify_link(title: str, artist: str = "") -> str:
    """Generate a Spotify URI that opens directly in the Spotify app."""
    query = f"{title} {artist}".strip()
    return f"spotify:search:{quote(query)}"
