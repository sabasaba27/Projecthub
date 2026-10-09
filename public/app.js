// ClassMarket front end: a small hash-routed single page app.
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const app = $('#app');
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
let me = null;

// ---------- utilities ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pct = (p) => (p < 0.005 ? '<1' : p > 0.995 ? '>99' : Math.round(p * 100)) + '%';
const cents = (p) => (p * 100).toFixed(1).replace(/\.0$/, '') + '¢';
const pts = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 });
const date = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
function ago(d) {
  const s = (Date.now() - new Date(d.replace(' ', 'T') + 'Z')) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
const thumb = (src, cls = '') => (src ? `<img class="thumb ${cls}" src="${esc(src)}" alt="">` : `<div class="thumb ${cls}">📊</div>`);
const avatar = (u, cls = '') => (u?.avatar
  ? `<img class="avatar ${cls}" src="${esc(u.avatar)}" alt="">`
  : `<div class="avatar ${cls}">${esc((u?.name || u?.username || '?')[0].toUpperCase())}</div>`);

async function api(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'fetch' } };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// In-page yes/no dialog, since some embedded views block the browser's own confirm box.
function ask(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p>${esc(message)}</p>
      <div class="modal-actions"><button class="btn" data-a="0">Cancel</button><button class="btn primary" data-a="1">${esc(okLabel)}</button></div></div>`;
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b && e.target !== wrap) return;
      wrap.remove();
      resolve(b?.dataset.a === '1');
    };
    document.body.appendChild(wrap);
    $('[data-a="1"]', wrap).focus();
  });
}

function renderNav() {
  $('#nav').innerHTML = me
    ? `${me.isAdmin ? '<a class="btn sm" href="#/admin">Admin</a>' : ''}
       ${me.isAdmin ? '' : `<a class="balance-pill" href="#/profile"><small>Points</small><b>${pts(me.points)}</b></a>`}
       <a href="#/profile" title="Your profile">${avatar(me)}</a>`
    : `<a class="btn ghost" href="#/login">Log in</a><a class="btn primary" href="#/signup">Sign up</a>`;
}

// ---------- router ----------

const routes = [
  [/^#?\/?$/, home],
  [/^#\/market\/(\d+)/, market],
  [/^#\/login/, login],
  [/^#\/signup/, signup],
  [/^#\/profile/, profile],
  [/^#\/admin/, admin],
];

async function route() {
  const hash = location.hash || '#/';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  for (const [re, view] of routes) {
    const m = path.match(re);
    if (m) {
      window.scrollTo(0, 0);
      app.onclick = null;
      try { await view(m[1], params); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      return;
    }
  }
  app.innerHTML = '<div class="empty">Page not found</div>';
}

$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  location.hash = '#/' + (q ? '?q=' + encodeURIComponent(q) : '');
});
window.addEventListener('hashchange', route);

// ---------- home ----------

function gauge(p) {
  const r = 26, len = Math.PI * r;
  const color = p >= 0.5 ? 'var(--green)' : 'var(--red)';
  return `<div class="gauge">
    <svg viewBox="0 0 62 38"><path d="M5 33 A26 26 0 0 1 57 33" fill="none" stroke="var(--border)" stroke-width="5" stroke-linecap="round"/>
    <path d="M5 33 A26 26 0 0 1 57 33" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${len * p} ${len}"/></svg>
    <b>${pct(p)}</b><small>chance</small></div>`;
}

function statusTag(m) {
  if (m.status === 'resolved') {
    const w = m.outcomes.find((o) => o.id === m.resolvedOutcomeId);
    return `<span class="resolved-tag">✓ ${esc(w?.label || 'Resolved')}</span>`;
  }
  return m.closed ? '<span class="closed-tag">Closed</span>' : '';
}

function card(m) {
  const binary = m.outcomes.length === 2 && m.outcomes[0].label === 'Yes' && m.outcomes[1].label === 'No';
  const link = `#/market/${m.id}`;
  let body;
  if (binary) {
    body = m.closed
      ? statusTag(m)
      : `<div class="yn">
          <a class="btn yes" href="${link}?o=${m.outcomes[0].id}">Yes ↑</a>
          <a class="btn no" href="${link}?o=${m.outcomes[1].id}">No ↓</a>
        </div>`;
  } else {
    const top = [...m.outcomes].sort((a, b) => b.price - a.price).slice(0, 3);
    body = top.map((o) => `
      <div class="card-row">
        ${o.image ? thumb(o.image, 'xs') : ''}
        <span class="label">${esc(o.label)}</span>
        <span class="pct">${pct(o.price)}</span>
        ${m.closed ? '' : `<a class="chip-yes" href="${link}?o=${o.id}">Vote</a>`}
      </div>`).join('') + (m.closed ? statusTag(m) : '');
  }
  return `<div class="card">
    <a class="card-head" href="${link}">
      ${thumb(m.image)}
      <div class="card-title">${esc(m.title)}</div>
      ${binary ? gauge(m.outcomes[0].price) : ''}
    </a>
    <div class="card-body">${body}</div>
    <div class="card-foot"><span>${pts(m.volume)} pts Vol.</span><span>${m.endDate ? 'Ends ' + date(m.endDate) : m.voters + (m.voters === 1 ? ' voter' : ' voters')}</span></div>
  </div>`;
}

async function home(_, params) {
  const q = params.get('q') || '';
  const category = params.get('c') || 'All';
  $('#search').q.value = q;
  const { markets, categories } = await api('GET', `/api/markets?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
  const pill = (c) => `<a class="pill ${c === category ? 'active' : ''}" href="#/?c=${encodeURIComponent(c)}">${esc(c)}</a>`;
  app.innerHTML = `
    <div class="pills">${['All', ...categories].map(pill).join('')}</div>
    ${q ? `<p class="muted">Results for “${esc(q)}”</p>` : ''}
    ${markets.length
      ? `<div class="grid">${markets.map(card).join('')}</div>`
      : `<div class="empty">No markets yet.${me?.isAdmin ? ' <a class="btn ghost" href="#/admin">Create one</a>' : ''}</div>`}`;
}

// ---------- market page ----------

function chart(m) {
  const W = 760, H = 260, pad = { l: 8, r: 40, t: 10, b: 24 };
  const hist = m.history.length ? m.history : [{ ts: Date.now(), prices: m.outcomes.map((o) => o.price) }];
  const pointsList = [...hist, { ts: Date.now(), prices: m.outcomes.map((o) => o.price) }];
  const t0 = pointsList[0].ts, t1 = Math.max(pointsList.at(-1).ts, t0 + 1);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (p) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => `
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(p)}" y2="${y(p)}" stroke="var(--border)" stroke-dasharray="${p % 1 ? '3 4' : ''}"/>
    <text x="${W - pad.r + 6}" y="${y(p) + 4}">${p * 100}%</text>`).join('');
  const show = binaryOf(m) ? [0] : m.outcomes.map((_, i) => i).slice(0, 6);
  const lines = show.map((i) => {
    let d = '';
    pointsList.forEach((h, k) => {
      const px = x(h.ts), py = y(h.prices[i] ?? 0);
      d += k === 0 ? `M${px},${py}` : `H${px}V${py}`; // step line like Polymarket
    });
    return `<path d="${d}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="2.2" stroke-linejoin="round"/>
            <circle cx="${x(t1)}" cy="${y(pointsList.at(-1).prices[i])}" r="4" fill="${COLORS[i % COLORS.length]}"/>`;
  }).join('');
  const labels = [t0, (t0 + t1) / 2, t1].map((t, k) => `<text x="${x(t)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][k]}">${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${lines}${labels}</svg>`;
}

const binaryOf = (m) => m.outcomes.length === 2 && m.outcomes[0].label === 'Yes' && m.outcomes[1].label === 'No';

async function market(id, params) {
  const { market: m } = await api('GET', `/api/markets/${id}`);
  const binary = binaryOf(m);
  const held = (oid) => m.myPositions?.find((p) => p.outcomeId === oid)?.shares || 0;
  const state = {
    side: 'buy',
    outcomeId: Number(params.get('o')) || m.outcomes[0].id,
    amount: '',
  };
  if (!m.outcomes.some((o) => o.id === state.outcomeId)) state.outcomeId = m.outcomes[0].id;

  const legend = binary ? '' : `<div class="legend">${m.outcomes.slice(0, 6).map((o, i) => `<span><i style="background:${COLORS[i]}"></i>${esc(o.label)} ${pct(o.price)}</span>`).join('')}</div>`;

  const outcomeRows = binary ? '' : `<div class="outcome-table">${m.outcomes.map((o) => `
    <div class="outcome-row" data-row="${o.id}">
      <div class="outcome-name">${o.image ? thumb(o.image) : ''}<span>${esc(o.label)}</span>${m.resolvedOutcomeId === o.id ? '<span class="resolved-tag">✓ Winner</span>' : ''}</div>
      <div class="outcome-pct">${pct(o.price)}</div>
      <div class="yn" style="grid-template-columns:1fr">
        <button class="btn yes" data-pick="${o.id}" ${m.closed ? 'disabled' : ''}>Buy ${cents(o.price)}</button>
      </div>
    </div>`).join('')}</div>`;

  app.innerHTML = `
    <div class="market-layout">
      <div>
        <div class="market-head">
          ${thumb(m.image, 'lg')}
          <div>
            <h1>${esc(m.title)}</h1>
            <div class="market-meta">
              <span>${pts(m.volume)} pts Vol.</span><span>${m.voters} ${m.voters === 1 ? 'voter' : 'voters'}</span>
              ${m.endDate ? `<span>📅 ${date(m.endDate)}</span>` : ''}<span>${esc(m.category)}</span> ${statusTag(m)}
            </div>
          </div>
        </div>
        ${binary ? `<div><span class="big-chance">${pct(m.outcomes[0].price)} chance</span></div>` : legend}
        ${chart(m)}
        ${outcomeRows}
        ${m.description ? `<div class="section-title">Rules</div><div class="rules">${esc(m.description)}</div>` : ''}
        <div class="section-title">Activity</div>
        <div class="activity">${m.recent.length ? m.recent.map((t) => `
          <div class="activity-row">${avatar(t, 'sm')}<b>${esc(t.username)}</b>
            <span class="${t.side === 'buy' ? 'side-buy' : 'side-sell'}">${t.side === 'buy' ? 'bought' : 'sold'}</span>
            ${pts(t.shares)} ${esc(t.label)} for ${pts(t.points)} pts<span class="when">${ago(t.created_at)}</span></div>`).join('')
          : '<p class="muted">No votes yet. Be the first!</p>'}</div>
      </div>
      <aside class="ticket" id="ticket"></aside>
    </div>`;

  const ticket = $('#ticket');
  function renderTicket() {
    const o = m.outcomes.find((x) => x.id === state.outcomeId);
    const i = m.outcomes.indexOf(o);
    $$('.outcome-row').forEach((r) => r.classList.toggle('selected', Number(r.dataset.row) === o.id));
    if (m.closed) {
      ticket.innerHTML = `<h3>Voting closed</h3><p class="muted">${m.status === 'resolved' ? 'This market has been resolved.' : 'This market has ended.'}</p>${statusTag(m)}`;
      return;
    }
    const pickers = binary
      ? `<div class="yn" style="margin-bottom:14px">${m.outcomes.map((x) => `
          <button class="btn ${x.label === 'Yes' ? 'yes' : 'no'} ${x.id === o.id ? 'on' : ''}" data-pick="${x.id}">${esc(x.label)} ${cents(x.price)}</button>`).join('')}</div>`
      : `<div class="ticket-outcome">${o.image ? thumb(o.image, 'xs') : ''}${esc(o.label)} <span class="muted" style="margin-left:auto">${cents(o.price)}</span></div>`;
    const myShares = held(o.id);
    const value = Number(state.amount) || 0;
    let quoteHtml = '';
    if (value > 0) {
      const max = state.side === 'buy' ? (me?.points ?? Infinity) : myShares;
      if (value > max + 1e-9) {
        quoteHtml = `<div class="error">${state.side === 'buy' ? 'Not enough points' : 'You only have ' + pts(myShares) + ' shares'}</div>`;
      } else {
        const q = LMSR.quote(m.outcomes.map((x) => x.shares), m.liquidity, i, state.side, value);
        quoteHtml = state.side === 'buy'
          ? `<div class="quote"><span>Avg price</span><span>${cents(q.avgPrice)}</span>
              <span>Shares</span><span>${pts(q.shares)}</span>
              <span>New odds</span><span>${pct(q.priceBefore)} → ${pct(q.priceAfter)}</span>
              <span>To win 🏆</span><span class="win">${pts(q.payout)} pts</span></div>`
          : `<div class="quote"><span>Avg price</span><span>${cents(q.avgPrice)}</span>
              <span>New odds</span><span>${pct(q.priceBefore)} → ${pct(q.priceAfter)}</span>
              <span>You receive</span><span class="win">${pts(q.points)} pts</span></div>`;
      }
    }
    ticket.innerHTML = `
      <div class="ticket-tabs">
        <button data-side="buy" class="${state.side === 'buy' ? 'on' : ''}">Buy</button>
        <button data-side="sell" class="${state.side === 'sell' ? 'on' : ''}">Sell</button>
      </div>
      ${pickers}
      <div class="row" style="align-items:center"><b>${state.side === 'buy' ? 'Points' : 'Shares'}</b>
        <span class="muted" style="text-align:right;font-size:13px">${state.side === 'buy' ? (me ? 'Balance ' + pts(me.points) : '') : 'You own ' + pts(myShares)}</span></div>
      <div class="amount"><input id="amt" inputmode="decimal" placeholder="0" value="${esc(state.amount)}"></div>
      <div class="quick">${(state.side === 'buy' ? [10, 50, 100] : [0.25, 0.5]).map((v) => `<button class="btn sm" data-quick="${v}">${state.side === 'buy' ? '+' + v : v * 100 + '%'}</button>`).join('')}
        <button class="btn sm" data-quick="max">Max</button></div>
      ${quoteHtml}
      ${me ? `<button class="btn primary block" id="go" ${value > 0 ? '' : 'disabled'}>${state.side === 'buy' ? 'Vote ' + esc(o.label) : 'Sell ' + esc(o.label)}</button>`
           : `<a class="btn primary block" style="display:block;text-align:center" href="#/login?next=${encodeURIComponent(location.hash)}">Log in to vote</a>`}
      <p class="muted" style="font-size:12px;margin:10px 0 0">Free to play. Odds move as people vote. A winning share pays 1 point.</p>`;
    const input = $('#amt');
    input.addEventListener('input', () => {
      state.amount = input.value.replace(/[^0-9.]/g, '');
      const pos = input.selectionStart;
      renderTicket();
      const again = $('#amt');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
  }

  app.onclick = onClick;
  async function onClick(e) {
    if (!/^#\/market\/(\d+)/.test(location.hash) || location.hash.match(/^#\/market\/(\d+)/)[1] !== id) return (app.onclick = null);
    const pick = e.target.closest('[data-pick]');
    const side = e.target.closest('[data-side]');
    const quick = e.target.closest('[data-quick]');
    if (pick) { state.outcomeId = Number(pick.dataset.pick); renderTicket(); if (innerWidth < 960) ticket.scrollIntoView({ behavior: 'smooth' }); }
    if (side) { state.side = side.dataset.side; state.amount = ''; renderTicket(); }
    if (quick) {
      const v = quick.dataset.quick;
      const myShares = held(state.outcomeId);
      if (state.side === 'buy') state.amount = String(v === 'max' ? Math.floor((me?.points || 0) * 100) / 100 : (Number(state.amount) || 0) + Number(v));
      else state.amount = String(Math.floor(myShares * (v === 'max' ? 1 : Number(v)) * 1e4) / 1e4);
      renderTicket();
    }
    if (e.target.id === 'go') {
      e.target.disabled = true;
      try {
        const r = await api('POST', `/api/markets/${id}/trade`, { outcomeId: state.outcomeId, side: state.side, amount: Number(state.amount) });
        me = r.user;
        renderNav();
        toast(state.side === 'buy' ? `Voted! You got ${pts(r.trade.shares)} shares` : `Sold for ${pts(r.trade.points)} pts`);
        market(id, new URLSearchParams('o=' + state.outcomeId));
      } catch (err) { toast(err.message); e.target.disabled = false; }
    }
  }
  renderTicket();
}

// ---------- auth ----------

function afterLogin(params) {
  renderNav();
  location.hash = params.get('next') || '#/';
}

async function login(_, params) {
  if (me) return (location.hash = '#/profile');
  app.innerHTML = `
    <form class="auth" id="f">
      <h1>Welcome back</h1><p class="muted">Log in to vote on markets.</p>
      <div class="field"><label>Email or username</label><input class="input" name="email" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="current-password" required></div>
      <div class="error" id="err"></div>
      <button class="btn primary block">Log in</button>
      <p class="muted" style="margin:16px 0 0;text-align:center">New here? <a class="btn ghost sm" href="#/signup">Create an account</a></p>
    </form>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      me = (await api('POST', '/api/login', { email: e.target.email.value, password: e.target.password.value })).user;
      afterLogin(params);
    } catch (err) { $('#err').textContent = err.message; }
  });
}

async function signup(_, params) {
  if (me) return (location.hash = '#/profile');
  app.innerHTML = `
    <form class="auth" id="f">
      <h1>Create your account</h1><p class="muted">It's free. You start with 1,000 points to vote with.</p>
      <div class="field avatar-pick"><img class="avatar lg" id="pv" hidden alt=""><div class="avatar lg" id="pv0">🙂</div>
        <label class="btn sm file-btn">Add photo<input type="file" name="avatar" accept="image/*"></label></div>
      <div class="field"><label>Full name</label><input class="input" name="name" autocomplete="name" required maxlength="80"></div>
      <div class="field"><label>Username</label><input class="input" name="username" autocomplete="username" required maxlength="30" pattern="[A-Za-z0-9_.]{3,30}">
        <small>3–30 letters, numbers, _ or .</small></div>
      <div class="field"><label>Email</label><input class="input" type="email" name="email" autocomplete="email" required></div>
      <div class="field"><label>Date of birth <span style="font-weight:400">(optional)</span></label><input class="input" type="date" name="birthdate"></div>
      <div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required>
        <small>At least 8 characters</small></div>
      <div class="error" id="err"></div>
      <button class="btn primary block">Sign up</button>
      <p class="muted" style="margin:16px 0 0;text-align:center">Have an account? <a class="btn ghost sm" href="#/login">Log in</a></p>
    </form>`;
  const file = $('input[type=file]');
  file.addEventListener('change', () => {
    if (!file.files[0]) return;
    $('#pv').src = URL.createObjectURL(file.files[0]);
    $('#pv').hidden = false;
    $('#pv0').hidden = true;
  });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button.primary', e.target);
    btn.disabled = true;
    try {
      me = (await api('POST', '/api/signup', new FormData(e.target))).user;
      toast('Welcome! You have 1,000 points');
      afterLogin(params);
    } catch (err) { $('#err').textContent = err.message; btn.disabled = false; }
  });
}

// ---------- profile (private to the logged-in user) ----------

async function profile(_, params) {
  if (!me) return (location.hash = '#/login?next=' + encodeURIComponent('#/profile'));
  const { positions, history } = await api('GET', '/api/me/votes');
  const tab = params.get('tab') || 'positions';
  const value = positions.filter((p) => p.market.status === 'open').reduce((s, p) => s + p.value, 0);
  const posRows = positions.map((p) => {
    const won = p.market.status === 'resolved' && p.market.resolvedOutcomeId === p.outcome.id;
    const lost = p.market.status === 'resolved' && !won;
    return `<a class="list-row" href="#/market/${p.market.id}">
      ${thumb(p.market.image)}
      <div class="grow"><div class="title">${esc(p.market.title)}</div>
        <div class="muted" style="font-size:13px"><b style="color:var(--text)">${esc(p.outcome.label)}</b> · ${pts(p.shares)} shares · now ${cents(p.outcome.price)}</div></div>
      <div class="right">${won ? `<span class="resolved-tag">Won ${pts(p.shares)}</span>` : lost ? '<span class="closed-tag">Lost</span>'
        : `<b>${pts(p.value)} pts</b><div class="muted" style="font-size:12px">spent ${pts(p.netSpent)}</div>`}</div></a>`;
  }).join('');
  const histRows = history.map((t) => `
    <a class="list-row" href="#/market/${t.market_id}">${thumb(t.image, 'xs')}
      <div class="grow"><div class="title">${esc(t.title)}</div>
        <div class="muted" style="font-size:13px"><span class="${t.side === 'buy' ? 'side-buy' : 'side-sell'}">${t.side === 'buy' ? 'Bought' : 'Sold'}</span> ${pts(t.shares)} ${esc(t.label)} at ${cents(t.points / t.shares)}</div></div>
      <div class="right"><b>${t.side === 'buy' ? '-' : '+'}${pts(t.points)}</b><div class="muted" style="font-size:12px">${ago(t.created_at)}</div></div></a>`).join('');

  app.innerHTML = `
    <div class="profile-head">
      <label class="file-btn" title="Change photo" style="cursor:pointer">${avatar(me, 'lg')}<input type="file" id="av" accept="image/*"></label>
      <div><h1>${esc(me.name)}</h1><div class="muted">@${esc(me.username)} · joined ${date(me.createdAt)}</div></div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span class="private-note">🔒 Only you can see your votes</span>
        <button class="btn" id="logout">Log out</button></div>
    </div>
    <div class="stats">
      <div class="stat"><small>Points</small><b>${pts(me.points)}</b></div>
      <div class="stat"><small>Positions value</small><b>${pts(value)}</b></div>
      <div class="stat"><small>Total</small><b>${pts(me.points + value)}</b></div>
      <div class="stat"><small>Votes</small><b>${history.length}</b></div>
    </div>
    <div class="tabs">
      <button class="${tab === 'positions' ? 'on' : ''}" onclick="location.hash='#/profile?tab=positions'">Positions</button>
      <button class="${tab === 'history' ? 'on' : ''}" onclick="location.hash='#/profile?tab=history'">History</button>
    </div>
    ${tab === 'positions' ? posRows || '<div class="empty">No votes yet. <a class="btn ghost" href="#/">Browse markets</a></div>'
                          : histRows || '<div class="empty">No history yet.</div>'}`;

  $('#logout').onclick = async () => { await api('POST', '/api/logout'); me = null; renderNav(); location.hash = '#/'; };
  $('#av').onchange = async (e) => {
    const fd = new FormData();
    fd.append('avatar', e.target.files[0]);
    try { me = (await api('POST', '/api/me/avatar', fd)).user; renderNav(); profile(_, params); } catch (err) { toast(err.message); }
  };
}

// ---------- admin ----------

async function admin(_, params) {
  if (!me?.isAdmin) { app.innerHTML = '<div class="empty">Admins only.</div>'; return; }
  const tab = params.get('tab') || 'markets';
  const [{ markets }, { trades }, { users }] = await Promise.all([
    api('GET', '/api/markets'), api('GET', '/api/admin/trades'), api('GET', '/api/admin/users'),
  ]);

  const marketRows = markets.map((m) => `
    <div class="list-row" style="align-items:flex-start">
      ${thumb(m.image)}
      <div class="grow"><a class="title" href="#/market/${m.id}" style="display:block">${esc(m.title)}</a>
        <div class="muted" style="font-size:13px">${esc(m.category)} · ${pts(m.volume)} pts · ${m.voters} voters · ${m.outcomes.map((o) => esc(o.label) + ' ' + pct(o.price)).join(', ')}</div>
        ${m.status === 'open' ? `<div class="resolve-box">
          <select class="input" style="padding:5px 8px;max-width:200px" data-resolve-select="${m.id}">
            <option value="">Resolve as…</option>${m.outcomes.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}</select>
          <button class="btn sm" data-resolve="${m.id}">Resolve</button></div>` : statusTag(m)}
      </div>
      <div class="admin-actions"><button class="btn danger sm" data-del-market="${m.id}">Delete</button></div>
    </div>`).join('');
  const tradeRows = trades.map((t) => `
    <div class="list-row">${avatar(t, 'sm')}
      <div class="grow"><div class="title">${esc(t.username)} <span class="${t.side === 'buy' ? 'side-buy' : 'side-sell'}">${t.side === 'buy' ? 'bought' : 'sold'}</span> ${pts(t.shares)} ${esc(t.label)}</div>
        <div class="muted" style="font-size:13px">${esc(t.title)} · ${pts(t.points)} pts · ${ago(t.created_at)}</div></div>
      <button class="btn danger sm" data-del-trade="${t.id}">Delete</button></div>`).join('');
  const userRows = users.map((u) => `
    <div class="list-row">${avatar(u)}
      <div class="grow"><div class="title">${esc(u.name)} <span class="muted">@${esc(u.username)}</span> ${u.isAdmin ? '<span class="resolved-tag">Admin</span>' : ''}</div>
        <div class="muted" style="font-size:13px">${esc(u.email)}${u.birthdate ? ' · born ' + date(u.birthdate) : ''} · ${pts(u.points)} pts · ${u.votes} votes</div></div>
      ${u.isAdmin ? '' : `<button class="btn danger sm" data-del-user="${u.id}">Delete</button>`}</div>`).join('');

  app.innerHTML = `
    <h1 style="margin-bottom:18px">Admin</h1>
    <div class="admin-grid">
      <form class="panel" id="create">
        <h2>New market</h2>
        <div class="seg"><button type="button" class="on" data-type="binary">Yes / No</button><button type="button" data-type="multi">Multiple options</button></div>
        <input type="hidden" name="type" value="binary">
        <div class="field"><label>Question</label><input class="input" name="title" required maxlength="200" placeholder="Will it snow before winter break?"></div>
        <div class="field avatar-pick"><img class="preview" id="imgpv" hidden alt=""><div class="preview" id="imgpv0"></div>
          <label class="btn sm file-btn">Upload picture<input type="file" name="image" accept="image/*"></label></div>
        <div class="field"><label>Description / rules</label><textarea class="input" name="description" maxlength="5000" placeholder="How this market resolves…"></textarea></div>
        <div class="row">
          <div class="field"><label>Category</label><input class="input" name="category" maxlength="50" placeholder="School" list="cats">
            <datalist id="cats">${[...new Set(markets.map((m) => m.category))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label>End date</label><input class="input" type="date" name="endDate"></div>
        </div>
        <div class="field"><label>Liquidity</label><input class="input" type="number" name="liquidity" value="100" min="10" max="100000">
          <small>Higher = odds move slower when people vote.</small></div>
        <div id="opts" hidden>
          <label class="muted" style="font-size:13px;font-weight:600">Options</label>
          <div id="optlist"></div>
          <button type="button" class="btn sm" id="addopt" style="margin-bottom:14px">+ Add option</button>
        </div>
        <div class="error" id="err"></div>
        <button class="btn primary block">Create market</button>
      </form>
      <div class="panel">
        <div class="tabs">
          <button class="${tab === 'markets' ? 'on' : ''}" onclick="location.hash='#/admin?tab=markets'">Markets (${markets.length})</button>
          <button class="${tab === 'votes' ? 'on' : ''}" onclick="location.hash='#/admin?tab=votes'">Votes (${trades.length})</button>
          <button class="${tab === 'users' ? 'on' : ''}" onclick="location.hash='#/admin?tab=users'">Users (${users.length})</button>
        </div>
        ${tab === 'markets' ? marketRows || '<div class="empty">No markets yet</div>'
          : tab === 'votes' ? tradeRows || '<div class="empty">No votes yet</div>'
          : userRows}
      </div>
    </div>`;

  const form = $('#create');
  let optCount = 0;
  function addOpt() {
    const i = optCount++;
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.innerHTML = `<img class="preview" hidden alt=""><input class="input" name="outcomes" maxlength="100" placeholder="Option ${i + 1}">
      <label class="btn sm file-btn" title="Picture">🖼<input type="file" name="outcomeImage${i}" accept="image/*"></label>
      <button type="button" class="btn sm" title="Remove">✕</button>`;
    const [img, , label, rm] = row.children;
    $('input', label).onchange = (e) => { img.src = URL.createObjectURL(e.target.files[0]); img.hidden = false; };
    rm.onclick = () => row.remove();
    $('#optlist').appendChild(row);
  }
  addOpt(); addOpt();
  $('#addopt').onclick = addOpt;
  $$('[data-type]', form).forEach((b) => (b.onclick = () => {
    $$('[data-type]', form).forEach((x) => x.classList.toggle('on', x === b));
    form.elements.type.value = b.dataset.type;
    $('#opts').hidden = b.dataset.type === 'binary';
  }));
  form.elements.image.onchange = (e) => { $('#imgpv').src = URL.createObjectURL(e.target.files[0]); $('#imgpv').hidden = false; $('#imgpv0').hidden = true; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button.primary', form);
    btn.disabled = true;
    try {
      await api('POST', '/api/admin/markets', new FormData(form));
      toast('Market created');
      location.hash = '#/admin?tab=markets&t=' + Date.now();
    } catch (err) { $('#err').textContent = err.message; btn.disabled = false; }
  };

  app.onclick = async (e) => {
    if (!location.hash.startsWith('#/admin')) return (app.onclick = null);
    const t = e.target;
    const reload = () => admin(_, params);
    try {
      if (t.dataset.delMarket && await ask('Delete this market and all its votes? Open markets refund voters.')) {
        await api('DELETE', '/api/admin/markets/' + t.dataset.delMarket); toast('Market deleted'); reload();
      } else if (t.dataset.delTrade && await ask('Delete this vote? The voter gets their points back.')) {
        await api('DELETE', '/api/admin/trades/' + t.dataset.delTrade); toast('Vote deleted'); reload();
      } else if (t.dataset.delUser && await ask('Delete this user and all their votes?')) {
        await api('DELETE', '/api/admin/users/' + t.dataset.delUser); toast('User deleted'); reload();
      } else if (t.dataset.resolve) {
        const outcomeId = $(`[data-resolve-select="${t.dataset.resolve}"]`).value;
        if (!outcomeId) return toast('Pick the winning option first');
        if (!(await ask('Resolve this market? Winners get paid and voting closes.', 'Resolve'))) return;
        await api('POST', `/api/admin/markets/${t.dataset.resolve}/resolve`, { outcomeId: Number(outcomeId) });
        toast('Market resolved'); reload();
      }
    } catch (err) { toast(err.message); }
  };
}

// ---------- start ----------

(async () => {
  try { me = (await api('GET', '/api/me')).user; } catch { me = null; }
  renderNav();
  route();
})();
