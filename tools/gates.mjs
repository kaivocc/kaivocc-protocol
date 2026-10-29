// Gate runner: node tools/gates.mjs. Exit 0 only when every gate passes.
import { readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build, render, validate, handleOf } from '../build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TMP = join(ROOT, '.gate-tmp');
const read = (p) => readFileSync(p, 'utf8');
const REG = JSON.parse(read(join(ROOT, 'register.json')));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ADDR_G = /0x[a-fA-F0-9]{40}/g;
const FIX_ADDR = '0x' + 'a1'.repeat(20);

const results = [];
let asserts = 0;
function ok(c, msg) { asserts++; if (!c) throw new Error(msg); }
function gate(name, fn) {
  try { fn(); results.push([name, true]); console.log('  ok   ' + name); }
  catch (e) { results.push([name, false, e.message]); console.log('  FAIL ' + name + '\n       ' + e.message); }
}

/* ---------- helpers ---------- */
function walk(d, acc = []) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, acc) : acc.push(p); } return acc; }
const isText = (p) => /\.(html|css|js|json|svg|md|mjs|py|txt)$/.test(p) || !/\./.test(p);
const records = (reg) => Object.entries(reg.records);
function flip(reg, key) {   // state-independent: reads the current state at runtime
  const r = reg.records[key];
  if (r.state === 'stated') {
    reg.records[key] = { state: 'absent', label: r.label, kind: r.kind, source: r.source, recordedOn: r.recordedOn };
  } else {
    const n = { ...r, state: 'stated' };
    if (r.kind === 'address') n.value = FIX_ADDR;
    else if (r.kind === 'social') n.url = key === 'github' ? 'https://github.com/kaivo-fixture' : 'https://x.com/kaivo_fixture';
    else if (key === 'market') { n.url = 'https://api.geckoterminal.com/api/v2/networks/robinhood_chain/trending_pools?include=base_token,quote_token&page=1'; n.pollMs = 60000; }
    else if (key === 'domain') n.url = 'https://fixture.example';
    else if (key === 'chain') { n.chainId = '0x1'; n.rpc = 'https://rpc.fixture.example'; }
    else if (key === 'networks') n.items = ['FixtureNet'];
    else n.value = 'fixture-value-' + key;
    reg.records[key] = n;
  }
  return reg;
}
const tagsFor = (html, key) => [...html.matchAll(new RegExp(`<[^>]*data-rec="${key}"[^>]*>`, 'g'))].map((m) => m[0]);
const stateOf = (tag) => (tag.match(/data-state="(\w+)"/) || [])[1];
const section = (html, id) => { const a = html.indexOf(`<section id="${id}"`); const b = html.indexOf('</section>', a); return a < 0 ? '' : html.slice(a, b + 10); };
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const hexLits = (s) => s.match(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g) || [];

console.log('KAIVO gates');
build({ out: DIST });
rmSync(TMP, { recursive: true, force: true });
const html = read(join(DIST, 'index.html'));
const css = read(join(DIST, 'styles.css')), tokens = read(join(DIST, 'tokens.css')), js = read(join(DIST, 'app.js'));

/* ---------- build output ---------- */
gate('build: dist/ holds exactly the deploy set, nothing from the repo root', () => {
  const files = walk(DIST).map((p) => relative(DIST, p).split(sep).join('/')).sort();
  const want = ['app.js', 'assets/apple-touch-icon.png', 'assets/favicon-32.png', 'assets/favicon.svg', 'assets/logo-192.png', 'assets/logo-640.png', 'index.html', 'styles.css', 'tokens.css'];
  ok(JSON.stringify(files) === JSON.stringify(want), 'dist contents differ: ' + files.join(','));
  ok(!files.some((f) => /register|README|LICENSE|whitepaper|brand|reference/i.test(f)), 'repo file leaked into dist');
});
gate('logo: file copied into dist, valid RGBA PNG, referenced with a correct relative path', () => {
  const p = join(DIST, 'assets/logo-640.png'); ok(existsSync(p), 'logo-640.png missing in dist');
  const b = readFileSync(p); ok(b.slice(1, 4).toString() === 'PNG', 'not a PNG');
  ok(b[25] === 6, 'IHDR colour type is ' + b[25] + ', expected 6 (RGBA)');
  ok(b.equals(readFileSync(join(ROOT, 'src/assets/logo-640.png'))), 'dist logo differs from source');
  ok(/<img class="logo-hero" src="assets\/logo-640\.png"/.test(html), 'hero img does not reference assets/logo-640.png');
  ok(/<img src="assets\/logo-192\.png"/.test(html), 'brand img does not reference assets/logo-192.png');
});
gate('paths: every relative src/href in index.html resolves to a file in dist', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:)/.test(u));
  ok(refs.length >= 8, 'too few refs found');
  for (const r of refs) { ok(!r.startsWith('/'), 'absolute path ' + r); ok(existsSync(join(DIST, r)), 'dangling ref ' + r); }
});
gate('favicon: 32x32 SVG, linked, no double hyphen anywhere, no comments', () => {
  const s = read(join(DIST, 'assets/favicon.svg'));
  ok(/width="32" height="32" viewBox="0 0 32 32"/.test(s), 'not 32x32');
  ok(!s.includes('--') && !s.includes('<!--'), 'double hyphen or comment in svg');
  ok(/rel="icon" type="image\/svg\+xml" href="assets\/favicon\.svg"/.test(html), 'svg favicon not linked');
  ok((s.match(/<path/g) || []).length === 2, 'expected ink + green paths');
});

/* ---------- palette ---------- */
gate('palette: colour literals live only in tokens.css; svg literals are a subset of tokens', () => {
  ok(hexLits(css).length === 0, 'hex literal in styles.css: ' + hexLits(css));
  ok(hexLits(js).length === 0, 'hex literal in app.js');
  ok(hexLits(html.replace(/\sd="[^"]*"/g, '')).length === 0, 'hex literal in index.html: ' + hexLits(html));
  ok(!/\brgba?\(|\bhsla?\(/.test(css + js), 'rgb()/hsl() literal outside tokens');
  const tk = new Set(hexLits(tokens).map((h) => h.toUpperCase()));
  for (const h of hexLits(read(join(DIST, 'assets/favicon.svg')))) ok(tk.has(h.toUpperCase()), 'favicon colour not in tokens: ' + h);
});
gate('palette: every token matches the real pixel named in its provenance comment', () => {
  const r = spawnSync('python', ['-I', join(ROOT, 'tools/verify-palette.py')], { encoding: 'utf8' });
  ok(r.status === 0, 'verify-palette failed: ' + r.stdout + r.stderr);
});

/* ---------- no dates ---------- */
const DATE_PATTERNS = [/\b(19|20)\d{2}\b/, /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, /\bas of\b|\bchecked\b|\bupdated\b|\blast (seen|sync)\b|\b\d+\s?(s|m|h|d)\s+ago\b|\bago\b/i, /\b(am|pm)\b/i];
gate('dates: no date, time or "as of" text anywhere in dist (text, attributes, strings)', () => {
  const body = html.replace(/\sd="[^"]*"/g, '').replace(/<script type="application\/json"[\s\S]*?<\/script>/, '');
  for (const p of DATE_PATTERNS) { const m = body.match(p); ok(!m, 'date-like text in html: ' + (m && m[0])); }
  ok(!/new Date|Date\.now|toLocale(Time|Date)String|toISOString|Intl\.DateTimeFormat|performance\.timing/.test(js.replace(/performance\.now/g, '')), 'date API used in app.js');
  ok(!/2026|recordedOn/.test(html + js + css), 'register dates leaked into dist');
  ok(/recordedOn/.test(read(join(ROOT, 'register.json'))), 'register should keep dates as data');
});

/* ---------- register ---------- */
gate('register: states valid, inert records carry no value/url, stated addresses are address-shaped', () => {
  validate(REG);
  for (const [k, r] of records(REG)) if (r.state !== 'stated') ok(!('value' in r) && !('url' in r), k + ' inert but carries a value');
  const bad = clone(REG); bad.records.x.state = 'absent'; bad.records.x.url = 'https://x.com/oops';
  let threw = false; try { validate(bad); } catch { threw = true; } ok(threw, 'validator accepted an inert record with a url');
});

/* ---------- mutation harness ---------- */
gate('mutation: flip every record at runtime; anchors, hrefs and values follow the record state', () => {
  const base = render(REG);
  for (const [key] of records(REG)) {
    const m = flip(clone(REG), key); validate(m);
    const html2 = render(m);
    for (const [label, reg, h] of [['base', REG, base], ['flipped', m, html2]]) {
      const r = reg.records[key], tags = tagsFor(h, key);
      ok(tags.length > 0, `${key}: no data-rec anchor in ${label} render`);
      for (const t of tags) {
        ok(stateOf(t) === r.state, `${key}: anchor state ${stateOf(t)} != record ${r.state} (${label})`);
        if (r.state !== 'stated') ok(!/href=/.test(t), `${key}: inert anchor has href (${label})`);
      }
      for (const f of ['value', 'url', 'rpc', 'chainId']) if (r.state === 'stated' && r[f]) ok(h.includes(r[f]), `${key}.${f} missing from ${label} render`);
    }
    const old = REG.records[key];
    if (old.state === 'stated') for (const f of ['value', 'url', 'rpc', 'chainId']) if (old[f]) ok(!html2.includes(old[f]), `${key}.${f} leaked after going inert`);
    ok(html2 !== base, `${key}: flip changed nothing`);
  }
});

/* ---------- link rule ---------- */
gate('links: store URL, derive handle; no href for unstated records; external hrefs only from stated records', () => {
  for (const key of ['x', 'github']) {
    const inert = render(flip(clone(REG), key).records[key].state === 'stated' ? (() => { const r = clone(REG); r.records[key] = { state: 'absent', label: REG.records[key].label, kind: 'social' }; return r; })() : REG);
    const st = render((() => { const r = clone(REG); r.records[key] = { ...REG.records[key], state: 'stated', url: key === 'x' ? 'https://x.com/kaivo_fixture' : 'https://github.com/kaivo-fixture' }; return r; })());
    ok(tagsFor(inert, key).every((t) => !t.includes('href=') && t.includes('role="img"') && /pending/.test(t)), `${key}: inert icon wrong`);
    const t = tagsFor(st, key)[0];
    ok(t.includes('href="https://') && t.includes(handleOf(key === 'x' ? 'https://x.com/kaivo_fixture' : 'https://github.com/kaivo-fixture')), `${key}: stated icon lacks href/handle`);
  }
  const stated = new Set(records(REG).filter(([, r]) => r.state === 'stated' && r.url).map(([, r]) => r.url));
  for (const m of html.matchAll(/<a [^>]*href="(https?:[^"]+)"/g)) ok(stated.has(m[1]), 'external link not backed by a stated record: ' + m[1]);
});

/* ---------- social icons ---------- */
gate('social: X and GitHub icons present top-right in both states, official marks, 44px, no text labels', () => {
  for (const reg of [REG, flip(flip(clone(REG), 'x'), 'github')]) {
    const h = render(reg), hdr = h.slice(h.indexOf('<header'), h.indexOf('</header>'));
    const end = hdr.slice(hdr.indexOf('class="top-end"'));
    ok(end.indexOf('data-rec="x"') > 0 && end.indexOf('data-rec="github"') > end.indexOf('data-rec="x"'), 'icons missing or misordered in .top-end');
    ok(hdr.includes('M18.901 1.153h3.68l-8.04 9.19'), 'official X mark path missing');
    ok(hdr.includes('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'), 'official GitHub octicon path missing');
    for (const k of ['x', 'github']) { const block = h.slice(h.indexOf(`data-rec="${k}"`)).split('</a>')[0].split('</span>')[0]; ok(!/>\s*[A-Za-z]{2,}\s*</.test(block.replace(/<svg[\s\S]*?<\/svg>/, '')), k + ' icon has a text label'); }
  }
  ok(/\.soc \{[^}]*width: 44px; height: 44px/.test(css), '.soc is not 44x44');
  ok(!/\.top-end[^{]*\{[^}]*display:\s*none/.test(css) && !/\.soc[^{]*\{[^}]*display:\s*none/.test(css), 'social icons hidden at some breakpoint');
});

/* ---------- CA ---------- */
gate('CA slot: top of page, both branches, full address + copy when stated, nothing address-shaped when absent', () => {
  const caKey = records(REG).find(([, r]) => r.kind === 'address')[0];
  const a = render(REG.records[caKey].state === 'stated' ? flip(clone(REG), caKey) : REG);       // absent branch
  const b = render(REG.records[caKey].state === 'stated' ? REG : flip(clone(REG), caKey));       // stated branch
  const absent = REG.records[caKey].state === 'stated' ? render(flip(clone(REG), caKey)) : a;
  const stated = REG.records[caKey].state === 'stated' ? render(REG) : b;
  ok(/class="ca inert"[^>]*data-state="(absent|unconfirmed)"/.test(absent) && /ca-pending">pending</.test(absent), 'absent: inert pending slot missing');
  ok(!ADDR_G.test(absent), 'absent: address-shaped string present'); ADDR_G.lastIndex = 0;
  ok(/<button class="ca-btn"[^>]*disabled/.test(absent), 'absent: copy button should be disabled');
  ok(stated.includes(`id="ca-val">${FIX_ADDR}<`) || new RegExp('id="ca-val">0x[a-fA-F0-9]{40}<').test(stated), 'stated: full address not rendered');
  ok(/data-copy-from="#ca-val"/.test(stated) && !/<button class="ca-btn"[^>]*disabled/.test(stated), 'stated: copy button missing or disabled');
  for (const h of [absent, stated]) ok(h.indexOf('id="ca"') > h.indexOf('<header') && h.indexOf('id="ca"') < h.indexOf('<main'), 'CA slot not inside the header above main');
  ok(/\.top \{[^}]*position: sticky; top: 0/.test(css), 'header with CA slot is not sticky');
  ok(/\.ca-val \{[^}]*font: 500 clamp\(15px, 2\.1vw, 26px\)/.test(css), 'CA font not large');
  ok(/data-copy-from/.test(js) && /clipboard/.test(js) && /classList\.add\('done'\)/.test(js), 'copy feedback missing in app.js');
});
gate('address scanner: matches address-shaped strings to the stated registry; 0x hex such as a chain id is never blanket-rejected', () => {
  const statedSet = (reg) => new Set(records(reg).filter(([, r]) => r.kind === 'address' && r.state === 'stated').map(([, r]) => r.value.toLowerCase()));
  const scan = (text, reg) => (text.match(ADDR_G) || []).filter((a) => !statedSet(reg).has(a.toLowerCase()));
  ok(scan('chain 0x1237 and 0xdeadbeef', REG).length === 0, 'short 0x hex wrongly rejected');
  ok(scan('stray ' + FIX_ADDR, REG).length === 1 || statedSet(REG).has(FIX_ADDR), 'scanner missed an unstated address');
  const flipped = flip(clone(REG), records(REG).find(([, r]) => r.kind === 'address')[0]);
  const hh = render(flipped);
  ok(scan(hh, flipped).length === 0, 'stated CA flagged by scanner (CA must be exempt)');
  for (const p of walk(DIST).filter(isText)) ok(scan(read(p), REG).length === 0, 'unregistered address in ' + relative(DIST, p));
});

/* ---------- market ---------- */
gate('market: identical bytes whatever the CA state, and driven only by the market record', () => {
  const caKey = records(REG).find(([, r]) => r.kind === 'address')[0];
  const A = render(REG), B = render(flip(clone(REG), caKey));
  for (const id of ['market']) ok(section(A, id) === section(B, id) && section(A, id).length > 500, 'market section differs with CA state');
  const tk = (h) => (h.match(/<div class="ticker"[\s\S]*?<\/div><\/div>/) || [''])[0];
  ok(tk(A) === tk(B) && tk(A).length > 20, 'ticker differs with CA state');
  ok(!/\bca\b|contract|#ca-val/i.test(js.replace(/data-copy-from/g, '')), 'app.js market code references the CA');
  const M = render(flip(clone(REG), 'market'));
  const marketStated = REG.records.market.state === 'stated';
  ok(marketStated ? !M.includes('id="market-cfg"') && !M.includes('class="ticker"') : M.includes('id="market-cfg"'), 'market did not follow its own record');
  const cfg = JSON.parse(A.match(/id="market-cfg">([\s\S]*?)<\/script>/)[1]);
  ok(cfg.url === 'https://api.geckoterminal.com/api/v2/networks/robinhood_chain/trending_pools?include=base_token,quote_token&page=1', 'market URL is not the specified one');
  ok(cfg.pollMs === 60000, 'poll interval is not 60s');
});
gate('market: parser/poller contract (fields, relationships, backoff, visibility, fallbacks, skeletons)', () => {
  for (const s of ["o.type === 'token'", 'image_url', 'symbol', 'price_usd', 'price_change_percentage', 'volume_usd', 'relationships', 'base_token', '.slice(0, 10)', 'visibilitychange', 'Math.pow(2', 'AbortController', 'setTimeout(cycle', 'data-copy', "'—'"]) ok(js.includes(s), 'app.js missing: ' + s);
  ok(/last good data/.test(js), 'no last-good-data path');
  ok(/class="skel/.test(html) && /@keyframes shimmer/.test(css) && /\.in\.go/.test(css), 'skeleton to fade-in path missing');
  ok(/tt img/.test(css) && /onerror/.test(js) && /charAt\(0\)/.test(js), 'letter tile fallback missing');
  ok(/flash-up/.test(js) && /tween\(/.test(js), 'count-up / flash missing');
  ok(!/api\.geckoterminal/.test(js), 'market URL hard-coded in app.js instead of the register');
});

/* ---------- motion ---------- */
gate('motion: reduced-motion fallback covers all animation; spring solver, parallax, spotlight, progress, live dot present', () => {
  ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important[\s\S]*transition: none !important/.test(css), 'blanket reduced-motion rule missing');
  ok(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(js) && /reduce\.matches/.test(js), 'JS does not honour reduced motion');
  for (const s of ['function Spring', 'data-depth', 'pointermove', '--mx', 'IntersectionObserver', 'scaleX(']) ok(js.includes(s), 'app.js missing ' + s);
  for (const s of ['@keyframes ping', '[data-spot]::before', '.progress', '.mesh i', '@keyframes drift1', '@keyframes scroll']) ok(css.includes(s), 'css missing ' + s);
});

/* ---------- measurement hygiene ---------- */
gate('css: no ch units; tap-target minimums declared for every interactive class', () => {
  ok(!/\d(?:\.\d+)?ch\b/.test(css), 'ch unit used');
  for (const sel of ['\\.nav a', '\\.menu-btn', '\\.ca-btn', '\\.btn', '\\.tab', '\\.row \\.cp', '\\.kv \\.cpy', '\\.faq summary', '\\.foot \\.links a', '\\.brand', '\\.soc']) ok(new RegExp(sel + '[^{]*\\{[^}]*(min-height|height): ?(4[4-9]|[5-9]\\d)px').test(css), 'no 44px floor for ' + sel);
});

/* ---------- copy ---------- */
gate('copy: zero shared 2-grams with the reference page text (pairs made only of function words excluded)', () => {
  const ref = new Set(JSON.parse(read(join(ROOT, 'tools/ref-grams.json'))));
  const stop = new Set('a an the of to and or in on for with is it as at by be your you that this from every one no not are can we our its into until only when what how why if so but than then them they their there these those was were will would could should has have had do does did i me my up out off over under'.split(' '));
  // facts that come from register records (chain and network names, stated values, the domain) are data, not copy
  let text = visibleText(html);
  for (const [, r] of records(REG)) for (const f of [r.label === 'Robinhood Chain' && r.label, r.value, ...(r.items || [])]) if (f) text = text.split(f).join(' ');
  text = text.split('kaivo.cc').join(' ');
  const w = text.toLowerCase().match(/[a-z0-9][a-z0-9'+.%$:/-]*/g).map((x) => x.replace(/^[.'\-:/]+|[.'\-:/]+$/g, ''));
  const hits = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (stop.has(w[i]) && stop.has(w[i + 1])) continue;
    const g = createHash('sha1').update(w[i] + ' ' + w[i + 1]).digest('hex').slice(0, 10);
    if (ref.has(g)) hits.push(w[i] + ' ' + w[i + 1]);
  }
  ok(hits.length === 0, 'shared 2-grams: ' + [...new Set(hits)].join(' | '));
});

/* ---------- repo ---------- */
gate('repo: no CLAUDE.md, no .claude/, no AI attribution; README, whitepaper, MIT LICENSE present and outside dist', () => {
  ok(!existsSync(join(ROOT, 'CLAUDE.md')) && !existsSync(join(ROOT, '.claude')), 'CLAUDE.md or .claude/ present');
  const skip = (p) => /[\\/](brand|reference|node_modules|dist|\.gate-tmp)[\\/]|ref-grams\.json|gates\.mjs$/.test(p) || !isText(p);
  for (const p of walk(ROOT).filter((p) => !skip(p))) ok(!/claude|anthropic|co-authored-by|generated (by|with)|\bchatgpt\b|\bopenai\b/i.test(read(p)), 'attribution-like text in ' + relative(ROOT, p));
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) ok(existsSync(join(ROOT, f)), f + ' missing');
  ok(/^MIT License/.test(read(join(ROOT, 'LICENSE'))) && /Copyright \(c\) 2026 KAIVO/.test(read(join(ROOT, 'LICENSE'))), 'LICENSE not MIT / KAIVO / 2026');
  const readme = read(join(ROOT, 'README.md')), wp = read(join(ROOT, 'docs/whitepaper.md'));
  ok(/kaivo\.cc/.test(readme) && /Robinhood Chain/.test(readme) && /## Overview/.test(readme) && /## Features/.test(readme) && /## Links/.test(readme), 'README sections missing');
  ok(/Vision and mission/.test(wp) && /Tokenomics/.test(wp) && /Roadmap/.test(wp) && /Team/.test(wp) && (wp.match(/\*\*Phase \d/g) || []).length >= 3, 'whitepaper sections missing');
  ok(!/\bAI\b/.test(readme + wp), 'README / whitepaper mention AI');
});

rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} gates passed, ${asserts} assertions, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
