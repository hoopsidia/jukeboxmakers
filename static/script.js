let visibleCount = 40;
const BATCH_SIZE = 20;

// --- Tabs ---
const TAB_IDS = ['trending', 'search', 'lyrics', 'genre', 'vibe', 'sfx', 'voice'];

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
    } else if (tab === 'vibe') {
        document.getElementById('tabVibe').classList.add('active');
        document.getElementById('vibeInput').focus();
    } else if (tab === 'sfx') {
        document.getElementById('tabSfx').classList.add('active');
        document.getElementById('sfxInput').focus();
    } else if (tab === 'voice') {
        document.getElementById('tabVoice').classList.add('active');
        document.getElementById('voiceDesc').focus();
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

// --- Player & Waveform ---
let currentPlayerTitle = '';
let currentPlayerArtist = '';
let waveformData = null;
let waveformAnimId = null;

async function loadWaveform(audioUrl) {
    const canvas = document.getElementById('playerWaveform');
    if (!canvas) return;

    waveformData = null;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
        const resp = await fetch(audioUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close();

        // Downsample to ~200 bars
        const rawData = decoded.getChannelData(0);
        const barCount = 200;
        const blockSize = Math.floor(rawData.length / barCount);
        const peaks = [];
        for (let i = 0; i < barCount; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[i * blockSize + j]);
            }
            peaks.push(sum / blockSize);
        }

        // Normalize
        const max = Math.max(...peaks) || 1;
        waveformData = peaks.map(p => p / max);

        drawStaticWaveform();
        startProgressUpdate();
    } catch (e) {
        // Silently fail - waveform is optional
    }
}

function drawStaticWaveform() {
    const canvas = document.getElementById('playerWaveform');
    if (!canvas || !waveformData) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const audio = document.getElementById('playerAudio');
    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    const progressX = progress * rect.width;

    const barCount = waveformData.length;
    const gap = 1;
    const barWidth = (rect.width / barCount) - gap;
    const centerY = rect.height / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);

    for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        const barHeight = waveformData[i] * rect.height * 0.85;

        if (x < progressX) {
            ctx.fillStyle = '#666';
        } else {
            ctx.fillStyle = '#222';
        }

        ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    }
}

function startProgressUpdate() {
    if (waveformAnimId) cancelAnimationFrame(waveformAnimId);
    function update() {
        waveformAnimId = requestAnimationFrame(update);
        drawStaticWaveform();
    }
    update();
}

function stopWaveform() {
    if (waveformAnimId) {
        cancelAnimationFrame(waveformAnimId);
        waveformAnimId = null;
    }
    waveformData = null;
    const canvas = document.getElementById('playerWaveform');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Click on waveform to seek
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('playerWaveform');
    if (canvas) {
        canvas.addEventListener('click', (e) => {
            const audio = document.getElementById('playerAudio');
            if (!audio.duration) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = x / rect.width;
            audio.currentTime = ratio * audio.duration;
        });
    }
});

async function playSong(e, title, artist) {
    const bar = document.getElementById('playerBar');
    const audio = document.getElementById('playerAudio');
    const titleEl = document.getElementById('playerTitle');
    const artistEl = document.getElementById('playerArtist');

    currentPlayerTitle = title;
    currentPlayerArtist = artist;

    titleEl.textContent = title;
    artistEl.textContent = artist;
    bar.classList.add('active');
    document.body.classList.add('player-open');

    document.querySelectorAll('.song-card, .search-result-card, .vibe-track-card').forEach(c => c.classList.remove('playing'));
    if (e && e.target) e.target.closest('.song-card, .search-result-card, .vibe-track-card')?.classList.add('playing');

    const query = encodeURIComponent(`${title} ${artist}`.trim());
    titleEl.textContent = `${title} — loading...`;
    try {
        const resp = await fetch(`/api/preview?q=${query}`);
        const data = await resp.json();
        if (data.previewUrl) {
            audio.src = data.previewUrl;
            audio.play();
            loadWaveform(data.previewUrl);
            if (data.trackName) { titleEl.textContent = data.trackName; currentPlayerTitle = data.trackName; }
            if (data.artistName) { artistEl.textContent = data.artistName; currentPlayerArtist = data.artistName; }
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
    stopWaveform();
    bar.classList.remove('active');
    document.body.classList.remove('player-open');
    document.querySelectorAll('.song-card, .search-result-card, .vibe-track-card').forEach(c => c.classList.remove('playing'));
}

function downloadCurrentSong() {
    if (!currentPlayerTitle) return;
    const query = encodeURIComponent(`${currentPlayerTitle} ${currentPlayerArtist}`.trim());
    const filename = encodeURIComponent(`${currentPlayerTitle} - ${currentPlayerArtist}`.trim());
    const a = document.createElement('a');
    a.href = `/api/download?q=${query}&filename=${filename}`;
    a.download = `${currentPlayerTitle} - ${currentPlayerArtist}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

// --- Genre search (iTunes charts) ---
let activeGenre = null;
let genreCurrentLimit = 50;

async function searchGenre(genre) {
    const results = document.getElementById('genreResults');
    const activeEl = document.getElementById('genreActive');
    const loadMoreEl = document.getElementById('genreLoadMore');

    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));

    if (activeGenre === genre) {
        activeGenre = null;
        activeEl.textContent = '';
        results.replaceChildren();
        loadMoreEl.style.display = 'none';
        return;
    }
    activeGenre = genre;
    genreCurrentLimit = 50;

    document.querySelectorAll('.genre-btn').forEach(b => {
        if (b.textContent === genre) b.classList.add('active');
    });

    activeEl.textContent = `>_ top_50: ${genre}`;

    const loading = document.createElement('div');
    loading.className = 'search-loading';
    loading.textContent = `loading ${genre}...`;
    results.replaceChildren(loading);

    try {
        const resp = await fetch(`/api/genre?genre=${encodeURIComponent(genre)}&limit=50`);
        const data = await resp.json();
        results.replaceChildren();

        if (!data.results || data.results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = `no ${genre} results.`;
            results.appendChild(empty);
            loadMoreEl.style.display = 'none';
            return;
        }

        data.results.forEach(song => {
            results.appendChild(createResultCard(song));
        });

        // Show load more only if we got exactly 50 (more might be available)
        if (data.results.length >= 50) {
            loadMoreEl.style.display = 'block';
            document.getElementById('genreLoadCount').textContent = `${data.results.length} loaded`;
        } else {
            loadMoreEl.style.display = 'none';
        }
    } catch (e) {
        results.replaceChildren();
        const err = document.createElement('div');
        err.className = 'search-empty';
        err.textContent = 'error: genre search failed.';
        results.appendChild(err);
        loadMoreEl.style.display = 'none';
    }
}

async function loadMoreGenre() {
    if (!activeGenre) return;
    genreCurrentLimit = Math.min(genreCurrentLimit + 50, 200);

    const results = document.getElementById('genreResults');
    const activeEl = document.getElementById('genreActive');
    activeEl.textContent = `>_ top_${genreCurrentLimit}: ${activeGenre}`;

    const loading = document.createElement('div');
    loading.className = 'search-loading';
    loading.textContent = `loading top ${genreCurrentLimit}...`;
    results.appendChild(loading);

    try {
        const resp = await fetch(`/api/genre?genre=${encodeURIComponent(activeGenre)}&limit=${genreCurrentLimit}`);
        const data = await resp.json();
        results.replaceChildren();

        data.results.forEach(song => {
            results.appendChild(createResultCard(song));
        });

        const count = data.results.length;
        document.getElementById('genreLoadCount').textContent = `${count} loaded`;
        // Hide if we got less than requested (no more available) or reached 200
        if (count < genreCurrentLimit || genreCurrentLimit >= 200) {
            document.getElementById('genreLoadMore').style.display = 'none';
        }
    } catch (e) {
        // keep existing results
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIBE AI (TRACKFINDER)
// ═══════════════════════════════════════════════════════════════════════════════
let vibeState = {
    totalLoaded: 0,
    currentOffset: 0,
    currentVibe: '',
    currentVideoType: '',
    allTracks: [],
    isLoading: false,
};

function appendVibeTag(text) {
    const input = document.getElementById('vibeInput');
    const cur = input.value.trim();
    input.value = cur ? cur + ', ' + text : text;
    input.focus();
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderVibeTrack(track, index) {
    const card = document.createElement('div');
    card.className = 'vibe-track-card';
    card.ondblclick = (e) => playSong(e, track.name, track.artist);

    const num = document.createElement('div');
    num.className = 'vibe-track-num';
    num.textContent = String(index + 1).padStart(2, '0');
    card.appendChild(num);

    const info = document.createElement('div');
    info.className = 'vibe-track-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'song-title';
    titleDiv.textContent = track.name;
    info.appendChild(titleDiv);

    const artistDiv = document.createElement('div');
    artistDiv.className = 'song-artist';
    artistDiv.textContent = track.artist;
    info.appendChild(artistDiv);

    if (track.usedBy) {
        const usedBy = document.createElement('div');
        usedBy.className = 'vibe-track-desc';
        usedBy.textContent = `↗ ${track.usedBy}`;
        info.appendChild(usedBy);
    }

    if (track.description) {
        const desc = document.createElement('div');
        desc.className = 'vibe-track-desc';
        desc.textContent = track.description;
        info.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'vibe-track-meta';
    if (track.bpm) {
        const bpm = document.createElement('span');
        bpm.textContent = `${track.bpm}bpm`;
        meta.appendChild(bpm);
    }
    if (track.mood) {
        const mood = document.createElement('span');
        mood.textContent = track.mood.toLowerCase();
        meta.appendChild(mood);
    }
    if (track.energy !== undefined) {
        const energy = document.createElement('span');
        energy.textContent = `energy:${track.energy}`;
        meta.appendChild(energy);
    }
    if (track.trendScore !== undefined) {
        const trend = document.createElement('span');
        trend.textContent = `trend:${track.trendScore}`;
        meta.appendChild(trend);
    }
    info.appendChild(meta);

    // Platform search links
    if (track.platforms && track.searchQuery) {
        const platforms = document.createElement('div');
        platforms.className = 'vibe-track-platforms';
        track.platforms.forEach(p => {
            const btn = document.createElement('button');
            btn.textContent = `[${p.toLowerCase()}]`;
            btn.onclick = () => searchPlatform(p, track.searchQuery);
            platforms.appendChild(btn);
        });
        info.appendChild(platforms);
    }

    card.appendChild(info);

    // Play/download buttons
    const actions = document.createElement('div');
    actions.className = 'song-links';
    const playBtn = document.createElement('button');
    playBtn.className = 'link-btn play';
    playBtn.onclick = (e) => playSong(e, track.name, track.artist);
    actions.appendChild(playBtn);
    const dlBtn = document.createElement('button');
    dlBtn.className = 'link-btn download';
    dlBtn.onclick = (e) => downloadSong(e, track.name, track.artist);
    actions.appendChild(dlBtn);
    card.appendChild(actions);

    return card;
}

function searchPlatform(platform, query) {
    const urls = {
        'Epidemic Sound': `https://www.epidemicsound.com/music/search/?term=${encodeURIComponent(query)}`,
        'YouTube Music': `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
        'Spotify': `https://open.spotify.com/search/${encodeURIComponent(query)}`,
        'SoundCloud': `https://soundcloud.com/search?q=${encodeURIComponent(query)}`,
        'YouTube': `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        'Artlist': `https://artlist.io/music#search=${encodeURIComponent(query)}`,
    };
    window.open(urls[platform] || `https://www.google.com/search?q=${encodeURIComponent(query + ' ' + platform)}`, '_blank');
}

async function searchVibe() {
    const vibe = document.getElementById('vibeInput').value.trim();
    const videoType = 'sport edits';
    const errorEl = document.getElementById('vibeError');
    const loadingEl = document.getElementById('vibeLoading');
    const btn = document.getElementById('vibeSearchBtn');

    if (!vibe) {
        errorEl.textContent = '>_ error: describe a vibe first';
        return;
    }
    errorEl.textContent = '';

    // Reset state
    vibeState = { totalLoaded: 0, currentOffset: 0, currentVibe: vibe, currentVideoType: videoType, allTracks: [], isLoading: true };

    loadingEl.className = 'vibe-loading active';
    btn.disabled = true;
    document.getElementById('vibeTracksGrid').innerHTML = '';
    document.getElementById('vibeAnalysisBox').style.display = 'none';
    document.getElementById('vibeLoadMore').style.display = 'none';
    document.getElementById('vibeKeywords').style.display = 'none';

    try {
        const resp = await fetch('/api/vibe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vibe, videoType, offset: 0, exclude: [] }),
        });
        const data = await resp.json();

        if (data.error) {
            errorEl.textContent = `>_ error: ${data.error}`;
            return;
        }

        // Analysis
        if (data.vibeAnalysis) {
            document.getElementById('vibeAnalysisText').textContent = data.vibeAnalysis;
            document.getElementById('vibeContextText').textContent = data.trendContext || '';
            const tagsEl = document.getElementById('vibeAnalysisTags');
            tagsEl.innerHTML = '';
            (data.vibeTags || []).forEach(tag => {
                const s = document.createElement('span');
                s.textContent = tag;
                tagsEl.appendChild(s);
            });
            document.getElementById('vibeAnalysisBox').style.display = 'block';
        }

        // Tracks
        const tracks = data.tracks || [];
        const grid = document.getElementById('vibeTracksGrid');
        tracks.forEach((t, i) => {
            grid.appendChild(renderVibeTrack(t, i));
        });
        vibeState.allTracks = [...tracks];
        vibeState.totalLoaded = tracks.length;
        vibeState.currentOffset = tracks.length;

        // Load more
        document.getElementById('vibeLoadMore').style.display = 'block';
        document.getElementById('vibeLoadCount').textContent = `${vibeState.totalLoaded} tracks`;

        // Keywords
        if (data.searchKeywords?.length) {
            const kwGrid = document.getElementById('vibeKeywordsGrid');
            kwGrid.innerHTML = '';
            data.searchKeywords.forEach(kw => {
                const el = document.createElement('span');
                el.className = 'vibe-keyword';
                el.textContent = kw;
                el.onclick = () => { document.getElementById('vibeInput').value = kw; };
                kwGrid.appendChild(el);
            });
            document.getElementById('vibeKeywords').style.display = 'block';
        }

    } catch (e) {
        errorEl.textContent = `>_ error: ${e.message}`;
    } finally {
        loadingEl.className = 'vibe-loading';
        btn.disabled = false;
        vibeState.isLoading = false;
    }
}

async function loadMoreVibe() {
    if (vibeState.isLoading) return;
    vibeState.isLoading = true;

    const grid = document.getElementById('vibeTracksGrid');

    // Separator
    const sep = document.createElement('div');
    sep.className = 'vibe-batch-sep';
    sep.textContent = `//_ batch ${Math.floor(vibeState.currentOffset / 10) + 1}`;
    grid.appendChild(sep);

    const loadingEl = document.getElementById('vibeLoading');
    loadingEl.className = 'vibe-loading active';

    try {
        const resp = await fetch('/api/vibe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vibe: vibeState.currentVibe,
                videoType: vibeState.currentVideoType,
                offset: vibeState.currentOffset,
                exclude: vibeState.allTracks.map(t => t.name),
            }),
        });
        const data = await resp.json();
        const tracks = data.tracks || [];

        tracks.forEach((t, i) => {
            grid.appendChild(renderVibeTrack(t, vibeState.totalLoaded + i));
        });

        vibeState.allTracks = [...vibeState.allTracks, ...tracks];
        vibeState.totalLoaded += tracks.length;
        vibeState.currentOffset += tracks.length;
        document.getElementById('vibeLoadCount').textContent = `${vibeState.totalLoaded} tracks`;
    } catch (e) {
        // silent
    } finally {
        loadingEl.className = 'vibe-loading';
        vibeState.isLoading = false;
    }
}

// --- Input event listeners ---
document.addEventListener('DOMContentLoaded', () => {
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

    // Vibe: Ctrl/Cmd+Enter to search
    const vibeInput = document.getElementById('vibeInput');
    if (vibeInput) {
        vibeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) searchVibe();
        });
    }

    // SFX: Enter to generate
    const sfxInput = document.getElementById('sfxInput');
    if (sfxInput) {
        sfxInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') generateSfx();
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE TTS (ElevenLabs)
// ═══════════════════════════════════════════════════════════════════════════════
let voiceGenerating = false;
let voiceCounter = 0;

function toggleVoiceDesc() {
    const select = document.getElementById('voiceSelect');
    const descField = document.getElementById('voiceDescField');
    descField.style.display = select.value === 'custom' ? 'block' : 'none';
}

async function generateVoice() {
    if (voiceGenerating) return;

    const select = document.getElementById('voiceSelect');
    const descInput = document.getElementById('voiceDesc');
    const scriptInput = document.getElementById('voiceScript');
    const voiceId = select.value !== 'custom' ? select.value : '';
    const voiceDesc = select.value === 'custom' ? descInput.value.trim() : '';
    const script = scriptInput.value.trim();
    const errorEl = document.getElementById('voiceError');
    const loadingEl = document.getElementById('voiceLoading');
    const results = document.getElementById('voiceResults');
    const btn = document.getElementById('voiceGenBtn');

    if (select.value === 'custom' && !voiceDesc) {
        errorEl.textContent = '>_ error: describe the voice first';
        return;
    }
    if (!script) {
        errorEl.textContent = '>_ error: write a script first';
        return;
    }
    errorEl.textContent = '';
    voiceGenerating = true;
    loadingEl.style.display = 'block';
    btn.disabled = true;

    try {
        const resp = await fetch('/api/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceId, voiceDesc, script }),
        });
        const data = await resp.json();

        if (data.error) {
            errorEl.textContent = `>_ error: ${data.error}`;
            return;
        }

        voiceCounter++;

        const card = document.createElement('div');
        card.className = 'sfx-card';

        const num = document.createElement('div');
        num.className = 'sfx-num';
        num.textContent = String(voiceCounter).padStart(3, '0') + '_';
        card.appendChild(num);

        const info = document.createElement('div');
        info.className = 'sfx-info';

        const descDiv = document.createElement('div');
        descDiv.className = 'sfx-prompt';
        descDiv.textContent = voiceId || voiceDesc;
        info.appendChild(descDiv);

        const scriptDiv = document.createElement('div');
        scriptDiv.className = 'sfx-meta';
        const preview = script.length > 80 ? script.substring(0, 80) + '...' : script;
        scriptDiv.textContent = `"${preview}"`;
        info.appendChild(scriptDiv);

        if (data.cached) {
            const cachedDiv = document.createElement('div');
            cachedDiv.className = 'sfx-meta';
            cachedDiv.textContent = '[cached]';
            info.appendChild(cachedDiv);
        }

        const audio = document.createElement('audio');
        audio.className = 'sfx-audio';
        audio.src = data.audioUrl;
        audio.controls = true;
        audio.autoplay = true;
        info.appendChild(audio);

        card.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'song-links';

        const playBtn = document.createElement('button');
        playBtn.className = 'link-btn play';
        playBtn.onclick = () => { audio.currentTime = 0; audio.play(); };
        actions.appendChild(playBtn);

        const dlBtn = document.createElement('button');
        dlBtn.className = 'link-btn download';
        dlBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = data.audioUrl;
            a.download = `voice_${voiceDesc.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        actions.appendChild(dlBtn);

        card.appendChild(actions);

        // Prepend (newest first, never clear history)
        results.insertBefore(card, results.firstChild);

    } catch (e) {
        errorEl.textContent = `>_ error: ${e.message}`;
    } finally {
        voiceGenerating = false;
        loadingEl.style.display = 'none';
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SFX GENERATOR (ElevenLabs)
// ═══════════════════════════════════════════════════════════════════════════════
let sfxGenerating = false;
let sfxCounter = 0;

async function generateSfx() {
    if (sfxGenerating) return;

    const input = document.getElementById('sfxInput');
    const prompt = input.value.trim();
    const duration = parseFloat(document.getElementById('sfxDuration').value);
    const errorEl = document.getElementById('sfxError');
    const loadingEl = document.getElementById('sfxLoading');
    const results = document.getElementById('sfxResults');
    const btn = document.getElementById('sfxGenBtn');

    if (!prompt) {
        errorEl.textContent = '>_ error: describe a sound first';
        return;
    }
    errorEl.textContent = '';
    sfxGenerating = true;
    loadingEl.style.display = 'block';
    btn.disabled = true;

    try {
        const resp = await fetch('/api/sfx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, duration, count: 5 }),
        });
        const data = await resp.json();

        if (data.error) {
            errorEl.textContent = `>_ error: ${data.error}`;
            return;
        }

        const variants = data.results || [];
        if (variants.length === 0) {
            errorEl.textContent = '>_ error: no results generated';
            return;
        }

        // Create a batch container
        sfxCounter++;
        const batch = document.createElement('div');
        batch.className = 'sfx-batch';

        const batchHeader = document.createElement('div');
        batchHeader.className = 'sfx-batch-header';
        batchHeader.textContent = `//_ ${String(sfxCounter).padStart(3, '0')} "${prompt}" — ${duration}s — ${variants.length} variants`;
        batch.appendChild(batchHeader);

        variants.forEach((v, i) => {
            if (v.error) return;

            const card = document.createElement('div');
            card.className = 'sfx-card';

            const num = document.createElement('div');
            num.className = 'sfx-num';
            num.textContent = `${String(sfxCounter).padStart(3, '0')}.${i + 1}`;
            card.appendChild(num);

            const info = document.createElement('div');
            info.className = 'sfx-info';

            const meta = document.createElement('div');
            meta.className = 'sfx-meta';
            meta.textContent = `variant_${i + 1}${v.cached ? ' [cached]' : ''}`;
            info.appendChild(meta);

            const audio = document.createElement('audio');
            audio.className = 'sfx-audio';
            audio.src = v.audioUrl;
            audio.controls = true;
            if (i === 0) audio.autoplay = true;
            info.appendChild(audio);

            card.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'song-links';

            const playBtn = document.createElement('button');
            playBtn.className = 'link-btn play';
            playBtn.onclick = () => { audio.currentTime = 0; audio.play(); };
            actions.appendChild(playBtn);

            const dlBtn = document.createElement('button');
            dlBtn.className = 'link-btn download';
            dlBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = v.audioUrl;
                a.download = `sfx_${prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_v${i + 1}.mp3`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
            actions.appendChild(dlBtn);

            card.appendChild(actions);
            batch.appendChild(card);
        });

        // Prepend batch (newest first)
        results.insertBefore(batch, results.firstChild);

        // Clear input for next prompt
        input.value = '';
        input.focus();

    } catch (e) {
        errorEl.textContent = `>_ error: ${e.message}`;
    } finally {
        sfxGenerating = false;
        loadingEl.style.display = 'none';
        btn.disabled = false;
    }
}

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
