import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcp_2xMi_QuG_4iM_vEEfHQHyaZsW3DaA",
  authDomain: "spotworthhy.firebaseapp.com",
  projectId: "spotworthhy",
  storageBucket: "spotworthhy.firebasestorage.app",
  messagingSenderId: "880938651118",
  appId: "1:880938651118:web:c43d1c1ec2c986623612ff",
  measurementId: "G-0ZHB4NB54P",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

let currentUser = null;

const PIN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.5 11.15 7.15 11.73a1.25 1.25 0 0 0 1.7 0C13.5 21.15 20 15.25 20 10c0-4.42-3.58-8-8-8Z" fill="currentColor"/>
</svg>`;

function starString(n) {
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function displayName(u) {
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return name || u.username;
}

function errorMessageFor(err) {
  const code = err && err.code ? err.code : '';
  if (code.includes('email-already-in-use')) return 'Denne e-postadressen er allerede registrert.';
  if (code.includes('weak-password')) return 'Passordet er for svakt (minst 6 tegn).';
  if (code.includes('invalid-email')) return 'Ugyldig e-postadresse.';
  if (code.includes('network-request-failed')) return 'Nettverksfeil. Sjekk internettforbindelsen.';
  return 'Noe gikk galt: ' + (err && err.message ? err.message : 'ukjent feil');
}

function postToHTML(post, authorUsername, options) {
  const editable = options && options.editable;
  const photo = post.photo
    ? `<img src="${post.photo}" alt="">`
    : `<div class="photo-icon-wrap"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10.5 12 5l6 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 9.5V18a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  const pin = post.address
    ? `<a class="pin-badge" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.address)}" target="_blank" rel="noopener" title="Se ${escapeHTML(post.address)} på kart">${PIN_SVG}</a>`
    : '';
  const visLabel = post.visibility === 'venner' ? 'Kun venner' : 'Offentlig';
  const tags = post.tags && post.tags.length
    ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag-pill">#${escapeHTML(t)}</span>`).join('')}</div>`
    : '';
  const actions = editable
    ? `<div class="feed-actions">
        <button type="button" class="btn btn-outline btn-sm edit-post-btn" data-id="${post.id}">Rediger</button>
        <button type="button" class="btn btn-outline btn-sm delete-post-btn" data-id="${post.id}">Slett</button>
      </div>`
    : '';

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
      ${tags}
      <div class="feed-meta">
        <span>@${escapeHTML(authorUsername || '?')}</span>
        <span class="vis-pill">${visLabel}</span>
      </div>
      ${actions}
    </article>
  `;
}

/* ---------------- Firestore helpers ---------------- */
async function isUsernameTaken(username) {
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
  return snap.exists();
}

async function fetchAllUsers() {
  const snap = await getDocs(query(collection(db, 'users'), limit(100)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

async function fetchPostsForUids(uids) {
  if (!uids.length) return [];
  const snap = await getDocs(query(collection(db, 'posts'), where('authorUid', 'in', uids)));
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return posts;
}

async function buildFriendUsersMap() {
  const map = { [currentUser.uid]: currentUser };
  await Promise.all((currentUser.friends || []).map(async (uid) => {
    const s = await getDoc(doc(db, 'users', uid));
    if (s.exists()) map[uid] = { uid, ...s.data() };
  }));
  return map;
}

/* ---------------- Friend state + requests ---------------- */
function getFriendState(user, uid) {
  if (!user) return 'none';
  if ((user.friends || []).includes(uid)) return 'friends';
  if ((user.sentRequests || []).includes(uid)) return 'sent';
  if ((user.incomingRequests || []).includes(uid)) return 'incoming';
  return 'none';
}

async function sendFriendRequest(targetUid) {
  await updateDoc(doc(db, 'users', currentUser.uid), { sentRequests: arrayUnion(targetUid) });
  await updateDoc(doc(db, 'users', targetUid), { incomingRequests: arrayUnion(currentUser.uid) });
  currentUser.sentRequests = [...(currentUser.sentRequests || []), targetUid];
}

async function acceptFriendRequest(requesterUid) {
  await updateDoc(doc(db, 'users', currentUser.uid), {
    incomingRequests: arrayRemove(requesterUid),
    friends: arrayUnion(requesterUid),
  });
  await updateDoc(doc(db, 'users', requesterUid), {
    friends: arrayUnion(currentUser.uid),
    sentRequests: arrayRemove(currentUser.uid),
  });
  currentUser.incomingRequests = (currentUser.incomingRequests || []).filter((u) => u !== requesterUid);
  currentUser.friends = [...(currentUser.friends || []), requesterUid];
}

async function declineFriendRequest(requesterUid) {
  await updateDoc(doc(db, 'users', currentUser.uid), { incomingRequests: arrayRemove(requesterUid) });
  currentUser.incomingRequests = (currentUser.incomingRequests || []).filter((u) => u !== requesterUid);
}

function updateRequestBadges() {
  const count = currentUser?.incomingRequests?.length || 0;
  document.querySelectorAll('.nav-badge').forEach((el) => { el.hidden = count === 0; });
  const tabBadge = document.getElementById('requests-badge');
  if (tabBadge) {
    tabBadge.textContent = String(count);
    tabBadge.hidden = count === 0;
  }
}

/* ---------------- Feed rendering ---------------- */
async function renderFeed() {
  const feedList = document.getElementById('feed-list');
  const feedEmpty = document.getElementById('feed-empty');
  if (!feedList || !currentUser) return;

  const searchInput = document.getElementById('feed-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const uids = [currentUser.uid, ...(currentUser.friends || [])].slice(0, 30);
  const [usersMap, posts] = await Promise.all([buildFriendUsersMap(), fetchPostsForUids(uids)]);

  const filtered = q
    ? posts.filter((p) => [p.text || '', p.address || '', ...(p.tags || [])].join(' ').toLowerCase().includes(q))
    : posts;

  if (filtered.length === 0) {
    feedEmpty.hidden = false;
    const title = document.getElementById('feed-empty-title');
    const text = document.getElementById('feed-empty-text');
    if (q) {
      if (title) title.textContent = 'Ingen treff';
      if (text) text.textContent = `Fant ingen anmeldelser som matcher "${q}".`;
    } else {
      if (title) title.textContent = 'Ingen anmeldelser enda';
      if (text) text.textContent = 'Følg venner for å se hva de anbefaler, eller trykk på + nederst for å legge ut din egen første anmeldelse.';
    }
    feedList.innerHTML = '';
    return;
  }
  feedEmpty.hidden = true;
  feedList.innerHTML = filtered
    .map((p) => postToHTML(p, usersMap[p.authorUid]?.username, { editable: p.authorUid === currentUser.uid }))
    .join('');
}

async function renderMyPosts() {
  const myPosts = document.getElementById('my-posts');
  if (!myPosts || !currentUser) return;
  const posts = await fetchPostsForUids([currentUser.uid]);
  myPosts.innerHTML = posts.length
    ? posts.map((p) => postToHTML(p, currentUser.username, { editable: true })).join('')
    : '<p class="empty-hint">Du har ikke lagt ut noen anmeldelser enda.</p>';
}

document.getElementById('feed-search-input')?.addEventListener('input', renderFeed);

document.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('.delete-post-btn');
  if (!delBtn || !currentUser) return;
  if (!confirm('Slette denne anmeldelsen? Dette kan ikke angres.')) return;
  await deleteDoc(doc(db, 'posts', delBtn.dataset.id));
  await renderFeed();
  await renderMyPosts();
});

/* ---------------- Password show/hide toggles ---------------- */
document.querySelectorAll('.password-toggle').forEach((btn) => {
  const input = document.getElementById(btn.dataset.target);
  const eye = btn.querySelector('.icon-eye');
  const eyeOff = btn.querySelector('.icon-eye-off');
  if (!input) return;
  btn.addEventListener('click', () => {
    const showingText = input.type === 'password';
    input.type = showingText ? 'text' : 'password';
    eye.hidden = showingText;
    eyeOff.hidden = !showingText;
  });
});

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
    window.location.href = currentUser ? 'feed.html' : 'logg-inn.html';
  });
})();

function updateDrawerLoginButton() {
  const loginBtn = document.getElementById('drawer-login');
  if (!loginBtn) return;
  loginBtn.textContent = currentUser ? 'Gå til feed' : 'Logg inn';
}

/* ---------------- Registration flow (registrer.html) ---------------- */
(function initRegister() {
  const registerForm = document.getElementById('register-form');
  if (!registerForm) return;

  const usernameInput = document.getElementById('reg-username');
  const usernameHint = document.getElementById('username-hint');
  let checkTimer = null;

  usernameInput?.addEventListener('input', () => {
    clearTimeout(checkTimer);
    const val = usernameInput.value.trim().replace(/^@/, '');
    if (!val) { usernameHint.textContent = ''; usernameHint.classList.remove('field-error'); return; }
    checkTimer = setTimeout(async () => {
      const taken = await isUsernameTaken(val);
      usernameHint.textContent = taken ? 'Opptatt' : 'Ledig';
      usernameHint.classList.toggle('field-error', taken);
    }, 350);
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const username = usernameInput.value.trim().replace(/^@/, '').toLowerCase();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;
    const mismatchError = document.getElementById('password-mismatch-error');
    const email = document.getElementById('reg-email').value.trim();
    const firstName = document.getElementById('reg-first').value.trim();
    const lastName = document.getElementById('reg-last').value.trim();

    if (password !== passwordConfirm) {
      mismatchError.hidden = false;
      return;
    }
    mismatchError.hidden = true;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Oppretter konto...';

    try {
      if (await isUsernameTaken(username)) {
        usernameHint.textContent = 'Dette brukernavnet er allerede tatt. Velg et annet.';
        usernameHint.classList.add('field-error');
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      await setDoc(doc(db, 'usernames', username), { uid, email });
      await setDoc(doc(db, 'users', uid), {
        firstName, lastName, username, email,
        bio: '', avatar: '', private: false,
        friends: [], sentRequests: [], incomingRequests: [],
      });

      sendEmailVerification(cred.user).catch(() => {});

      document.getElementById('sent-email').textContent = email;
      document.getElementById('step-1').hidden = true;
      document.getElementById('step-2').hidden = false;
    } catch (err) {
      alert(errorMessageFor(err));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send bekreftelseskode';
    }
  });

  document.getElementById('go-to-feed')?.addEventListener('click', () => {
    window.location.href = 'feed.html';
  });
})();

/* ---------------- Login flow (logg-inn.html) ---------------- */
(function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const idVal = document.getElementById('login-id').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logger inn...';

    try {
      let email = idVal;
      if (!idVal.includes('@')) {
        const unameSnap = await getDoc(doc(db, 'usernames', idVal.toLowerCase()));
        if (!unameSnap.exists()) throw { code: 'auth/user-not-found' };
        email = unameSnap.data().email;
      }
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'feed.html';
    } catch (err) {
      errorEl.textContent = 'Fant ingen konto med disse opplysningene, eller feil passord.';
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Logg inn';
    }
  });
})();

/* ---------------- Image cropper (shared by create post sheet) ---------------- */
function initCropper(onCropped) {
  const overlay = document.getElementById('crop-overlay');
  const viewport = document.getElementById('crop-viewport');
  const image = document.getElementById('crop-image');
  const zoom = document.getElementById('crop-zoom');
  const cancelBtn = document.getElementById('crop-cancel');
  const confirmBtn = document.getElementById('crop-confirm');
  if (!overlay) return { open: () => {} };

  const VIEWPORT_SIZE = 280;
  const OUTPUT_SIZE = 640;
  let state = { naturalW: 0, naturalH: 0, baseScale: 1, scale: 1, left: 0, top: 0 };
  let dragStart = null;

  function clamp() {
    const totalScale = state.baseScale * state.scale;
    const w = state.naturalW * totalScale;
    const h = state.naturalH * totalScale;
    state.left = Math.min(0, Math.max(VIEWPORT_SIZE - w, state.left));
    state.top = Math.min(0, Math.max(VIEWPORT_SIZE - h, state.top));
  }

  function render() {
    const totalScale = state.baseScale * state.scale;
    image.style.width = `${state.naturalW * totalScale}px`;
    image.style.height = `${state.naturalH * totalScale}px`;
    image.style.left = `${state.left}px`;
    image.style.top = `${state.top}px`;
  }

  viewport.addEventListener('pointerdown', (e) => {
    dragStart = { x: e.clientX, y: e.clientY, left: state.left, top: state.top };
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    state.left = dragStart.left + (e.clientX - dragStart.x);
    state.top = dragStart.top + (e.clientY - dragStart.y);
    clamp();
    render();
  });
  viewport.addEventListener('pointerup', () => { dragStart = null; });
  viewport.addEventListener('pointerleave', () => { dragStart = null; });

  zoom.addEventListener('input', () => {
    state.scale = Number(zoom.value);
    clamp();
    render();
  });

  cancelBtn.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  confirmBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    const totalScale = state.baseScale * state.scale;
    const outputScale = OUTPUT_SIZE / VIEWPORT_SIZE;
    ctx.drawImage(
      image,
      0, 0, state.naturalW, state.naturalH,
      state.left * outputScale, state.top * outputScale,
      state.naturalW * totalScale * outputScale, state.naturalH * totalScale * outputScale
    );
    overlay.classList.remove('open');
    onCropped(canvas.toDataURL('image/jpeg', 0.8));
  });

  return {
    open(srcDataUrl) {
      image.onload = () => {
        state.naturalW = image.naturalWidth;
        state.naturalH = image.naturalHeight;
        state.baseScale = Math.max(VIEWPORT_SIZE / state.naturalW, VIEWPORT_SIZE / state.naturalH);
        state.scale = 1;
        state.left = (VIEWPORT_SIZE - state.naturalW * state.baseScale) / 2;
        state.top = (VIEWPORT_SIZE - state.naturalH * state.baseScale) / 2;
        render();
      };
      zoom.value = 1;
      image.src = srcDataUrl;
      overlay.classList.add('open');
    },
  };
}

/* ---------------- Create / edit post sheet ---------------- */
(function initCreatePost() {
  const trigger = document.getElementById('create-post-trigger');
  const overlay = document.getElementById('create-overlay');
  if (!trigger || !overlay) return;

  const closeBtn = document.getElementById('create-close');
  const sheetTitle = document.querySelector('#create-overlay .sheet-head h3');
  const form = document.getElementById('create-form');
  const submitBtn = form.querySelector('button[type="submit"]');
  const photoInput = document.getElementById('post-photo');
  const photoPreviewImg = document.getElementById('photo-preview-img');
  const photoPreviewText = document.getElementById('photo-preview-text');
  const starPicker = document.getElementById('star-picker');
  const postText = document.getElementById('post-text');
  const charCount = document.getElementById('char-count');
  const addressInput = document.getElementById('post-address');
  const visToggle = document.getElementById('visibility-toggle');
  const tagPicker = document.getElementById('tag-picker');
  const customTagInput = document.getElementById('custom-tag-input');
  const addCustomTagBtn = document.getElementById('add-custom-tag');
  const customTagsList = document.getElementById('custom-tags-list');

  const cropper = initCropper((croppedDataUrl) => {
    currentPhoto = croppedDataUrl;
    photoPreviewImg.src = currentPhoto;
    photoPreviewImg.hidden = false;
    photoPreviewText.hidden = true;
    photoInput.value = '';
  });

  const presetTagValues = [...tagPicker.querySelectorAll('.tag-chip')].map((b) => b.dataset.tag);

  let currentPhoto = '';
  let currentStars = 0;
  let currentVis = 'offentlig';
  let currentTags = [];
  let editingPostId = null;

  function renderCustomTags() {
    const customOnes = currentTags.filter((t) => !presetTagValues.includes(t));
    customTagsList.innerHTML = customOnes.map((t) => `
      <span class="tag-pill removable-tag">#${escapeHTML(t)} <button type="button" class="remove-tag-btn" data-tag="${escapeHTML(t)}">×</button></span>
    `).join('');
  }

  function addCustomTag() {
    const val = customTagInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!val || currentTags.includes(val)) { customTagInput.value = ''; return; }
    currentTags = [...currentTags, val];
    customTagInput.value = '';
    renderCustomTags();
  }

  addCustomTagBtn.addEventListener('click', addCustomTag);
  customTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); }
  });
  customTagsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-tag-btn');
    if (!btn) return;
    currentTags = currentTags.filter((t) => t !== btn.dataset.tag);
    renderCustomTags();
  });

  function resetForm() {
    form.reset();
    currentPhoto = '';
    currentStars = 0;
    currentVis = 'offentlig';
    currentTags = [];
    editingPostId = null;
    sheetTitle.textContent = 'Nytt innlegg';
    submitBtn.textContent = 'Publiser';
    photoPreviewImg.hidden = true;
    photoPreviewText.hidden = false;
    charCount.textContent = '0/100';
    [...starPicker.children].forEach((b) => b.classList.remove('active'));
    [...visToggle.children].forEach((b) => b.classList.toggle('active', b.dataset.vis === 'offentlig'));
    tagPicker.querySelectorAll('.tag-chip').forEach((b) => b.classList.remove('active'));
    renderCustomTags();
  }

  async function openEditForm(postId) {
    const snap = await getDoc(doc(db, 'posts', postId));
    if (!snap.exists()) return;
    const post = { id: snap.id, ...snap.data() };

    editingPostId = postId;
    currentPhoto = post.photo || '';
    currentStars = post.stars;
    currentVis = post.visibility;
    currentTags = post.tags ? [...post.tags] : [];

    if (currentPhoto) {
      photoPreviewImg.src = currentPhoto;
      photoPreviewImg.hidden = false;
      photoPreviewText.hidden = true;
    } else {
      photoPreviewImg.hidden = true;
      photoPreviewText.hidden = false;
    }
    postText.value = post.text || '';
    charCount.textContent = `${postText.value.length}/100`;
    addressInput.value = post.address || '';
    [...starPicker.children].forEach((b) => b.classList.toggle('active', Number(b.dataset.star) <= currentStars));
    [...visToggle.children].forEach((b) => b.classList.toggle('active', b.dataset.vis === currentVis));
    tagPicker.querySelectorAll('.tag-chip').forEach((b) => b.classList.toggle('active', currentTags.includes(b.dataset.tag)));
    renderCustomTags();

    sheetTitle.textContent = 'Rediger innlegg';
    submitBtn.textContent = 'Lagre endringer';
    overlay.classList.add('open');
  }

  trigger.addEventListener('click', () => { resetForm(); overlay.classList.add('open'); });
  closeBtn?.addEventListener('click', () => { overlay.classList.remove('open'); resetForm(); });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.classList.remove('open'); resetForm(); }
  });

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-post-btn');
    if (editBtn) openEditForm(editBtn.dataset.id);
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cropper.open(reader.result);
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

  tagPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-chip');
    if (!btn) return;
    const tag = btn.dataset.tag;
    btn.classList.toggle('active');
    currentTags = btn.classList.contains('active')
      ? [...currentTags, tag]
      : currentTags.filter((t) => t !== tag);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (currentStars === 0) {
      alert('Velg en stjernevurdering før du publiserer.');
      return;
    }

    const postData = {
      photo: currentPhoto,
      stars: currentStars,
      text: postText.value.trim(),
      address: addressInput.value.trim(),
      visibility: currentVis,
      tags: currentTags,
      authorUid: currentUser.uid,
    };

    submitBtn.disabled = true;
    try {
      if (editingPostId) {
        await updateDoc(doc(db, 'posts', editingPostId), postData);
      } else {
        await addDoc(collection(db, 'posts'), { ...postData, createdAt: serverTimestamp() });
      }
      overlay.classList.remove('open');
      resetForm();
      await renderFeed();
      await renderMyPosts();
    } catch (err) {
      alert('Klarte ikke å lagre innlegget: ' + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

/* ---------------- Search + friend requests sheet ---------------- */
function initSearchAndRequests() {
  const trigger = document.getElementById('search-trigger');
  const overlay = document.getElementById('search-overlay');
  if (!trigger || !overlay || !currentUser) return;

  const closeBtn = document.getElementById('search-close');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const requestsList = document.getElementById('requests-list');
  const tabBtns = document.querySelectorAll('#search-overlay .tab-btn');
  const panels = document.querySelectorAll('#search-overlay .tab-panel');

  function actionButtonHTML(uid) {
    const state = getFriendState(currentUser, uid);
    if (state === 'friends') return `<button type="button" class="btn btn-ghost btn-sm" disabled>Venner</button>`;
    if (state === 'sent') return `<button type="button" class="btn btn-ghost btn-sm" disabled>Forespørsel sendt</button>`;
    if (state === 'incoming') return `<button type="button" class="btn btn-primary btn-sm friend-accept-btn" data-uid="${uid}">Godta</button>`;
    return `<button type="button" class="btn btn-outline btn-sm friend-request-btn" data-uid="${uid}">Legg til</button>`;
  }

  async function renderSearch(queryStr) {
    const q = queryStr.trim().toLowerCase();
    const all = await fetchAllUsers();
    const pool = all.filter((u) => u.uid !== currentUser.uid);
    const matches = q
      ? pool.filter((f) => displayName(f).toLowerCase().includes(q) || f.username.toLowerCase().includes(q))
      : pool;

    results.innerHTML = matches.length
      ? matches.map((f) => `
        <div class="search-row">
          <a class="search-row-info" href="bruker.html?u=${encodeURIComponent(f.username)}">
            <strong>${escapeHTML(displayName(f))}</strong>
            <span>@${escapeHTML(f.username)}</span>
          </a>
          ${actionButtonHTML(f.uid)}
        </div>
      `).join('')
      : '<p class="empty-hint">Ingen treff ennå. Etter hvert som flere oppretter konto på spotworthy, dukker de opp her.</p>';
  }

  async function renderRequests() {
    if (!requestsList) return;
    const incoming = currentUser.incomingRequests || [];
    const people = (await Promise.all(incoming.map(async (uid) => {
      const s = await getDoc(doc(db, 'users', uid));
      return s.exists() ? { uid, ...s.data() } : null;
    }))).filter(Boolean);

    requestsList.innerHTML = people.length
      ? people.map((f) => `
        <div class="search-row">
          <a class="search-row-info" href="bruker.html?u=${encodeURIComponent(f.username)}">
            <strong>${escapeHTML(displayName(f))}</strong>
            <span>@${escapeHTML(f.username)}</span>
          </a>
          <div class="request-actions">
            <button type="button" class="btn btn-primary btn-sm request-accept-btn" data-uid="${f.uid}">Godta</button>
            <button type="button" class="btn btn-outline btn-sm request-decline-btn" data-uid="${f.uid}">Avslå</button>
          </div>
        </div>
      `).join('')
      : '<p class="empty-hint">Ingen ventende forespørsler.</p>';
  }

  function switchTab(tab) {
    tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  trigger.addEventListener('click', async () => {
    overlay.classList.add('open');
    input.value = '';
    await renderSearch('');
    await renderRequests();
    switchTab((currentUser.incomingRequests?.length || 0) > 0 ? 'requests' : 'search');
  });
  closeBtn?.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  input.addEventListener('input', () => renderSearch(input.value));

  results.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('.friend-request-btn');
    const acceptBtn = e.target.closest('.friend-accept-btn');
    if (addBtn) {
      await sendFriendRequest(addBtn.dataset.uid);
      await renderSearch(input.value);
    } else if (acceptBtn) {
      await acceptFriendRequest(acceptBtn.dataset.uid);
      await renderSearch(input.value);
      await renderRequests();
      updateRequestBadges();
      await renderFeed();
    }
  });

  requestsList?.addEventListener('click', async (e) => {
    const acceptBtn = e.target.closest('.request-accept-btn');
    const declineBtn = e.target.closest('.request-decline-btn');
    if (acceptBtn) {
      await acceptFriendRequest(acceptBtn.dataset.uid);
      await renderRequests();
      await renderSearch(input.value);
      updateRequestBadges();
      await renderFeed();
    } else if (declineBtn) {
      await declineFriendRequest(declineBtn.dataset.uid);
      await renderRequests();
      updateRequestBadges();
    }
  });
}

/* ---------------- Own profile page (profil.html) ---------------- */
function initProfilePage() {
  const usernameEl = document.getElementById('profile-username');
  if (!usernameEl || !currentUser) return;

  const nameEl = document.getElementById('profile-name');
  const usernameInput = document.getElementById('username-input');
  const usernameHint = document.getElementById('username-hint');
  const bioInput = document.getElementById('bio-input');
  const bioCount = document.getElementById('bio-count');
  const privateToggle = document.getElementById('private-toggle');
  const avatarImg = document.getElementById('avatar-img');
  const avatarPlaceholder = document.getElementById('avatar-placeholder');
  const avatarInput = document.getElementById('avatar-input');
  const saveBtn = document.getElementById('save-profile');
  const logoutBtn = document.getElementById('logout-btn');
  let unameTimer = null;

  function refresh() {
    usernameEl.textContent = '@' + currentUser.username;
    nameEl.textContent = displayName(currentUser);
    usernameInput.value = currentUser.username;
    bioInput.value = currentUser.bio || '';
    bioCount.textContent = `${bioInput.value.length}/100`;
    privateToggle.checked = !!currentUser.private;
    if (currentUser.avatar) {
      avatarImg.src = currentUser.avatar;
      avatarImg.hidden = false;
      avatarPlaceholder.hidden = true;
    }
  }
  refresh();

  usernameInput.addEventListener('input', () => {
    clearTimeout(unameTimer);
    const val = usernameInput.value.trim().replace(/^@/, '');
    if (!val || val.toLowerCase() === currentUser.username.toLowerCase()) {
      usernameHint.textContent = '';
      usernameHint.classList.remove('field-error');
      return;
    }
    unameTimer = setTimeout(async () => {
      const taken = await isUsernameTaken(val);
      usernameHint.textContent = taken ? 'Opptatt' : 'Ledig';
      usernameHint.classList.toggle('field-error', taken);
    }, 350);
  });

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

  saveBtn.addEventListener('click', async () => {
    const newUsername = usernameInput.value.trim().replace(/^@/, '').toLowerCase();
    saveBtn.disabled = true;
    try {
      if (newUsername && newUsername !== currentUser.username) {
        if (await isUsernameTaken(newUsername)) {
          usernameHint.textContent = 'Dette brukernavnet er opptatt.';
          usernameHint.classList.add('field-error');
          return;
        }
        await setDoc(doc(db, 'usernames', newUsername), { uid: currentUser.uid, email: currentUser.email });
        await deleteDoc(doc(db, 'usernames', currentUser.username));
        currentUser.username = newUsername;
      }

      const updates = {
        username: currentUser.username,
        bio: bioInput.value.trim(),
        private: privateToggle.checked,
        avatar: avatarImg.hidden ? '' : avatarImg.src,
      };
      await updateDoc(doc(db, 'users', currentUser.uid), updates);
      Object.assign(currentUser, updates);

      refresh();
      await renderMyPosts();
      saveBtn.textContent = 'Lagret!';
      setTimeout(() => { saveBtn.textContent = 'Lagre profil'; }, 1500);
    } catch (err) {
      alert('Klarte ikke å lagre: ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });

  renderMyPosts();
}

/* ---------------- Viewed (friend) profile page (bruker.html) ---------------- */
async function initViewedProfilePage() {
  const usernameEl = document.getElementById('viewed-username');
  if (!usernameEl || !currentUser) return;

  const params = new URLSearchParams(window.location.search);
  const targetUsername = (params.get('u') || '').replace(/^@/, '').toLowerCase();
  const friendBtn = document.getElementById('viewed-friend-btn');

  const unameSnap = await getDoc(doc(db, 'usernames', targetUsername));
  if (!unameSnap.exists()) {
    usernameEl.textContent = 'Fant ikke brukeren';
    if (friendBtn) friendBtn.hidden = true;
    return;
  }
  const targetUid = unameSnap.data().uid;

  if (targetUid === currentUser.uid) {
    window.location.href = 'profil.html';
    return;
  }

  const targetSnap = await getDoc(doc(db, 'users', targetUid));
  if (!targetSnap.exists()) {
    usernameEl.textContent = 'Fant ikke brukeren';
    if (friendBtn) friendBtn.hidden = true;
    return;
  }
  const target = { uid: targetUid, ...targetSnap.data() };

  const nameEl = document.getElementById('viewed-name');
  const bioEl = document.getElementById('viewed-bio');
  const avatarImg = document.getElementById('viewed-avatar-img');
  const avatarInitial = document.getElementById('viewed-avatar-initial');
  const lockedEl = document.getElementById('viewed-locked');
  const postsTitle = document.getElementById('viewed-posts-title');
  const postsEl = document.getElementById('viewed-posts');

  usernameEl.textContent = '@' + target.username;
  nameEl.textContent = displayName(target);
  bioEl.textContent = target.bio || '';
  if (target.avatar) {
    avatarImg.src = target.avatar;
    avatarImg.hidden = false;
    avatarInitial.hidden = true;
  } else {
    avatarInitial.textContent = displayName(target).charAt(0).toUpperCase();
  }

  function renderFriendButton() {
    const state = getFriendState(currentUser, target.uid);
    friendBtn.classList.remove('btn-outline', 'btn-primary', 'btn-ghost');
    friendBtn.disabled = false;
    if (state === 'friends') {
      friendBtn.textContent = 'Venner';
      friendBtn.classList.add('btn-ghost');
      friendBtn.disabled = true;
    } else if (state === 'sent') {
      friendBtn.textContent = 'Forespørsel sendt';
      friendBtn.classList.add('btn-ghost');
      friendBtn.disabled = true;
    } else if (state === 'incoming') {
      friendBtn.textContent = 'Godta forespørsel';
      friendBtn.classList.add('btn-primary');
    } else {
      friendBtn.textContent = 'Legg til venn';
      friendBtn.classList.add('btn-outline');
    }
  }

  async function renderPosts() {
    const isFriend = (currentUser.friends || []).includes(target.uid);
    if (target.private && !isFriend) {
      lockedEl.hidden = false;
      postsTitle.hidden = true;
      postsEl.innerHTML = '';
      return;
    }
    lockedEl.hidden = true;
    postsTitle.hidden = false;
    const snap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', target.uid)));
    let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    posts = posts.filter((p) => p.visibility === 'offentlig' || isFriend);
    posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    postsEl.innerHTML = posts.length
      ? posts.map((p) => postToHTML(p, target.username)).join('')
      : '<p class="empty-hint">Ingen synlige anmeldelser.</p>';
  }

  friendBtn.addEventListener('click', async () => {
    const state = getFriendState(currentUser, target.uid);
    if (state === 'none') await sendFriendRequest(target.uid);
    if (state === 'incoming') await acceptFriendRequest(target.uid);
    renderFriendButton();
    await renderPosts();
    updateRequestBadges();
  });

  renderFriendButton();
  await renderPosts();
}

/* ---------------- App shell guard ---------------- */
function guardAppPages() {
  if (!document.body.classList.contains('app-body')) return;
  if (!currentUser) {
    window.location.href = 'logg-inn.html';
  } else {
    updateRequestBadges();
  }
}

/* ---------------- Auth state entry point ---------------- */
onAuthStateChanged(auth, async (fbUser) => {
  if (fbUser) {
    const snap = await getDoc(doc(db, 'users', fbUser.uid));
    currentUser = snap.exists() ? { uid: fbUser.uid, ...snap.data() } : null;
  } else {
    currentUser = null;
  }

  updateDrawerLoginButton();
  guardAppPages();
  initSearchAndRequests();
  initProfilePage();
  await initViewedProfilePage();
  await renderFeed();
});
