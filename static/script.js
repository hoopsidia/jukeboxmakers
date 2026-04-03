let visibleCount = 40;
const BATCH_SIZE = 20;

// --- Tabs ---
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (tab === 'trending') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tabTrending').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tabSearch').classList.add('active');
        document.getElementById('searchInput').focus();
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
            loadCoverForCard(card);
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

// --- Refresh ---
async function refreshData() {
    const btn = document.getElementById('btnRefresh');
    btn.disabled = true;
    btn.textContent = 'Actualisation...';

    try {
        await fetch('/api/refresh', { method: 'POST' });
        document.getElementById('lastRefresh').textContent = 'Actualisation en cours...';
        setTimeout(() => location.reload(), 30000);
    } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Actualiser';
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
            if (false) {
            }
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

// --- Search ---
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchSongs();
        });
        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (input.value.trim().length >= 2) searchSongs();
            }, 500);
        });
    }
});

function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createResultCard(song) {
    const card = document.createElement('div');
    card.className = 'search-result-card';

    const duration = song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : '';

    card.ondblclick = (e) => playSong(e, song.title, song.artist);

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
    loading.textContent = 'Recherche en cours...';
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

// --- Cover loading ---
async function loadCoverForCard(card) {
    const placeholder = card.querySelector('.cover-placeholder');
    if (!placeholder) return;
    const title = card.querySelector('.song-title')?.textContent || '';
    const artist = card.querySelector('.song-artist')?.textContent || '';
    if (!title) return;
    const q = encodeURIComponent(`${title} ${artist}`.trim());
    try {
        const resp = await fetch(`/api/artwork?q=${q}`);
        const data = await resp.json();
        if (data.artworkUrl) {
            const img = document.createElement('img');
            img.src = data.artworkUrl;
            img.alt = title;
            img.loading = 'lazy';
            placeholder.replaceWith(img);
        }
    } catch (e) {}
}

(async function loadCovers() {
    const cards = document.querySelectorAll('.song-card');
    for (const card of cards) {
        if (card.style.display === 'none') continue;
        await loadCoverForCard(card);
    }
})();

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
