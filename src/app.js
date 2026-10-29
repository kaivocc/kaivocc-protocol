(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  /* ---------- damped spring solver (semi-implicit Euler, fixed substeps) ---------- */
  var live = [];
  var raf = 0, last = 0;
  function Spring(from, to, opt) {
    this.x = from; this.v = 0; this.to = to;
    this.k = opt.k || 170; this.c = opt.c || 22; this.m = opt.m || 1;
    this.on = opt.on; this.done = opt.done; this.hold = opt.hold; this.wait = opt.delay || 0;
    live.push(this); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  Spring.prototype.step = function (dt) {
    if (this.wait > 0) { this.wait -= dt * 1000; return false; }
    var n = Math.ceil(dt / 0.004), h = dt / n;
    for (var i = 0; i < n; i++) {
      var a = (-this.k * (this.x - this.to) - this.c * this.v) / this.m;
      this.v += a * h; this.x += this.v * h;
    }
    this.on(this.x);
    if (!this.hold && Math.abs(this.x - this.to) < 0.0005 && Math.abs(this.v) < 0.0005) { this.on(this.to); return true; }
    return false;
  };
  function tick(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (var i = live.length - 1; i >= 0; i--) { if (live[i].step(dt)) { var s = live.splice(i, 1)[0]; if (s.done) s.done(); } }
    raf = live.length ? requestAnimationFrame(tick) : 0;
  }

  /* ---------- scroll progress, header, menu ---------- */
  var bar = $('.progress i'), top = $('.top');
  var scrollTarget = 0, barSpring = null, barX = 0;
  function onScroll() {
    var h = root.scrollHeight - window.innerHeight;
    var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
    top.classList.toggle('scrolled', window.scrollY > 4);
    if (reduce.matches) { bar.style.transform = 'scaleX(' + p + ')'; return; }
    scrollTarget = p;
    if (!barSpring) {
      barSpring = new Spring(barX, p, { k: 260, c: 30, hold: true, on: function (x) { barX = x; bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, x)) + ')'; } });
    }
    barSpring.to = p;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  var mb = $('.menu-btn');
  if (mb) {
    mb.addEventListener('click', function () {
      var o = top.classList.toggle('open'); mb.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
    $$('.menu-panel a').forEach(function (a) { a.addEventListener('click', function () { top.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); }); });
  }

  /* ---------- scroll reveal ---------- */
  var revealEls = $$('[data-reveal]');
  function showNow(el) { el.style.opacity = 1; el.style.transform = 'none'; }
  if (reduce.matches || !('IntersectionObserver' in window)) { revealEls.forEach(showNow); }
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, sibs = el.parentElement ? $$(':scope > [data-reveal]', el.parentElement) : [el];
        var idx = Math.max(0, sibs.indexOf(el));
        new Spring(0, 1, {
          k: 170, c: 20, delay: idx * 80,
          on: function (p) { el.style.opacity = Math.min(1, Math.max(0, p * 1.4)); el.style.transform = 'translate3d(0,' + ((1 - p) * 26).toFixed(2) + 'px,0)'; },
          done: function () { el.style.transform = 'none'; }
        });
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- hero parallax (pointer + scroll) ---------- */
  var stage = $('.stage');
  if (stage && !reduce.matches) {
    var layers = $$('[data-depth]', stage).map(function (el) { return { el: el, d: parseFloat(el.getAttribute('data-depth')) || 0, x: 0, y: 0, sx: null, sy: null }; });
    var px = 0, py = 0;
    window.addEventListener('pointermove', function (e) { px = (e.clientX / window.innerWidth - 0.5) * 2; py = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });
    layers.forEach(function (L) {
      L.sx = new Spring(0, 0, { k: 90, c: 15, hold: true, on: function (x) { L.x = x; place(L); } });
      L.sy = new Spring(0, 0, { k: 90, c: 15, hold: true, on: function (y) { L.y = y; place(L); } });
    });
    var place = function (L) { L.el.style.transform = 'translate3d(' + L.x.toFixed(2) + 'px,' + L.y.toFixed(2) + 'px,0)'; };
    var feed = function () {
      var sc = Math.min(window.scrollY, 700);
      layers.forEach(function (L) { L.sx.to = px * L.d * 26; L.sy.to = py * L.d * 20 + sc * L.d * 0.16; });
      requestAnimationFrame(feed);
    };
    feed();
  }

  /* ---------- spotlight ---------- */
  doc.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-spot]');
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---------- copy ---------- */
  var toast = $('.toast'), toastT = 0;
  function say(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }
  function writeClip(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = doc.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } finally { doc.body.removeChild(ta); }
    });
  }
  function copy(text, btn, label) {
    writeClip(text).then(function () {
      btn.classList.add('done');
      var tx = btn.querySelector('[data-lbl]'), old = tx && tx.textContent;
      if (tx) tx.textContent = 'Copied';
      say((label || 'Copied') + ' copied');
      setTimeout(function () { btn.classList.remove('done'); if (tx) tx.textContent = old; }, 1600);
    }, function () { say('Copy blocked by the browser'); });
  }
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) copy(b.getAttribute('data-copy'), b, b.getAttribute('data-copy-label'));
    var cb = e.target.closest('[data-copy-from]');
    if (cb) { var src = $(cb.getAttribute('data-copy-from')); if (src) copy(src.textContent.trim(), cb, cb.getAttribute('data-copy-label')); }
  });

  /* ---------- market ---------- */
  var cfgEl = $('#market-cfg'), host = $('#mkt');
  if (cfgEl && host) market(JSON.parse(cfgEl.textContent));

  function market(cfg) {
    var rowsEl = $('.rows', host), trackEl = $('.ticker-track'), errEl = $('.mkt-err', host);
    var statusEls = $$('[data-mkt-status]'), tabs = $$('.tab', host);
    var store = null, mode = 'vol', fails = 0, timer = 0, busy = false, ctrl = null, netId = null, firstPaint = true;
    var cells = {};   // token id -> { el, px, chg, vol, vals }

    var fmtUsd = function (n) {
      if (n == null || !isFinite(n)) return '—';
      var a = Math.abs(n);
      if (a >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: a >= 1000 ? 0 : 2 });
      if (a === 0) return '$0.00';
      var d = Math.min(12, Math.max(4, 2 - Math.floor(Math.log10(a)) + 1));
      return '$' + n.toFixed(d);
    };
    var fmtVol = function (n) {
      if (n == null || !isFinite(n)) return '—';
      if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
      if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
      return '$' + n.toFixed(0);
    };
    var fmtChg = function (n) { return n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; };

    function setStatus(state, text) {
      statusEls.forEach(function (el) { el.setAttribute('data-state', state); var t = $('[data-mkt-text]', el); if (t) t.textContent = text; });
    }
    function setErr(msg) { errEl.textContent = msg || ''; errEl.classList.toggle('show', !!msg); }

    function urlFor(net) { return net ? cfg.url.replace(/\/networks\/[^/]+\//, '/networks/' + encodeURIComponent(net) + '/') : cfg.url; }
    function get(u) {
      ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 12000);
      return fetch(u, { headers: { accept: 'application/json' }, signal: ctrl.signal }).then(function (r) {
        clearTimeout(to);
        if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
        return r.json();
      }, function (e) { clearTimeout(to); throw e; });
    }
    function load() {
      var first = netId === null ? get(urlFor(null)) : get(urlFor(netId));
      return first.catch(function (e) {
        // a 404 from this host can arrive without CORS headers, so the browser reports a bare network error: any failure on the stated network tries the fallback once
        if (netId === null && cfg.fallbackNetwork && e.name !== 'AbortError') {
          return get(urlFor(cfg.fallbackNetwork)).then(function (j) { netId = cfg.fallbackNetwork; return j; });
        }
        throw e;
      });
    }

    function parse(j) {
      var tokens = {};
      (j.included || []).forEach(function (o) { if (o && o.type === 'token') tokens[o.id] = o.attributes || {}; });
      var best = {};
      (j.data || []).forEach(function (p) {
        var a = p.attributes || {}, rel = p.relationships || {};
        var bid = rel.base_token && rel.base_token.data && rel.base_token.data.id;
        var t = tokens[bid]; if (!t) return;
        var vol = parseFloat(a.volume_usd && a.volume_usd.h24), chg = parseFloat(a.price_change_percentage && a.price_change_percentage.h24);
        var rec = {
          id: bid, symbol: String(t.symbol || '?'), name: String(t.name || ''), price: parseFloat(t.price_usd != null ? t.price_usd : a.base_token_price_usd),  // token object omits price on this network; pool carries it
          img: t.image_url && !/missing/i.test(t.image_url) ? t.image_url : null,
          chg: isFinite(chg) ? chg : null, vol: isFinite(vol) ? vol : 0
        };
        if (!best[bid] || rec.vol > best[bid].vol) best[bid] = rec;
      });
      var list = Object.keys(best).map(function (k) { return best[k]; });
      list.sort(function (a, b) { return b.vol - a.vol; });
      return list.slice(0, 10);
    }

    /* token tile: logo with letter fallback */
    function tile(rec) {
      var s = doc.createElement('span'); s.className = 'tt'; s.textContent = rec.symbol.charAt(0).toUpperCase();
      if (rec.img) {
        var im = new Image(); im.alt = ''; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
        im.onload = function () { im.classList.add('ok'); }; im.onerror = function () { im.remove(); };
        im.src = rec.img; s.appendChild(im);
      }
      return s;
    }
    function tween(el, from, to, fmt) {
      if (reduce.matches || from === to) { el.textContent = fmt(to); return; }
      var f = from == null || !isFinite(from) ? 0 : from;
      new Spring(0, 1, { k: 120, c: 24, on: function (p) { var q = Math.min(1, Math.max(0, p)); el.textContent = fmt(f + (to - f) * q); }, done: function () { el.textContent = fmt(to); } });
    }
    function flash(el, dir) {
      el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(dir > 0 ? 'flash-up' : 'flash-dn');
    }
    function setCell(c, key, to, fmt, el, animateFrom) {
      var prev = c.vals[key];
      c.vals[key] = to;
      if (prev === undefined) { tween(el, animateFrom, to, fmt); return; }
      if (prev !== to) { tween(el, prev, to, fmt); if (isFinite(prev) && isFinite(to)) flash(c.row, to > prev ? 1 : -1); }
    }
    function makeRow(rec, i) {
      var row = doc.createElement('div'); row.className = 'row in'; row.setAttribute('data-spot', '');
      var n = doc.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
      var who = doc.createElement('div'); who.className = 'who';
      var nm = doc.createElement('span'); nm.innerHTML = '<b></b><small></small>';
      who.appendChild(tile(rec)); who.appendChild(nm);
      var pxe = doc.createElement('span'); pxe.className = 'num px';
      var chg = doc.createElement('span'); chg.className = 'num chg';
      var vol = doc.createElement('span'); vol.className = 'num vol';
      var cp = doc.createElement('button'); cp.type = 'button'; cp.className = 'cp'; cp.setAttribute('data-copy', rec.symbol); cp.setAttribute('data-copy-label', rec.symbol);
      cp.setAttribute('aria-label', 'Copy symbol ' + rec.symbol);
      cp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
      [n, who, pxe, chg, vol, cp].forEach(function (x) { row.appendChild(x); });
      return { row: row, n: n, nameB: $('b', nm), nameS: $('small', nm), px: pxe, chg: chg, vol: vol, cp: cp, who: who, vals: {} };
    }
    function paintRows(list) {
      var order = list.slice();
      if (mode === 'chg') order.sort(function (a, b) { return (b.chg == null ? -1e9 : b.chg) - (a.chg == null ? -1e9 : a.chg); });
      var seen = {};
      var fresh = [];
      order.forEach(function (rec, i) {
        seen[rec.id] = 1;
        var c = cells[rec.id];
        if (!c) { c = cells[rec.id] = makeRow(rec, i); fresh.push(c); }
        c.n.textContent = String(i + 1);
        c.nameB.textContent = rec.symbol; c.nameS.textContent = rec.name;
        c.cp.setAttribute('data-copy', rec.symbol);
        setCell(c, 'px', rec.price, fmtUsd, c.px, 0);
        setCell(c, 'vol', rec.vol, fmtVol, c.vol, 0);
        var prevChg = c.vals.chg; c.vals.chg = rec.chg;
        c.chg.className = 'num chg ' + (rec.chg == null ? '' : rec.chg >= 0 ? 'up' : 'dn');
        if (prevChg === undefined) tween(c.chg, 0, rec.chg, function (v) { return fmtChgAbs(v, rec.chg); });
        else {
          c.chg.textContent = fmtChgAbs(rec.chg, rec.chg);
          if (prevChg !== rec.chg && isFinite(prevChg) && isFinite(rec.chg)) flash(c.row, rec.chg > prevChg ? 1 : -1);
        }
        rowsEl.appendChild(c.row);
      });
      Object.keys(cells).forEach(function (k) { if (!seen[k]) { cells[k].row.remove(); delete cells[k]; } });
      fresh.forEach(function (c, i) { setTimeout(function () { c.row.classList.add('go'); }, reduce.matches ? 0 : 60 + i * 55); });
    }
    function fmtChgAbs(v, target) { return target == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'; }

    function paintTicker(list) {
      var frag = doc.createDocumentFragment();
      for (var pass = 0; pass < 2; pass++) {
        list.forEach(function (rec) {
          var t = doc.createElement('span'); t.className = 'tick'; if (pass) t.setAttribute('aria-hidden', 'true');
          t.appendChild(tile(rec));
          var s = doc.createElement('span'); s.className = 'sym'; s.textContent = rec.symbol;
          var p = doc.createElement('span'); p.className = 'px'; p.textContent = fmtUsd(rec.price);
          var c = doc.createElement('span'); c.className = 'chg ' + (rec.chg == null ? '' : rec.chg >= 0 ? 'up' : 'dn'); c.textContent = fmtChg(rec.chg);
          t.appendChild(s); t.appendChild(p); t.appendChild(c); frag.appendChild(t);
        });
      }
      trackEl.textContent = ''; trackEl.appendChild(frag);
    }

    function clearPlaceholders() { $$('[data-ph]', host).forEach(function (n) { n.remove(); }); }
    function dashRows() {
      clearPlaceholders();
      for (var i = 0; i < 10; i++) {
        var r = doc.createElement('div'); r.className = 'row'; r.setAttribute('data-ph', '');
        r.innerHTML = '<span class="n">' + (i + 1) + '</span><div class="who"><span class="tt">—</span><span><b>—</b></span></div><span class="num px">—</span><span class="num chg">—</span><span class="num vol">—</span><span></span>';
        rowsEl.appendChild(r);
      }
      trackEl.innerHTML = '<span class="tick"><span class="sym">—</span><span class="px">no feed</span></span>';
    }

    function ok(j) {
      var list = parse(j);
      if (!list.length) throw new Error('empty');
      store = list; fails = 0;
      if (firstPaint) { clearPlaceholders(); firstPaint = false; }
      paintRows(list); paintTicker(list);
      setErr(''); setStatus('live', 'Live');
    }
    function bad(e) {
      if (e && e.name === 'AbortError' && doc.hidden) return;
      fails++;
      if (store) { setErr('Refresh failed. Showing the last good data and retrying.'); setStatus('retry', 'Retrying'); }
      else { setErr('The market feed could not be reached (' + (e && e.message ? e.message : 'network') + '). Retrying with backoff.'); setStatus('off', 'Offline'); if (firstPaint) { dashRows(); } }
    }
    function nextDelay() { return fails ? Math.min(60000, 3000 * Math.pow(2, fails - 1)) * (0.85 + Math.random() * 0.3) : cfg.pollMs; }
    function cycle() {
      clearTimeout(timer);
      if (doc.hidden || busy) return;
      busy = true;
      if (!store) setStatus('retry', fails ? 'Retrying' : 'Connecting');
      load().then(ok, bad).then(function () { busy = false; if (!doc.hidden) timer = setTimeout(cycle, nextDelay()); });
    }
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { clearTimeout(timer); if (ctrl) ctrl.abort(); }
      else cycle();
    });
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        mode = t.getAttribute('data-mode');
        tabs.forEach(function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
        if (store) paintRows(store);
      });
    });
    cycle();
  }
})();
