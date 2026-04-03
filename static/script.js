let visibleCount = 40;
const BATCH_SIZE = 20;

// --- Tabs ---
const TAB_IDS = ['trending', 'search', 'lyrics', 'genre'];

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const idx = TAB_IDS.indexOf(tab);
    if (idx >= 0) {
        document.querySelectorAll('.tab-btn')[idx].classList.add('active');
    }

    if (tab === 'trending') {
        document.getElementById('tabTrending').classList.add('active');
    } else if (tab === 'search') {
        document.getElementById('tabSearch').classList.add('active');
        document.getElementById('searchInput').focus();
    } else if (tab === 'lyrics') {
        document.getElementById('tabLyrics').classList.add('active');
        document.getElementById('lyricsInput').focus();
    } else if (tab === 'genre') {
        document.getElementById('tabGenre').classList.add('active');
    }
}

// --- Show More ---
function showMore() {
    const cards = document.querySelectorAll('.song-card');
    const total = cards.length;
    const nextLimit = visibleCount + BATCH_SIZE;

    cards.forEach(card => {
        const idx = parseInt(card.dataset.index);
        if (idx <= nextLimit) {
            card.style.display = 'flex';
        }
    });

    visibleCount = Math.min(nextLimit, total);
    const countEl = document.getElementById('showMoreCount');
    if (countEl) countEl.textContent = `${visibleCount} / ${total}`;

    if (visibleCount >= total) {
        const container = document.getElementById('showMoreContainer');
        if (container) container.style.display = 'none';
    }
}

// --- Player ---
async function playSong(e, title, artist) {
    const bar = document.getElementById('playerBar');
    const audio = document.getElementById('playerAudio');
    const titleEl = document.getElementById('playerTitle');
    const artistEl = document.getElementById('playerArtist');

    titleEl.textContent = title;
    artistEl.textContent = artist;
    bar.classList.add('active');
    document.body.classList.add('player-open');

    document.querySelectorAll('.song-card, .search-result-card').forEach(c => c.classList.remove('playing'));
    if (e && e.target) e.target.closest('.song-card, .search-result-card')?.classList.add('playing');

    const query = encodeURIComponent(`${title} ${artist}`.trim());
    titleEl.textContent = `${title} — loading...`;
    try {
        const resp = await fetch(`/api/preview?q=${query}`);
        const data = await resp.json();
        if (data.previewUrl) {
            audio.src = data.previewUrl;
            audio.play();
            if (data.trackName) titleEl.textContent = data.trackName;
            if (data.artistName) artistEl.textContent = data.artistName;
        } else {
            titleEl.textContent = `${title} — not_found`;
            artistEl.textContent = '';
            audio.src = '';
        }
    } catch (e) {
        titleEl.textContent = `${title} — error`;
        artistEl.textContent = '';
    }
}

function closePlayer() {
    const bar = document.getElementById('playerBar');
    const audio = document.getElementById('playerAudio');
    audio.pause();
    audio.src = '';
    bar.classList.remove('active');
    document.body.classList.remove('player-open');
    document.querySelectorAll('.song-card, .search-result-card').forEach(c => c.classList.remove('playing'));
}

// --- Download ---
function downloadSong(e, title, artist) {
    const query = encodeURIComponent(`${title} ${artist}`.trim());
    const filename = encodeURIComponent(`${title} - ${artist}`.trim());
    const btn = e.target.closest('.link-btn.download');
    if (btn) btn.classList.add('loading');

    const a = document.createElement('a');
    a.href = `/api/download?q=${query}&filename=${filename}`;
    a.download = `${title} - ${artist}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (btn) setTimeout(() => btn.classList.remove('loading'), 3000);
}

// --- Shared card builder ---
function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createResultCard(song, opts = {}) {
    const card = document.createElement('div');
    card.className = 'search-result-card';

    const duration = song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : '';

    card.ondblclick = (e) => playSong(e, song.title, song.artist);

    // Show rank if available (genre charts)
    if (song.rank) {
        const rankDiv = document.createElement('div');
        rankDiv.className = 'song-rank';
        rankDiv.textContent = String(song.rank).padStart(3, '0');
        card.appendChild(rankDiv);
    }

    const info = document.createElement('div');
    info.className = 'song-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'song-title';
    titleDiv.textContent = song.title;
    info.appendChild(titleDiv);

    const artistDiv = document.createElement('div');
    artistDiv.className = 'song-artist';
    artistDiv.textContent = song.artist;
    info.appendChild(artistDiv);

    if (opts.showSnippet && song.snippet) {
        const snippetDiv = document.createElement('div');
        snippetDiv.className = 'song-snippet';
        snippetDiv.textContent = `"${song.snippet.replace(/\n/g, ' / ')}"`;
        info.appendChild(snippetDiv);
    }

    if (opts.showSource && song.source === 'lyrics') {
        const srcDiv = document.createElement('div');
        srcDiv.className = 'song-source';
        srcDiv.textContent = '[lyrics_match]';
        info.appendChild(srcDiv);
    }

    if (duration) {
        const durDiv = document.createElement('div');
        durDiv.className = 'song-duration';
        durDiv.textContent = duration;
        info.appendChild(durDiv);
    }
    card.appendChild(info);

    const links = document.createElement('div');
    links.className = 'song-links';

    const playBtn = document.createElement('button');
    playBtn.className = 'link-btn play';
    playBtn.title = 'Play';
    playBtn.onclick = (e) => playSong(e, song.title, song.artist);
    links.appendChild(playBtn);

    const dlBtn = document.createElement('button');
    dlBtn.className = 'link-btn download';
    dlBtn.title = 'Download';
    dlBtn.onclick = (e) => downloadSong(e, song.title, song.artist);
    links.appendChild(dlBtn);

    card.appendChild(links);
    return card;
}

// --- Search (iTunes catalog) ---
let searchTimeout = null;

async function searchSongs() {
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const q = input.value.trim();

    if (q.length < 2) {
        results.replaceChildren();
        return;
    }

    const loading = document.createElement('div');
    loading.className = 'search-loading';
    loading.textContent = 'searching catalog...';
    results.replaceChildren(loading);

    try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
        const data = await resp.json();
        results.replaceChildren();

        if (!data.results || data.results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = 'no results found.';
            results.appendChild(empty);
            return;
        }

        data.results.forEach(song => {
            results.appendChild(createResultCard(song));
        });
    } catch (e) {
        results.replaceChildren();
        const err = document.createElement('div');
        err.className = 'search-empty';
        err.textContent = 'error: search failed.';
        results.appendChild(err);
    }
}

// --- Lyrics search (Genius) ---
let lyricsTimeout = null;

async function searchLyrics() {
    const input = document.getElementById('lyricsInput');
    const results = document.getElementById('lyricsResults');
    const q = input.value.trim();

    if (q.length < 2) {
        results.replaceChildren();
        return;
    }

    const loading = document.createElement('div');
    loading.className = 'search-loading';
    loading.textContent = 'scanning lyrics...';
    results.replaceChildren(loading);

    try {
        const resp = await fetch(`/api/lyrics?q=${encodeURIComponent(q)}&limit=20`);
        const data = await resp.json();
        results.replaceChildren();

        if (!data.results || data.results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = 'no lyrics match found.';
            results.appendChild(empty);
            return;
        }

        data.results.forEach(song => {
            results.appendChild(createResultCard(song, { showSnippet: true, showSource: true }));
        });
    } catch (e) {
        results.replaceChildren();
        const err = document.createElement('div');
        err.className = 'search-empty';
        err.textContent = 'error: lyrics search failed.';
        results.appendChild(err);
    }
}

// --- Genre search (iTunes) ---
let activeGenre = null;

async function searchGenre(genre) {
    const results = document.getElementById('genreResults');
    const activeEl = document.getElementById('genreActive');

    // Toggle active button
    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
    if (activeGenre === genre) {
        activeGenre = null;
        activeEl.textContent = '';
        results.replaceChildren();
        return;
    }
    activeGenre = genre;

    // Highlight clicked button
    document.querySelectorAll('.genre-btn').forEach(b => {
        if (b.textContent === genre) b.classList.add('active');
    });

    activeEl.textContent = `>_ top_50: ${genre}`;

    const loading = document.createElement('div');
    loading.className = 'search-loading';
    loading.textContent = `loading ${genre}...`;
    results.replaceChildren(loading);

    try {
        const resp = await fetch(`/api/genre?genre=${encodeURIComponent(genre)}&limit=30`);
        const data = await resp.json();
        results.replaceChildren();

        if (!data.results || data.results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = `no ${genre} results.`;
            results.appendChild(empty);
            return;
        }

        data.results.forEach(song => {
            results.appendChild(createResultCard(song));
        });
    } catch (e) {
        results.replaceChildren();
        const err = document.createElement('div');
        err.className = 'search-empty';
        err.textContent = 'error: genre search failed.';
        results.appendChild(err);
    }
}

// --- Input event listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Search tab
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchSongs();
        });
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (searchInput.value.trim().length >= 2) searchSongs();
            }, 500);
        });
    }

    // Lyrics tab
    const lyricsInput = document.getElementById('lyricsInput');
    if (lyricsInput) {
        lyricsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchLyrics();
        });
        lyricsInput.addEventListener('input', () => {
            clearTimeout(lyricsTimeout);
            lyricsTimeout = setTimeout(() => {
                if (lyricsInput.value.trim().length >= 2) searchLyrics();
            }, 500);
        });
    }
});

// Auto-reload every 5 minutes
setInterval(() => {
    fetch('/api/songs')
        .then(r => r.json())
        .then(data => {
            if (data.count > 0) {
                const grid = document.getElementById('songsGrid');
                if (grid.querySelector('.empty-state')) {
                    location.reload();
                }
            }
        })
        .catch(() => {});
}, 300000);
