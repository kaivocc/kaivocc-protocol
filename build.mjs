// Static build: register.json + src/ -> dist/. No dependencies.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export const ASSETS = ['logo-640.png', 'logo-192.png', 'apple-touch-icon.png', 'favicon.svg', 'favicon-32.png'];

/* ---------- register ---------- */
export function validate(reg) {
  const errs = [];
  for (const [k, r] of Object.entries(reg.records)) {
    if (!['stated', 'absent', 'unconfirmed'].includes(r.state)) errs.push(`${k}: bad state`);
    if (r.state !== 'stated') for (const f of ['value', 'url', 'items', 'rpc', 'chainId']) if (f in r) errs.push(`${k}: inert record carries ${f}`);
    if (r.state === 'stated' && r.kind === 'address' && !ADDRESS.test(r.value || '')) errs.push(`${k}: stated address is not address-shaped`);
    if (r.state === 'stated' && r.kind === 'social' && !/^https:\/\//.test(r.url || '')) errs.push(`${k}: stated social needs an https url`);
  }
  if (errs.length) throw new Error('register invalid:\n  ' + errs.join('\n  '));
}
const on = (r) => r && r.state === 'stated';
export const handleOf = (url) => '@' + new URL(url).pathname.split('/').filter(Boolean)[0];

/* ---------- icons ---------- */
const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
const ARROW = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- record renderers ---------- */
function social(key, rec, svg) {
  if (on(rec)) {
    const h = handleOf(rec.url);
    return `<a class="soc" data-rec="${key}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(rec.label)} ${esc(h)}" title="${esc(rec.label)} ${esc(h)}">${svg}</a>`;
  }
  return `<span class="soc inert" data-rec="${key}" data-state="${rec.state}" role="img" aria-disabled="true" aria-label="${esc(rec.label)} pending" title="${esc(rec.label)} pending">${svg}</span>`;
}
function caSlot(rec) {
  if (on(rec)) {
    return `<div class="ca" data-rec="ca" data-state="stated" id="ca">
      <span class="ca-tag">${esc(rec.label)}</span>
      <span class="ca-val" id="ca-val">${esc(rec.value)}</span>
      <button class="ca-btn" type="button" data-copy-from="#ca-val" data-copy-label="Contract address" aria-label="Copy contract address">${COPY}<span data-lbl>Copy</span></button>
    </div>`;
  }
  return `<div class="ca inert" data-rec="ca" data-state="${rec.state}" id="ca">
      <span class="ca-tag">${esc(rec.label)}</span>
      <span class="ca-pending">pending</span>
      <button class="ca-btn" type="button" disabled aria-disabled="true" style="opacity:.45;cursor:not-allowed">${COPY}<span data-lbl>Copy</span></button>
    </div>`;
}
/* a value slot: stated -> value, otherwise label + "pending" only */
function slot(key, rec) {
  return on(rec) && rec.value
    ? `<span class="chip ok" data-rec="${key}" data-state="stated">${esc(rec.value)}</span>`
    : `<span class="chip" data-rec="${key}" data-state="${rec.state}">pending</span>`;
}
function tile(key, rec, sub) {
  const v = on(rec) && rec.value ? `<div class="v">${esc(rec.value)}</div>` : '<div class="v pend">pending</div>';
  return `<div class="tile" data-reveal data-spot data-rec="${key}" data-state="${rec.state}"><div class="k">${esc(rec.label)}</div>${v}<div class="s">${esc(sub)}</div></div>`;
}

const skelRows = Array.from({ length: 10 }, (_, i) =>
  `<div class="row" data-ph aria-hidden="true"><span class="n">${i + 1}</span><div class="who"><span class="skel sq"></span><span><span class="skel" style="width:90px"></span></span></div><span class="skel" style="width:80px;justify-self:end"></span><span class="skel" style="width:60px;justify-self:end"></span><span class="skel" style="width:84px;justify-self:end"></span><span></span></div>`).join('');
const skelTicks = Array.from({ length: 12 }, () => '<span class="skel skel-tick"></span>').join('');

export function render(reg) {
  const R = reg.records;
  const chain = R.chain, domain = R.domain, market = R.market;
  const domainLink = (cls, label) => on(domain)
    ? `<a class="${cls}" data-rec="domain" data-state="stated" href="${esc(domain.url)}">${label}</a>`
    : `<span class="${cls}" data-rec="domain" data-state="${domain.state}" aria-disabled="true">Site pending</span>`;
  const netList = on(R.networks) ? R.networks.items.map((n) => `<span class="chip ok">${esc(n)}</span>`).join('') : '<span class="chip">pending</span>';
  const copyBtn = (text, label) => `<button class="cpy" type="button" data-copy="${esc(text)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${COPY}<span data-lbl>Copy</span></button>`;

  const status = (cls = '') => `<span class="pill ${cls}" data-mkt-status data-state="retry"><span class="dot"></span><span data-mkt-text>Connecting</span></span>`;

  const marketBlock = on(market) ? `
    <div class="mkt" id="mkt" data-rec="market" data-state="stated">
      <div class="mkt-head">
        <div class="tabs" role="tablist" aria-label="Sort order">
          <button class="tab" role="tab" type="button" data-mode="vol" aria-selected="true">By volume</button>
          <button class="tab" role="tab" type="button" data-mode="chg" aria-selected="false">By 24h move</button>
        </div>
        ${status()}
      </div>
      <div class="mkt-err" role="status"></div>
      <div class="row hd"><span>#</span><span>Token</span><span class="num">Price</span><span class="num">24h</span><span class="num">Volume 24h</span><span></span></div>
      <div class="rows">${skelRows}</div>
      <div class="mkt-foot"><span>Ten leading pools, ranked by 24h volume, exactly as the index reports them.</span><span>Re-reads each minute while this tab is in view.</span></div>
    </div>
    <script type="application/json" id="market-cfg">${JSON.stringify({ url: market.url, fallbackNetwork: market.fallbackNetwork || null, pollMs: market.pollMs || 60000 })}</script>`
    : `<div class="mkt" data-rec="market" data-state="${market.state}"><div class="mkt-head"><span class="chip">Market feed pending</span></div></div>`;

  const tickerBlock = on(market)
    ? `<div class="ticker" aria-label="Live token ticker"><div class="ticker-track">${skelTicks}</div></div>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>KAIVO | Spend once, route anywhere</title>
<meta name="description" content="KAIVO holds a steady pool of value that software agents draw on across hundreds of engines, beside a live market board.">
<meta property="og:title" content="KAIVO">
<meta property="og:description" content="A steady pool of value, hundreds of engines, a readable spend trail.">
${on(domain) ? `<meta property="og:image" content="${esc(domain.url)}/assets/logo-640.png">` : ''}
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="styles.css">
<script>document.documentElement.className+=' js'</script>
</head>
<body>
<div class="progress" aria-hidden="true"><i></i></div>
<div class="mesh" aria-hidden="true"><i></i><i></i><i></i></div>
<header class="top" id="top">
  <div class="wrap">
    <div class="top-row">
      <a class="brand" href="#home" aria-label="KAIVO home"><img src="assets/logo-192.png" width="34" height="34" alt=""><b>KAIVO</b></a>
      <nav class="nav" aria-label="Sections">
        <a href="#market">Market</a><a href="#how">Flow</a><a href="#models">Models</a><a href="#funding">Funding</a><a href="#chain">Chain</a><a href="#faq">FAQ</a>
      </nav>
      <div class="top-end">
        ${social('x', R.x, X_SVG)}
        ${social('github', R.github, GH_SVG)}
        <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="menu"><svg class="bars" viewBox="0 0 24 24"><path d="M4 8h16M4 16h16"/></svg><svg class="x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
    </div>
    <nav class="menu-panel" id="menu" aria-label="Sections menu">
      <a href="#market">Market</a><a href="#how">Flow</a><a href="#models">Models</a><a href="#funding">Funding</a><a href="#chain">Chain</a><a href="#faq">FAQ</a>
    </nav>
    ${caSlot(R.ca)}
  </div>
</header>

<main class="wrap" id="home">
  <section class="hero" aria-labelledby="h1">
    <div class="hero-grid">
      <div class="hero-copy">
        <div data-reveal style="display:flex;flex-wrap:wrap;gap:10px">${on(market) ? status() : ''}<span class="pill" data-rec="chain" data-state="${chain.state}">${on(chain) ? esc(chain.label) : 'Chain pending'}</span></div>
        <h1 id="h1" data-reveal>Fuel for software <em>that runs unattended.</em></h1>
        <p class="lead" data-reveal>Kaivo converts a steady pool of value into the horsepower behind whichever engine your software calls. Load the pool, let the router choose, and keep each cost easy to read.</p>
        <div class="cta-row" data-reveal>
          <a class="btn" href="#market">Watch the market ${ARROW}</a>
          ${domainLink('btn green', 'kaivo.cc ' + ARROW)}
        </div>
      </div>
      <div class="stage" aria-hidden="false">
        <div class="layer" data-depth="0.4"><span class="orb a"></span><span class="orb b"></span></div>
        <div class="layer" data-depth="1"><img class="logo-hero" src="assets/logo-640.png" width="640" height="604" alt="KAIVO mark: two crossing orbits around a green ring" fetchpriority="high"></div>
        <div class="layer" data-depth="1.6"><span class="orb c"></span><span class="tag t1">Agents</span><span class="tag t2">Any engine</span><span class="tag t3">Single ledger</span></div>
      </div>
    </div>
    <div class="tiles">
      ${tile('models', R.models, 'engines behind a single pool')}
      ${tile('backing', R.backing, 'kCASH is matched to its reserve')}
      ${tile('fees', R.fees, 'charged on routed calls')}
      ${tile('yield', R['yield'], 'earned while funds rest')}
    </div>
  </section>

  ${tickerBlock}

  <section id="market" aria-labelledby="h-market">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">Live on-chain</span>
      <h2 id="h-market">Where the volume sits <em>on the chain today.</em></h2>
      <p>Ten pools with the heaviest daily turnover, pulled from a public pool index. The board stands apart from the token and does not wait on a contract announcement.</p>
    </div>
    <div data-reveal>${marketBlock}</div>
  </section>

  <section id="how" aria-labelledby="h-how">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">The flow</span>
      <h2 id="h-how">Three steps between <em>deposit and result.</em></h2>
    </div>
    <div class="cards">
      <article class="card" data-reveal data-spot><span class="num">01</span><h3>Park the value</h3><p>Stable funds go in and come out as kCASH, a unit held at parity with its reserve.</p></article>
      <article class="card" data-reveal data-spot><span class="num">02</span><h3>Let the router decide</h3><p>A task heads toward whichever engine suits it best, trading off quality, speed and price.</p></article>
      <article class="card" data-reveal data-spot><span class="num">03</span><h3>Check the books</h3><p>Software leaves a plain trail of what it burned, so spending limits turn into numbers rather than hunches.</p></article>
    </div>
    <div class="flow" data-reveal>
      <div class="node"><div class="chips"><span class="tk">NVDA</span><span class="tk">TSLA</span><span class="tk g">USDG</span></div><b>Capital</b><small>Shares, fiat</small></div>
      <span class="ln" aria-hidden="true"></span>
      <div class="node"><span class="core" aria-hidden="true">k</span><b>kCASH</b><small>${on(R.backing) ? esc(R.backing.value) + ' backed value' : 'backing pending'}</small></div>
      <span class="ln" aria-hidden="true"></span>
      <div class="node"><div class="pillbox"><span>${on(R.models) ? esc(R.models.value) + ' engines' : 'engines pending'}</span><span class="dark">AI</span><span>workers</span></div><small>Matched by the router</small></div>
    </div>
  </section>

  <section id="models" aria-labelledby="h-models">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">Model tiers</span>
      <h2 id="h-models">Rate slots, <em>filled when confirmed.</em></h2>
      <p>The table is laid out already. A figure lands the instant it is confirmed; until that moment its slot admits the gap.</p>
    </div>
    <div class="tbl" data-reveal>
      <div class="tr hd"><span>Tier</span><span>Input</span><span>Output</span><span>Through Kaivo</span></div>
      ${['Light tier|small and speedy', 'Balanced tier|day-to-day thinking', 'Deep tier|long, tangled problems', 'Code tier|writing and fixing'].map((t) => { const [a, b] = t.split('|'); return `<div class="tr"><span><b>${a}</b><small>${b}</small></span>${slot('fees', R.fees)}${slot('fees', R.fees)}${slot('fees', R.fees)}</div>`; }).join('')}
    </div>
  </section>

  <section id="funding" aria-labelledby="h-fund">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">Funding</span>
      <h2 id="h-fund">Routes for <em>topping up the pool.</em></h2>
    </div>
    <div class="cards">
      <article class="card" data-reveal data-spot><h3>Stablecoin transfer</h3><p>Move stable funds from your account and collect kCASH in return.</p><div class="chips">${slot('backing', R.backing)}</div></article>
      <article class="card" data-reveal data-spot><h3>${esc(R.cardCheckout.label)}</h3><p>A fiat door for people who prefer plastic.</p><div class="chips">${slot('cardCheckout', R.cardCheckout)}</div></article>
      <article class="card" data-reveal data-spot><h3>${esc(R['yield'].label)}</h3><p>A return on funds parked between runs.</p><div class="chips">${slot('yield', R['yield'])}</div></article>
    </div>
    <div class="sec-head" style="margin-top:56px" data-reveal>
      <span class="eyebrow">Connect</span>
      <h2>Plug it into <em>the tools you use today.</em></h2>
    </div>
    <div class="cards">
      <article class="card" data-reveal data-spot><h3>Toolkits</h3><p>Ready-made adapters for popular orchestration libraries.</p><div class="chips">${slot('plugins', R.plugins)}</div></article>
      <article class="card" data-reveal data-spot><h3>Tool protocol</h3><p>Offer the pool to any client fluent in a tool protocol.</p><div class="chips">${slot('plugins', R.plugins)}</div></article>
      <article class="card" data-reveal data-spot><h3>${esc(R.endpoint.label)}</h3><p>A single address for requests, whichever vendor answers.</p><div class="chips">${slot('endpoint', R.endpoint)}</div></article>
    </div>
  </section>

  <section id="kcash" aria-labelledby="h-k">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">kCASH</span>
      <h2 id="h-k">A unit built for <em>machines with budgets.</em></h2>
    </div>
    <div class="steps" data-reveal>
      <div class="step"><span class="big">Hold</span><p>Deposit stable funds and keep kCASH on standby.</p></div>
      <div class="step"><span class="big">Spend</span><p>Software draws down the pool as its calls get routed and answered.</p></div>
      <div class="step"><span class="big">Redeem</span><p>Leftover kCASH converts back into its reserve.</p>${slot('redeemFee', R.redeemFee)}</div>
    </div>
  </section>

  <section id="chain" aria-labelledby="h-chain">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">Chain and records</span>
      <h2 id="h-chain">Where it lives, <em>and what remains unsettled.</em></h2>
    </div>
    <div class="chain">
      <dl class="kv" data-reveal data-rec="chain" data-state="${chain.state}">
        <div><dt>Network</dt><dd class="v" style="margin:0">${on(chain) ? esc(chain.label) : 'pending'}</dd></div>
        ${on(chain) ? `<div><dt>Chain ID</dt><dd class="v" style="margin:0">${esc(chain.chainId)}</dd>${copyBtn(chain.chainId, 'Chain ID')}</div>
        <div><dt>RPC</dt><dd class="v" style="margin:0">${esc(chain.rpc)}</dd>${copyBtn(chain.rpc, 'RPC address')}</div>
        <div><dt>Source</dt><dd class="v" style="margin:0">${esc(chain.source)}</dd></div>` : ''}
      </dl>
      <div class="kv" data-reveal>
        <div data-rec="networks" data-state="${R.networks.state}"><span class="k">Networks</span><span class="chips" style="display:flex;flex-wrap:wrap;gap:8px">${netList}</span></div>
        <div><span class="k">${esc(R.ca.label)}</span>${slot('ca-status', R.ca)}</div>
        <div><span class="k">${esc(R.x.label)}</span>${slot('x-status', R.x)}</div>
        <div><span class="k">${esc(R.github.label)}</span>${slot('github-status', R.github)}</div>
      </div>
    </div>
  </section>

  <section id="faq" aria-labelledby="h-faq">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">Questions</span>
      <h2 id="h-faq">Plain replies, <em>no fog.</em></h2>
    </div>
    <div class="faq" data-reveal>
      <details><summary>What does Kaivo actually do?</summary><div class="ans"><p>It stores a steady pool of value that software can burn through across many engines, with routing and bookkeeping looked after.</p></div></details>
      <details><summary>What is kCASH?</summary><div class="ans"><p>The accounting unit for that pool, held at parity with its reserve so a figure keeps its meaning.</p></div></details>
      <details><summary>Why are some slots marked pending?</summary><div class="ans"><p>Whatever lacks confirmation is marked pending rather than guessed. Links, addresses and rates surface only after they are stated.</p></div></details>
      <details><summary>Is the market board tied to the token?</summary><div class="ans"><p>No. It reads a public index spanning the entire network and keeps running whatever happens with a contract.</p></div></details>
      <details><summary>Which networks are in scope?</summary><div class="ans"><p>Robinhood Chain leads, with BNB Chain and Base next to it.</p></div></details>
      <details><summary>Is any of this financial advice?</summary><div class="ans"><p>No. Market numbers originate with an outside provider and appear untouched.</p></div></details>
    </div>
  </section>

  <section class="closing" data-reveal>
    <span class="glow" aria-hidden="true"></span>
    <h2>Hand your software <em>a purse with brains.</em></h2>
    <p>Watch the board, keep an eye on the records as they firm up, and return once the gaps close.</p>
    <div class="cta-row"><a class="btn" href="#market">Return to the board ${ARROW}</a><a class="btn ghost" href="#top">Top of page</a></div>
  </section>
</main>

<footer>
  <div class="wrap foot">
    <p>Market data comes from an outside public index and is shown untouched. Nothing here is a recommendation to buy or sell.</p>
    <div class="links"><a href="#market">Market</a><a href="#how">Flow</a><a href="#faq">FAQ</a>${on(domain) ? `<a href="${esc(domain.url)}" data-rec="domain-foot" data-state="stated">kaivo.cc</a>` : ''}</div>
  </div>
</footer>
<div class="toast" role="status" aria-live="polite"></div>
<script src="app.js" defer></script>
</body>
</html>
`;
}

export function build({ register, out = join(ROOT, 'dist') } = {}) {
  const reg = register || JSON.parse(readFileSync(join(ROOT, 'register.json'), 'utf8'));
  validate(reg);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets'), { recursive: true });
  writeFileSync(join(out, 'index.html'), render(reg));
  for (const f of ['tokens.css', 'styles.css', 'app.js']) copyFileSync(join(ROOT, 'src', f), join(out, f));
  for (const f of ASSETS) {
    const p = join(ROOT, 'src', 'assets', f);
    if (!existsSync(p)) throw new Error('missing asset ' + f + ' (run tools/prep-assets.py)');
    copyFileSync(p, join(out, 'assets', f));
  }
  return out;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const out = build();
  console.log('built ->', out);
}
