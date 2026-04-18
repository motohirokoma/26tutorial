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
