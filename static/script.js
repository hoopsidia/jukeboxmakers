let visibleCount = 40;
const BATCH_SIZE = 20;

// --- Tabs ---
const TAB_IDS = ['trending', 'search', 'lyrics', 'genre', 'vibe', 'sfx'];

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
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let waveformAnimId = null;

function initWaveform() {
    if (audioCtx) return; // already initialized
    const audio = document.getElementById('playerAudio');
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    sourceNode = audioCtx.createMediaElementSource(audio);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
}

function drawWaveform() {
    const canvas = document.getElementById('playerWaveform');
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        waveformAnimId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        // Resize canvas to actual display size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * (window.devicePixelRatio || 1);
        canvas.height = rect.height * (window.devicePixelRatio || 1);
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

        ctx.clearRect(0, 0, rect.width, rect.height);

        const barCount = 80;
        const barWidth = rect.width / barCount;
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
            const val = dataArray[i * step] / 255;
            const barHeight = val * rect.height;
            const x = i * barWidth;
            const brightness = Math.floor(40 + val * 60);
            ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
            ctx.fillRect(x, rect.height - barHeight, barWidth - 1, barHeight);
        }
    }
    draw();
}

function stopWaveform() {
    if (waveformAnimId) {
        cancelAnimationFrame(waveformAnimId);
        waveformAnimId = null;
    }
    const canvas = document.getElementById('playerWaveform');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

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
            initWaveform();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            drawWaveform();
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
            body: JSON.stringify({ prompt, duration }),
        });
        const data = await resp.json();

        if (data.error) {
            errorEl.textContent = `>_ error: ${data.error}`;
            return;
        }

        sfxCounter++;

        // Create SFX card
        const card = document.createElement('div');
        card.className = 'sfx-card';

        const num = document.createElement('div');
        num.className = 'sfx-num';
        num.textContent = String(sfxCounter).padStart(3, '0') + '_';
        card.appendChild(num);

        const info = document.createElement('div');
        info.className = 'sfx-info';

        const promptDiv = document.createElement('div');
        promptDiv.className = 'sfx-prompt';
        promptDiv.textContent = prompt;
        info.appendChild(promptDiv);

        const meta = document.createElement('div');
        meta.className = 'sfx-meta';
        meta.textContent = `${duration}s${data.cached ? ' [cached]' : ''}`;
        info.appendChild(meta);

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
            a.download = `sfx_${prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        actions.appendChild(dlBtn);

        card.appendChild(actions);

        // Prepend (newest first)
        results.insertBefore(card, results.firstChild);

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
