import aiosqlite
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "songs.db")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    cover_url TEXT,
    tiktok_url TEXT,
    spotify_url TEXT,
    youtube_url TEXT,
    usage_count INTEGER DEFAULT 0,
    trend_direction TEXT DEFAULT 'stable',
    hashtags TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
)
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_TABLE)
        await db.commit()


async def upsert_song(song: dict):
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        existing = await db.execute("SELECT first_seen, usage_count FROM songs WHERE id = ?", (song["id"],))
        row = await existing.fetchone()

        # Use trend from scraper if available, otherwise compute from usage delta
        trend = song.get("trend_direction", "stable")

        if row:
            if trend == "stable":
                old_count = row[1] or 0
                new_count = song.get("usage_count", 0)
                if new_count > old_count:
                    trend = "up"
                elif new_count < old_count:
                    trend = "down"

            await db.execute("""
                UPDATE songs SET
                    title = ?, artist = ?, cover_url = ?, tiktok_url = ?,
                    spotify_url = ?, youtube_url = ?, usage_count = ?,
                    trend_direction = ?, hashtags = ?, last_seen = ?
                WHERE id = ?
            """, (
                song.get("title"), song.get("artist"), song.get("cover_url"),
                song.get("tiktok_url"), song.get("spotify_url"), song.get("youtube_url"),
                song.get("usage_count", 0), trend, song.get("hashtags", ""),
                now, song["id"]
            ))
        else:
            if trend == "stable":
                trend = "new"
            await db.execute("""
                INSERT INTO songs (id, title, artist, cover_url, tiktok_url, spotify_url,
                    youtube_url, usage_count, trend_direction, hashtags, first_seen, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                song["id"], song.get("title"), song.get("artist"), song.get("cover_url"),
                song.get("tiktok_url"), song.get("spotify_url"), song.get("youtube_url"),
                song.get("usage_count", 0), trend, song.get("hashtags", ""),
                now, now
            ))
        await db.commit()


async def get_top_songs(limit: int = 50, hashtag_filter: str = None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = "SELECT * FROM songs"
        params = []

        if hashtag_filter:
            query += " WHERE hashtags LIKE ?"
            params.append(f"%{hashtag_filter}%")

        query += " ORDER BY usage_count DESC LIMIT ?"
        params.append(limit)

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_last_refresh():
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT MAX(last_seen) FROM songs")
        row = await cursor.fetchone()
        return row[0] if row and row[0] else None
