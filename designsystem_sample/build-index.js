#!/usr/bin/env node
// build-index.js — DS catalog index generator
// Usage: node build-index.js
// Reads: systems.json + 47 HTML files (ds-meta script + main section ids)
// Writes: index.html
//
// Validation:
//   1. File existence: all NN-slug.html for each systems.json[].id
//   2. ds-meta.id triplet match: filename === ds-meta.id === systems.json[].id
//   3. section id array: HTML main > section[id] === ["brand", ...systems.json[].sections[].id]

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SYSTEMS_PATH = path.join(ROOT, 'systems.json');
const OUT_PATH = path.join(ROOT, 'index.html');

const KIND_LABELS = {
  'design-system': 'DS',
  'component-library': 'CL',
  'brand-guidelines': 'BG',
  'product-aesthetic': 'PA',
  'ui-kit': 'UK',
};

const CATEGORY_LABELS = {
  'big-tech': 'Big Tech / Platform',
  'oss': 'OSS / Framework',
  'asia': 'Asia',
  'saas': 'B2B SaaS',
  'personality': 'Personality',
  'public': 'Government / Public',
  'browser-other': 'Browser / Other',
};

const CATEGORY_ORDER = ['big-tech', 'oss', 'asia', 'saas', 'personality', 'public', 'browser-other'];

// ---------- 1. Load systems.json ----------
const systems = JSON.parse(fs.readFileSync(SYSTEMS_PATH, 'utf8'));
console.log(`Loaded ${systems.length} systems.`);

// ---------- 2. Validate each HTML ----------
const errors = [];
const warnings = [];

for (const sys of systems) {
  const file = path.join(ROOT, `${sys.id}.html`);
  if (!fs.existsSync(file)) {
    errors.push(`MISSING_FILE: ${sys.id}.html`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');

  // ds-meta script
  const m = html.match(/<script id="ds-meta" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!m) {
    errors.push(`NO_DS_META: ${sys.id}`);
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    errors.push(`INVALID_DS_META_JSON: ${sys.id} — ${e.message}`);
    continue;
  }
  if (meta.id !== sys.id) {
    errors.push(`ID_MISMATCH: filename=${sys.id} but ds-meta.id=${meta.id}`);
  }
  if (meta.fileSlug !== sys.id) {
    errors.push(`SLUG_MISMATCH: filename=${sys.id} but ds-meta.fileSlug=${meta.fileSlug}`);
  }

  // section id array (main 内のみ)
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!mainMatch) {
    errors.push(`NO_MAIN: ${sys.id}`);
    continue;
  }
  const mainHtml = mainMatch[1];
  const ids = [...mainHtml.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map(x => x[1]);
  const expected = ['brand', ...sys.sections.map(s => s.id)];
  if (ids.length !== expected.length || ids.some((id, i) => id !== expected[i])) {
    errors.push(
      `SECTION_MISMATCH: ${sys.id}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(ids)}`
    );
  }
}

if (errors.length > 0) {
  console.error(`\n=== ${errors.length} errors ===`);
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
}
console.log(`Validation OK: ${systems.length}/${systems.length}`);

// ---------- 3. Render index.html ----------
const grouped = CATEGORY_ORDER.map(cat => ({
  category: cat,
  label: CATEGORY_LABELS[cat],
  systems: systems.filter(s => s.category === cat),
}));

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const renderCard = sys => {
  const accent = sys.swatches[0] || '#888';
  const swatches = (sys.swatches || []).slice(0, 5).map(c =>
    `<span class="swatch" style="background:${escapeHtml(c)}" title="${escapeHtml(c)}"></span>`
  ).join('');
  const tags = (sys.tags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const num = sys.id.split('-')[0];
  return `
    <a class="card"
       href="${escapeHtml(sys.id)}.html"
       data-name="${escapeHtml(sys.name.toLowerCase())}"
       data-vendor="${escapeHtml((sys.vendor||'').toLowerCase())}"
       data-kind="${escapeHtml(sys.kind)}"
       data-category="${escapeHtml(sys.category)}"
       data-fidelity="${escapeHtml(sys.fidelity)}"
       data-source-status="${escapeHtml(sys.sourceStatus)}"
       data-tags="${escapeHtml((sys.tags||[]).join(' ').toLowerCase())}">
      <div class="card-accent" style="background:${escapeHtml(accent)}"></div>
      <div class="card-body">
        <div class="card-swatches">${swatches}</div>
        <div class="card-title-row">
          <h3 class="card-title">${escapeHtml(sys.name)}</h3>
          <span class="card-num">${escapeHtml(num)}</span>
        </div>
        <div class="card-vendor">${escapeHtml(sys.vendor || '')}</div>
        <div class="card-badges">
          <span class="badge kind kind-${escapeHtml(sys.kind)}">${escapeHtml(KIND_LABELS[sys.kind] || sys.kind)}</span>
          <span class="badge fid fid-${escapeHtml(sys.fidelity)}">${escapeHtml(sys.fidelity)}</span>
          <span class="badge src src-${escapeHtml(sys.sourceStatus)}">${escapeHtml(sys.sourceStatus)}</span>
        </div>
        <p class="card-desc">${escapeHtml(sys.description || '')}</p>
        <div class="card-foot">
          <div class="card-tags">${tags}</div>
          <span class="card-arrow">→</span>
        </div>
      </div>
    </a>`;
};

const renderSection = g => `
    <section class="cat-section" data-category="${g.category}">
      <h2 class="cat-h">
        <span class="cat-label">${escapeHtml(g.label)}</span>
        <span class="cat-count">${g.systems.length}</span>
      </h2>
      <div class="grid">
        ${g.systems.map(renderCard).join('')}
      </div>
    </section>`;

const stats = {
  total: systems.length,
  kinds: Object.entries(systems.reduce((a, s) => (a[s.kind]=(a[s.kind]||0)+1, a), {})),
  fidelity: Object.entries(systems.reduce((a, s) => (a[s.fidelity]=(a[s.fidelity]||0)+1, a), {})),
  sourceStatus: Object.entries(systems.reduce((a, s) => (a[s.sourceStatus]=(a[s.sourceStatus]||0)+1, a), {})),
};

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design Systems Reference Catalog — 47 systems</title>
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f4f4f5; --surface:#ffffff; --surface-2:#fafafa;
  --text:#18181b; --text-2:#52525b; --text-3:#a1a1aa;
  --border:#e4e4e7; --border-2:#d4d4d8;
  --shadow:0 1px 3px rgba(0,0,0,0.06); --shadow-2:0 4px 12px rgba(0,0,0,0.08);
  --accent:#18181b;
  --r-sm:6px; --r-md:10px; --r-lg:14px; --r-xl:20px;
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-7:32px; --s-8:48px;
  --font-sans:'Inter','Noto Sans JP',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,'SF Mono',monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg);color:var(--text);
  font-family:var(--font-sans);font-size:14px;line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
a{color:inherit;text-decoration:none}

/* Topbar */
.topbar{
  position:sticky;top:0;z-index:30;height:56px;
  background:rgba(255,255,255,0.92);backdrop-filter:saturate(150%) blur(8px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:var(--s-5);
  padding:0 var(--s-7);
}
.topbar .logo{font-weight:700;font-size:15px;letter-spacing:-0.01em}
.topbar .logo .dot{display:inline-block;width:8px;height:8px;background:var(--text);border-radius:50%;margin-right:8px;vertical-align:middle}
.topbar .search{
  flex:1;max-width:420px;
  background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r-md);padding:0 var(--s-3);height:36px;
  font:inherit;color:var(--text);
}
.topbar .search:focus{outline:none;border-color:var(--text-2);box-shadow:0 0 0 3px rgba(24,24,27,0.06)}
.topbar .meta{margin-left:auto;color:var(--text-3);font-size:12px;font-variant-numeric:tabular-nums}

/* Hero */
.hero{padding:var(--s-8) var(--s-7) var(--s-6);max-width:1280px;margin:0 auto}
.hero h1{font-size:34px;font-weight:700;letter-spacing:-0.02em;margin:0 0 var(--s-3)}
.hero .lead{color:var(--text-2);max-width:720px;margin:0 0 var(--s-5);font-size:15px}
.hero .stats{display:flex;flex-wrap:wrap;gap:var(--s-5);font-size:13px;color:var(--text-2)}
.hero .stats .stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:var(--s-2) var(--s-4);box-shadow:var(--shadow)}
.hero .stats .stat strong{color:var(--text);font-weight:600;margin-right:6px;font-variant-numeric:tabular-nums}

/* Filter bar */
.filter-bar{
  position:sticky;top:56px;z-index:20;
  background:rgba(244,244,245,0.92);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--border);
  padding:var(--s-3) var(--s-7);
  display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-3);
}
.filter-group{display:flex;align-items:center;gap:var(--s-2)}
.filter-group .label{color:var(--text-3);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
.chip{
  padding:5px 10px;font-size:12px;font-weight:500;
  background:var(--surface);border:1px solid var(--border);
  border-radius:999px;cursor:pointer;color:var(--text-2);
  transition:all 0.12s ease;
}
.chip:hover{border-color:var(--border-2);color:var(--text)}
.chip.active{background:var(--text);color:var(--surface);border-color:var(--text)}

/* Container */
main{max-width:1280px;margin:0 auto;padding:var(--s-6) var(--s-7) var(--s-8)}

/* Category section */
.cat-section{margin-bottom:var(--s-8)}
.cat-section.hidden{display:none}
.cat-h{
  display:flex;align-items:baseline;gap:var(--s-3);
  font-size:13px;font-weight:600;color:var(--text-2);
  text-transform:uppercase;letter-spacing:0.05em;
  padding-bottom:var(--s-3);border-bottom:1px solid var(--border);
  margin:0 0 var(--s-5);
}
.cat-h .cat-label{color:var(--text)}
.cat-h .cat-count{color:var(--text-3);font-variant-numeric:tabular-nums}

/* Card grid */
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--s-5)}
@media(max-width:1279px){.grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:959px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:639px){.grid{grid-template-columns:1fr}}

/* Card */
.card{
  display:flex;flex-direction:column;
  background:var(--surface);
  border:1px solid var(--border);border-radius:var(--r-lg);
  overflow:hidden;box-shadow:var(--shadow);
  transition:transform 0.18s ease,box-shadow 0.18s ease,border-color 0.18s ease;
}
.card.hidden{display:none}
.card:hover{transform:translateY(-2px);box-shadow:var(--shadow-2);border-color:var(--border-2)}
.card-accent{height:8px;width:100%}
.card-body{padding:var(--s-4);display:flex;flex-direction:column;gap:var(--s-2);flex:1}
.card-swatches{display:flex;gap:4px;margin-bottom:var(--s-1)}
.swatch{display:inline-block;width:22px;height:22px;border-radius:4px;border:1px solid rgba(0,0,0,0.06)}
.card-title-row{display:flex;align-items:center;gap:var(--s-2)}
.card-title{margin:0;font-size:15px;font-weight:600;letter-spacing:-0.01em;flex:1}
.card-num{
  font-family:var(--font-mono);font-size:10px;color:var(--text-3);
  background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:2px 6px;
  font-variant-numeric:tabular-nums;
}
.card-vendor{font-size:12px;color:var(--text-3)}
.card-badges{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0}
.badge{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:500;letter-spacing:0.02em;text-transform:uppercase}
.badge.kind{background:#f4f4f5;color:#52525b;border:1px solid #e4e4e7}
.badge.kind.kind-design-system{background:#dbeafe;color:#1e40af;border-color:#bfdbfe}
.badge.kind.kind-component-library{background:#f0e7ff;color:#5b21b6;border-color:#e0ccff}
.badge.kind.kind-brand-guidelines{background:#fce7f3;color:#9d174d;border-color:#fbcfe8}
.badge.kind.kind-product-aesthetic{background:#fef3c7;color:#854d0e;border-color:#fde68a}
.badge.kind.kind-ui-kit{background:#d1fae5;color:#065f46;border-color:#a7f3d0}
.badge.fid{background:#f4f4f5;color:#52525b;border:1px solid #e4e4e7}
.badge.fid.fid-documented{background:#dcfce7;color:#15803d;border-color:#bbf7d0}
.badge.fid.fid-approximated{background:#fef3c7;color:#92400e;border-color:#fde68a}
.badge.fid.fid-inspired{background:#ede9fe;color:#5b21b6;border-color:#ddd6fe}
.badge.src{background:#f4f4f5;color:#52525b;border:1px solid #e4e4e7;text-transform:none;font-size:9px}
.badge.src.src-verified{background:#f0fdf4;color:#166534;border-color:#bbf7d0}
.badge.src.src-homepage-only{background:#fefce8;color:#854d0e;border-color:#fde68a}
.badge.src.src-legacy{background:#fff7ed;color:#9a3412;border-color:#fed7aa}
.badge.src.src-unverified{background:#fef2f2;color:#991b1b;border-color:#fecaca}
.card-desc{
  margin:0;font-size:13px;color:var(--text-2);line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  flex:1;
}
.card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:var(--s-2)}
.card-tags{display:flex;gap:4px;flex-wrap:wrap}
.tag{font-size:10px;color:var(--text-3);background:var(--surface-2);border:1px solid var(--border);padding:1px 6px;border-radius:3px}
.card-arrow{color:var(--text-3);font-size:14px;transition:transform 0.18s ease,color 0.18s ease}
.card:hover .card-arrow{transform:translateX(4px);color:var(--text)}

/* Empty */
.empty{
  text-align:center;padding:var(--s-8) var(--s-5);color:var(--text-3);
  background:var(--surface);border:1px dashed var(--border-2);border-radius:var(--r-lg);
}
.empty.hidden{display:none}

/* Footer */
footer.site-footer{
  border-top:1px solid var(--border);
  padding:var(--s-7) var(--s-7) var(--s-8);
  color:var(--text-2);font-size:12px;
  max-width:1280px;margin:0 auto;
}
footer.site-footer h3{font-size:13px;font-weight:600;color:var(--text);margin:0 0 var(--s-3)}
footer.site-footer p{margin:0 0 var(--s-2);max-width:760px;line-height:1.7}
footer.site-footer details{margin-top:var(--s-4);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:var(--s-3) var(--s-4)}
footer.site-footer details summary{cursor:pointer;font-weight:500;color:var(--text)}
footer.site-footer details ul{margin:var(--s-3) 0 0;padding-left:var(--s-5);font-size:11px;line-height:1.6}
footer.site-footer details a{color:var(--text-2);text-decoration:underline}
footer.site-footer .sig{margin-top:var(--s-5);color:var(--text-3);font-size:11px}
</style>
</head>
<body>

<header class="topbar">
  <div class="logo"><span class="dot"></span>DS Catalog</div>
  <input type="search" class="search" id="searchInput" placeholder="Search by name, vendor, tag…" aria-label="Search">
  <div class="meta">${stats.total} systems · ${CATEGORY_ORDER.length} categories · 2026-05</div>
</header>

<section class="hero">
  <h1>Design Systems Reference Catalog</h1>
  <p class="lead">世界の著名なデザインシステム・コンポーネントライブラリ・ブランドガイドラインを 47 件、各 DS のデフォルトトーンに寄せて再現したカタログです。Internal visual reference 用途。</p>
  <div class="stats">
    <span class="stat"><strong>${stats.total}</strong>systems</span>
    ${stats.kinds.map(([k,v]) => `<span class="stat"><strong>${v}</strong>${KIND_LABELS[k]||k}</span>`).join('')}
    <span class="stat"><strong>${stats.fidelity.find(([k]) => k==='documented')?.[1] || 0}</strong>documented</span>
    <span class="stat"><strong>${stats.sourceStatus.find(([k]) => k==='verified')?.[1] || 0}</strong>verified</span>
  </div>
</section>

<div class="filter-bar">
  <div class="filter-group" data-filter="category">
    <span class="label">Category</span>
    <button class="chip active" data-value="">All</button>
    ${CATEGORY_ORDER.map(c => `<button class="chip" data-value="${c}">${CATEGORY_LABELS[c]}</button>`).join('')}
  </div>
  <div class="filter-group" data-filter="kind">
    <span class="label">Kind</span>
    <button class="chip active" data-value="">All</button>
    ${Object.keys(KIND_LABELS).map(k => `<button class="chip" data-value="${k}">${KIND_LABELS[k]}</button>`).join('')}
  </div>
  <div class="filter-group" data-filter="fidelity">
    <span class="label">Fidelity</span>
    <button class="chip active" data-value="">All</button>
    <button class="chip" data-value="documented">documented</button>
    <button class="chip" data-value="approximated">approximated</button>
    <button class="chip" data-value="inspired">inspired</button>
  </div>
  <div class="filter-group" data-filter="source-status">
    <span class="label">Source</span>
    <button class="chip active" data-value="">All</button>
    <button class="chip" data-value="verified">verified</button>
    <button class="chip" data-value="homepage-only">homepage-only</button>
    <button class="chip" data-value="legacy">legacy</button>
    <button class="chip" data-value="unverified">unverified</button>
  </div>
</div>

<main>
${grouped.map(renderSection).join('\n')}
<div class="empty hidden" id="emptyState">該当する DS がありません。フィルタや検索を変更してください。</div>
</main>

<footer class="site-footer">
  <h3>About this catalog</h3>
  <p>本サイトは Motohiro Koma が個人プロジェクトとして制作した、世界の著名なデザインシステム/コンポーネントライブラリ/ブランドガイドラインの参照カタログです。各ページは公式の公開ドキュメントを参考にした近似再現で、原著作者・提供元との関係はありません。各 DS の名称・商標・トークン・原則は提供元に帰属します。各ページの <code>fidelity</code> バッジ (documented / approximated / inspired) と <code>sourceStatus</code> バッジで再現精度をご判断ください。</p>
  <p>商標権者・著作権者から削除のご要望があれば速やかに対応します。お問い合わせは <a href="https://github.com/motohirokoma/26tutorial/issues" target="_blank" rel="noopener">GitHub Issues</a> へ。</p>
  <p>Reproduction date: 2026-05-05 ・ Total: ${stats.total} systems</p>
  <details>
    <summary>License notes (47 entries)</summary>
    <ul>
${systems.map(s => `      <li><strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.licenseNote)}</li>`).join('\n')}
    </ul>
  </details>
  <p class="sig">Built with Claude. systems.json (single source of truth) → build-index.js → index.html.</p>
</footer>

<script>
const cards = Array.from(document.querySelectorAll('.card'));
const sections = Array.from(document.querySelectorAll('.cat-section'));
const search = document.getElementById('searchInput');
const empty = document.getElementById('emptyState');
const filterState = { category: '', kind: '', fidelity: '', 'source-status': '', q: '' };

document.querySelectorAll('.filter-group').forEach(group => {
  const filter = group.dataset.filter;
  group.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filterState[filter] = chip.dataset.value;
      apply();
    });
  });
});

search.addEventListener('input', () => {
  filterState.q = search.value.trim().toLowerCase();
  apply();
});

function apply(){
  let visibleCount = 0;
  cards.forEach(card => {
    const ds = card.dataset;
    const okCat = !filterState.category || ds.category === filterState.category;
    const okKind = !filterState.kind || ds.kind === filterState.kind;
    const okFid = !filterState.fidelity || ds.fidelity === filterState.fidelity;
    const okSrc = !filterState['source-status'] || ds.sourceStatus === filterState['source-status'];
    const q = filterState.q;
    const okQ = !q || (
      ds.name.includes(q) || ds.vendor.includes(q) || ds.tags.includes(q)
    );
    const visible = okCat && okKind && okFid && okSrc && okQ;
    card.classList.toggle('hidden', !visible);
    if (visible) visibleCount++;
  });
  sections.forEach(sec => {
    const visibleInSec = sec.querySelectorAll('.card:not(.hidden)').length;
    sec.classList.toggle('hidden', visibleInSec === 0);
  });
  empty.classList.toggle('hidden', visibleCount > 0);
}

apply();
</script>

</body>
</html>
`;

fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log(`Wrote ${OUT_PATH} (${html.length} chars).`);
