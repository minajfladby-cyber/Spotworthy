const STORAGE_KEY = 'spotworthy_user';

const PIN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.5 11.15 7.15 11.73a1.25 1.25 0 0 0 1.7 0C13.5 21.15 20 15.25 20 10c0-4.42-3.58-8-8-8Z" fill="currentColor"/>
</svg>`;

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function starString(n) {
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function postToHTML(post, rotateClass) {
  const photo = post.photo
    ? `<img src="${post.photo}" alt="">`
    : `<div class="photo-icon-wrap"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10.5 12 5l6 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 9.5V18a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  const pin = post.address
    ? `<button type="button" class="pin-badge" title="${escapeHTML(post.address)}">${PIN_SVG}</button>`
    : '';
  const visLabel = post.visibility === 'venner' ? 'Kun venner' : 'Offentlig';

  return `
    <article class="feed-card">
      <div class="polaroid-photo feed-photo photo-1">
        ${photo}
        ${pin}
      </div>
      <div class="polaroid-caption">
        <span class="place-name">${escapeHTML(post.address) || 'Ukjent sted'}</span>
        <span class="stars">${starString(post.stars)}</span>
      </div>
      ${post.text ? `<p class="feed-text">${escapeHTML(post.text)}</p>` : ''}
      <div class="feed-meta">
        <span>@${escapeHTML(post.author)}</span>
        <span class="vis-pill">${visLabel}</span>
      </div>
    </article>
  `;
}

/* ---------------- Drawer + about modal (index.html) ---------------- */
(function initDrawer() {
  const toggle = document.getElementById('menu-toggle');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  const closeBtn = document.getElementById('drawer-close');
  if (!toggle || !drawer) return;

  function open() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  document.querySelector('[data-modal="about"]')?.addEventListener('click', () => {
    close();
    modalOverlay?.classList.add('open');
  });
  modalClose?.addEventListener('click', () => modalOverlay?.classList.remove('open'));
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('open');
  });

  document.getElementById('drawer-login')?.addEventListener('click', () => {
    window.location.href = getUser() ? 'feed.html' : 'registrer.html';
  });
})();

/* ---------------- Registration flow (registrer.html) ---------------- */
(function initRegister() {
  const registerForm = document.getElementById('register-form');
  const verifyForm = document.getElementById('verify-form');
  if (!registerForm) return;

  let pendingUser = null;
  let pendingCode = null;

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    pendingUser = {
      firstName: document.getElementById('reg-first').value.trim(),
      lastName: document.getElementById('reg-last').value.trim(),
      username: document.getElementById('reg-username').value.trim().replace(/^@/, ''),
      email: document.getElementById('reg-email').value.trim(),
    };
    pendingCode = String(Math.floor(100000 + Math.random() * 900000));

    document.getElementById('sent-email').textContent = pendingUser.email;
    document.getElementById('demo-code-hint').textContent =
      `Demo-modus: denne siden har ingen e-postserver, så koden din vises her i stedet: ${pendingCode}`;

    document.getElementById('step-1').hidden = true;
    document.getElementById('step-2').hidden = false;
  });

  verifyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = document.getElementById('reg-code').value.trim();
    const errorEl = document.getElementById('code-error');

    if (entered !== pendingCode) {
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    saveUser({
      ...pendingUser,
      bio: '',
      avatar: '',
      private: false,
      posts: [],
    });

    window.location.href = 'feed.html';
  });
})();

/* ---------------- Feed rendering (feed.html + profil.html) ---------------- */
function renderFeed() {
  const feedList = document.getElementById('feed-list');
  const feedEmpty = document.getElementById('feed-empty');
  if (!feedList) return;

  const user = getUser();
  const posts = user?.posts || [];

  if (posts.length === 0) {
    if (feedEmpty) feedEmpty.hidden = false;
    feedList.innerHTML = '';
    return;
  }
  if (feedEmpty) feedEmpty.hidden = true;
  feedList.innerHTML = posts.slice().reverse().map((p) => postToHTML(p)).join('');
}

function renderMyPosts() {
  const myPosts = document.getElementById('my-posts');
  if (!myPosts) return;
  const user = getUser();
  const posts = user?.posts || [];
  if (posts.length === 0) {
    myPosts.innerHTML = '<p class="empty-hint">Du har ikke lagt ut noen anmeldelser enda.</p>';
    return;
  }
  myPosts.innerHTML = posts.slice().reverse().map((p) => postToHTML(p)).join('');
}

/* ---------------- App shell guard (feed.html + profil.html) ---------------- */
(function guardAppPages() {
  if (!document.body.classList.contains('app-body')) return;
  if (!getUser()) {
    window.location.href = 'registrer.html';
  }
})();

/* ---------------- Search sheet (feed.html + profil.html) ---------------- */
(function initSearch() {
  const trigger = document.getElementById('search-trigger');
  const overlay = document.getElementById('search-overlay');
  if (!trigger || !overlay) return;

  const closeBtn = document.getElementById('search-close');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  const MOCK_FRIENDS = [
    { name: 'Mina Fladby', username: 'minaf' },
    { name: 'Jonas Berg', username: 'jonasb' },
    { name: 'Sara Lie', username: 'sara.lie' },
    { name: 'Kafe Solvang', username: 'kafesolvang' },
    { name: 'Amir Khan', username: 'amirk' },
  ];

  function render(query) {
    const q = query.trim().toLowerCase();
    const matches = q
      ? MOCK_FRIENDS.filter((f) => f.name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q))
      : MOCK_FRIENDS;

    results.innerHTML = matches.length
      ? matches.map((f) => `
        <div class="search-row">
          <div class="search-row-info">
            <strong>${escapeHTML(f.name)}</strong>
            <span>@${escapeHTML(f.username)}</span>
          </div>
          <button type="button" class="btn btn-outline btn-sm friend-request-btn" data-username="${escapeHTML(f.username)}">Legg til</button>
        </div>
      `).join('')
      : '<p class="empty-hint">Ingen treff.</p>';
  }

  trigger.addEventListener('click', () => {
    overlay.classList.add('open');
    input.value = '';
    render('');
  });
  closeBtn?.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  input.addEventListener('input', () => render(input.value));
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('.friend-request-btn');
    if (!btn) return;
    btn.textContent = 'Forespørsel sendt';
    btn.disabled = true;
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-ghost');
  });
})();

/* ---------------- Create post sheet (feed.html + profil.html) ---------------- */
(function initCreatePost() {
  const trigger = document.getElementById('create-post-trigger');
  const overlay = document.getElementById('create-overlay');
  if (!trigger || !overlay) return;

  const closeBtn = document.getElementById('create-close');
  const form = document.getElementById('create-form');
  const photoInput = document.getElementById('post-photo');
  const photoPreviewImg = document.getElementById('photo-preview-img');
  const photoPreviewText = document.getElementById('photo-preview-text');
  const starPicker = document.getElementById('star-picker');
  const postText = document.getElementById('post-text');
  const charCount = document.getElementById('char-count');
  const visToggle = document.getElementById('visibility-toggle');

  let currentPhoto = '';
  let currentStars = 0;
  let currentVis = 'offentlig';

  function resetForm() {
    form.reset();
    currentPhoto = '';
    currentStars = 0;
    currentVis = 'offentlig';
    photoPreviewImg.hidden = true;
    photoPreviewText.hidden = false;
    charCount.textContent = '0/100';
    [...starPicker.children].forEach((b) => b.classList.remove('active'));
    [...visToggle.children].forEach((b) => b.classList.toggle('active', b.dataset.vis === 'offentlig'));
  }

  trigger.addEventListener('click', () => overlay.classList.add('open'));
  closeBtn?.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      currentPhoto = reader.result;
      photoPreviewImg.src = currentPhoto;
      photoPreviewImg.hidden = false;
      photoPreviewText.hidden = true;
    };
    reader.readAsDataURL(file);
  });

  starPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    currentStars = Number(btn.dataset.star);
    [...starPicker.children].forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.star) <= currentStars);
    });
  });

  postText.addEventListener('input', () => {
    charCount.textContent = `${postText.value.length}/100`;
  });

  visToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.vis-btn');
    if (!btn) return;
    [...visToggle.children].forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentVis = btn.dataset.vis;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = getUser();
    if (!user) return;
    if (currentStars === 0) {
      alert('Velg en stjernevurdering før du publiserer.');
      return;
    }

    user.posts = user.posts || [];
    user.posts.push({
      id: Date.now(),
      photo: currentPhoto,
      stars: currentStars,
      text: postText.value.trim(),
      address: document.getElementById('post-address').value.trim(),
      visibility: currentVis,
      author: user.username,
    });
    saveUser(user);

    overlay.classList.remove('open');
    resetForm();
    renderFeed();
    renderMyPosts();
  });
})();

/* ---------------- Profile page (profil.html) ---------------- */
(function initProfile() {
  const usernameEl = document.getElementById('profile-username');
  if (!usernameEl) return;

  const user = getUser();
  if (!user) return;

  const nameEl = document.getElementById('profile-name');
  const bioInput = document.getElementById('bio-input');
  const bioCount = document.getElementById('bio-count');
  const privateToggle = document.getElementById('private-toggle');
  const avatarImg = document.getElementById('avatar-img');
  const avatarPlaceholder = document.getElementById('avatar-placeholder');
  const avatarInput = document.getElementById('avatar-input');
  const saveBtn = document.getElementById('save-profile');

  usernameEl.textContent = '@' + user.username;
  nameEl.textContent = `${user.firstName} ${user.lastName}`.trim();
  bioInput.value = user.bio || '';
  bioCount.textContent = `${bioInput.value.length}/100`;
  privateToggle.checked = !!user.private;
  if (user.avatar) {
    avatarImg.src = user.avatar;
    avatarImg.hidden = false;
    avatarPlaceholder.hidden = true;
  }

  bioInput.addEventListener('input', () => {
    bioCount.textContent = `${bioInput.value.length}/100`;
  });

  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      avatarImg.src = reader.result;
      avatarImg.hidden = false;
      avatarPlaceholder.hidden = true;
    };
    reader.readAsDataURL(file);
  });

  saveBtn.addEventListener('click', () => {
    const current = getUser();
    current.bio = bioInput.value.trim();
    current.private = privateToggle.checked;
    current.avatar = avatarImg.hidden ? '' : avatarImg.src;
    saveUser(current);
    saveBtn.textContent = 'Lagret!';
    setTimeout(() => { saveBtn.textContent = 'Lagre profil'; }, 1500);
  });

  renderMyPosts();
})();

renderFeed();