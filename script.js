(() => {
  const POSTS_KEY = 'pulseFeedPosts.v7';
  const SUGGESTIONS_KEY = 'pulseSuggestions.v2';
  const MUSIC_DB_NAME = 'pulseFeedDb';
  const MUSIC_DB_VERSION = 1;
  const MUSIC_STORE = 'music';
  const MUSIC_KEY = 'tracks';
  const LEGACY_MUSIC_KEY = 'pulseMusicTracks.v1';
  const page = document.body.dataset.page || 'admin';

  const NICKNAMES = [
    'DerinAkis','BetonZihin','MaskesizGercek','GriDuvar','AltKatSakin','SogukGercek','DipDalga','KaranlikYorum','Gozlemci34','NabizTutan','IsimsizKayit','SistemArizasi','ArkaSokakVeri','KuleAltindan','YedinciKat','UyariSeviyesi','BuzGibiHakikat','SesKaydi01','CatiKatisi','DuvarArasi','user384920','yorumcu_xx','gercekler123','vatandas_01','milliSes78','haberTakipcisi','objektif_bakis','dogruYorumcu','netKonusan','turkEvladidir','sistemSavunucusu','rastgele_987','anon_kayit','yorumMakinesi','feedKontrol','veri_akisi','trendAvcisi','feedTetik','BodrumdanSes','TesisatciDegil','CatiUstunde','DelikIcinden','BetonAltindan','KilerSakin','DuvarKemirgen','SogukZemin','KatMaliki','KiraciDegil','TapuBizde','IslakDuvar','RutubetliGercek','SarsintiOncesi','ArizaKaydi','EnkazAltindan','PasaSakini','YonetimKatinda','MarkaOrtak','GuvenliYarin','BuyumeUzmani','EkonomiTakip','ResmiAciklama','PRMasasi','KrizYonetimi','KamuBilgi','IletisimOfisi','GuvenilirKaynak','KurumsalSes','DestekHatti','StratejiMasasi','DegerYaratir','IleriVizyon','YerAltiKaydi','SertAkis','DissArsivi','MaskeyiDusur','CizgiDisi','SakinOlmam','HukumGeldi','DefterAcik','KayitDisi','GozDiken','NabizYuksek','TansiyonArtis','DuzenCoktu','SinyalYok','VeriPatladi',
  ];

  const state = {
    posts: [], suggestions: [], tracks: [], currentTrackId: '',
    autoScroll: false, pauseAtPosts: true, speedPxPerSecond: 34, lastTime: performance.now(),
    timelineIndex: 0, timelineEvents: [], lastTrackTime: 0, nickPool: [],
  };

  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const audioPlayer = new Audio();
  audioPlayer.loop = false;
  let musicDbPromise = null;

  const ids = ['composerForm','postText','postType','parentPostSelect','mediaFile','carouselFiles','carouselTimestamps','postTimestamp','authorAvatarFile','authorHandle','authorRandom','isSponsored','isVip','isBoosted','feed','adminFeed','manageList','suggestionForm','suggestionHandle','suggestionBio','suggestionAvatarFile','suggestionManageList','suggestionsList','searchInput','autoScrollEnabled','scrollSpeed','pauseAtPosts','musicForm','musicTitle','musicArtist','musicFile','musicManageList','musicTrackSelect','musicToggleBtn','musicPrevBtn','musicNextBtn','musicTrackTitle','musicTrackSinger','musicProgress','musicCurrentTime','musicDuration','musicVisualizer','timelineOverlay','recordToggleBtn'];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const timeAgo = (ts) => `${Math.max(1, Math.floor((Date.now() - ts) / 60000))}m`;
  const fmt = (v) => { const t = Math.floor(v || 0); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const avatarFor = (h) => `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(String(h || 'user').replace('@', ''))}`;

  function seedSuggestions() {
    return [{ id: uid(), handle: '@blue.artist', bio: 'visual performer', avatar: '' }];
  }

  function persistPostAndSuggestions() {
    localStorage.setItem(POSTS_KEY, JSON.stringify(state.posts));
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(state.suggestions));
  }

  function openMusicDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (musicDbPromise) return musicDbPromise;
    musicDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(MUSIC_DB_NAME, MUSIC_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MUSIC_STORE)) db.createObjectStore(MUSIC_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('DB açılamadı'));
    });
    return musicDbPromise;
  }

  async function loadTracks() {
    try {
      const db = await openMusicDb();
      if (!db) throw new Error('no db');
      const tracks = await new Promise((resolve, reject) => {
        const tx = db.transaction(MUSIC_STORE, 'readonly');
        const req = tx.objectStore(MUSIC_STORE).get(MUSIC_KEY);
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error);
      });
      return tracks;
    } catch {
      return JSON.parse(localStorage.getItem(LEGACY_MUSIC_KEY) || '[]') || [];
    }
  }

  async function persistTracks() {
    try {
      const db = await openMusicDb();
      if (!db) throw new Error('no db');
      await new Promise((resolve, reject) => {
        const tx = db.transaction(MUSIC_STORE, 'readwrite');
        tx.objectStore(MUSIC_STORE).put(state.tracks, MUSIC_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      localStorage.removeItem(LEGACY_MUSIC_KEY);
      return true;
    } catch {
      try {
        localStorage.setItem(LEGACY_MUSIC_KEY, JSON.stringify(state.tracks));
        return true;
      } catch {
        alert('Şarkı kaydı başarısız: depolama dolu olabilir.');
        return false;
      }
    }
  }

  async function loadData() {
    state.posts = JSON.parse(localStorage.getItem(POSTS_KEY) || '[]') || [];
    state.suggestions = JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || 'null') || seedSuggestions();
    state.tracks = await loadTracks();
    state.currentTrackId = state.tracks[0]?.id || '';
    state.nickPool = [...NICKNAMES];
  }

  const posts = () => state.posts.filter((x) => x.type === 'post').sort((a, b) => a.createdAt - b.createdAt);
  const comments = (id) => state.posts.filter((x) => x.type === 'comment' && x.parentId === id).sort((a, b) => a.createdAt - b.createdAt);

  function renderParentOptions() {
    if (!el.parentPostSelect) return;
    el.parentPostSelect.innerHTML = '<option value="">None</option>' + posts().map((p) => `<option value="${p.id}">${esc(p.author)} · ${esc(p.text.slice(0, 20))}</option>`).join('');
  }

  function mediaNode(item, cls = 'media') {
    if (!item?.src) return '';
    if (item.mediaType === 'video') return `<video class="${cls}" src="${item.src}" muted playsinline controls></video>`;
    return `<img class="${cls}" src="${item.src}" alt="media" />`;
  }

  function renderFeed(target) {
    if (!target) return;
    const list = posts();
    if (!list.length) {
      target.innerHTML = '<div class="empty-feed">No posts yet.</div>';
      return;
    }
    target.innerHTML = list.map((p) => {
      const c = comments(p.id);
      const avatar = p.authorAvatar || avatarFor(p.author);
      return `<article class="post-card">
        <header class="post-head">
          <img class="avatar" src="${avatar}" alt="${esc(p.author)} avatar" />
          <p class="meta-row"><strong>${esc(p.author)}</strong> <span class="timestamp">· ${timeAgo(p.createdAt)}</span></p>
        </header>
        <p class="post-text">${esc(p.text)}</p>
        ${mediaNode({ src: p.media, mediaType: p.mediaType })}
        ${p.carousel?.length ? `<div class="carousel-preview">${p.carousel.map((it) => `<span>${it.mediaType === 'video' ? '🎬' : '🖼'} ${Number(it.timestampSec || 0)}s</span>`).join('')}</div>` : ''}
        <div class="post-actions"><span>❤ ${p.likes || 0}</span><span>↻ ${p.reposts || 0}</span></div>
        ${c.length ? `<section class="comments">${c.map((x) => `<p class="comment"><strong>${esc(x.author)}</strong>: ${esc(x.text)}</p>`).join('')}</section>` : ''}
      </article>`;
    }).join('');
  }

  function renderManageList() {
    if (!el.manageList) return;
    el.manageList.innerHTML = state.posts.sort((a, b) => b.createdAt - a.createdAt).map((item) => `<div class="manage-item"><div><p><strong>${esc(item.author)}</strong> · ${item.type}</p><small>${esc(item.text.slice(0, 70))}</small></div><button class="delete-btn" data-delete-post-id="${item.id}">Delete</button></div>`).join('');
  }

  function renderSuggestions() {
    if (!el.suggestionsList) return;
    const q = (el.searchInput?.value || '').toLowerCase();
    el.suggestionsList.innerHTML = state.suggestions
      .filter((s) => !q || s.handle.toLowerCase().includes(q) || s.bio.toLowerCase().includes(q))
      .map((s) => `<article class="suggestion-item"><img class="avatar mini" src="${s.avatar || avatarFor(s.handle)}" alt="${esc(s.handle)} avatar" /><div><p><strong>${esc(s.handle)}</strong></p><small>${esc(s.bio)}</small></div><button type="button">Takip et</button></article>`)
      .join('');
  }

  function renderSuggestionManager() {
    if (!el.suggestionManageList) return;
    el.suggestionManageList.innerHTML = state.suggestions.map((s) => `<div class="manage-item"><div><strong>${esc(s.handle)}</strong><br><small>${esc(s.bio)}</small></div><button class="delete-btn" data-delete-suggestion-id="${s.id}">Delete</button></div>`).join('');
  }

  function renderTrackSelect() {
    if (!el.musicTrackSelect) return;
    el.musicTrackSelect.innerHTML = state.tracks.length
      ? state.tracks.map((t) => `<option value="${t.id}">${esc(t.title)} · ${esc(t.artist)}</option>`).join('')
      : '<option value="">Şarkı yok</option>';
    if (state.currentTrackId) el.musicTrackSelect.value = state.currentTrackId;
  }

  function renderTrackManager() {
    if (!el.musicManageList) return;
    el.musicManageList.innerHTML = state.tracks.map((t) => `<div class="manage-item"><div><strong>${esc(t.title)}</strong><br><small>${esc(t.artist)}</small></div><button class="delete-btn" data-delete-track-id="${t.id}">Delete</button></div>`).join('');
  }

  function refresh() {
    renderParentOptions();
    renderFeed(el.feed);
    renderFeed(el.adminFeed);
    renderManageList();
    renderSuggestions();
    renderSuggestionManager();
    renderTrackSelect();
    renderTrackManager();
    buildTimeline();
  }

  function pickRandomNick() {
    if (!state.nickPool.length) state.nickPool = [...NICKNAMES];
    const i = Math.floor(Math.random() * state.nickPool.length);
    return `@${state.nickPool.splice(i, 1)[0]}`;
  }

  const toDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  async function onPublish(e) {
    e.preventDefault();
    const text = el.postText.value.trim();
    if (!text) return;

    const type = el.postType.value;
    const parentId = type === 'comment' ? (el.parentPostSelect.value || null) : null;
    if (type === 'comment' && !parentId) return alert('Comment için parent post seçin.');

    const mediaFile = el.mediaFile.files?.[0] || null;
    const media = await toDataUrl(mediaFile);
    const mediaType = mediaFile?.type.startsWith('video/') ? 'video' : 'image';
    const avatar = await toDataUrl(el.authorAvatarFile.files?.[0] || null);

    const carouselFiles = Array.from(el.carouselFiles?.files || []);
    const stampList = (el.carouselTimestamps?.value || '').split(',').map((x) => Number(x.trim()));
    const carousel = [];
    for (let i = 0; i < carouselFiles.length; i += 1) {
      const f = carouselFiles[i];
      carousel.push({ src: await toDataUrl(f), mediaType: f.type.startsWith('video/') ? 'video' : 'image', timestampSec: Number.isFinite(stampList[i]) ? stampList[i] : null });
    }

    state.posts.push({
      id: uid(), type, parentId,
      author: el.authorRandom?.checked ? pickRandomNick() : (el.authorHandle.value.trim() || '@studio.pulse'),
      authorAvatar: avatar,
      text, media, mediaType, carousel,
      timestampSec: Number.isFinite(Number(el.postTimestamp?.value)) ? Number(el.postTimestamp.value) : null,
      sponsored: Boolean(el.isSponsored.checked), vip: Boolean(el.isVip.checked), boosted: Boolean(el.isBoosted.checked),
      likes: 12, reposts: 3, createdAt: Date.now(),
    });

    persistPostAndSuggestions();
    refresh();
    el.composerForm.reset();
    if (el.authorRandom) el.authorRandom.checked = true;
    if (el.authorHandle) {
      el.authorHandle.value = '@studio.pulse';
      el.authorHandle.disabled = true;
    }
  }

  async function onAddTrack(e) {
    e.preventDefault();
    const file = el.musicFile.files?.[0] || null;
    const title = el.musicTitle.value.trim();
    const artist = el.musicArtist.value.trim();
    if (!file || !title || !artist) return alert('Şarkı eklemek için tüm alanları doldurun.');

    const track = { id: uid(), title, artist, src: await toDataUrl(file), createdAt: Date.now() };
    state.tracks.unshift(track);
    state.currentTrackId = track.id;
    if (!(await persistTracks())) {
      state.tracks = state.tracks.filter((x) => x.id !== track.id);
      return;
    }
    refresh();
    applyTrack(track.id);
    el.musicForm.reset();
  }

  function applyTrack(id) {
    const t = state.tracks.find((x) => x.id === id);
    if (!t) return;
    state.currentTrackId = id;
    audioPlayer.src = t.src;
    if (el.musicTrackTitle) el.musicTrackTitle.textContent = t.title;
    if (el.musicTrackSinger) el.musicTrackSinger.textContent = t.artist;
  }

  async function togglePlayback() {
    if (!audioPlayer.src) applyTrack(el.musicTrackSelect?.value || state.currentTrackId);
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
      try {
        await audioPlayer.play();
        autoRecordStart();
      } catch {
        alert('Tarayıcı oynatmayı engelledi.');
      }
    } else {
      audioPlayer.pause();
      autoRecordStop();
    }
    if (el.musicToggleBtn) el.musicToggleBtn.textContent = audioPlayer.paused ? '▶' : '❚❚';
  }

  function buildTimeline() {
    const events = [];
    for (const p of posts()) {
      if (Number.isFinite(p.timestampSec)) events.push({ ts: p.timestampSec, kind: 'post', post: p });
      for (const c of comments(p.id)) if (Number.isFinite(c.timestampSec)) events.push({ ts: c.timestampSec, kind: 'comment', post: p, comment: c });
      (p.carousel || []).forEach((it) => { if (Number.isFinite(it.timestampSec)) events.push({ ts: it.timestampSec, kind: 'carousel', post: p, item: it }); });
    }
    state.timelineEvents = events.sort((a, b) => a.ts - b.ts);
    state.timelineIndex = 0;
  }

  let overlayTimer = 0;
  let boostTimer = 0;
  function showOverlay(html, duration = 1300) {
    if (!el.timelineOverlay || page !== 'feed') return;
    clearTimeout(overlayTimer);
    clearInterval(boostTimer);
    el.timelineOverlay.innerHTML = `<div class="timeline-modal">${html}</div>`;
    overlayTimer = window.setTimeout(() => {
      if (el.timelineOverlay) el.timelineOverlay.innerHTML = '';
    }, duration);
  }

  function triggerEvent(ev, nextTs) {
    const dur = Math.max(400, ((nextTs ?? (ev.ts + 2)) - ev.ts) * 1000 - 80);
    if (ev.kind === 'carousel') {
      showOverlay(`<div class="timeline-head">Kaydırmalı post</div>${mediaNode(ev.item, 'timeline-media')}<p>${esc(ev.post.text)}</p>`, dur);
      return;
    }
    if (ev.kind === 'comment') {
      showOverlay(`<div class="timeline-head">Yorum akışı</div><div class="expand-box"><p>${esc(ev.post.text)}</p><div class="comment-bubble"><span>💬</span> <strong>${esc(ev.comment.author)}</strong><p>${esc(ev.comment.text)}</p></div></div>`, dur);
      return;
    }

    const p = ev.post;
    if (p.boosted) {
      showOverlay(`<div class="timeline-head">Trend Patlaması</div><h2>${esc(p.text)}</h2><p id="boostCounts">❤ ${p.likes} · ↻ ${p.reposts}</p>`, dur);
      let l = p.likes;
      let r = p.reposts;
      boostTimer = window.setInterval(() => {
        l += Math.floor(Math.random() * 22) + 8;
        r += Math.floor(Math.random() * 11) + 4;
        const node = document.getElementById('boostCounts');
        if (node) node.textContent = `❤ ${l} · ↻ ${r}`;
      }, 90);
      return;
    }

    const media = p.mediaType === 'video'
      ? `<video class="timeline-media" src="${p.media}" autoplay muted playsinline controls></video>`
      : mediaNode({ src: p.media, mediaType: p.mediaType }, 'timeline-media');
    showOverlay(`<div class="timeline-head">Zaman damgalı post</div><h3>${esc(p.author)}</h3><p>${esc(p.text)}</p>${media}`, dur);
  }

  function processTimeline() {
    if (page !== 'feed' || audioPlayer.paused) return;
    const t = audioPlayer.currentTime;
    if (t + 0.3 < state.lastTrackTime) {
      state.timelineIndex = state.timelineEvents.findIndex((x) => x.ts > t - 0.01);
      if (state.timelineIndex < 0) state.timelineIndex = state.timelineEvents.length;
    }
    while (state.timelineIndex < state.timelineEvents.length && state.timelineEvents[state.timelineIndex].ts <= t + 0.05) {
      const ev = state.timelineEvents[state.timelineIndex];
      triggerEvent(ev, state.timelineEvents[state.timelineIndex + 1]?.ts);
      state.timelineIndex += 1;
    }
    state.lastTrackTime = t;
  }

  let recorder = null;
  let recordedChunks = [];
  let recordStream = null;

  async function startRecording() {
    if (recorder || page !== 'feed') return;
    try {
      recordStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 60,
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          displaySurface: 'browser',
        },
        audio: true,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'exclude',
      });
      recorder = new MediaRecorder(recordStream, { mimeType: 'video/webm;codecs=vp9' });
      recordedChunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pulse-feed-${Date.now()}.webm`;
        a.click();
        recordStream?.getTracks().forEach((tr) => tr.stop());
        recorder = null;
        recordStream = null;
        if (el.recordToggleBtn) el.recordToggleBtn.textContent = '● Record';
      };
      recorder.start(250);
      if (el.recordToggleBtn) el.recordToggleBtn.textContent = '■ Stop';
    } catch {
      alert('Kayıt başlatılamadı. Tarayıcı izinlerini kontrol edin.');
    }
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  const autoRecordStart = () => { void startRecording(); };
  const autoRecordStop = () => { stopRecording(); };

  function bind() {
    if (el.postType && el.parentPostSelect) {
      el.postType.addEventListener('change', () => { el.parentPostSelect.disabled = el.postType.value !== 'comment'; });
      el.parentPostSelect.disabled = true;
    }
    if (el.authorRandom) {
      el.authorHandle.disabled = el.authorRandom.checked;
      el.authorRandom.addEventListener('change', () => { el.authorHandle.disabled = el.authorRandom.checked; });
    }

    if (el.composerForm) el.composerForm.addEventListener('submit', onPublish);

    if (el.manageList) {
      el.manageList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete-post-id]');
        if (!btn) return;
        const id = btn.dataset.deletePostId;
        state.posts = state.posts.filter((x) => x.id !== id && x.parentId !== id);
        persistPostAndSuggestions();
        refresh();
      });
    }

    if (el.suggestionForm) {
      el.suggestionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const handleInput = el.suggestionHandle.value.trim();
        const bio = el.suggestionBio.value.trim();
        if (!handleInput || !bio) return;
        state.suggestions.unshift({
          id: uid(),
          handle: handleInput.startsWith('@') ? handleInput : `@${handleInput}`,
          bio,
          avatar: await toDataUrl(el.suggestionAvatarFile.files?.[0] || null),
        });
        persistPostAndSuggestions();
        refresh();
        el.suggestionForm.reset();
      });
    }

    if (el.suggestionManageList) {
      el.suggestionManageList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete-suggestion-id]');
        if (!btn) return;
        state.suggestions = state.suggestions.filter((x) => x.id !== btn.dataset.deleteSuggestionId);
        persistPostAndSuggestions();
        refresh();
      });
    }

    if (el.musicForm) el.musicForm.addEventListener('submit', (e) => { void onAddTrack(e); });

    if (el.musicManageList) {
      el.musicManageList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete-track-id]');
        if (!btn) return;
        const id = btn.dataset.deleteTrackId;
        state.tracks = state.tracks.filter((x) => x.id !== id);
        if (state.currentTrackId === id) {
          state.currentTrackId = state.tracks[0]?.id || '';
          if (state.currentTrackId) applyTrack(state.currentTrackId);
          else {
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
          }
        }
        void persistTracks();
        refresh();
      });
    }

    if (el.musicTrackSelect) el.musicTrackSelect.addEventListener('change', () => applyTrack(el.musicTrackSelect.value));
    if (el.musicToggleBtn) el.musicToggleBtn.addEventListener('click', () => { void togglePlayback(); });
    if (el.musicPrevBtn) el.musicPrevBtn.addEventListener('click', () => {
      if (!state.tracks.length) return;
      const i = state.tracks.findIndex((x) => x.id === state.currentTrackId);
      applyTrack(state.tracks[(i - 1 + state.tracks.length) % state.tracks.length].id);
    });
    if (el.musicNextBtn) el.musicNextBtn.addEventListener('click', () => {
      if (!state.tracks.length) return;
      const i = state.tracks.findIndex((x) => x.id === state.currentTrackId);
      applyTrack(state.tracks[(i + 1) % state.tracks.length].id);
    });
    if (el.musicProgress) el.musicProgress.addEventListener('input', () => {
      if (!audioPlayer.duration) return;
      audioPlayer.currentTime = (Number(el.musicProgress.value) / 100) * audioPlayer.duration;
      processTimeline();
    });

    if (el.recordToggleBtn) el.recordToggleBtn.addEventListener('click', () => { if (recorder) stopRecording(); else void startRecording(); });
    if (el.searchInput) el.searchInput.addEventListener('input', renderSuggestions);
    if (el.autoScrollEnabled) el.autoScrollEnabled.addEventListener('change', () => { state.autoScroll = el.autoScrollEnabled.checked; });
    if (el.pauseAtPosts) el.pauseAtPosts.addEventListener('change', () => { state.pauseAtPosts = el.pauseAtPosts.checked; });
    if (el.scrollSpeed) el.scrollSpeed.addEventListener('input', () => { state.speedPxPerSecond = Number(el.scrollSpeed.value); });
  }

  function tick(now) {
    if (page === 'feed' && state.autoScroll) {
      const delta = (now - state.lastTime) / 1000;
      window.scrollBy(0, state.speedPxPerSecond * delta);
    }
    state.lastTime = now;
    requestAnimationFrame(tick);
  }

  function initVisualizer() {
    const canvas = el.musicVisualizer;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const w = canvas.width = canvas.clientWidth;
      const h = canvas.height = canvas.clientHeight;
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i += 1) {
        const hh = audioPlayer.paused ? 10 : 14 + (Math.random() * 44);
        ctx.fillStyle = '#6f8fff';
        ctx.fillRect(12 + (i * 8), (h / 2) - (hh / 2), 5, hh);
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  function initAudio() {
    audioPlayer.addEventListener('timeupdate', () => {
      if (el.musicCurrentTime) el.musicCurrentTime.textContent = fmt(audioPlayer.currentTime);
      if (el.musicDuration) el.musicDuration.textContent = fmt(audioPlayer.duration);
      if (el.musicProgress && audioPlayer.duration) {
        el.musicProgress.value = String((audioPlayer.currentTime / audioPlayer.duration) * 100);
      }
      processTimeline();
    });

    audioPlayer.addEventListener('ended', () => {
      if (el.musicToggleBtn) el.musicToggleBtn.textContent = '▶';
      autoRecordStop();
      if (el.timelineOverlay) el.timelineOverlay.innerHTML = '';
    });
    audioPlayer.addEventListener('pause', autoRecordStop);
  }

  async function init() {
    await loadData();
    refresh();
    bind();
    initVisualizer();
    initAudio();
    if (state.currentTrackId) applyTrack(state.currentTrackId);
    requestAnimationFrame(tick);
  }

  void init();
})();
