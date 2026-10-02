import {
  rpc, errText, esc, fmtScore, TEAM_CLASS, logoHtml, confirmBox, toast,
  onState, startStateSync, fmtOver,
} from './lib.js';

const KEY = 'sb_secretary_secret';
const JUDGES = [1, 2, 3, 4];
const MAX = 40;
let root;
let secret = localStorage.getItem(KEY);
let data = null;
let tab = null;            // 'intro' | 'speech'
let structKey = '';
const saving = {};         // `${stage}:${target}:${judge}` -> 'saving' | 'ok' | 'err'

export function mountSecretary(el) {
  root = el;
  if (secret) verify(); else renderLogin();
}

function renderLogin(msg = '') {
  root.innerHTML = `
    <div class="p-login">
      <div class="p-login-brand">${logoHtml('logo-lg')}<div class="brand-title">Smart<span>Banker</span></div><div class="brand-sub">Thư ký — nhập điểm Ban giám khảo</div></div>
      <form class="card p-login-form" id="f" autocomplete="off">
        <label>Tài khoản<input id="u" required></label>
        <label>Mật khẩu<input id="pw" type="password" required></label>
        ${msg ? `<div class="form-error">${esc(msg)}</div>` : ''}
        <button class="btn btn-primary btn-block btn-lg">Đăng nhập</button>
      </form>
    </div>`;
  root.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = `${e.target.u.value.trim()}|${e.target.pw.value}`;
    try {
      const role = await rpc('account_login', { p_secret: s });
      if (role !== 'secretary' && role !== 'host') throw new Error('KHONG_CO_QUYEN');
      secret = s;
      localStorage.setItem(KEY, s);
      start();
    } catch (err) {
      renderLogin(errText(err));
    }
  });
}

async function verify() {
  try {
    const role = await rpc('account_login', { p_secret: secret });
    if (role !== 'secretary' && role !== 'host') throw new Error('SAI_MAT_KHAU');
    start();
  } catch (err) {
    if (/SAI_MAT_KHAU/.test(err?.message)) {
      localStorage.removeItem(KEY);
      renderLogin('Phiên đăng nhập không còn hợp lệ.');
    } else renderLogin(errText(err));
  }
}

function start() {
  root.innerHTML = `
    <div class="h-wrap">
      <header class="h-top">
        ${logoHtml('logo-sm', true)}
        <div class="h-title">SmartBanker <small>THƯ KÝ</small></div>
        <button class="btn btn-sm btn-ghost" id="logout">Thoát</button>
      </header>
      <div class="sec-tabs">
        <button data-tab="intro">Phần 1 · Giới thiệu</button>
        <button data-tab="speech">Phần 3 · Hùng biện</button>
      </div>
      <main class="h-main sec-main" id="sec-main"><div class="p-wait"><div class="spinner"></div></div></main>
    </div>`;
  root.querySelector('#logout').addEventListener('click', async () => {
    if (!(await confirmBox('Đăng xuất tài khoản thư ký?'))) return;
    localStorage.removeItem(KEY);
    location.reload();
  });
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    structKey = '';
    paint();
  }));
  startStateSync({ pollMs: 0 });
  onState(load);
  load();
  setInterval(load, 3000);
}

async function load() {
  try {
    data = await rpc('secretary_overview', { p_secret: secret });
    if (!tab) tab = String(data.phase).startsWith('speech') || data.phase.startsWith('final') ? 'speech' : 'intro';
    paint();
  } catch (err) {
    toast(errText(err), 'error');
  }
}

function timeInfo(r, limitS) {
  if (!r.started_at) return '<span class="muted">Chưa bấm giờ</span>';
  if (!r.stopped_at) return '<span class="live">● Đang thi</span>';
  const el = r.stopped_at - r.started_at;
  const over = el - limitS * 1000;
  return `Thời gian <b>${fmtOver(el)}</b>${over > 0 ? ` · <span class="over">quá giờ ${fmtOver(over)}</span>` : ' · <span class="ok">đúng giờ</span>'}`;
}

function rowsFor() {
  return tab === 'intro' ? data.intro : data.speech;
}

// Vẽ khung (chỉ khi danh sách đổi) — ô nhập giữ nguyên để không mất chữ đang gõ
function paint() {
  const main = root.querySelector('#sec-main');
  if (!main || !data) return;
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const rows = rowsFor();
  const key = `${tab}:${data.locked}:` + rows.map((r) => `${r.target}.${r.order_no}.${r.question ?? ''}`).join('|');
  if (key !== structKey) {
    structKey = key;
    main.innerHTML = structure(rows);
    wire(main);
  }
  update(main, rows);
}

function structure(rows) {
  if (!rows.length) {
    return `<div class="p-wait"><div class="big-emoji">⏳</div><p>${tab === 'intro'
      ? 'Chưa có dữ liệu Phần 1 — chờ MC mở bốc thăm.'
      : 'Chưa có 3 thí sinh Hùng biện — chờ MC mở Phần 3.'}</p></div>`;
  }
  const lock = data.locked ? `<div class="sec-lock">🔒 Đã công bố kết quả — điểm đã khoá</div>` : '';
  const hint = `<div class="sec-hint">Nhập điểm từng giám khảo (0 – ${MAX}), điểm đã trừ quá giờ theo quyết định BTC. Tự lưu khi rời ô.</div>`;
  return lock + hint + rows.map((r) => `
    <div class="card sec-card" data-row="${esc(r.target)}">
      <div class="sec-head">
        <span class="sec-order">${r.order_no ?? '–'}</span>
        <div class="sec-who">
          <div class="sec-name">${esc(r.name)}</div>
          <div class="sec-sub">${tab === 'speech' ? `${esc(r.team_name)} · Kiến thức ${fmtScore(r.quiz_score)} điểm (hạng ${r.quiz_rank})` : `Kiến thức: <span data-quiz></span>`}</div>
        </div>
        <span class="sec-now" data-now>ĐANG THI</span>
      </div>
      ${tab === 'speech' ? `<div class="sec-q">${r.question ? esc(r.question) : '<span class="muted">Chưa bốc câu hỏi</span>'}</div>` : ''}
      <div class="sec-time" data-time></div>
      <div class="sec-judges">${JUDGES.map((j) => `
        <label class="sec-judge">GK ${j}
          <input type="text" inputmode="decimal" data-judge="${j}" data-target="${esc(r.target)}" ${data.locked ? 'disabled' : ''} placeholder="–">
          <span class="sec-save" data-save="${j}"></span>
        </label>`).join('')}
      </div>
      <div class="sec-avg">Điểm TB giám khảo: <b data-avg>–</b><span data-total></span></div>
      <div class="sec-missing" data-missing></div>
    </div>`).join('');
}

function update(main, rows) {
  const limit = tab === 'intro' ? data.config.intro_seconds : data.config.speech_seconds;
  rows.forEach((r) => {
    const card = main.querySelector(`[data-row="${CSS.escape(r.target)}"]`);
    if (!card) return;
    const tc = TEAM_CLASS[tab === 'intro' ? Number(r.target) : r.team_id];
    if (tc) card.classList.add(tc);
    card.classList.toggle('now', data.current === `${tab}:${r.target}`);
    card.querySelector('[data-time]').innerHTML = timeInfo(r, limit);
    const quiz = card.querySelector('[data-quiz]');
    if (quiz) quiz.textContent = r.quiz_total != null ? fmtScore(r.quiz_total) + ' điểm' : '–';
    card.querySelector('[data-avg]').textContent = r.avg != null ? fmtScore(r.avg) : '–';
    const missing = JUDGES.filter((j) => r.scores?.[j - 1] == null);
    card.querySelector('[data-missing]').textContent = missing.length && missing.length < 4
      ? `⚠ Chưa nhập GK ${missing.join(', ')} — điểm TB đang tính trên ${4 - missing.length} giám khảo` : '';
    const extra = tab === 'intro' ? r.quiz_total : r.quiz_score;
    card.querySelector('[data-total]').innerHTML = r.avg != null && extra != null
      ? ` · Tổng: <b>${fmtScore(Number(r.avg) + Number(extra))}</b>` : '';
    JUDGES.forEach((j) => {
      const inp = card.querySelector(`input[data-judge="${j}"]`);
      const v = r.scores?.[j - 1];
      const k = `${tab}:${r.target}:${j}`;
      if (document.activeElement !== inp && saving[k] !== 'saving' && inp.dataset.dirty !== '1') {
        inp.value = v == null ? '' : String(v).replace('.', ',');
      }
      const st = card.querySelector(`[data-save="${j}"]`);
      st.textContent = saving[k] === 'saving' ? '…' : saving[k] === 'err' ? '!' : v != null ? '✓' : '';
      st.className = 'sec-save ' + (saving[k] || (v != null ? 'ok' : ''));
    });
  });
}

function wire(main) {
  main.querySelectorAll('input[data-judge]').forEach((inp) => {
    inp.addEventListener('input', () => { inp.dataset.dirty = '1'; });
    inp.addEventListener('change', () => save(inp));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
}

async function save(inp) {
  const raw = inp.value.trim().replace(',', '.');
  const judge = Number(inp.dataset.judge);
  const target = inp.dataset.target;
  const k = `${tab}:${target}:${judge}`;
  let score = null;
  if (raw !== '') {
    score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > MAX) {
      toast(`Điểm phải từ 0 đến ${MAX}`, 'error');
      inp.focus();
      return;
    }
    score = Math.round(score * 10) / 10;
  }
  saving[k] = 'saving';
  paint();
  try {
    await rpc('secretary_set_score', { p_secret: secret, p_stage: tab, p_target: target, p_judge: judge, p_score: score });
    saving[k] = 'ok';
    inp.dataset.dirty = '0';
  } catch (err) {
    saving[k] = 'err';
    toast(errText(err), 'error');
  }
  await load();
}
