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
auth.languageCode = 'en';
const db = getFirestore(fbApp);

import("https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js")
  .then(({ getAnalytics, isSupported }) => isSupported().then((ok) => { if (ok) getAnalytics(fbApp); }))
  .catch(() => {});

let currentUser = null;

const PIN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.5 11.15 7.15 11.73a1.25 1.25 0 0 0 1.7 0C13.5 21.15 20 15.25 20 10c0-4.42-3.58-8-8-8Z" fill="currentColor"/>
</svg>`;

const HEART_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-9.2-9.4C1.7 7.700 3.700 4.700 6.800 4.700c1.900 0 3.500 1 5.200 3 1.700-2 3.300-3 5.200-3 3.100 0 5.100 3 4 6.200-1.700 4.800-9.200 9.400-9.200 9.400Z" class="heart-path"/></svg>`;

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

function formatDate(value) {
  if (!value) return '';
  const date = typeof value === 'string'
    ? new Date(value + 'T00:00:00')
    : (value.seconds ? new Date(value.seconds * 1000) : null);
  if (!date || isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function postSortKey(post) {
  if (post.postDate) {
    const t = new Date(post.postDate + 'T00:00:00').getTime();
    if (!isNaN(t)) return t;
  }
  return (post.createdAt?.seconds || 0) * 1000;
}

function resizeToSquare(dataUrl, size) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function errorMessageFor(err) {
  const code = err && err.code ? err.code : '';
  if (code.includes('email-already-in-use')) return 'This email address is already registered.';
  if (code.includes('weak-password')) return 'Password is too weak (at least 6 characters).';
  if (code.includes('invalid-email')) return 'Invalid email address.';
  if (code.includes('network-request-failed')) return 'Network error. Check your internet connection.';
  return 'Something went wrong: ' + (err && err.message ? err.message : 'unknown error');
}

function postToHTML(post, authorUsername, options) {
  const editable = options && options.editable;
  const photo = post.photo
    ? `<img class="post-photo-img" src="${post.photo}" alt="">`
    : `<div class="photo-icon-wrap"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10.5 12 5l6 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 9.5V18a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  const pin = post.address
    ? `<a class="pin-badge" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.address)}" target="_blank" rel="noopener" title="View ${escapeHTML(post.address)} on map">${PIN_SVG}</a>`
    : '';
  const visLabel = post.visibility === 'venner' ? 'Friends only' : 'Public';
  const tags = post.tags && post.tags.length
    ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag-pill">#${escapeHTML(t)}</span>`).join('')}</div>`
    : '';
  const actions = editable
    ? `<div class="feed-actions">
        <button type="button" class="btn btn-outline btn-sm edit-post-btn" data-id="${post.id}">Edit</button>
        <button type="button" class="btn btn-outline btn-sm delete-post-btn" data-id="${post.id}">Delete</button>
      </div>`
    : '';
  const authorLink = authorUsername
    ? `<a href="bruker.html?u=${encodeURIComponent(authorUsername)}" class="feed-author-link">@${escapeHTML(authorUsername)}</a>`
    : '<span>@?</span>';
  const dateStr = formatDate(post.postDate || post.createdAt);
  // Older posts (from before place name/address were split) only had "address",
  // used as the heading. Fall back to it to avoid "Unknown place".
  const heading = post.placeName || post.address || 'Unknown place';
  const addressLine = (post.address && post.placeName)
    ? `<a class="post-address-line" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.address)}" target="_blank" rel="noopener">${PIN_SVG}<span>${escapeHTML(post.address)}</span></a>`
    : '';

  const likes = Array.isArray(post.likes) ? post.likes : [];
  const liked = !!currentUser && likes.includes(currentUser.uid);
  const likeBtn = `<button type="button" class="like-btn${liked ? ' liked' : ''}" data-id="${post.id}" aria-pressed="${liked}" aria-label="Like this post">${HEART_SVG}<span class="like-count">${likes.length || ''}</span></button>`;

  return `
    <article class="feed-card">
      <div class="polaroid-photo feed-photo photo-1">
        ${photo}
        ${pin}
      </div>
      <div class="polaroid-caption">
        <span class="place-name">${escapeHTML(heading)}</span>
        <span class="stars">${starString(post.stars)}</span>
      </div>
      ${addressLine}
      ${post.text ? `<p class="feed-text">${escapeHTML(post.text)}</p>` : ''}
      ${tags}
      <div class="feed-meta">
        <span class="feed-meta-left">${authorLink}${dateStr ? `<span class="feed-date">${dateStr}</span>` : ''}</span>
        <span class="feed-meta-right">${likeBtn}<span class="vis-pill">${visLabel}</span></span>
      </div>
      ${actions}
    </article>
  `;
}

/* ---------------- Geocoding (address -> coordinates, via OpenStreetMap Nominatim) ---------------- */
const GEO_CACHE_KEY = 'sw_geo_v1';
const GEO_RETRY_MS = 7 * 24 * 3600 * 1000;
let geoChain = Promise.resolve();
let geoLastCall = 0;

function geoKey(address) {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function geoCacheRead() {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) || {}; } catch (e) { return {}; }
}
function geoCacheWrite(cache) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* storage unavailable */ }
}

// Nominatim allows 1 request per second, so every lookup goes through one queue.
function nominatimLookup(q, timeoutMs) {
  const run = async () => {
    const wait = 1100 - (Date.now() - geoLastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geoLastCall = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
    try {
      const res = await fetch(
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=' + encodeURIComponent(q),
        { signal: ctrl.signal }
      );
      if (!res.ok) throw new Error('geocoder ' + res.status);
      const rows = await res.json();
      if (!rows.length) return null;
      const lat = parseFloat(rows[0].lat);
      const lng = parseFloat(rows[0].lon);
      return isFinite(lat) && isFinite(lng) ? { lat, lng } : null;
    } finally {
      clearTimeout(timer);
    }
  };
  const result = geoChain.then(run, run);
  geoChain = result.catch(() => {});
  return result;
}

// Returns {lat, lng} or null (address not found / lookup failed). Never throws.
async function geocodeAddress(address, placeName, timeoutMs) {
  const key = geoKey(address);
  if (!key) return null;
  const cache = geoCacheRead();
  const hit = cache[key];
  if (hit && hit.lat != null) return { lat: hit.lat, lng: hit.lng };
  if (hit && hit.miss && Date.now() - hit.miss < GEO_RETRY_MS) return null;

  const queries = [address];
  if (placeName) queries.push(`${placeName}, ${address}`);
  // House number missing in OpenStreetMap? Fall back to the street itself.
  const parts = address.split(',');
  const street = parts[0].replace(/\s+\d+\s*[A-Za-z]?(?:\s*[-–/]\s*\d+\s*[A-Za-z]?)?\s*$/, '').trim();
  if (street && street !== parts[0].trim()) queries.push([street, ...parts.slice(1)].join(','));
  try {
    for (const q of queries) {
      const found = await nominatimLookup(q, timeoutMs);
      if (found) {
        const fresh = geoCacheRead();
        fresh[key] = found;
        geoCacheWrite(fresh);
        return found;
      }
    }
    const fresh = geoCacheRead();
    fresh[key] = { miss: Date.now() };
    geoCacheWrite(fresh);
  } catch (e) {
    // Network error or timeout: don't cache, so it is retried next time.
  }
  return null;
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
  posts.sort((a, b) => postSortKey(b) - postSortKey(a));
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
  friendsMapCache = null;
  searchPoolCache = null;
}

async function declineFriendRequest(requesterUid) {
  await updateDoc(doc(db, 'users', currentUser.uid), { incomingRequests: arrayRemove(requesterUid) });
  await updateDoc(doc(db, 'users', requesterUid), { sentRequests: arrayRemove(currentUser.uid) });
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
let friendsMapCache = null;
async function getFriendUsersMap() {
  const key = (currentUser.friends || []).join(',');
  if (friendsMapCache && friendsMapCache.key === key) return friendsMapCache.map;
  const map = await buildFriendUsersMap();
  friendsMapCache = { key, map };
  return map;
}

let searchPoolCache = null;
async function getSearchPool() {
  if (searchPoolCache && Date.now() - searchPoolCache.time < 60000) return searchPoolCache;
  const mineAndFriends = [currentUser.uid, ...(currentUser.friends || [])].slice(0, 30);
  const [users, publicSnap, ownPosts] = await Promise.all([
    fetchAllUsers(),
    getDocs(query(collection(db, 'posts'), where('visibility', '==', 'offentlig'), limit(300))),
    fetchPostsForUids(mineAndFriends),
  ]);
  const usersMap = {};
  users.forEach((u) => { usersMap[u.uid] = u; });
  usersMap[currentUser.uid] = currentUser;

  const friendSet = new Set([currentUser.uid, ...(currentUser.friends || [])]);
  const byId = {};
  ownPosts.forEach((p) => { byId[p.id] = p; });
  publicSnap.docs.forEach((d) => {
    const p = { id: d.id, ...d.data() };
    const author = usersMap[p.authorUid];
    if (!author) return;
    if (author.private && !friendSet.has(p.authorUid)) return;
    byId[p.id] = p;
  });
  searchPoolCache = { time: Date.now(), posts: Object.values(byId), usersMap, friendSet };
  return searchPoolCache;
}

const feedState = { scope: 'alle', sort: 'nyeste' };
let feedRenderId = 0;

function averageStars(posts) {
  const rated = posts.filter((p) => p.stars > 0);
  if (!rated.length) return null;
  return rated.reduce((sum, p) => sum + p.stars, 0) / rated.length;
}

function renderFriendsStrip(friendsMap) {
  const strip = document.getElementById('friends-strip');
  if (!strip) return;
  const friends = (currentUser.friends || []).map((uid) => friendsMap[uid]).filter(Boolean);
  const items = friends.map((f) => `
    <a class="strip-item" href="bruker.html?u=${encodeURIComponent(f.username)}">
      <span class="strip-avatar">${f.avatar ? `<img src="${f.avatar}" alt="">` : escapeHTML(displayName(f).charAt(0).toUpperCase())}</span>
      <span class="strip-name">${escapeHTML(f.firstName || f.username)}</span>
    </a>`).join('');
  strip.innerHTML = `
    <button type="button" class="strip-item strip-add" id="strip-add">
      <span class="strip-avatar">+</span>
      <span class="strip-name">${friends.length ? 'Find more' : 'Find friends'}</span>
    </button>${items}`;
  strip.hidden = false;
}

async function renderFeed() {
  const feedList = document.getElementById('feed-list');
  const feedEmpty = document.getElementById('feed-empty');
  if (!feedList || !currentUser) return;
  const myRender = ++feedRenderId;

  const searchInput = document.getElementById('feed-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const words = q.split(/\s+/).map((w) => w.replace(/^#/, '')).filter(Boolean);
  const searching = words.length > 0;
  const tools = document.getElementById('search-tools');
  const summary = document.getElementById('search-summary');
  if (tools) tools.hidden = !searching;

  let posts;
  let usersMap;
  let friendSet;
  if (searching) {
    const [pool, friendsMap] = await Promise.all([getSearchPool(), getFriendUsersMap()]);
    if (myRender !== feedRenderId) return;
    usersMap = pool.usersMap;
    friendSet = pool.friendSet;
    renderFriendsStrip(friendsMap);
    posts = pool.posts.filter((p) => {
      const hay = [p.placeName, p.address, p.text, ...(p.tags || [])].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (feedState.scope === 'venner') posts = posts.filter((p) => friendSet.has(p.authorUid));
    if (feedState.scope === 'offentlig') posts = posts.filter((p) => !friendSet.has(p.authorUid));
    if (feedState.sort === 'best') {
      posts.sort((a, b) => (b.stars - a.stars)
        || ((b.likes || []).length - (a.likes || []).length)
        || (postSortKey(b) - postSortKey(a)));
    } else {
      posts.sort((a, b) => postSortKey(b) - postSortKey(a));
    }
  } else {
    const uids = [currentUser.uid, ...(currentUser.friends || [])].slice(0, 30);
    const [friendsMap, ownAndFriends] = await Promise.all([getFriendUsersMap(), fetchPostsForUids(uids)]);
    if (myRender !== feedRenderId) return;
    usersMap = friendsMap;
    posts = ownAndFriends;
    renderFriendsStrip(friendsMap);
  }

  if (summary) {
    const avg = averageStars(posts);
    summary.innerHTML = searching && posts.length
      ? `<strong>${posts.length}</strong> results for “${escapeHTML(q)}”`
        + (avg ? ` <span class="summary-avg"><span class="stars">★</span> avg ${avg.toFixed(1)} of 5</span>` : '')
      : '';
  }

  if (posts.length === 0) {
    feedEmpty.hidden = false;
    const title = document.getElementById('feed-empty-title');
    const text = document.getElementById('feed-empty-text');
    if (searching) {
      if (title) title.textContent = 'No results';
      if (text) text.textContent = `No reviews match “${q}”. Try another word, for example pizza, coffee or a place name.`;
    } else {
      if (title) title.textContent = 'No reviews yet';
      if (text) text.textContent = 'Follow friends to see what they recommend, or tap + below to post your first review.';
    }
    feedList.innerHTML = '';
    return;
  }
  feedEmpty.hidden = true;
  feedList.innerHTML = posts
    .map((p) => postToHTML(p, usersMap[p.authorUid]?.username, { editable: p.authorUid === currentUser.uid }))
    .join('');
}

async function renderMyPosts() {
  const myPosts = document.getElementById('my-posts');
  if (!myPosts || !currentUser) return;
  const posts = await fetchPostsForUids([currentUser.uid]);
  myPosts.innerHTML = posts.length
    ? posts.map((p) => postToHTML(p, currentUser.username, { editable: true })).join('')
    : '<p class="empty-hint">You haven\'t posted any reviews yet.</p>';
}

(function initFeedSearch() {
  const input = document.getElementById('feed-search-input');
  if (!input) return;
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(renderFeed, 250);
  });

  function bindChips(selector, key) {
    document.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener('click', () => {
        feedState[key] = btn.dataset.value;
        document.querySelectorAll(selector).forEach((b) => b.classList.toggle('active', b === btn));
        renderFeed();
      });
    });
  }
  bindChips('.scope-chip', 'scope');
  bindChips('.sort-chip', 'sort');

  document.addEventListener('click', (e) => {
    if (e.target.closest('#strip-add')) document.getElementById('search-trigger')?.click();
  });
})();

function setLikeUI(btn, liked, count) {
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', String(liked));
  btn.querySelector('.like-count').textContent = count > 0 ? String(count) : '';
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.like-btn');
  if (!btn || !currentUser || btn.dataset.busy) return;
  btn.dataset.busy = '1';
  const wasLiked = btn.classList.contains('liked');
  const count = parseInt(btn.querySelector('.like-count').textContent || '0', 10) || 0;
  setLikeUI(btn, !wasLiked, Math.max(0, count + (wasLiked ? -1 : 1)));
  try {
    await updateDoc(doc(db, 'posts', btn.dataset.id), {
      likes: wasLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
    });
    searchPoolCache = null;
  } catch (err) {
    setLikeUI(btn, wasLiked, count);
  } finally {
    delete btn.dataset.busy;
  }
});

document.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('.delete-post-btn');
  if (!delBtn || !currentUser) return;
  if (!confirm('Delete this review? This cannot be undone.')) return;
  await deleteDoc(doc(db, 'posts', delBtn.dataset.id));
  await renderFeed();
  await renderMyPosts();
});

/* ---------------- Photo lightbox ---------------- */
(function initLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  const lightboxImg = document.getElementById('lightbox-image');
  const closeBtn = document.getElementById('lightbox-close');
  if (!overlay || !lightboxImg) return;

  document.addEventListener('click', (e) => {
    const img = e.target.closest('.post-photo-img');
    if (!img) return;
    lightboxImg.src = img.src;
    overlay.classList.add('open');
  });
  closeBtn?.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
})();

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
  drawer.querySelectorAll('.drawer-link').forEach((link) => link.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

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
  loginBtn.textContent = currentUser ? 'Go to feed' : 'Log in';
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
      usernameHint.textContent = taken ? 'Taken' : 'Available';
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
    submitBtn.textContent = 'Creating account...';

    try {
      if (await isUsernameTaken(username)) {
        usernameHint.textContent = 'This username is already taken. Choose another.';
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
      submitBtn.textContent = 'Create account';
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
    submitBtn.textContent = 'Logging in...';

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
      errorEl.textContent = 'No account found with those details, or wrong password.';
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
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
  const dateInput = document.getElementById('post-date');
  const placeInput = document.getElementById('post-place');
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
  let editingPost = null;

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
    editingPost = null;
    sheetTitle.textContent = 'New post';
    submitBtn.textContent = 'Publish';
    photoPreviewImg.hidden = true;
    photoPreviewText.hidden = false;
    charCount.textContent = '0/100';
    dateInput.value = todayISO();
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
    editingPost = post;
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
    dateInput.value = post.postDate || todayISO();
    placeInput.value = post.placeName || '';
    addressInput.value = post.address || '';
    [...starPicker.children].forEach((b) => b.classList.toggle('active', Number(b.dataset.star) <= currentStars));
    [...visToggle.children].forEach((b) => b.classList.toggle('active', b.dataset.vis === currentVis));
    tagPicker.querySelectorAll('.tag-chip').forEach((b) => b.classList.toggle('active', currentTags.includes(b.dataset.tag)));
    renderCustomTags();

    sheetTitle.textContent = 'Edit post';
    submitBtn.textContent = 'Save changes';
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
      alert('Choose a star rating before publishing.');
      return;
    }

    const postData = {
      photo: currentPhoto,
      stars: currentStars,
      text: postText.value.trim(),
      postDate: dateInput.value || todayISO(),
      placeName: placeInput.value.trim(),
      address: addressInput.value.trim(),
      visibility: currentVis,
      tags: currentTags,
      authorUid: currentUser.uid,
    };

    submitBtn.disabled = true;
    const savedLabel = submitBtn.textContent;
    try {
      // Pin the post on the map: reuse the old coordinates if the address didn't change.
      if (!postData.address) {
        postData.lat = null;
        postData.lng = null;
      } else if (editingPost && editingPost.address === postData.address && editingPost.lat != null) {
        postData.lat = editingPost.lat;
        postData.lng = editingPost.lng;
      } else {
        submitBtn.textContent = 'Locating place…';
        const pos = await geocodeAddress(postData.address, postData.placeName, 6000);
        postData.lat = pos ? pos.lat : null;
        postData.lng = pos ? pos.lng : null;
        submitBtn.textContent = savedLabel;
      }
      if (editingPostId) {
        await updateDoc(doc(db, 'posts', editingPostId), postData);
      } else {
        await addDoc(collection(db, 'posts'), { ...postData, createdAt: serverTimestamp() });
      }
      overlay.classList.remove('open');
      resetForm();
      searchPoolCache = null;
      await renderFeed();
      await renderMyPosts();
      refreshMapPage();
    } catch (err) {
      submitBtn.textContent = savedLabel;
      alert('Could not save the post: ' + err.message);
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
    if (state === 'friends') return `<button type="button" class="btn btn-ghost btn-sm" disabled>Friends</button>`;
    if (state === 'sent') return `<button type="button" class="btn btn-ghost btn-sm" disabled>Request sent</button>`;
    if (state === 'incoming') return `<button type="button" class="btn btn-primary btn-sm friend-accept-btn" data-uid="${uid}">Accept</button>`;
    return `<button type="button" class="btn btn-outline btn-sm friend-request-btn" data-uid="${uid}">Add</button>`;
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
      : '<p class="empty-hint">No matches yet. As more people join spotworthy, they will show up here.</p>';
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
            <button type="button" class="btn btn-primary btn-sm request-accept-btn" data-uid="${f.uid}">Accept</button>
            <button type="button" class="btn btn-outline btn-sm request-decline-btn" data-uid="${f.uid}">Decline</button>
          </div>
        </div>
      `).join('')
      : '<p class="empty-hint">No pending requests.</p>';
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
      await renderFriendsList();
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
      await renderFriendsList();
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
      usernameHint.textContent = taken ? 'Taken' : 'Available';
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
    reader.onload = async () => {
      avatarImg.src = await resizeToSquare(reader.result, 400);
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
          usernameHint.textContent = 'This username is taken.';
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
      saveBtn.textContent = 'Saved!';
      setTimeout(() => { saveBtn.textContent = 'Save profile'; }, 1500);
    } catch (err) {
      alert('Could not save: ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });

  renderMyPosts();
  renderFriendsList();
}

async function renderFriendsList() {
  const friendsList = document.getElementById('friends-list');
  const friendsCount = document.getElementById('friends-count');
  if (!friendsList || !currentUser) return;

  const friendUids = currentUser.friends || [];
  friendsCount.textContent = friendUids.length ? `(${friendUids.length})` : '';

  if (!friendUids.length) {
    friendsList.innerHTML = '<p class="empty-hint">You have no friends yet. Use search at the bottom to find people.</p>';
    return;
  }

  const friends = (await Promise.all(friendUids.map(async (uid) => {
    const s = await getDoc(doc(db, 'users', uid));
    return s.exists() ? { uid, ...s.data() } : null;
  }))).filter(Boolean);

  friendsList.innerHTML = friends.map((f) => `
    <a class="friend-card" href="bruker.html?u=${encodeURIComponent(f.username)}">
      <span class="friend-avatar">${f.avatar ? `<img src="${f.avatar}" alt="">` : escapeHTML(displayName(f).charAt(0).toUpperCase())}</span>
      <strong>${escapeHTML(displayName(f))}</strong>
      <span class="friend-handle">@${escapeHTML(f.username)}</span>
    </a>
  `).join('');
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
    usernameEl.textContent = 'User not found';
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
    usernameEl.textContent = 'User not found';
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
      friendBtn.textContent = 'Friends';
      friendBtn.classList.add('btn-ghost');
      friendBtn.disabled = true;
    } else if (state === 'sent') {
      friendBtn.textContent = 'Request sent';
      friendBtn.classList.add('btn-ghost');
      friendBtn.disabled = true;
    } else if (state === 'incoming') {
      friendBtn.textContent = 'Accept request';
      friendBtn.classList.add('btn-primary');
    } else {
      friendBtn.textContent = 'Add friend';
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
    posts.sort((a, b) => postSortKey(b) - postSortKey(a));
    postsEl.innerHTML = posts.length
      ? posts.map((p) => postToHTML(p, target.username)).join('')
      : '<p class="empty-hint">No visible reviews.</p>';
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

/* ---------------- Recommendations on the home page (index.html) ---------------- */
async function initLandingRecs() {
  const section = document.getElementById('landing-recs');
  const grid = document.getElementById('landing-recs-grid');
  if (!section || !grid) return;
  try {
    const snap = await getDocs(query(collection(db, 'posts'), where('visibility', '==', 'offentlig'), limit(12)));
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.stars >= 4 && (p.placeName || p.address))
      .sort((a, b) => (Number(!!b.photo) - Number(!!a.photo)) || (b.stars - a.stars) || (postSortKey(b) - postSortKey(a)))
      .slice(0, 6);
    if (!posts.length) return;
    grid.innerHTML = posts.map((p) => recToHTML(p)).join('');
    section.hidden = false;
  } catch (err) {
    // No access or network error: show the home page without recommendations.
  }
}

function recToHTML(post) {
  const photo = post.photo
    ? `<img class="rec-photo-img" src="${post.photo}" alt="" loading="lazy">`
    : `<div class="photo-icon-wrap"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10.5 12 5l6 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 9.5V18a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  const heading = post.placeName || post.address;
  const tags = post.tags && post.tags.length
    ? `<div class="post-tags">${post.tags.slice(0, 4).map((t) => `<span class="tag-pill">#${escapeHTML(t)}</span>`).join('')}</div>`
    : '';
  const dateStr = formatDate(post.postDate || post.createdAt);
  return `
    <article class="feed-card rec-card">
      <div class="polaroid-photo feed-photo photo-1">${photo}</div>
      <div class="polaroid-caption">
        <span class="place-name">${escapeHTML(heading)}</span>
        <span class="stars">${starString(post.stars)}</span>
      </div>
      ${post.text ? `<p class="feed-text">${escapeHTML(post.text)}</p>` : ''}
      ${tags}
      ${dateStr ? `<div class="feed-meta"><span class="feed-date">${dateStr}</span></div>` : ''}
    </article>
  `;
}

initLandingRecs();

/* ---------------- Map page (kart.html) ---------------- */
const mapState = { scope: 'alle', top: false };
let mapCtl = null;

const MAP_PIN_SVG = `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M50 4 C26 4 8 22 8 46 C8 76 50 116 50 116 C50 116 92 76 92 46 C92 22 74 4 50 4 Z" fill="currentColor" stroke="#fff" stroke-width="6"/><path stroke-linejoin="round" d="M50 21 L56.2 37.5 L73.8 38.3 L60 49.2 L64.7 66.2 L50 56.5 L35.3 66.2 L40 49.2 L26.2 38.3 L43.8 37.5 Z" fill="#fff"/></svg>`;

function mapPinIcon(count) {
  return L.divIcon({
    className: 'sw-pin-icon',
    html: `<div class="sw-pin">${MAP_PIN_SVG}${count > 1 ? `<span class="sw-pin-count">${count}</span>` : ''}</div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 46],
  });
}

function validCoord(p) {
  return typeof p.lat === 'number' && typeof p.lng === 'number' && isFinite(p.lat) && isFinite(p.lng);
}

function mapCardHTML(group) {
  const posts = [...group.posts].sort((a, b) => postSortKey(b) - postSortKey(a));
  const named = posts.find((p) => p.placeName) || posts[0];
  const heading = named.placeName || named.address;
  const avg = averageStars(posts);
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(named.address)}`;
  const rows = posts.map((p) => {
    const author = group.usersMap[p.authorUid];
    const who = author
      ? `<a href="bruker.html?u=${encodeURIComponent(author.username)}" class="feed-author-link">@${escapeHTML(author.username)}</a>`
      : '<span>@?</span>';
    const thumb = p.photo
      ? `<img src="${p.photo}" alt="" loading="lazy">`
      : `<span class="map-thumb-empty">${PIN_SVG}</span>`;
    const date = formatDate(p.postDate || p.createdAt);
    const vis = p.visibility === 'venner' ? '<span class="vis-pill">Friends only</span>' : '';
    return `
      <div class="map-review">
        <div class="map-thumb">${thumb}</div>
        <div class="map-review-body">
          <div class="map-review-top"><span class="stars">${starString(p.stars)}</span>${vis}</div>
          ${p.text ? `<p class="map-review-text">${escapeHTML(p.text)}</p>` : ''}
          <div class="map-review-meta">${who}${date ? `<span class="feed-date">${date}</span>` : ''}</div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="map-card-head">
      <div class="map-card-title">
        <h3>${escapeHTML(heading)}</h3>
        <div class="map-card-sub"><span class="stars">${starString(Math.round(avg || 0))}</span><span>${avg ? avg.toFixed(1) : '–'} · ${posts.length} ${posts.length === 1 ? 'review' : 'reviews'}</span></div>
        <a class="post-address-line" href="${gmaps}" target="_blank" rel="noopener">${PIN_SVG}<span>${escapeHTML(named.address)}</span></a>
      </div>
      <button type="button" class="modal-close" id="map-card-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="map-reviews">${rows}</div>`;
}

async function initMapPage() {
  const el = document.getElementById('map');
  if (!el || !currentUser || mapCtl) return;
  const status = document.getElementById('map-status');
  const empty = document.getElementById('map-empty');
  const card = document.getElementById('map-card');

  if (typeof L === 'undefined') {
    status.textContent = 'The map could not load. Check your internet connection and reload.';
    status.hidden = false;
    return;
  }

  const map = L.map(el, { zoomControl: false, worldCopyJump: true }).setView([59.91, 10.75], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);

  // "Find me" button
  const Locate = L.Control.extend({
    onAdd() {
      const btn = L.DomUtil.create('button', 'map-locate');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Show my location');
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, 'click', () => map.locate({ setView: true, maxZoom: 15 }));
      return btn;
    },
  });
  new Locate({ position: 'topright' }).addTo(map);

  let meDot = null;
  let statusTimer = null;
  function flash(msg, ms) {
    status.textContent = msg;
    status.hidden = false;
    clearTimeout(statusTimer);
    if (ms) statusTimer = setTimeout(() => { status.hidden = true; }, ms);
  }
  map.on('locationfound', (e) => {
    if (meDot) meDot.remove();
    meDot = L.circleMarker(e.latlng, { radius: 8, color: '#fff', weight: 3, fillColor: '#2fb989', fillOpacity: 1 }).addTo(map);
  });
  map.on('locationerror', () => flash('Couldn’t get your location. Check your browser’s location permission.', 4000));

  const layer = L.layerGroup().addTo(map);
  let touched = false;
  el.addEventListener('pointerdown', () => { touched = true; });

  function closeCard() {
    card.hidden = true;
    el.querySelectorAll('.sw-pin.selected').forEach((n) => n.classList.remove('selected'));
  }
  map.on('click', closeCard);
  card.addEventListener('click', (e) => { if (e.target.closest('#map-card-close')) closeCard(); });

  let pool = null;
  let located = [];   // posts that have coordinates
  let missing = [];   // posts with an address but no coordinates yet
  let noAddress = 0;
  let runId = 0;

  function applyCoords(post, pos) {
    post.lat = pos.lat;
    post.lng = pos.lng;
  }

  function draw(fit) {
    layer.clearLayers();
    closeCard();
    const friendSet = pool.friendSet;
    let list = located;
    if (mapState.scope === 'venner') list = list.filter((p) => friendSet.has(p.authorUid));
    if (mapState.scope === 'offentlig') list = list.filter((p) => !friendSet.has(p.authorUid));
    if (mapState.top) list = list.filter((p) => p.stars >= 4);

    const groups = {};
    list.forEach((p) => {
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      (groups[key] = groups[key] || { lat: p.lat, lng: p.lng, posts: [], usersMap: pool.usersMap }).posts.push(p);
    });
    const all = Object.values(groups);
    all.forEach((g) => {
      const marker = L.marker([g.lat, g.lng], { icon: mapPinIcon(g.posts.length), keyboard: true, title: (g.posts.find((p) => p.placeName) || g.posts[0]).placeName || '' });
      marker.on('click', (e) => {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        closeCard();
        card.innerHTML = mapCardHTML(g);
        card.scrollTop = 0;
        card.hidden = false;
        const node = marker.getElement()?.querySelector('.sw-pin');
        if (node) node.classList.add('selected');
        // Move the pin into the free space above the card so it isn't hidden behind it.
        const pt = map.latLngToContainerPoint([g.lat, g.lng]);
        const freeH = el.clientHeight - card.offsetHeight - 12;
        const wantY = Math.max(90, freeH / 2 + 24);
        map.panBy([pt.x - el.clientWidth / 2, pt.y - wantY], { animate: true });
      });
      marker.addTo(layer);
    });

    if (!all.length && located.length) flash('No pins match this filter.', 2500);
    const nothingYet = located.length === 0 && missing.length === 0;
    empty.hidden = !(nothingYet && !all.length);
    if (fit && all.length) {
      const bounds = L.latLngBounds(all.map((g) => [g.lat, g.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: false });
    }
    return all.length;
  }

  async function load() {
    const myRun = ++runId;
    flash('Loading reviews…');
    pool = await getSearchPool();
    if (myRun !== runId) return;
    const cache = geoCacheRead();
    located = [];
    missing = [];
    noAddress = 0;
    pool.posts.forEach((p) => {
      if (validCoord(p)) { located.push(p); return; }
      if (!p.address) { noAddress += 1; return; }
      const hit = cache[geoKey(p.address)];
      if (hit && hit.lat != null) { applyCoords(p, hit); located.push(p); return; }
      if (hit && hit.miss && Date.now() - hit.miss < GEO_RETRY_MS) return; // address not found
      missing.push(p);
    });
    touched = false;
    draw(true);
    status.hidden = true;

    // Older posts have no coordinates yet: look them up one by one, pins appear as they are found.
    const byAddress = {};
    missing.forEach((p) => { (byAddress[geoKey(p.address)] = byAddress[geoKey(p.address)] || []).push(p); });
    const addresses = Object.keys(byAddress);
    let left = addresses.length;
    for (const key of addresses) {
      if (myRun !== runId) return;
      flash(`Placing ${left} ${left === 1 ? 'spot' : 'spots'} on the map…`);
      const first = byAddress[key][0];
      const pos = await geocodeAddress(first.address, first.placeName);
      left -= 1;
      if (myRun !== runId) return;
      if (pos) {
        byAddress[key].forEach((p) => {
          applyCoords(p, pos);
          located.push(p);
          // Save the coordinates on your own posts so they are only looked up once.
          if (p.authorUid === currentUser.uid) {
            updateDoc(doc(db, 'posts', p.id), { lat: pos.lat, lng: pos.lng }).catch(() => {});
          }
        });
        draw(!touched);
      }
    }
    status.hidden = true;
  }

  // Filters
  document.querySelectorAll('.map-scope').forEach((b) => b.addEventListener('click', () => {
    mapState.scope = b.dataset.value;
    document.querySelectorAll('.map-scope').forEach((x) => x.classList.toggle('active', x === b));
    if (pool) draw(true);
  }));
  const topBtn = document.getElementById('map-top');
  topBtn?.addEventListener('click', () => {
    mapState.top = !mapState.top;
    topBtn.classList.toggle('active', mapState.top);
    topBtn.setAttribute('aria-pressed', String(mapState.top));
    if (pool) draw(true);
  });

  mapCtl = { map, reload: load };
  try {
    await load();
  } catch (err) {
    flash('Could not load reviews: ' + (err && err.message ? err.message : 'unknown error'));
  }
}

// Called after a post is saved so the map picks up the new pin.
function refreshMapPage() {
  if (mapCtl) mapCtl.reload().catch(() => {});
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
  await initMapPage();
});
