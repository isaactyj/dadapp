// ---- Theme ----
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('.icon-sun').classList.toggle('visible', theme === 'dark');
  document.querySelector('.icon-moon').classList.toggle('visible', theme === 'light');
};

const initTheme = () => {
  applyTheme(localStorage.getItem('theme') || 'dark');
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
};

// ---- Notifications ----
const requestNotifications = async () => {
  const btn = document.getElementById('notifyBtn');
  if (!('Notification' in window)) {
    btn.textContent = 'Not supported';
    btn.disabled = true;
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    btn.textContent = 'Alerts Enabled';
    btn.disabled = true;
    new Notification('Buy Zone Alerts Active', {
      body: 'You will be notified each time you run a scan and stocks are in the buy zone.',
    });
  } else {
    btn.textContent = 'Permission Denied';
    btn.disabled = true;
  }
};

const maybeSendBuyZoneNotification = (symbols) => {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !symbols.length) return;
  new Notification(`Buy Zone: ${symbols.join(', ')}`, {
    body: `${symbols.length} stock${symbols.length > 1 ? 's are' : ' is'} trading near the support floor.`,
  });
};

// ---- Helpers ----
const BUY_ZONE_PCT = 2;

const isBuyZone = (item) =>
  item.price != null && item.support_level != null &&
  item.price <= item.support_level * (1 + BUY_ZONE_PCT / 100);

const getVerdict = (rr) => {
  const v = Number(rr);
  if (isNaN(v) || rr == null) return { label: 'No Data', cls: 'risky' };
  if (v >= 2) return { label: `Good Setup  ${v.toFixed(1)}:1`, cls: 'good' };
  if (v >= 1) return { label: `OK Setup  ${v.toFixed(1)}:1`, cls: 'ok' };
  return { label: `Risky  ${v.toFixed(1)}:1`, cls: 'risky' };
};

const metricRow = (label, value, tip = null) => {
  if (tip) {
    return `
      <div class="metric-group">
        <div class="metric-row">
          <span>${label} <button class="info-btn" aria-label="What does this mean?">i</button></span>
          <strong>${value}</strong>
        </div>
        <div class="info-tip">${tip}</div>
      </div>`;
  }
  return `<div class="metric-row"><span>${label}</span><strong>${value}</strong></div>`;
};

const priceBarHtml = (price, support, target) => {
  if (!support || !target || target <= support) return '';
  const range = target - support;
  const pos = Math.min(100, Math.max(0, ((price - support) / range) * 100)).toFixed(1);
  const bzWidth = Math.min(18, (support * BUY_ZONE_PCT / 100 / range * 100)).toFixed(1);
  return `
    <div class="price-bar-wrap">
      <div class="price-bar-track">
        <div class="price-bar-bz" style="width:${bzWidth}%"></div>
        <div class="price-bar-fill" style="width:${pos}%"></div>
        <div class="price-bar-pin" style="left:${pos}%"></div>
      </div>
      <div class="price-bar-labels">
        <span class="mini">Floor $${formatNumber(support)}</span>
        <span class="mini" style="color:var(--muted);">&#9679;</span>
        <span class="mini">Target $${formatNumber(target)}</span>
      </div>
    </div>
  `;
};

const sortResults = (results) =>
  [...results].sort((a, b) => {
    const aZ = isBuyZone(a) ? 1 : 0;
    const bZ = isBuyZone(b) ? 1 : 0;
    if (bZ !== aZ) return bZ - aZ;
    return (b.reward_risk_ratio ?? -Infinity) - (a.reward_risk_ratio ?? -Infinity);
  });

const setButtonLoading = (id, loading, originalLabel) => {
  const btn = document.getElementById(id);
  if (loading) {
    btn.innerHTML = `<span class="spinner"></span>${originalLabel}`;
    btn.classList.add('loading');
  } else {
    btn.innerHTML = originalLabel;
    btn.classList.remove('loading');
  }
};

// ---- App state ----
const state = { presets: [], activeTab: 'levels' };

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return Number(value).toFixed(digits);
};

const splitSymbols = (raw) =>
  raw.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);

const uniqueSymbols = (symbols) => [...new Set(symbols)];

const presetById = (id) => state.presets.find((p) => p.id === id);

const mergePresetAndInput = (presetId, rawInput) => {
  const presetSymbols = presetById(presetId)?.symbols || [];
  return uniqueSymbols([...presetSymbols, ...splitSymbols(rawInput)]);
};

const setStatus = (id, text) => { document.getElementById(id).textContent = text; };
const setMeta   = (id, text) => { document.getElementById(id).textContent = text; };

const friendlyTimestamp = (iso) => {
  if (!iso) return 'just now';
  try {
    const d = new Date(iso);
    const isToday = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return isToday
      ? `Today at ${time}`
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
  } catch { return iso; }
};

const populatePresets = () => {
  [document.getElementById('levelsPreset'), document.getElementById('earningsPreset')].forEach((sel) => {
    sel.innerHTML = '';
    state.presets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  });
  if (state.presets.length) {
    document.getElementById('levelsPreset').value = 'blended';
    document.getElementById('earningsPreset').value = 'blended';
  }
};

// ---- Render levels ----
const renderLevels = (payload) => {
  const container = document.getElementById('levelsResults');
  const alertBox  = document.getElementById('levelsAlerts');
  const chipsEl   = document.getElementById('buyZoneChips');
  const descEl    = document.getElementById('buyZoneDesc');

  if (!payload.results.length) {
    container.innerHTML = '<div class="empty">No results came back. Try a smaller ticker list or press Get Fresh Data.</div>';
    alertBox.classList.remove('visible');
    return;
  }

  const sorted = sortResults(payload.results);
  const buyZoneItems = sorted.filter(isBuyZone);

  if (buyZoneItems.length) {
    alertBox.classList.add('visible');
    descEl.textContent = `${buyZoneItems.length} stock${buyZoneItems.length > 1 ? 's are' : ' is'} trading within ${BUY_ZONE_PCT}% of the support floor — price is right at the entry zone.`;
    chipsEl.innerHTML = buyZoneItems.map((item) => `
      <div class="buy-zone-chip">
        ${item.symbol}
        <span class="chip-price">$${formatNumber(item.price)}</span>
      </div>
    `).join('');
    maybeSendBuyZoneNotification(buyZoneItems.map((i) => i.symbol));
  } else {
    alertBox.classList.remove('visible');
  }

  const notifyBtn = document.getElementById('notifyBtn');
  if (!('Notification' in window)) {
    notifyBtn.style.display = 'none';
  } else if (Notification.permission === 'granted') {
    notifyBtn.textContent = 'Alerts Enabled';
    notifyBtn.disabled = true;
  } else if (Notification.permission === 'denied') {
    notifyBtn.textContent = 'Blocked by Browser';
    notifyBtn.disabled = true;
  }

  container.innerHTML = sorted.map((item) => {
    const inBZ = isBuyZone(item);
    const verdict = getVerdict(item.reward_risk_ratio);
    const thesis = item.thesis_check;
    return `
      <article class="panel results-card${inBZ ? ' buy-zone' : ''}">
        <div class="card-top">
          <div>
            <div class="ticker">
              ${item.symbol}
              ${inBZ ? '<span class="buy-zone-badge">Buy Zone</span>' : ''}
            </div>
            <p>${item.name}</p>
          </div>
          <div class="price-and-verdict">
            <div class="price">$${formatNumber(item.price)}</div>
            <div class="verdict ${verdict.cls}">
              <span class="verdict-dot"></span>${verdict.label}
            </div>
          </div>
        </div>

        ${priceBarHtml(item.price, item.support_level, item.take_profit_level)}

        <div class="metric-stack">
          ${metricRow('Support Floor', `$${formatNumber(item.support_level)}`, 'The price level where buyers have historically stepped in to stop the stock falling — think of it as the floor.')}
          ${metricRow('Deeper Floor', `$${formatNumber(item.deep_support)}`, 'A second safety net below the main floor. If price breaks the first level, watch this one next.')}
          ${metricRow('First Profit Target', `$${formatNumber(item.take_profit_level)}`)}
          ${metricRow('Stretch Target', `$${formatNumber(item.stretch_target)}`, 'A more ambitious target if the stock keeps strong momentum past the first profit level.')}
          ${metricRow('Reward / Risk', formatNumber(item.reward_risk_ratio), 'How much you could gain for every $1 at risk. A ratio of 3:1 means you could make $3 for every $1 risked — higher is better.')}
        </div>

        ${thesis ? `
          <div class="thesis-box">
            <span>${thesis.symbol} — your guess: $${formatNumber(thesis.support_guess)} &rarr; $${formatNumber(thesis.take_profit_guess)}</span>
            <strong>${thesis.support_matches_model ? 'Support close to model' : 'Support differs'}</strong>
          </div>
          <div class="mini">Support gap: ${formatNumber(thesis.support_gap_pct)}% &nbsp;|&nbsp; Target gap: ${formatNumber(thesis.target_gap_pct)}%</div>
        ` : ''}

        <div class="mini">
          Risk to support: ${formatNumber(item.risk_to_support_pct)}% &nbsp;|&nbsp;
          Reward to target: ${formatNumber(item.reward_to_tp_pct)}% &nbsp;|&nbsp;
          Last close: ${item.last_close_date}
        </div>
      </article>
    `;
  }).join('');
};

// ---- Render earnings ----
const daysToEarnings = (dateStr) => {
  if (!dateStr || dateStr === 'n/a') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr.replace(/^~/, ''));
  if (isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

const earningsDaysLabel = (dateStr) => {
  const days = daysToEarnings(dateStr);
  if (days === null) return { text: 'n/a', cls: '' };
  if (days < 0)   return { text: `${Math.abs(days)}d ago`, cls: '' };
  if (days === 0) return { text: 'Today', cls: 'bad' };
  if (days <= 7)  return { text: `In ${days} day${days === 1 ? '' : 's'}`, cls: 'bad' };
  if (days <= 21) return { text: `In ${days} days`, cls: 'warn' };
  return { text: `In ${days} days`, cls: '' };
};

const earningsHitClass = (pct) => {
  const v = Number(pct);
  if (isNaN(v)) return 'risky';
  if (v >= 60) return 'good';
  if (v >= 40) return 'ok';
  return 'risky';
};

const renderEarningsTable = (payload) => {
  const body       = document.getElementById('earningsTableBody');
  const details    = document.getElementById('earningsDetails');
  const errors     = document.getElementById('earningsErrors');
  const mobileGrid = document.getElementById('earningsMobileGrid');

  document.getElementById('earningsHighHeader').textContent  = 'Avg Post-Earnings High';
  document.getElementById('earningsCloseHeader').textContent = 'Avg Post-Earnings Close';

  errors.innerHTML = (payload.errors || []).length
    ? `<div class="empty" style="text-align:left;"><strong>Could not load these symbols:</strong><br>${(payload.errors || []).map((e) => `${e.symbol}: ${e.error}`).join('<br>')}</div>`
    : '';

  if (!payload.results.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty">No qualifying earnings history found for this list of stocks.</div></td></tr>`;
    mobileGrid.innerHTML = '';
    details.innerHTML = '';
    return;
  }

  body.innerHTML = payload.results.map((item) => {
    const latest = item.latest_cycle;
    const latestText = latest ? `${latest.earnings_date} | ${formatNumber(latest.pre_to_post_close_return_pct)}%` : 'n/a';
    const { text: daysText, cls: daysCls } = earningsDaysLabel(item.next_earnings_date);
    const nextCell = item.next_earnings_date
      ? `${item.next_earnings_date}<div class="mini ${daysCls}">${daysText}</div>`
      : 'n/a';
    return `
      <tr>
        <td><strong>${item.symbol}</strong><div class="mini">${item.name}</div></td>
        <td>$${formatNumber(item.price)}</td>
        <td>${item.pattern_hits}/${item.events_tested}</td>
        <td>${formatNumber(item.hit_rate_pct)}%</td>
        <td>${formatNumber(item.avg_post_high_return_pct)}%</td>
        <td>${formatNumber(item.avg_post_close_return_pct)}%</td>
        <td>${nextCell}</td>
        <td>${latestText}</td>
      </tr>
    `;
  }).join('');

  mobileGrid.innerHTML = payload.results.map((item) => {
    const latest = item.latest_cycle;
    const cls = earningsHitClass(item.hit_rate_pct);
    const { text: daysText, cls: daysCls } = earningsDaysLabel(item.next_earnings_date);
    return `
      <div class="earnings-mob-card">
        <div class="earnings-mob-head">
          <div>
            <div class="ticker">${item.symbol}</div>
            <p>${item.name}</p>
          </div>
          <div style="text-align:right;">
            <div class="earnings-hit-rate ${cls}">${formatNumber(item.hit_rate_pct)}%</div>
            <div class="mini">hit rate</div>
          </div>
        </div>
        <div class="earnings-mob-row"><span>Current Price</span><strong>$${formatNumber(item.price)}</strong></div>
        <div class="earnings-mob-row"><span>Bounced / Total</span><strong>${item.pattern_hits} of ${item.events_tested} times</strong></div>
        <div class="earnings-mob-row"><span>Avg High After Earnings</span><strong>${formatNumber(item.avg_post_high_return_pct)}%</strong></div>
        <div class="earnings-mob-row"><span>Avg Close After Earnings</span><strong>${formatNumber(item.avg_post_close_return_pct)}%</strong></div>
        <div class="earnings-mob-row">
          <span>Next Earnings</span>
          <strong>
            ${item.next_earnings_date || 'n/a'}
            ${item.next_earnings_date ? `<span class="${daysCls}" style="font-size:0.82rem;font-weight:400;margin-left:6px;">${daysText}</span>` : ''}
          </strong>
        </div>
        ${latest ? `<div class="earnings-mob-row"><span>Last Cycle</span><strong>${latest.earnings_date} &nbsp; ${formatNumber(latest.pre_to_post_close_return_pct)}%</strong></div>` : ''}
      </div>
    `;
  }).join('');

  details.innerHTML = payload.results.slice(0, 6).map((item) => `
    <article class="panel mini-card">
      <div class="ticker">${item.symbol}</div>
      <p>${item.name}</p>
      <div class="mini" style="margin-top:10px;">Hit rate ${formatNumber(item.hit_rate_pct)}% over ${item.events_tested} events</div>
      ${(item.qualifying_cycles || []).map((cycle) => `
        <div class="metric-row" style="margin-top:12px;">
          <span>${cycle.earnings_date}</span>
          <strong>${formatNumber(cycle.pre_to_post_close_return_pct)}%</strong>
        </div>
        <div class="mini">Pre-window to post-close: ${formatNumber(cycle.pre_to_post_close_return_pct)}%</div>
      `).join('')}
    </article>
  `).join('');
};

// ---- API ----
const fetchJson = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || 'Request failed');
  return payload;
};

const buildUrl = (path, params) => {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url.toString();
};

// ---- Actions ----
const runLevels = async (refresh = false) => {
  const label = refresh ? 'Get Fresh Data' : 'Run Analysis';
  const btnId = refresh ? 'refreshLevels' : 'runLevels';
  try {
    setButtonLoading(btnId, true, label);
    setStatus('levelsStatus', 'Loading...');
    const symbols = mergePresetAndInput(
      document.getElementById('levelsPreset').value,
      document.getElementById('levelsSymbols').value
    );
    const url = buildUrl('/api/levels', {
      symbols: symbols.join(','),
      refresh: refresh ? '1' : '0',
      thesis_symbol: document.getElementById('thesisSymbol').value.trim().toUpperCase(),
      thesis_support: document.getElementById('thesisSupport').value,
      thesis_take_profit: document.getElementById('thesisTakeProfit').value,
    });
    const payload = await fetchJson(url);
    renderLevels(payload);
    setStatus('levelsStatus', `Loaded ${payload.results.length} stocks`);
    const errNote = payload.errors.length
      ? ` · ${payload.errors.length} stock${payload.errors.length > 1 ? 's' : ''} failed to load: ${payload.errors.map((e) => e.symbol).join(', ')}`
      : '';
    setMeta('levelsMeta', `Updated ${friendlyTimestamp(payload.last_updated)}${errNote}`);
  } catch (error) {
    setStatus('levelsStatus', 'Error');
    setMeta('levelsMeta', error.message);
    document.getElementById('levelsResults').innerHTML = `<div class="empty">${error.message}</div>`;
  } finally {
    setButtonLoading(btnId, false, label);
  }
};

const runEarnings = async (refresh = false) => {
  const label = refresh ? 'Get Fresh Data' : 'Run Earnings Scan';
  const btnId = refresh ? 'refreshEarnings' : 'runEarnings';
  try {
    setButtonLoading(btnId, true, label);
    setStatus('earningsStatus', 'Loading...');
    const symbols = mergePresetAndInput(
      document.getElementById('earningsPreset').value,
      document.getElementById('earningsSymbols').value
    );
    const url = buildUrl('/api/earnings-pattern', {
      symbols: symbols.join(','),
      refresh: refresh ? '1' : '0',
      pre_days: document.getElementById('preDays').value,
      post_days: document.getElementById('postDays').value,
    });
    const payload = await fetchJson(url);
    renderEarningsTable(payload);
    setStatus('earningsStatus', `Loaded ${payload.results.length} stocks`);
    const errNote = payload.errors.length
      ? ` · ${payload.errors.length} stock${payload.errors.length > 1 ? 's' : ''} failed to load: ${payload.errors.map((e) => e.symbol).join(', ')}`
      : '';
    setMeta('earningsMeta', `Updated ${friendlyTimestamp(payload.last_updated)}${errNote}`);
  } catch (error) {
    setStatus('earningsStatus', 'Error');
    setMeta('earningsMeta', error.message);
    document.getElementById('earningsTableBody').innerHTML = `<tr><td colspan="8"><div class="empty">${error.message}</div></td></tr>`;
    document.getElementById('earningsDetails').innerHTML = '';
  } finally {
    setButtonLoading(btnId, false, label);
  }
};

const bindTabs = () => {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
};

// ---- Info tooltips ----
document.addEventListener('click', (e) => {
  if (e.target.closest('.info-btn')) {
    e.stopPropagation();
    const tip = e.target.closest('.metric-group')?.querySelector('.info-tip');
    if (!tip) return;
    const wasOpen = tip.classList.contains('open');
    document.querySelectorAll('.info-tip.open').forEach((t) => t.classList.remove('open'));
    if (!wasOpen) tip.classList.add('open');
    return;
  }
  document.querySelectorAll('.info-tip.open').forEach((t) => t.classList.remove('open'));
});

// ---- Scroll to top ----
const scrollBtn = document.getElementById('scrollTop');
window.addEventListener('scroll', () => {
  scrollBtn.classList.toggle('visible', window.scrollY > 380);
}, { passive: true });
scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ---- Init ----
const init = async () => {
  initTheme();
  bindTabs();
  document.getElementById('runLevels').addEventListener('click', () => runLevels(false));
  document.getElementById('refreshLevels').addEventListener('click', () => runLevels(true));
  document.getElementById('runEarnings').addEventListener('click', () => runEarnings(false));
  document.getElementById('refreshEarnings').addEventListener('click', () => runEarnings(true));
  document.getElementById('notifyBtn').addEventListener('click', requestNotifications);

  try {
    const config = await fetchJson('/api/config');
    state.presets = config.presets || [];
    populatePresets();
  } catch (error) {
    setMeta('levelsMeta', `Could not load presets: ${error.message}`);
    setMeta('earningsMeta', `Could not load presets: ${error.message}`);
  }
};

init();
