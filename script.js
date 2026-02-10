(() => {
  const STORAGE_KEY = 'pulseFeedPosts.v2';

  const state = {
    posts: [],
    mode: 'admin',
    autoScroll: true,
    pauseAtPosts: true,
    speedPxPerSecond: 34,
    isPaused: false,
    pauseUntil: 0,
    lastTime: performance.now(),
    loopResetPending: false,
  };

  const el = {
    adminPanel: document.getElementById('adminPanel'),
    feedPanel: document.getElementById('feedPanel'),
    adminModeBtn: document.getElementById('adminModeBtn'),
    feedModeBtn: document.getElementById('feedModeBtn'),
    form: document.getElementById('composerForm'),
    postText: document.getElementById('postText'),
    postType: document.getElementById('postType'),
    parentPostSelect: document.getElementById('parentPostSelect'),
    mediaFile: document.getElementById('mediaFile'),
    isSponsored: document.getElementById('isSponsored'),
    authorHandle: document.getElementById('authorHandle'),
    authorSubMeta: document.getElementById('authorSubMeta'),
    feed: document.getElementById('feed'),
    autoScrollEnabled: document.getElementById('autoScrollEnabled'),
    scrollSpeed: document.getElementById('scrollSpeed'),
    pauseAtPosts: document.getElementById('pauseAtPosts'),
  };

  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadPosts() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.posts = seedPosts();
      persistPosts();
      return;
    }

    try {
      state.posts = JSON.parse(raw);
    } catch {
      state.posts = seedPosts();
      persistPosts();
    }
  }

  function persistPosts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts));
  }

  function seedPosts() {
    const now = Date.now();
    const p1 = {
      id: uid(),
      type: 'post',
      author: '@nova.wave',
      subMeta: 'visual rehearsal',
      text: 'Drafting a dark pulse feed for tonight\'s background take. Loop should feel alive.',
      sponsored: false,
      media: '',
      mediaKind: '',
      createdAt: now - 1000 * 60 * 12,
      pauseMs: 2300,
      parentId: null,
    };

    const p2 = {
      id: uid(),
      type: 'post',
      author: '@arc.light',
      subMeta: 'loop tools',
      text: 'Color-matched overlays available for creators. Built for cinematic edits and fast teasers.',
      sponsored: true,
      media: '',
      mediaKind: '',
      createdAt: now - 1000 * 60 * 9,
      pauseMs: 2900,
      parentId: null,
    };

    const c1 = {
      id: uid(),
      type: 'comment',
      author: '@grainframe',
      subMeta: 'studio notes',
      text: 'This palette works perfectly with bass-heavy scenes.',
      sponsored: false,
      media: '',
      mediaKind: '',
      createdAt: now - 1000 * 60 * 7,
      pauseMs: 0,
      parentId: p1.id,
    };

    const c2 = {
      id: uid(),
      type: 'comment',
      author: '@mono.synth',
      subMeta: 'night edits',
      text: 'Can already picture this under a chorus drop.',
      sponsored: false,
      media: '',
      mediaKind: '',
      createdAt: now - 1000 * 60 * 5,
      pauseMs: 0,
      parentId: p1.id,
    };

    return [p1, p2, c1, c2];
  }

  function timeAgo(ts) {
    const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
    if (diffMin < 60) return `${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function avatarFor(author) {
    const seed = encodeURIComponent(author.replace('@', ''));
    return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
  }

  function getTopLevelPosts() {
    return state.posts
      .filter((item) => item.type === 'post')
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function getCommentsFor(parentId) {
    return state.posts
      .filter((item) => item.type === 'comment' && item.parentId === parentId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function renderParentOptions() {
    const posts = getTopLevelPosts();
    const options = ['<option value="">None</option>'];
    for (const post of posts) {
      const snippet = post.text.slice(0, 42).replace(/</g, '&lt;');
      options.push(`<option value="${post.id}">${post.author} — ${snippet}${post.text.length > 42 ? '…' : ''}</option>`);
    }
    el.parentPostSelect.innerHTML = options.join('');
  }

  function renderFeed() {
    const posts = getTopLevelPosts();
    if (!posts.length) {
      el.feed.innerHTML = '<div class="empty-feed">No posts yet. Publish from Composer mode.</div>';
      return;
    }

    const fragments = posts.map((post) => {
      const comments = getCommentsFor(post.id);
      const mediaHtml = post.media
        ? `<div class="media-wrap"><img class="media ${post.mediaKind === 'video' ? 'video-thumb' : ''}" src="${post.media}" alt="Attached media" /></div>`
        : '';

      const commentsHtml = comments.length
        ? `<section class="comments" aria-label="Comments">${comments
            .map(
              (c) => `<p class="comment"><strong>${c.author}</strong> · <span class="timestamp">${timeAgo(c.createdAt)}</span><br>${c.text}</p>`
            )
            .join('')}</section>`
        : '<section class="comments" aria-label="Comments"></section>';

      return `
        <article class="post-card" data-pause="${post.pauseMs || 0}">
          <header class="post-head">
            <img class="avatar" src="${avatarFor(post.author)}" alt="${post.author} avatar" />
            <div>
              <p class="meta-row"><span class="username">${post.author}</span> <span class="timestamp">· ${timeAgo(post.createdAt)}</span></p>
              <p class="sub-meta">${post.subMeta || 'music video drafts'}</p>
            </div>
            ${post.sponsored ? '<span class="sponsored-label">Sponsored</span>' : ''}
          </header>
          <p class="post-text">${post.text}</p>
          ${mediaHtml}
          <footer class="post-actions" aria-hidden="true">
            <span>♡ ${Math.floor(Math.random() * 900 + 25)}</span>
            <span>💬 ${comments.length}</span>
            <span>↺ ${Math.floor(Math.random() * 70 + 3)}</span>
          </footer>
          ${commentsHtml}
        </article>`;
    });

    el.feed.innerHTML = fragments.join('');
  }

  function switchMode(mode) {
    state.mode = mode;
    const isAdmin = mode === 'admin';

    el.adminPanel.classList.toggle('active', isAdmin);
    el.feedPanel.classList.toggle('active', !isAdmin);
    el.adminModeBtn.classList.toggle('active', isAdmin);
    el.feedModeBtn.classList.toggle('active', !isAdmin);
  }

  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve({ dataUrl: '', mediaKind: '' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const mediaKind = file.type.startsWith('video/') ? 'video' : 'image';
        resolve({ dataUrl: String(reader.result), mediaKind });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPublish(event) {
    event.preventDefault();

    const text = el.postText.value.trim();
    if (!text) return;

    const type = el.postType.value;
    const selectedParent = el.parentPostSelect.value || null;
    const parentId = type === 'comment' ? selectedParent : null;

    if (type === 'comment' && !parentId) {
      alert('Please select a parent post for comments.');
      return;
    }

    const file = el.mediaFile.files && el.mediaFile.files[0] ? el.mediaFile.files[0] : null;
    const { dataUrl, mediaKind } = await toDataUrl(file);

    const post = {
      id: uid(),
      type,
      author: (el.authorHandle.value.trim() || '@studio.pulse').replace(/\s+/g, ''),
      subMeta: el.authorSubMeta.value.trim() || 'music video draft',
      text,
      sponsored: el.isSponsored.checked,
      media: dataUrl,
      mediaKind,
      createdAt: Date.now(),
      pauseMs: type === 'post' ? 2200 : 0,
      parentId,
    };

    state.posts.push(post);
    persistPosts();
    renderParentOptions();
    renderFeed();

    el.form.reset();
    el.authorHandle.value = '@studio.pulse';
    el.authorSubMeta.value = 'music video draft';
    el.autoScrollEnabled.checked = state.autoScroll;
    el.pauseAtPosts.checked = state.pauseAtPosts;

    switchMode('feed');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function maybePauseAtPost(now) {
    if (!state.pauseAtPosts) return;

    const posts = Array.from(document.querySelectorAll('.post-card'));
    for (const post of posts) {
      if (post.dataset.paused === '1') continue;
      const pauseMs = Number(post.dataset.pause || 0);
      if (!pauseMs) continue;
      const rect = post.getBoundingClientRect();
      if (rect.top >= 70 && rect.top <= 160) {
        post.dataset.paused = '1';
        state.isPaused = true;
        state.pauseUntil = now + pauseMs;
        break;
      }
    }
  }

  function maybeResetLoop() {
    if (state.loopResetPending) return;
    const bottom = window.innerHeight + window.scrollY;
    const nearEnd = bottom >= document.documentElement.scrollHeight - 4;
    if (!nearEnd) return;

    state.loopResetPending = true;
    window.setTimeout(() => {
      document.querySelectorAll('.post-card').forEach((post) => delete post.dataset.paused);
      window.scrollTo({ top: 0, behavior: 'auto' });
      state.loopResetPending = false;
    }, 900);
  }

  function tick(now) {
    if (state.mode !== 'feed' || !state.autoScroll) {
      state.lastTime = now;
      requestAnimationFrame(tick);
      return;
    }

    maybeResetLoop();

    if (state.isPaused) {
      if (now >= state.pauseUntil) {
        state.isPaused = false;
      }
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
    el.adminModeBtn.addEventListener('click', () => switchMode('admin'));
    el.feedModeBtn.addEventListener('click', () => switchMode('feed'));

    el.postType.addEventListener('change', () => {
      const isComment = el.postType.value === 'comment';
      el.parentPostSelect.disabled = !isComment;
    });

    el.form.addEventListener('submit', onPublish);

    el.autoScrollEnabled.addEventListener('change', () => {
      state.autoScroll = el.autoScrollEnabled.checked;
    });

    el.pauseAtPosts.addEventListener('change', () => {
      state.pauseAtPosts = el.pauseAtPosts.checked;
    });

    el.scrollSpeed.addEventListener('input', () => {
      state.speedPxPerSecond = Number(el.scrollSpeed.value);
    });
  }

  function init() {
    loadPosts();
    renderParentOptions();
    renderFeed();
    switchMode('admin');

    el.parentPostSelect.disabled = true;
    bindEvents();

    requestAnimationFrame((start) => {
      state.lastTime = start;
      requestAnimationFrame(tick);
    });
  }

  init();
})();
