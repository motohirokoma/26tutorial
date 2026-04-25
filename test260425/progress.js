/**
 * Tutorial Progress Tracking (ES Module)
 *
 * Stores chapter completion + streak in localStorage for instant UI,
 * and syncs to Firestore (tutorials/test260425/users/{uid}) when signed in.
 * Merges local and cloud state on sign-in (union of completions, max streak).
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

const STORAGE_KEY = 'test260425-tutorial-progress';
const STREAK_KEY = 'test260425-tutorial-streak';
const TUTORIAL_SLUG = 'test260425';

const CHAPTERS = [
  { id: '01', title: 'AI・DXの全体像と2026年の業界地殻変動', hours: 1.5, phase: 'basics' },
  { id: '02', title: '戦略コンサル思考 — イシュー・仮説・構造化', hours: 1.5, phase: 'basics' },
  { id: '03', title: '生成AI/LLM 本質編', hours: 2, phase: 'core' },
  { id: '04', title: '従来型ML / 予測AI / データ基盤 / MLOps', hours: 1.5, phase: 'core' },
  { id: '05', title: 'フィジカルAI — ロボティクス・エッジ・世界モデル', hours: 1.5, phase: 'core' },
  { id: '06', title: 'PoC設計から本番デリバリーまで', hours: 2, phase: 'core' },
  { id: '07', title: '業界未来予測 ✕ 技術ロードマップ ✕ データ資産の真価', hours: 2, phase: 'advanced' },
  { id: '08', title: 'インサイト型提案 — 脱・ソリューション営業', hours: 1.5, phase: 'advanced' },
  { id: '09', title: '業界ケース①: 金融', hours: 1.5, phase: 'advanced' },
  { id: '10', title: '業界ケース②: 製造', hours: 1.5, phase: 'advanced' },
  { id: '11', title: '業界ケース③: 防衛', hours: 1.5, phase: 'advanced' },
  { id: '12', title: '倫理・規制・セキュリティ', hours: 1.5, phase: 'capstone' },
  { id: '13', title: '統合ケース演習 — 中期DXロードマップ提案', hours: 2, phase: 'capstone' },
  { id: '14', title: '最終演習問題', hours: 1.5, phase: 'capstone' },
];

const TOTAL_HOURS = 23;

const CHAPTER_FILES = {
  '01': '01-overview.html',
  '02': '02-consulting-thinking.html',
  '03': '03-llm-fundamentals.html',
  '04': '04-ml-data-infra.html',
  '05': '05-physical-ai.html',
  '06': '06-poc-to-delivery.html',
  '07': '07-industry-foresight.html',
  '08': '08-insight-proposal.html',
  '09': '09-case-finance.html',
  '10': '10-case-manufacturing.html',
  '11': '11-case-defense.html',
  '12': '12-ethics-regulation.html',
  '13': '13-capstone-case.html',
  '14': '14-final-exercise.html',
};

let currentUser = null;
let cloudUnsub = null;
let applyingRemote = false;
let firstSnapshotForUser = true;

// ---- Local storage ----

function getProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveProgress(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function getStreak() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: null }; }
  catch (e) { return { count: 0, lastDate: null }; }
}
function saveStreak(streak) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
}

// ---- Cloud sync ----

function userDocRef(uid) {
  return doc(db, 'tutorials', TUTORIAL_SLUG, 'users', uid);
}

async function pushToCloud() {
  if (!currentUser || applyingRemote) return;
  try {
    await setDoc(userDocRef(currentUser.uid), {
      progress: getProgress(),
      streak: getStreak(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('Firestore push failed:', e);
  }
}

function mergeProgress(local, cloud) {
  const merged = { ...cloud };
  for (const k in local) {
    if (!merged[k] || new Date(local[k]) < new Date(merged[k])) {
      merged[k] = local[k];
    }
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
  }, (err) => {
    console.error('Firestore subscription error:', err);
  });
}

// ---- Actions ----

function toggleComplete(chapterId) {
  const data = getProgress();
  if (data[chapterId]) {
    delete data[chapterId];
  } else {
    data[chapterId] = new Date().toISOString();
    updateStreak();
  }
  saveProgress(data);
  updateAllUI();
  pushToCloud();
}

function updateStreak() {
  const streak = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  if (streak.lastDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (streak.lastDate === yesterday) {
    streak.count++;
  } else {
    streak.count = 1;
  }
  streak.lastDate = today;
  saveStreak(streak);
}

// ---- Stats ----

function getStats() {
  const data = getProgress();
  let doneCount = 0, doneHours = 0;
  CHAPTERS.forEach(ch => {
    if (data[ch.id]) { doneCount++; doneHours += ch.hours; }
  });
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

// ---- UI Update ----

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
  if (progressInfo) progressInfo.textContent = stats.doneHours + 'h / ' + stats.totalHours + 'h completed';

  const btn = document.querySelector('.btn-complete');
  if (btn) {
    const curCh = btn.getAttribute('data-chapter');
    if (curCh) {
      const isDone = !!data[curCh];
      btn.classList.toggle('is-done', isDone);
      btn.textContent = isDone ? '✓ Completed' : '☐ Mark as Complete';
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
  if (indexTime) indexTime.textContent = stats.doneHours + 'h / ' + stats.totalHours + 'h';

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
      nextBtn.style.color = '#16a34a';
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

// ---- Auth UI ----

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
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Sign-in failed:', e);
    alert('サインインに失敗しました: ' + e.message);
  }
}

async function handleSignOut() {
  try {
    if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
    await signOut(auth);
  } catch (e) {
    console.error('Sign-out failed:', e);
  }
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  const streak = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  if (streak.lastDate && streak.lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (streak.lastDate !== yesterday) {
      saveStreak({ count: 0, lastDate: null });
    }
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
    if (user) {
      subscribeToCloud(user.uid);
    }
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
