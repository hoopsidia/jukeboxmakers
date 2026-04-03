let visibleCount = 20;
const BATCH_SIZE = 20;

function showMore() {
    const cards = document.querySelectorAll('.song-card');
    const total = cards.length;
    const nextLimit = visibleCount + BATCH_SIZE;

    cards.forEach(card => {
        const idx = parseInt(card.dataset.index);
        if (idx <= nextLimit) {
            card.style.display = 'flex';
            // Load cover for newly visible cards
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

async function playSong(e, title, artist) {
    const bar = document.getElementById('playerBar');
    const audio = document.getElementById('playerAudio');
    const titleEl = document.getElementById('playerTitle');
    const artistEl = document.getElementById('playerArtist');
    const artEl = document.getElementById('playerArt');

    titleEl.textContent = title;
    artistEl.textContent = artist;
    artEl.src = '';
    bar.classList.add('active');
    document.body.classList.add('player-open');

    document.querySelectorAll('.song-card').forEach(c => c.classList.remove('playing'));
    if (e && e.target) e.target.closest('.song-card')?.classList.add('playing');

    const query = encodeURIComponent(`${title} ${artist}`.trim());
    titleEl.textContent = `${title} — chargement...`;
    try {
        const resp = await fetch(`/api/preview?q=${query}`);
        const data = await resp.json();
        if (data.previewUrl) {
            audio.src = data.previewUrl;
            audio.play();
            if (data.trackName) titleEl.textContent = data.trackName;
            if (data.artistName) artistEl.textContent = data.artistName;
            const cardImg = e?.target?.closest('.song-card')?.querySelector('.song-cover img');
            if (cardImg && cardImg.src) {
                artEl.src = cardImg.src;
            } else {
                try {
                    const artResp = await fetch(`/api/artwork?q=${query}`);
                    const artData = await artResp.json();
                    if (artData.artworkUrl) artEl.src = artData.artworkUrl;
                } catch (e) {}
            }
        } else {
            titleEl.textContent = `${title} — introuvable`;
            artistEl.textContent = '';
            audio.src = '';
        }
    } catch (e) {
        titleEl.textContent = `${title} — erreur`;
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
    document.querySelectorAll('.song-card').forEach(c => c.classList.remove('playing'));
}

function downloadSong(e, title, artist) {
    const query = encodeURIComponent(`${title} ${artist}`.trim());
    const filename = encodeURIComponent(`${title} - ${artist}`.trim());
    const btn = e.target.closest('.link-btn.download');
    btn.classList.add('loading');

    const a = document.createElement('a');
    a.href = `/api/download?q=${query}&filename=${filename}`;
    a.download = `${title} - ${artist}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => btn.classList.remove('loading'), 3000);
}

// Load cover for a single card
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

// Load covers for initially visible cards
(async function loadCovers() {
    const cards = document.querySelectorAll('.song-card');
    for (const card of cards) {
        if (card.style.display === 'none') continue;
        await loadCoverForCard(card);
    }
})();

// Auto-reload every 5 minutes to pick up background updates
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
