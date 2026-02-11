(() => {
  const POSTS_KEY = 'pulseFeedPosts.v5';
  const SUGGESTIONS_KEY = 'pulseSuggestions.v2';
  const MUSIC_KEY = 'pulseMusicTracks.v1';
  const MUSIC_DB_NAME = 'pulseFeedDb';
  const MUSIC_DB_VERSION = 1;
  const MUSIC_STORE_NAME = 'music';
  const MUSIC_STORE_KEY = 'tracks';
  const page = document.body.dataset.page || 'admin';

  const state = {
    posts: [],
    suggestions: [],
    tracks: [],
    currentTrackId: '',
    autoScroll: false,
    pauseAtPosts: true,
    speedPxPerSecond: 34,
    isPaused: false,
    pauseUntil: 0,
    lastTime: performance.now(),
    loopResetPending: false,
  };

  const el = {
    form: document.getElementById('composerForm'),
    postText: document.getElementById('postText'),
    postType: document.getElementById('postType'),
    parentPostSelect: document.getElementById('parentPostSelect'),
    mediaFile: document.getElementById('mediaFile'),
    authorAvatarFile: document.getElementById('authorAvatarFile'),
    isSponsored: document.getElementById('isSponsored'),
    authorHandle: document.getElementById('authorHandle'),
    authorSubMeta: document.getElementById('authorSubMeta'),
    feed: document.getElementById('feed'),
    manageList: document.getElementById('manageList'),
    suggestionForm: document.getElementById('suggestionForm'),
    suggestionHandle: document.getElementById('suggestionHandle'),
    suggestionBio: document.getElementById('suggestionBio'),
    suggestionAvatarFile: document.getElementById('suggestionAvatarFile'),
    suggestionManageList: document.getElementById('suggestionManageList'),
    suggestionsList: document.getElementById('suggestionsList'),
    searchInput: document.getElementById('searchInput'),
    autoScrollEnabled: document.getElementById('autoScrollEnabled'),
    scrollSpeed: document.getElementById('scrollSpeed'),
    pauseAtPosts: document.getElementById('pauseAtPosts'),
    musicForm: document.getElementById('musicForm'),
    musicTitle: document.getElementById('musicTitle'),
    musicArtist: document.getElementById('musicArtist'),
    musicFile: document.getElementById('musicFile'),
    musicManageList: document.getElementById('musicManageList'),
    musicTrackSelect: document.getElementById('musicTrackSelect'),
    musicToggleBtn: document.getElementById('musicToggleBtn'),
    musicPrevBtn: document.getElementById('musicPrevBtn'),
    musicNextBtn: document.getElementById('musicNextBtn'),
    musicPlayerStatus: document.getElementById('musicPlayerStatus'),
    musicVisualizer: document.getElementById('musicVisualizer'),
    musicTrackTitle: document.getElementById('musicTrackTitle'),
    musicTrackSinger: document.getElementById('musicTrackSinger'),
    musicProgress: document.getElementById('musicProgress'),
    musicCurrentTime: document.getElementById('musicCurrentTime'),
    musicDuration: document.getElementById('musicDuration'),
    musicFormNotice: document.getElementById('musicFormNotice'),
  };

  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const audioPlayer = new Audio();
  const visualizer = {
    audioCtx: null,
    analyser: null,
    dataArray: null,
    source: null,
    rafId: 0,
  };
  let musicDbPromise = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTextWithMentions(text) {
    const safe = escapeHtml(text);
    return safe.replace(/(^|\s)(@[a-zA-Z0-9_.-]+)/g, '$1<span class="mention">$2</span>');
  }

  function timeAgo(ts) {
    const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
    if (diffMin < 60) return `${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }


  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function showMusicNotice(message, type = 'ok') {
    if (!el.musicFormNotice) return;
    el.musicFormNotice.textContent = message;
    el.musicFormNotice.className = `form-notice ${type}`;
    window.setTimeout(() => {
      if (el.musicFormNotice && el.musicFormNotice.textContent === message) {
        el.musicFormNotice.textContent = '';
        el.musicFormNotice.className = 'form-notice';
      }
    }, 2500);
  }



  function openMusicDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (musicDbPromise) return musicDbPromise;

    musicDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(MUSIC_DB_NAME, MUSIC_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MUSIC_STORE_NAME)) {
          db.createObjectStore(MUSIC_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          musicDbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        musicDbPromise = null;
        reject(request.error || new Error('IndexedDB açılamadı'));
      };
    });

    return musicDbPromise;
  }

  async function loadTracksFromDb() {
    const db = await openMusicDb();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MUSIC_STORE_NAME, 'readonly');
      const store = tx.objectStore(MUSIC_STORE_NAME);
      const request = store.get(MUSIC_STORE_KEY);
      request.onsuccess = () => {
        const result = request.result;
        resolve(Array.isArray(result) ? result : []);
      };
      request.onerror = () => reject(request.error || new Error('Şarkılar okunamadı'));
    });
  }

  async function saveTracksToDb() {
    const db = await openMusicDb();
    if (!db) {
      try {
        localStorage.setItem(MUSIC_KEY, JSON.stringify(state.tracks));
        return true;
      } catch {
        return false;
      }
    }

    return new Promise((resolve) => {
      const tx = db.transaction(MUSIC_STORE_NAME, 'readwrite');
      const store = tx.objectStore(MUSIC_STORE_NAME);
      store.put(state.tracks, MUSIC_STORE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }



  function initVisualizer() {
    if (!el.musicVisualizer || visualizer.analyser) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    visualizer.audioCtx = new AudioCtx();
    visualizer.source = visualizer.audioCtx.createMediaElementSource(audioPlayer);
    visualizer.analyser = visualizer.audioCtx.createAnalyser();
    visualizer.analyser.fftSize = 128;
    visualizer.source.connect(visualizer.analyser);
    visualizer.analyser.connect(visualizer.audioCtx.destination);
    visualizer.dataArray = new Uint8Array(visualizer.analyser.frequencyBinCount);
    drawVisualizer();
  }

  function drawVisualizer() {
    if (!el.musicVisualizer) return;
    const canvas = el.musicVisualizer;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width != width || canvas.height != height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    const targetBarCount = 25;
    const gap = 3;
    const barWidth = 5;
    const sidePadding = 2 * (barWidth + gap);
    const maxClusterWidth = Math.max(barWidth, width - (sidePadding * 2));
    const fitBarCount = Math.max(1, Math.floor((maxClusterWidth + gap) / (barWidth + gap)));
    const barCount = Math.min(targetBarCount, fitBarCount);
    const clusterWidth = (barCount * barWidth) + ((barCount - 1) * gap);
    const startX = Math.max(sidePadding, (width - clusterWidth) / 2);
    const centerY = height / 2;

    if (visualizer.analyser && visualizer.dataArray) {
      visualizer.analyser.getByteFrequencyData(visualizer.dataArray);
    }

    const barHeightProfile = [
      0.30, 0.34,
      0.42, 0.48, 0.54,
      0.60, 0.66, 0.72,
      0.54, 0.48, 0.42,
      0.74, 0.82, 0.74,
      0.42, 0.48, 0.54,
      0.72, 0.66, 0.60,
      0.54, 0.48, 0.42,
      0.34, 0.30,
    ];

    for (let i = 0; i < barCount; i += 1) {
      const value = visualizer.dataArray ? visualizer.dataArray[i % visualizer.dataArray.length] / 255 : 0;
      const idle = audioPlayer.paused ? 0.08 : 0.16;
      const amplitude = (value * (audioPlayer.paused ? 0.45 : 1)) + idle;
      const envelope = barHeightProfile[i] || 0.35;
      const halfHeight = Math.max(3, amplitude * envelope * height * 0.255);
      const x = startX + (i * (barWidth + gap));
      const y = centerY - halfHeight;
      const gradient = ctx.createLinearGradient(0, y, 0, centerY + halfHeight);
      gradient.addColorStop(0, '#9cb6ff');
      gradient.addColorStop(1, '#41527e');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, halfHeight * 2);
    }

    visualizer.rafId = requestAnimationFrame(drawVisualizer);
  }

  function avatarFor(author) {
    const seed = encodeURIComponent(String(author).replace('@', ''));
    return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
  }

  function seedPosts() {
    const now = Date.now();
    const p1 = uid();
    const p2 = uid();
    return [
      {
        id: p1,
        type: 'post',
        author: '@nova.wave',
        authorAvatar: '',
        subMeta: 'visual rehearsal',
        text: 'Yeni editte @mono.synth ile ortak deneme yaptık. Gece çekimi için hazır.',
        sponsored: false,
        media: '',
        createdAt: now - 1000 * 60 * 12,
        pauseMs: 2400,
        parentId: null,
      },
      {
        id: p2,
        type: 'post',
        author: '@arc.light',
        authorAvatar: '',
        subMeta: 'loop tools',
        text: 'Bu bir tanıtım gönderisidir. @studio.pulse için yeni görsel paket çıktı.',
        sponsored: true,
        media: '',
        createdAt: now - 1000 * 60 * 10,
        pauseMs: 2800,
        parentId: null,
      },
      {
        id: uid(),
        type: 'comment',
        author: '@grainframe',
        authorAvatar: '',
        subMeta: 'studio notes',
        text: '@nova.wave palet çok iyi duruyor.',
        sponsored: false,
        media: '',
        createdAt: now - 1000 * 60 * 8,
        pauseMs: 0,
        parentId: p1,
      },
    ];
  }

  function seedSuggestions() {
    return [
      { id: uid(), handle: '@blue.artist', bio: 'visual performer', avatar: '' },
      { id: uid(), handle: '@ghost.user', bio: 'night cuts', avatar: '' },
      { id: uid(), handle: '@mono.synth', bio: 'audio textures', avatar: '' },
    ];
  }

  function seedTracks() {
    return [];
  }

  async function loadData() {
    try {
      state.posts = JSON.parse(localStorage.getItem(POSTS_KEY) || 'null') || seedPosts();
    } catch {
      state.posts = seedPosts();
    }

    try {
      state.suggestions = JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || 'null') || seedSuggestions();
    } catch {
      state.suggestions = seedSuggestions();
    }

    let tracksLoaded = false;
    try {
      const dbTracks = await loadTracksFromDb();
      if (Array.isArray(dbTracks)) {
        state.tracks = dbTracks;
        tracksLoaded = true;
      }
    } catch {
      tracksLoaded = false;
    }

    if (!tracksLoaded) {
      try {
        state.tracks = JSON.parse(localStorage.getItem(MUSIC_KEY) || 'null') || seedTracks();
      } catch {
        state.tracks = seedTracks();
      }

      const migrated = await saveTracksToDb();
      if (migrated) {
        localStorage.removeItem(MUSIC_KEY);
      }
    }

    state.tracks = state.tracks.map((track) => ({
      ...track,
      artist: track.artist || 'Unknown Artist',
    }));

    state.currentTrackId = state.tracks[0]?.id || '';

    persistPosts();
    persistSuggestions();
  }

  const persistPosts = () => localStorage.setItem(POSTS_KEY, JSON.stringify(state.posts));
  const persistSuggestions = () => localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(state.suggestions));
  async function persistTracks() {
    const ok = await saveTracksToDb();
    if (ok && window.indexedDB) {
      localStorage.removeItem(MUSIC_KEY);
    }
    return ok;
  }

  const getPosts = () => state.posts.filter((x) => x.type === 'post').sort((a, b) => a.createdAt - b.createdAt);
  const getCommentsFor = (postId) => state.posts.filter((x) => x.type === 'comment' && x.parentId === postId).sort((a, b) => a.createdAt - b.createdAt);

  function renderParentOptions() {
    if (!el.parentPostSelect) return;
    const options = ['<option value="">None</option>'];
    for (const post of getPosts()) {
      const shortText = escapeHtml(post.text.slice(0, 20));
      options.push(`<option value="${post.id}">${escapeHtml(post.author)} · ${shortText}${post.text.length > 20 ? '…' : ''}</option>`);
    }
    el.parentPostSelect.innerHTML = options.join('');
  }

  function renderFeed() {
    if (!el.feed) return;
    const posts = getPosts();
    if (!posts.length) {
      el.feed.innerHTML = '<div class="empty-feed">No posts yet.</div>';
      return;
    }

    el.feed.innerHTML = posts.map((post) => {
      const comments = getCommentsFor(post.id);
      const media = post.media ? `<div class="media-wrap"><img class="media" src="${post.media}" alt="Attached media" /></div>` : '';
      const avatar = post.authorAvatar || avatarFor(post.author);
      const commentsHtml = comments.length
        ? `<section class="comments">${comments.map((c) => `<p class="comment"><strong>${escapeHtml(c.author)}</strong> · <span class="timestamp">${timeAgo(c.createdAt)}</span><br>${formatTextWithMentions(c.text)}</p>`).join('')}</section>`
        : '<section class="comments"></section>';

      return `<article class="post-card ${post.sponsored ? 'sponsored-card' : ''}" data-pause="${post.pauseMs || 0}">
        <header class="post-head">
          <img class="avatar" src="${avatar}" alt="${escapeHtml(post.author)} avatar" />
          <div>
            <p class="meta-row"><span class="username">${escapeHtml(post.author)}</span> <span class="timestamp">· ${timeAgo(post.createdAt)}</span></p>
            <p class="sub-meta">${escapeHtml(post.subMeta || 'music video drafts')}</p>
          </div>
          ${post.sponsored ? '<span class="sponsored-label">Sponsored</span>' : ''}
        </header>
        <p class="post-text">${formatTextWithMentions(post.text)}</p>
        ${media}
        <footer class="post-actions" aria-hidden="true">
          <span>♡ ${Math.floor(Math.random() * 900 + 25)}</span>
          <span>💬 ${comments.length}</span>
          <span>↺ ${Math.floor(Math.random() * 70 + 3)}</span>
        </footer>
        ${commentsHtml}
      </article>`;
    }).join('');
  }

  function renderManageList() {
    if (!el.manageList) return;
    const sorted = [...state.posts].sort((a, b) => b.createdAt - a.createdAt);
    el.manageList.innerHTML = sorted.map((item) => `<div class="manage-item">
      <div>
        <p><strong>${escapeHtml(item.author)}</strong> · <span>${item.type.toUpperCase()}</span> · <small>${timeAgo(item.createdAt)}</small></p>
        <small>${escapeHtml(item.text.slice(0, 80))}${item.text.length > 80 ? '…' : ''}</small>
      </div>
      <button class="delete-btn" type="button" data-delete-post-id="${item.id}">Delete</button>
    </div>`).join('');
  }

  function renderSuggestions() {
    if (!el.suggestionsList) return;
    const query = (el.searchInput?.value || '').trim().toLowerCase();
    const list = state.suggestions.filter((s) => !query || s.handle.toLowerCase().includes(query) || s.bio.toLowerCase().includes(query));

    el.suggestionsList.innerHTML = list.map((s) => {
      const avatar = s.avatar || avatarFor(s.handle);
      return `<article class="suggestion-item">
        <img src="${avatar}" alt="${escapeHtml(s.handle)} avatar" class="avatar mini" />
        <div>
          <p><strong>${escapeHtml(s.handle)}</strong></p>
          <small>${escapeHtml(s.bio)}</small>
        </div>
        <button type="button">Takip et</button>
      </article>`;
    }).join('');
  }

  function renderSuggestionManager() {
    if (!el.suggestionManageList) return;
    el.suggestionManageList.innerHTML = state.suggestions.map((s) => `<div class="manage-item">
      <div>
        <p><strong>${escapeHtml(s.handle)}</strong></p>
        <small>${escapeHtml(s.bio)}</small>
      </div>
      <button class="delete-btn" type="button" data-delete-suggestion-id="${s.id}">Delete</button>
    </div>`).join('');
  }

  function renderTrackSelect() {
    if (!el.musicTrackSelect) return;

    if (!state.tracks.length) {
      el.musicTrackSelect.innerHTML = '<option value="">Şarkı yok</option>';
      if (el.musicPlayerStatus) el.musicPlayerStatus.textContent = 'Henüz şarkı yüklenmedi';
      if (el.musicToggleBtn) {
        el.musicToggleBtn.disabled = true;
        el.musicToggleBtn.textContent = '▶';
      }
      if (el.musicTrackTitle) el.musicTrackTitle.textContent = 'Song';
      if (el.musicTrackSinger) el.musicTrackSinger.textContent = 'Singer Name';
      if (el.musicCurrentTime) el.musicCurrentTime.textContent = '0:00';
      if (el.musicDuration) el.musicDuration.textContent = '0:00';
      if (el.musicProgress) el.musicProgress.value = '0';
      return;
    }

    el.musicTrackSelect.innerHTML = state.tracks.map((track) => `<option value="${track.id}">${escapeHtml(track.title)} · ${escapeHtml(track.artist || 'Unknown Artist')}</option>`).join('');

    if (!state.currentTrackId || !state.tracks.some((x) => x.id === state.currentTrackId)) {
      state.currentTrackId = state.tracks[0].id;
    }

    el.musicTrackSelect.value = state.currentTrackId;
    if (el.musicPlayerStatus) el.musicPlayerStatus.textContent = audioPlayer.paused ? 'Hazır' : 'Çalıyor';
    if (el.musicToggleBtn) {
      el.musicToggleBtn.disabled = false;
      el.musicToggleBtn.textContent = audioPlayer.paused ? '▶' : '❚❚';
    }
  }

  function renderTrackManager() {
    if (!el.musicManageList) return;
    el.musicManageList.innerHTML = state.tracks.map((track) => `<div class="manage-item">
      <div>
        <p><strong>${escapeHtml(track.title)}</strong></p>
        <small>${escapeHtml(track.artist || 'Unknown Artist')}</small>
      </div>
      <button class="delete-btn" type="button" data-delete-track-id="${track.id}">Delete</button>
    </div>`).join('');
  }

  function applySelectedTrack(trackId) {
    const track = state.tracks.find((x) => x.id === trackId);
    if (!track) return;
    state.currentTrackId = track.id;
    audioPlayer.src = track.src;
    audioPlayer.load();
    if (el.musicPlayerStatus) el.musicPlayerStatus.textContent = `${track.title} hazır`;
    if (el.musicToggleBtn) el.musicToggleBtn.textContent = '▶';
    if (el.musicTrackTitle) el.musicTrackTitle.textContent = track.title;
    if (el.musicTrackSinger) el.musicTrackSinger.textContent = track.artist || 'Unknown Artist';
    if (el.musicCurrentTime) el.musicCurrentTime.textContent = '0:00';
    if (el.musicDuration) el.musicDuration.textContent = '0:00';
    if (el.musicProgress) el.musicProgress.value = '0';
  }

  function refresh() {
    renderParentOptions();
    renderFeed();
    renderManageList();
    renderSuggestions();
    renderSuggestionManager();
    renderTrackSelect();
    renderTrackManager();
  }

  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPublish(event) {
    event.preventDefault();
    const text = el.postText.value.trim();
    if (!text) return;

    const type = el.postType.value;
    const parentId = type === 'comment' ? (el.parentPostSelect.value || null) : null;
    if (type === 'comment' && !parentId) {
      alert('Please select a parent post for comments.');
      return;
    }

    const media = await toDataUrl(el.mediaFile.files?.[0] || null);
    const authorAvatar = await toDataUrl(el.authorAvatarFile?.files?.[0] || null);

    state.posts.push({
      id: uid(),
      type,
      author: (el.authorHandle.value.trim() || '@studio.pulse').replace(/\s+/g, ''),
      authorAvatar,
      subMeta: el.authorSubMeta.value.trim() || 'music video draft',
      text,
      sponsored: Boolean(el.isSponsored.checked),
      media,
      createdAt: Date.now(),
      pauseMs: type === 'post' ? 2200 : 0,
      parentId,
    });

    persistPosts();
    refresh();

    el.form.reset();
    el.authorHandle.value = '@studio.pulse';
    el.authorSubMeta.value = 'music video draft';
  }

  function deletePostOrComment(id) {
    const item = state.posts.find((x) => x.id === id);
    if (!item) return;

    state.posts = item.type === 'post'
      ? state.posts.filter((x) => x.id !== id && x.parentId !== id)
      : state.posts.filter((x) => x.id !== id);

    persistPosts();
    refresh();
  }

  async function onAddSuggestion(event) {
    event.preventDefault();
    const handle = el.suggestionHandle.value.trim();
    const bio = el.suggestionBio.value.trim();
    if (!handle || !bio) return;

    const avatar = await toDataUrl(el.suggestionAvatarFile?.files?.[0] || null);
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;

    state.suggestions.unshift({ id: uid(), handle: normalized, bio, avatar });
    persistSuggestions();
    renderSuggestions();
    renderSuggestionManager();
    el.suggestionForm.reset();
  }

  function deleteSuggestion(id) {
    state.suggestions = state.suggestions.filter((x) => x.id !== id);
    persistSuggestions();
    renderSuggestions();
    renderSuggestionManager();
  }

  async function onAddTrack(event) {
    event.preventDefault();
    const title = el.musicTitle?.value.trim();
    const artist = el.musicArtist?.value.trim();
    const file = el.musicFile?.files?.[0] || null;
    if (!title || !artist || !file) {
      showMusicNotice('Lütfen tüm alanları doldurun.', 'error');
      return;
    }

    const src = await toDataUrl(file);
    const track = { id: uid(), title, artist, src, createdAt: Date.now() };
    state.tracks = [track, ...state.tracks];
    state.currentTrackId = track.id;

    if (!(await persistTracks())) {
      state.tracks = state.tracks.filter((x) => x.id !== track.id);
      state.currentTrackId = state.tracks[0]?.id || '';
      showMusicNotice('Şarkı kaydedilemedi. Tarayıcı depolaması dolu olabilir.', 'error');
      return;
    }

    showMusicNotice('Şarkı eklendi.', 'ok');
    refresh();
    applySelectedTrack(track.id);
    el.musicForm.reset();
  }

  async function deleteTrack(id) {
    const snapshot = state.tracks;
    const previousTrackId = state.currentTrackId;
    const isCurrent = state.currentTrackId === id;
    state.tracks = state.tracks.filter((x) => x.id !== id);
    if (!state.tracks.length) {
      state.currentTrackId = '';
      audioPlayer.pause();
      audioPlayer.removeAttribute('src');
      audioPlayer.load();
    } else if (isCurrent) {
      applySelectedTrack(state.tracks[0].id);
    }
    if (!(await persistTracks())) {
      state.tracks = snapshot;
      state.currentTrackId = previousTrackId;
      showMusicNotice('Şarkı silinirken kayıt hatası oluştu.', 'error');
      return;
    }
    refresh();
  }

  async function togglePlayback() {
    if (!state.tracks.length) return;
    const selectedId = el.musicTrackSelect?.value || state.currentTrackId;
    if (!audioPlayer.src || state.currentTrackId !== selectedId) {
      applySelectedTrack(selectedId);
    }

    if (audioPlayer.paused) {
      try {
        initVisualizer();
        if (visualizer.audioCtx?.state === 'suspended') await visualizer.audioCtx.resume();
        await audioPlayer.play();
        if (el.musicPlayerStatus) el.musicPlayerStatus.textContent = 'Çalıyor';
        if (el.musicToggleBtn) el.musicToggleBtn.textContent = '❚❚';
      } catch {
        if (el.musicPlayerStatus) el.musicPlayerStatus.textContent = 'Tarayıcı ses oynatmayı engelledi';
      }
      return;
    }

    audioPlayer.pause();
    if (el.musicPlayerStatus) el.musicPlayerStatus.textContent = 'Duraklatıldı';
    if (el.musicToggleBtn) el.musicToggleBtn.textContent = '▶';
  }

  function maybePauseAtPost(now) {
    if (!state.pauseAtPosts || page !== 'feed') return;
    const cards = Array.from(document.querySelectorAll('.post-card'));
    for (const card of cards) {
      if (card.dataset.paused === '1') continue;
      const pauseMs = Number(card.dataset.pause || 0);
      if (!pauseMs) continue;
      const rect = card.getBoundingClientRect();
      if (rect.top >= 70 && rect.top <= 160) {
        card.dataset.paused = '1';
        state.isPaused = true;
        state.pauseUntil = now + pauseMs;
        break;
      }
    }
  }

  function maybeResetLoop() {
    if (state.loopResetPending || page !== 'feed') return;
    const nearEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (!nearEnd) return;

    state.loopResetPending = true;
    window.setTimeout(() => {
      document.querySelectorAll('.post-card').forEach((card) => delete card.dataset.paused);
      window.scrollTo({ top: 0, behavior: 'auto' });
      state.loopResetPending = false;
    }, 900);
  }

  function tick(now) {
    if (page !== 'feed' || !state.autoScroll) {
      state.lastTime = now;
      requestAnimationFrame(tick);
      return;
    }

    maybeResetLoop();

    if (state.isPaused) {
      if (now >= state.pauseUntil) state.isPaused = false;
      state.lastTime = now;
      requestAnimationFrame(tick);
      return;
    }

    const delta = (now - state.lastTime) / 1000;
    window.scrollBy(0, state.speedPxPerSecond * delta);
    maybePauseAtPost(now);
    state.lastTime = now;
    requestAnimationFrame(tick);
  }

  function bindEvents() {
    if (el.postType && el.parentPostSelect) {
      el.postType.addEventListener('change', () => {
        el.parentPostSelect.disabled = el.postType.value !== 'comment';
      });
      el.parentPostSelect.disabled = true;
    }

    if (el.form) el.form.addEventListener('submit', onPublish);

    if (el.manageList) {
      el.manageList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-delete-post-id]');
        if (!btn) return;
        deletePostOrComment(btn.getAttribute('data-delete-post-id'));
      });
    }

    if (el.suggestionForm) el.suggestionForm.addEventListener('submit', onAddSuggestion);

    if (el.suggestionManageList) {
      el.suggestionManageList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-delete-suggestion-id]');
        if (!btn) return;
        deleteSuggestion(btn.getAttribute('data-delete-suggestion-id'));
      });
    }

    if (el.musicForm) el.musicForm.addEventListener('submit', onAddTrack);

    if (el.musicManageList) {
      el.musicManageList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-delete-track-id]');
        if (!btn) return;
        void deleteTrack(btn.getAttribute('data-delete-track-id'));
      });
    }

    if (el.musicTrackSelect) {
      el.musicTrackSelect.addEventListener('change', () => {
        applySelectedTrack(el.musicTrackSelect.value);
      });
    }

    if (el.musicToggleBtn) el.musicToggleBtn.addEventListener('click', togglePlayback);


    if (el.musicPrevBtn) {
      el.musicPrevBtn.addEventListener('click', () => {
        if (!state.tracks.length) return;
        const currentIndex = state.tracks.findIndex((x) => x.id === state.currentTrackId);
        const nextIndex = currentIndex <= 0 ? state.tracks.length - 1 : currentIndex - 1;
        applySelectedTrack(state.tracks[nextIndex].id);
        if (!audioPlayer.paused) audioPlayer.play();
      });
    }

    if (el.musicNextBtn) {
      el.musicNextBtn.addEventListener('click', () => {
        if (!state.tracks.length) return;
        const currentIndex = state.tracks.findIndex((x) => x.id === state.currentTrackId);
        const nextIndex = currentIndex >= state.tracks.length - 1 ? 0 : currentIndex + 1;
        applySelectedTrack(state.tracks[nextIndex].id);
        if (!audioPlayer.paused) audioPlayer.play();
      });
    }

    if (el.musicProgress) {
      el.musicProgress.addEventListener('input', () => {
        if (!Number.isFinite(audioPlayer.duration) || !audioPlayer.duration) return;
        audioPlayer.currentTime = (Number(el.musicProgress.value) / 100) * audioPlayer.duration;
      });
    }

    if (el.searchInput) el.searchInput.addEventListener('input', renderSuggestions);
    if (el.autoScrollEnabled) el.autoScrollEnabled.addEventListener('change', () => { state.autoScroll = el.autoScrollEnabled.checked; });
    if (el.pauseAtPosts) el.pauseAtPosts.addEventListener('change', () => { state.pauseAtPosts = el.pauseAtPosts.checked; });
    if (el.scrollSpeed) el.scrollSpeed.addEventListener('input', () => { state.speedPxPerSecond = Number(el.scrollSpeed.value); });
  }

  async function init() {
    await loadData();
    refresh();
    bindEvents();

    if (state.currentTrackId) applySelectedTrack(state.currentTrackId);

    initVisualizer();

    audioPlayer.addEventListener('loadedmetadata', () => {
      if (el.musicDuration) el.musicDuration.textContent = formatAudioTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('timeupdate', () => {
      if (el.musicCurrentTime) el.musicCurrentTime.textContent = formatAudioTime(audioPlayer.currentTime);
      if (el.musicProgress && Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
        el.musicProgress.value = String((audioPlayer.currentTime / audioPlayer.duration) * 100);
      }
    });

    audioPlayer.addEventListener('ended', () => {
      if (!state.tracks.length) return;
      const currentIndex = state.tracks.findIndex((x) => x.id === state.currentTrackId);
      const nextIndex = currentIndex >= state.tracks.length - 1 ? 0 : currentIndex + 1;
      applySelectedTrack(state.tracks[nextIndex].id);
      audioPlayer.play();
    });

    requestAnimationFrame((start) => {
      state.lastTime = start;
      requestAnimationFrame(tick);
    });
  }

  void init();
})();
