import {
  auth, db, provider, signInWithPopup, signOut, onAuthStateChanged,
  doc, setDoc, onSnapshot, serverTimestamp,
} from './firebase-config.js';

const STORAGE_KEY = 'test260419-5-tutorial-progress';
const STREAK_KEY = 'test260419-5-tutorial-streak';
const TUTORIAL_SLUG = 'test260419-5';

const CHAPTERS = [
  { id: '01', title: 'Skillとは', hours: 0.42, phase: 'basics' },
  { id: '02', title: 'Skillの最小構成', hours: 0.5, phase: 'basics' },
  { id: '03', title: '良いSkillの設計原則', hours: 0.5, phase: 'basics' },
  { id: '04', title: 'templatesディレクトリの使い方', hours: 0.5, phase: 'basics' },
  { id: '05', title: '実践：メール下書きSkill', hours: 0.67, phase: 'practice' },
  { id: '06', title: '実践：議事録整形Skill', hours: 0.5, phase: 'practice' },
  { id: '07', title: 'Skills と Subagents/Hooks の組み合わせ', hours: 0.5, phase: 'practice' },
  { id: '08', title: '最終演習：業務から3つSkill化', hours: 0.42, phase: 'practice' },
];

const TOTAL_HOURS = 4;

const CHAPTER_FILES = {
  '01': '01-skill-overview.html',
  '02': '02-skill-structure.html',
  '03': '03-design-principles.html',
  '04': '04-templates.html',
  '05': '05-email-draft-skill.html',
  '06': '06-meeting-notes-skill.html',
  '07': '07-combine-sub-hook.html',
  '08': '08-final-exercise.html',
};

let currentUser = null, cloudUnsub = null, applyingRemote = false, firstSnapshotForUser = true;

function getProgress(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{}}catch(e){return {}}}
function saveProgress(d){localStorage.setItem(STORAGE_KEY,JSON.stringify(d))}
function getStreak(){try{return JSON.parse(localStorage.getItem(STREAK_KEY))||{count:0,lastDate:null}}catch(e){return{count:0,lastDate:null}}}
function saveStreak(s){localStorage.setItem(STREAK_KEY,JSON.stringify(s))}
function userDocRef(uid){return doc(db,'tutorials',TUTORIAL_SLUG,'users',uid)}

async function pushToCloud(){
  if(!currentUser||applyingRemote)return;
  try{await setDoc(userDocRef(currentUser.uid),{progress:getProgress(),streak:getStreak(),updatedAt:serverTimestamp()})}
  catch(e){console.error('Firestore push failed:',e)}
}

function mergeProgress(local,cloud){const m={...cloud};for(const k in local){if(!m[k]||new Date(local[k])<new Date(m[k]))m[k]=local[k]}return m}
function mergeStreak(local,cloud){if(!cloud)return local;if(!local||!local.lastDate)return cloud;if(cloud.lastDate>local.lastDate)return cloud;if(local.lastDate>cloud.lastDate)return local;return{count:Math.max(local.count,cloud.count),lastDate:local.lastDate}}

function subscribeToCloud(uid){
  firstSnapshotForUser = true;
  cloudUnsub = onSnapshot(userDocRef(uid),(snap)=>{
    if(snap.metadata&&snap.metadata.hasPendingWrites)return;
    const cloud = snap.exists()?snap.data():null;
    if(firstSnapshotForUser){
      firstSnapshotForUser=false;
      const lp=getProgress(),ls=getStreak();
      const mp=cloud?mergeProgress(lp,cloud.progress||{}):lp;
      const ms=cloud?mergeStreak(ls,cloud.streak):ls;
      applyingRemote=true; saveProgress(mp); saveStreak(ms); updateAllUI(); applyingRemote=false;
      const cp=(cloud&&cloud.progress)||{};
      const lhe=Object.keys(mp).some(k=>!cp[k]);
      if(!snap.exists()||lhe){
        setDoc(userDocRef(uid),{progress:mp,streak:ms,updatedAt:serverTimestamp()}).catch(e=>console.error('Initial sync push failed:',e));
      }
    } else {
      applyingRemote=true; saveProgress((cloud&&cloud.progress)||{}); saveStreak((cloud&&cloud.streak)||{count:0,lastDate:null}); updateAllUI(); applyingRemote=false;
    }
  },(err)=>console.error('Firestore subscription error:',err));
}

function toggleComplete(chId){
  const d=getProgress();
  if(d[chId])delete d[chId]; else {d[chId]=new Date().toISOString(); updateStreak();}
  saveProgress(d); updateAllUI(); pushToCloud();
}

function updateStreak(){
  const s=getStreak(), today=new Date().toISOString().slice(0,10);
  if(s.lastDate===today)return;
  const y=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(s.lastDate===y)s.count++; else s.count=1;
  s.lastDate=today; saveStreak(s);
}

function getStats(){
  const d=getProgress(); let dc=0,dh=0;
  CHAPTERS.forEach(c=>{if(d[c.id]){dc++; dh+=c.hours}});
  return{doneCount:dc,totalCount:CHAPTERS.length,doneHours:dh,totalHours:TOTAL_HOURS,percentage:Math.round((dc/CHAPTERS.length)*100)};
}

function getPhaseStats(){
  const d=getProgress(),ph={};
  CHAPTERS.forEach(c=>{if(!ph[c.phase])ph[c.phase]={done:0,total:0}; ph[c.phase].total++; if(d[c.id])ph[c.phase].done++});
  const r={}; for(const p in ph) r[p]=ph[p].total>0?Math.round((ph[p].done/ph[p].total)*100):0;
  return r;
}

function getNextChapter(){const d=getProgress(); for(let i=0;i<CHAPTERS.length;i++)if(!d[CHAPTERS[i].id])return CHAPTERS[i]; return null}

function updateAllUI(){
  const d=getProgress(),s=getStats(),ps=getPhaseStats(),nc=getNextChapter(),st=getStreak();
  document.querySelectorAll('.status-dot[data-chapter]').forEach(dot=>{const id=dot.getAttribute('data-chapter'); dot.classList.toggle('done',!!d[id])});
  const rf=document.querySelector('.ring-fill');
  if(rf){const c=2*Math.PI*18, f=(s.percentage/100)*c; rf.setAttribute('stroke-dasharray',f.toFixed(1)+' '+(c-f).toFixed(1)); rf.setAttribute('stroke-dashoffset','0');}
  const rp=document.querySelector('.ring-pct'); if(rp)rp.textContent=s.percentage+'%';
  const rs=document.querySelector('.ring-sub'); if(rs)rs.textContent=s.doneCount+' / '+s.totalCount+' sections';
  const pi=document.querySelector('.progress-info'); if(pi)pi.textContent=s.doneHours.toFixed(1)+'h / '+s.totalHours+'h completed';
  const btn=document.querySelector('.btn-complete');
  if(btn){const cc=btn.getAttribute('data-chapter'); if(cc){const done=!!d[cc]; btn.classList.toggle('is-done',done); btn.textContent=done?'\u2713 Completed':'\u2610 Mark as Complete';}}
  document.querySelectorAll('.chapter-link[data-chapter]').forEach(link=>{const id=link.getAttribute('data-chapter'),cb=link.querySelector('.ch-checkbox');
    if(cb){if(d[id]){link.classList.add('completed'); cb.innerHTML='<span class="check-icon">&#10003;</span>';} else {link.classList.remove('completed'); cb.innerHTML='';}}
  });
  const ib=document.querySelector('.index-progress-fill'); if(ib)ib.style.width=s.percentage+'%';
  const ic=document.querySelector('.index-progress-count'); if(ic)ic.textContent=s.doneCount+' / '+s.totalCount+' sections completed';
  const it=document.querySelector('.index-progress-time'); if(it)it.textContent=s.doneHours.toFixed(1)+'h / '+s.totalHours+'h';
  document.querySelectorAll('[id^="pct-"]').forEach(el=>{const pk=el.id.replace('pct-',''),p=ps[pk]; if(p!==undefined){el.textContent=p+'%'; el.classList.toggle('has-progress',p>0);}});
  const nb=document.getElementById('next-btn');
  if(nb){if(nc){const inCh=window.location.pathname.indexOf('/chapters/')!==-1; nb.href=(inCh?'':'chapters/')+CHAPTER_FILES[nc.id]; nb.innerHTML='<span class="next-label">Next:</span> '+nc.title+' &rarr;';} else {nb.removeAttribute('href'); nb.innerHTML='&#127881; Complete!'; nb.style.color='#D97757';}}
  const se=document.getElementById('streak'),sc=document.getElementById('streak-count');
  if(se&&sc){se.classList.toggle('active',st.count>0); sc.textContent=st.count+(st.count===1?' day':' days');}
  const gb=document.getElementById('global-bar'); if(gb)gb.style.width=s.percentage+'%';
}

function updateAuthUI(u){const sb=document.getElementById('sign-in-btn'),ub=document.getElementById('auth-user'),av=document.getElementById('auth-avatar'),nm=document.getElementById('auth-name'),sy=document.getElementById('sync-badge');
  if(u){if(sb)sb.style.display='none'; if(ub)ub.style.display='flex'; if(av&&u.photoURL)av.src=u.photoURL; if(nm)nm.textContent=u.displayName||u.email||'Signed in'; if(sy){sy.style.display='inline-flex'; sy.title='Cloud sync on';}}
  else {if(sb)sb.style.display='inline-flex'; if(ub)ub.style.display='none'; if(sy)sy.style.display='none';}}
async function handleSignIn(){try{await signInWithPopup(auth,provider)}catch(e){console.error(e); alert('サインインに失敗しました: '+e.message)}}
async function handleSignOut(){try{if(cloudUnsub){cloudUnsub(); cloudUnsub=null;} await signOut(auth)}catch(e){console.error(e)}}

document.addEventListener('DOMContentLoaded',()=>{
  const s=getStreak(),t=new Date().toISOString().slice(0,10);
  if(s.lastDate&&s.lastDate!==t){const y=new Date(Date.now()-86400000).toISOString().slice(0,10); if(s.lastDate!==y)saveStreak({count:0,lastDate:null});}
  const btn=document.querySelector('.btn-complete');
  if(btn)btn.addEventListener('click',function(){const id=this.getAttribute('data-chapter'); if(id)toggleComplete(id);});
  document.querySelectorAll('.ch-checkbox[data-chapter]').forEach(cb=>cb.addEventListener('click',function(e){e.preventDefault(); e.stopPropagation(); toggleComplete(this.getAttribute('data-chapter'));}));
  const si=document.getElementById('sign-in-btn'); if(si)si.addEventListener('click',handleSignIn);
  const so=document.getElementById('sign-out-btn'); if(so)so.addEventListener('click',handleSignOut);
  onAuthStateChanged(auth,(u)=>{currentUser=u; updateAuthUI(u); if(cloudUnsub){cloudUnsub(); cloudUnsub=null;} if(u)subscribeToCloud(u.uid);});
  updateAllUI();
});

window.tutorialProgress={getStats,getPhaseStats,getNextChapter,getStreak,getProgress,reset(){localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STREAK_KEY); updateAllUI(); if(currentUser)pushToCloud();}};


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
