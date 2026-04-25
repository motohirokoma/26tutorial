/**
 * Tutorial Progress Tracking (ES Module)
 */
import {
  auth,
  db,
  provider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from './firebase-config.js';

const STORAGE_KEY = 'test260418-2-tutorial-progress';
const STREAK_KEY = 'test260418-2-tutorial-streak';
const TUTORIAL_SLUG = 'test260418-2';

const CHAPTERS = [
  { id: '01', title: 'ソロキャンプへようこそ', hours: 0.33, phase: 'basics' },
  { id: '02', title: '装備の全体像「ビッグ3」', hours: 0.5, phase: 'basics' },
  { id: '03', title: 'テントの選び方', hours: 0.5, phase: 'basics' },
  { id: '04', title: '寝袋・マットの選び方', hours: 0.5, phase: 'basics' },
  { id: '05', title: 'キャンプ場の選び方・予約', hours: 0.42, phase: 'basics' },
  { id: '06', title: '最初の買い物リスト・予算', hours: 0.25, phase: 'basics' },
  { id: '07', title: '設営：テント&タープ', hours: 0.5, phase: 'core' },
  { id: '08', title: '焚き火入門', hours: 0.5, phase: 'core' },
  { id: '09', title: 'ソロキャンプ料理', hours: 0.5, phase: 'core' },
  { id: '10', title: '夜の過ごし方・快眠・防寒', hours: 0.42, phase: 'core' },
  { id: '11', title: '虫・動物・天気対策', hours: 0.42, phase: 'core' },
  { id: '12', title: '撤収とLeave No Trace', hours: 0.33, phase: 'core' },
  { id: '13', title: 'ピンチ対応（ケガ・遭難・体調不良）', hours: 0.33, phase: 'core' },
  { id: '14', title: '車→トレイルキャンプのマインドセット', hours: 0.33, phase: 'advanced' },
  { id: '15', title: 'UL装備と軽量化設計', hours: 0.5, phase: 'advanced' },
  { id: '16', title: 'ルート計画・地図読み・登山計画書', hours: 0.5, phase: 'advanced' },
  { id: '17', title: '山の水・食・低体温対策', hours: 0.5, phase: 'advanced' },
  { id: '18', title: '最終演習：1泊2日トレイルキャンプを計画する', hours: 0.5, phase: 'advanced' },
];

const TOTAL_HOURS = 8;

const CHAPTER_FILES = {
  '01': '01-welcome.html',
  '02': '02-big3-overview.html',
  '03': '03-tent-selection.html',
  '04': '04-sleep-system.html',
  '05': '05-campsite-selection.html',
  '06': '06-shopping-list.html',
  '07': '07-setup-tent-tarp.html',
  '08': '08-fire-basics.html',
  '09': '09-solo-cooking.html',
  '10': '10-night-sleep-warmth.html',
  '11': '11-bugs-wildlife-weather.html',
  '12': '12-teardown-lnt.html',
  '13': '13-emergency-response.html',
  '14': '14-trail-mindset.html',
  '15': '15-ul-gear.html',
  '16': '16-route-planning.html',
  '17': '17-water-food-hypothermia.html',
  '18': '18-final-exercise.html',
};

let currentUser = null;
let cloudUnsub = null;
let applyingRemote = false;
let firstSnapshotForUser = true;

function getProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveProgress(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function getStreak() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: null }; }
  catch (e) { return { count: 0, lastDate: null }; }
}
function saveStreak(streak) { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); }

function userDocRef(uid) { return doc(db, 'tutorials', TUTORIAL_SLUG, 'users', uid); }

async function pushToCloud() {
  if (!currentUser || applyingRemote) return;
  try {
    await setDoc(userDocRef(currentUser.uid), {
      progress: getProgress(),
      streak: getStreak(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) { console.error('Firestore push failed:', e); }
}

function mergeProgress(local, cloud) {
  const merged = { ...cloud };
  for (const k in local) {
    if (!merged[k] || new Date(local[k]) < new Date(merged[k])) merged[k] = local[k];
  }
  return merged;
}

function mergeStreak(local, cloud) {
  if (!cloud) return local;
  if (!local || !local.lastDate) return cloud;
  if (cloud.lastDate > local.lastDate) return cloud;
  if (local.lastDate > cloud.lastDate) return local;
  return { count: Math.max(local.count, cloud.count), lastDate: local.lastDate };
}

function subscribeToCloud(uid) {
  firstSnapshotForUser = true;
  cloudUnsub = onSnapshot(userDocRef(uid), (snap) => {
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    const cloud = snap.exists() ? snap.data() : null;
    if (firstSnapshotForUser) {
      firstSnapshotForUser = false;
      const localProgress = getProgress();
      const localStreak = getStreak();
      const mergedProgress = cloud ? mergeProgress(localProgress, cloud.progress || {}) : localProgress;
      const mergedStreak = cloud ? mergeStreak(localStreak, cloud.streak) : localStreak;
      applyingRemote = true;
      saveProgress(mergedProgress);
      saveStreak(mergedStreak);
      updateAllUI();
      applyingRemote = false;
      const cloudProgress = (cloud && cloud.progress) || {};
      const localHasExtra = Object.keys(mergedProgress).some(k => !cloudProgress[k]);
      if (!snap.exists() || localHasExtra) {
        setDoc(userDocRef(uid), {
          progress: mergedProgress,
          streak: mergedStreak,
          updatedAt: serverTimestamp(),
        }).catch(e => console.error('Initial sync push failed:', e));
      }
    } else {
      applyingRemote = true;
      saveProgress((cloud && cloud.progress) || {});
      saveStreak((cloud && cloud.streak) || { count: 0, lastDate: null });
      updateAllUI();
      applyingRemote = false;
    }
  }, (err) => { console.error('Firestore subscription error:', err); });
}

function toggleComplete(chapterId) {
  const data = getProgress();
  if (data[chapterId]) { delete data[chapterId]; }
  else { data[chapterId] = new Date().toISOString(); updateStreak(); }
  saveProgress(data);
  updateAllUI();
  pushToCloud();
}

function updateStreak() {
  const streak = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  if (streak.lastDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (streak.lastDate === yesterday) { streak.count++; } else { streak.count = 1; }
  streak.lastDate = today;
  saveStreak(streak);
}

function getStats() {
  const data = getProgress();
  let doneCount = 0, doneHours = 0;
  CHAPTERS.forEach(ch => { if (data[ch.id]) { doneCount++; doneHours += ch.hours; } });
  return {
    doneCount, totalCount: CHAPTERS.length, doneHours, totalHours: TOTAL_HOURS,
    percentage: Math.round((doneCount / CHAPTERS.length) * 100),
  };
}

function getPhaseStats() {
  const data = getProgress();
  const phases = {};
  CHAPTERS.forEach(ch => {
    if (!phases[ch.phase]) phases[ch.phase] = { done: 0, total: 0 };
    phases[ch.phase].total++;
    if (data[ch.id]) phases[ch.phase].done++;
  });
  const result = {};
  for (const p in phases) {
    result[p] = phases[p].total > 0 ? Math.round((phases[p].done / phases[p].total) * 100) : 0;
  }
  return result;
}

function getNextChapter() {
  const data = getProgress();
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (!data[CHAPTERS[i].id]) return CHAPTERS[i];
  }
  return null;
}

function updateAllUI() {
  const data = getProgress();
  const stats = getStats();
  const phaseStats = getPhaseStats();
  const nextCh = getNextChapter();
  const streak = getStreak();

  document.querySelectorAll('.status-dot[data-chapter]').forEach(dot => {
    const chId = dot.getAttribute('data-chapter');
    dot.classList.toggle('done', !!data[chId]);
  });

  const ringFill = document.querySelector('.ring-fill');
  if (ringFill) {
    const circ = 2 * Math.PI * 18;
    const filled = (stats.percentage / 100) * circ;
    ringFill.setAttribute('stroke-dasharray', filled.toFixed(1) + ' ' + (circ - filled).toFixed(1));
    ringFill.setAttribute('stroke-dashoffset', '0');
  }
  const ringPct = document.querySelector('.ring-pct');
  if (ringPct) ringPct.textContent = stats.percentage + '%';
  const ringSub = document.querySelector('.ring-sub');
  if (ringSub) ringSub.textContent = stats.doneCount + ' / ' + stats.totalCount + ' sections';
  const progressInfo = document.querySelector('.progress-info');
  if (progressInfo) progressInfo.textContent = stats.doneHours.toFixed(1) + 'h / ' + stats.totalHours + 'h completed';

  const btn = document.querySelector('.btn-complete');
  if (btn) {
    const curCh = btn.getAttribute('data-chapter');
    if (curCh) {
      const isDone = !!data[curCh];
      btn.classList.toggle('is-done', isDone);
      btn.textContent = isDone ? '\u2713 Completed' : '\u2610 Mark as Complete';
    }
  }

  document.querySelectorAll('.chapter-link[data-chapter]').forEach(link => {
    const chId = link.getAttribute('data-chapter');
    const cb = link.querySelector('.ch-checkbox');
    if (cb) {
      if (data[chId]) {
        link.classList.add('completed');
        cb.innerHTML = '<span class="check-icon">&#10003;</span>';
      } else {
        link.classList.remove('completed');
        cb.innerHTML = '';
      }
    }
  });

  const indexBar = document.querySelector('.index-progress-fill');
  if (indexBar) indexBar.style.width = stats.percentage + '%';
  const indexCount = document.querySelector('.index-progress-count');
  if (indexCount) indexCount.textContent = stats.doneCount + ' / ' + stats.totalCount + ' sections completed';
  const indexTime = document.querySelector('.index-progress-time');
  if (indexTime) indexTime.textContent = stats.doneHours.toFixed(1) + 'h / ' + stats.totalHours + 'h';

  document.querySelectorAll('[id^="pct-"]').forEach(el => {
    const phaseKey = el.id.replace('pct-', '');
    const pct = phaseStats[phaseKey];
    if (pct !== undefined) {
      el.textContent = pct + '%';
      el.classList.toggle('has-progress', pct > 0);
    }
  });

  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) {
    if (nextCh) {
      const isInChaptersDir = window.location.pathname.indexOf('/chapters/') !== -1;
      const prefix = isInChaptersDir ? '' : 'chapters/';
      nextBtn.href = prefix + CHAPTER_FILES[nextCh.id];
      nextBtn.innerHTML = '<span class="next-label">Next:</span> ' + nextCh.title + ' &rarr;';
    } else {
      nextBtn.removeAttribute('href');
      nextBtn.innerHTML = '&#127881; Complete!';
      nextBtn.style.color = '#4d7c0f';
    }
  }

  const streakEl = document.getElementById('streak');
  const streakCount = document.getElementById('streak-count');
  if (streakEl && streakCount) {
    streakEl.classList.toggle('active', streak.count > 0);
    streakCount.textContent = streak.count + (streak.count === 1 ? ' day' : ' days');
  }

  const globalBar = document.getElementById('global-bar');
  if (globalBar) globalBar.style.width = stats.percentage + '%';
}

function updateAuthUI(user) {
  const signInBtn = document.getElementById('sign-in-btn');
  const userBox = document.getElementById('auth-user');
  const avatar = document.getElementById('auth-avatar');
  const name = document.getElementById('auth-name');
  const syncBadge = document.getElementById('sync-badge');
  if (user) {
    if (signInBtn) signInBtn.style.display = 'none';
    if (userBox) userBox.style.display = 'flex';
    if (avatar && user.photoURL) avatar.src = user.photoURL;
    if (name) name.textContent = user.displayName || user.email || 'Signed in';
    if (syncBadge) { syncBadge.style.display = 'inline-flex'; syncBadge.title = 'Cloud sync on'; }
  } else {
    if (signInBtn) signInBtn.style.display = 'inline-flex';
    if (userBox) userBox.style.display = 'none';
    if (syncBadge) syncBadge.style.display = 'none';
  }
}

async function handleSignIn() {
  try { await signInWithPopup(auth, provider); }
  catch (e) { console.error('Sign-in failed:', e); alert('サインインに失敗しました: ' + e.message); }
}

async function handleSignOut() {
  try { if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; } await signOut(auth); }
  catch (e) { console.error('Sign-out failed:', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  const streak = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  if (streak.lastDate && streak.lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (streak.lastDate !== yesterday) saveStreak({ count: 0, lastDate: null });
  }

  const btn = document.querySelector('.btn-complete');
  if (btn) {
    btn.addEventListener('click', function () {
      const chId = this.getAttribute('data-chapter');
      if (chId) toggleComplete(chId);
    });
  }

  document.querySelectorAll('.ch-checkbox[data-chapter]').forEach(cb => {
    cb.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleComplete(this.getAttribute('data-chapter'));
    });
  });

  const signInBtn = document.getElementById('sign-in-btn');
  if (signInBtn) signInBtn.addEventListener('click', handleSignIn);
  const signOutBtn = document.getElementById('sign-out-btn');
  if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
    if (user) subscribeToCloud(user.uid);
  });

  updateAllUI();
});

window.tutorialProgress = {
  getStats, getPhaseStats, getNextChapter, getStreak, getProgress,
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STREAK_KEY);
    updateAllUI();
    if (currentUser) pushToCloud();
  },
};


// ============ Zoomable diagrams (lightbox) ============
(function initZoomableDiagrams() {
  const EXCLUDE = '.clawd, .clawd-heading, .clawd-aside, .clawd-btn, .lucide, .topbar, nav.sidebar, .streak-badge, .auth-box, .zoomable-wrap';
  const MIN_WIDTH = 200;
  let overlay = null;

  function findTargets() {
    const targets = new Set();
    document.querySelectorAll('main .mermaid').forEach((el) => {
      if (el.closest('.zoomable-wrap')) return;
      targets.add(el);
    });
    document.querySelectorAll('main canvas').forEach((el) => {
      if (el.closest(EXCLUDE)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_WIDTH) return;
      targets.add(el);
    });
    document.querySelectorAll('main svg').forEach((el) => {
      if (el.closest(EXCLUDE)) return;
      if (el.closest('.mermaid')) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_WIDTH) return;
      targets.add(el);
    });
    return [...targets];
  }

  function wrapZoomable(el) {
    if (el.closest('.zoomable-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'zoomable-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(el);
    });
  }

  function sizeSvgFromViewBox(svg) {
    svg.style.cssText = '';
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    const vb = svg.getAttribute('viewBox');
    if (!vb) return;
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || !parts[2] || !parts[3]) return;
    const ratio = parts[2] / parts[3];
    const maxW = Math.min(window.innerWidth * 0.85, 1400);
    const maxH = window.innerHeight * 0.8;
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    svg.setAttribute('width', Math.round(w));
    svg.setAttribute('height', Math.round(h));
  }

  function cloneForLightbox(el) {
    if (el.tagName === 'CANVAS') {
      const img = document.createElement('img');
      try { img.src = el.toDataURL('image/png'); } catch (_) { /* tainted */ }
      return img;
    }
    const clone = el.cloneNode(true);
    if (clone.style) clone.style.cssText = '';
    const svgs = [];
    if (clone.tagName && clone.tagName.toLowerCase() === 'svg') svgs.push(clone);
    if (clone.querySelectorAll) svgs.push(...clone.querySelectorAll('svg'));
    svgs.forEach(sizeSvgFromViewBox);
    return clone;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = '<div class="lightbox-content"><button class="lightbox-close" aria-label="閉じる">✕</button></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('lightbox-close')) {
        closeLightbox();
      }
    });
    return overlay;
  }

  function openLightbox(el) {
    const ov = ensureOverlay();
    const content = ov.querySelector('.lightbox-content');
    [...content.children].forEach((c) => {
      if (!c.classList.contains('lightbox-close')) c.remove();
    });
    content.appendChild(cloneForLightbox(el));
    ov.classList.add('is-open');
    document.body.classList.add('lightbox-open');
  }

  function closeLightbox() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.classList.remove('lightbox-open');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  function init() {
    findTargets().forEach(wrapZoomable);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 1500);
})();

// ============ Clawd ランダムアニメーション ============
(function initClawdAnimations() {
  const ANIMS = ['hop', 'wiggle', 'wobble', 'spin', 'pop', 'crab'];
  const SELECTOR = '.clawd, .clawd-heading, .clawd-aside, .clawd-btn';

  function trigger(el) {
    if (el.dataset.animating === '1') return;
    const cls = 'anim-' + ANIMS[Math.floor(Math.random() * ANIMS.length)];
    el.classList.add(cls);
    el.dataset.animating = '1';
    el.addEventListener('animationend', () => {
      el.classList.remove(cls);
      delete el.dataset.animating;
    }, { once: true });
  }

  document.addEventListener('mouseenter', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches(SELECTOR)) trigger(t);
  }, true);

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest(SELECTOR);
    if (el) trigger(el);
  });
})();

// ============ Term tooltip tap toggle (iOS Safari対応) ============
(function initTermTooltips() {
  document.addEventListener('click', (e) => {
    const term = e.target.closest('.term');
    document.querySelectorAll('.term.is-open').forEach((t) => {
      if (t !== term) t.classList.remove('is-open');
    });
    if (term) {
      term.classList.toggle('is-open');
      e.stopPropagation();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.term.is-open').forEach((t) => t.classList.remove('is-open'));
    }
  });
})();

// ============ Sidebar digital clock ============
(function initSidebarClock() {
  const dateEls = document.querySelectorAll('.sidebar-clock .clock-date');
  const timeEls = document.querySelectorAll('.sidebar-clock .clock-time');
  if (!timeEls.length) return;
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    const d = new Date();
    const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} (${WEEK[d.getDay()]})`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    dateEls.forEach((el) => { el.textContent = date; });
    timeEls.forEach((el) => { el.textContent = time; });
  }
  tick();
  setInterval(tick, 1000);
})();
