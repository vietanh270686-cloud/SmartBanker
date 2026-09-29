import {
  rpc, errText, esc, fmtSec, fmtScore, LETTERS, TEAM_CLASS, logoHtml, deviceId, confirmBox, toast,
  game, onState, startStateSync, notifyVersion, optionsTiming, loadParts, partTopic,
} from './lib.js';

const KEY = 'sb_player';
let root;
let session = load();
let summary = null;          // my_summary
// Lựa chọn gắn với TỪNG LƯỢT CHẠY câu hỏi (không chỉ số câu) — để "Chạy lại câu này" / reset rồi chơi lại
// không giữ đáp án cũ
let selection = { run: null, choice: null, confirmed: null };
let currentRun = null;
let sending = false;
let queued = null;
let lastKey = '';
let hbTimer;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function save(s) {
  session = s;
  if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
}

export function mountPlayer(el) {
  root = el;
  if (session) startGame(); else renderLogin();
}

// ---------------- Đăng nhập ----------------
function renderLogin(msg = '') {
  clearInterval(hbTimer);
  root.innerHTML = `
    <div class="p-login">
      <div class="p-login-brand">
        ${logoHtml('logo-lg')}
        <div class="brand-title">Smart<span>Banker</span></div>
        <div class="brand-sub">Cuộc thi kiến thức</div>
      </div>
      <form class="card p-login-form" id="login-form" autocomplete="off">
        <label>Mã cán bộ<input id="code" inputmode="numeric" autocapitalize="characters" required></label>
        <label>Mật khẩu<input id="pw" type="password" required></label>
        ${msg ? `<div class="form-error">${esc(msg)}</div>` : ''}
        <button class="btn btn-primary btn-block btn-lg" type="submit">Vào thi</button>
      </form>
    </div>`;
  const form = root.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Đang vào…';
    try {
      const res = await rpc('player_login', {
        p_code: form.code.value.trim(), p_password: form.pw.value, p_device: deviceId(),
      });
      save(res);
      startGame();
    } catch (err) {
      renderLogin(errText(err));
    }
  });
}

// Mỗi lần MC bấm "Bắt đầu câu" là 1 lượt mới (version của state khi vào pha 'question' thay đổi);
// sang pha 'options' thì countdown_start_at là duy nhất cho lượt đó
function runKey(s) {
  if (!s || s.q_no == null) return null;
  if (s.phase === 'question') return `${s.q_no}:q${s.version}`;
  if (s.payload?.countdown_start_at) return `${s.q_no}:${s.payload.countdown_start_at}`;
  return null;
}

function onStateChange(s) {
  const rk = runKey(s);
  const isNewQuestion = s.phase === 'question' || (s.phase === 'options' && rk !== currentRun);
  if (isNewQuestion && rk !== currentRun) {
    currentRun = rk;
    selection = { run: rk, choice: null, confirmed: null };
    queued = null;
    if (summary) summary = { ...summary, current: null };
  } else if (rk) {
    currentRun = rk;
  }
  refreshSummaryIfNeeded();
  render();
}

let started = false;
function startGame() {
  lastKey = '';
  if (!started) {
    started = true;
    loadParts().then(() => { lastKey = ''; render(); });
    startStateSync({ pollMs: 0 });
    onState(onStateChange);
    setInterval(tick, 100);
  }
  heartbeat();
  clearInterval(hbTimer);
  hbTimer = setInterval(heartbeat, 4000);
  render();
}

async function heartbeat() {
  if (!session) return;
  try {
    const r = await rpc('heartbeat', { p_token: session.token });
    if (!r.valid) {
      save(null);
      renderLogin('Bạn đã được đăng xuất khỏi thiết bị này. Vui lòng đăng nhập lại.');
      return;
    }
    notifyVersion(r.version);
    setOnline(true);
  } catch {
    setOnline(false);
  }
}

function setOnline(ok) {
  document.body.classList.toggle('offline', !ok);
}

async function logout() {
  if (!(await confirmBox('Đăng xuất khỏi thiết bị này?'))) return;
  try { await rpc('player_logout', { p_token: session.token }); } catch { /* bỏ qua */ }
  save(null);
  renderLogin();
}

// ---------------- Điểm cá nhân ----------------
let summaryFor = '';
async function refreshSummaryIfNeeded(force = false) {
  const s = game.state;
  if (!s || !session) return;
  const k = `${s.phase}:${s.q_no}:${s.version}`;
  if (!force && k === summaryFor) return;
  summaryFor = k;
  try {
    const r = await rpc('my_summary', { p_token: session.token });
    if (!r.valid) return;
    summary = r;
    // khôi phục lựa chọn khi vào lại giữa chừng
    const rk = runKey(s);
    if (r.current && s.phase === 'options' && s.q_no === r.current.q_no && rk === runKey(game.state) && !selection.choice) {
      selection = { run: rk, choice: r.current.choice, confirmed: r.current.choice };
    }
    lastKey = '';
    render();
  } catch { /* thử lại ở lần đổi trạng thái sau */ }
}

// ---------------- Gửi đáp án (tuần tự, lấy lựa chọn cuối) ----------------
function choose(letter) {
  const s = game.state;
  if (!s || s.phase !== 'options') return;
  const t = optionsTiming(s.payload);
  if (t.stage !== 'answering') return;
  const rk = runKey(s);
  if (selection.run !== rk) selection = { run: rk, choice: null, confirmed: null };
  selection.choice = letter;
  if (navigator.vibrate) navigator.vibrate(30);
  paintOptions();
  queued = { q: s.q_no, run: rk, choice: letter };
  flush();
}

async function flush() {
  if (sending || !queued) return;
  sending = true;
  const job = queued;
  queued = null;
  try {
    await rpc('submit_answer', { p_token: session.token, p_q: job.q, p_choice: job.choice });
    if (selection.run === job.run) selection.confirmed = job.choice;
  } catch (err) {
    const m = errText(err);
    if (/mạng/.test(m)) {
      // lỗi mạng: thử lại nếu người chơi chưa đổi ý khác và vẫn là lượt câu hỏi đó
      if (!queued && job.run === currentRun) queued = job;
      await new Promise((r) => setTimeout(r, 700));
    } else {
      toast(m, 'error');
    }
  } finally {
    sending = false;
    paintOptions();
    if (queued) flush();
  }
}

// ---------------- Render ----------------
function header() {
  return `
    <header class="p-header">
      ${logoHtml('logo-sm')}
      <div class="p-who">
        <div class="p-name">${esc(session.name)}</div>
        <div class="p-team ${TEAM_CLASS[session.team_id]}">${esc(session.team_name)} · ${esc(session.code)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="logout">Đăng xuất</button>
    </header>
    <div class="offline-bar">Mất kết nối — đang kết nối lại…</div>`;
}

function keyFor(s) {
  if (!s) return 'loading';
  let k = `${s.phase}:${s.version}`;
  if (s.phase === 'options') {
    const t = optionsTiming(s.payload);
    k += `:${t.stage}`;
  }
  return k;
}

function render() {
  if (!session) return;
  const s = game.state;
  const k = keyFor(s);
  if (k === lastKey) return;
  lastKey = k;
  root.innerHTML = `<div class="p-wrap">${header()}<main class="p-main">${body(s)}</main></div>`;
  root.querySelector('#logout').addEventListener('click', logout);
  root.querySelectorAll('[data-choice]').forEach((b) =>
    b.addEventListener('click', () => choose(b.dataset.choice)),
  );
  tick();
}

function scoreCard() {
  if (!summary) return '';
  return `
    <div class="card p-score">
      <div><div class="lbl">Tổng điểm</div><div class="val">${fmtScore(summary.score)}</div></div>
      <div><div class="lbl">Số câu đúng</div><div class="val">${summary.correct_count ?? 0}</div></div>
      <div><div class="lbl">Thời gian câu đúng</div><div class="val">${fmtSec(summary.time_ms)}</div></div>
    </div>`;
}

function body(s) {
  if (!s) return `<div class="p-wait"><div class="spinner"></div>Đang tải…</div>`;
  const p = s.payload || {};
  switch (s.phase) {
    case 'lobby':
      return `<div class="p-wait">
        <div class="big-emoji">👋</div>
        <h2>Xin chào ${esc(session.name)}!</h2>
        <p>Bạn đã vào phòng thi. Vui lòng chờ MC bắt đầu.</p>
      </div>`;
    case 'part_intro':
      return `<div class="p-wait">
        <div class="part-tag">Phần ${s.part_no}</div>
        <h2>${esc(p.part_name)}</h2>
        ${partTopic(s.part_no) ? `<p class="p-topic">Chủ đề: ${esc(partTopic(s.part_no))}</p>` : ''}
        <p>${p.q_count} câu hỏi · Chuẩn bị sẵn sàng!</p>
      </div>`;
    case 'question':
      return `${qHead(s)}<div class="p-question">${esc(p.text)}</div>
        <div class="p-hint">Chờ hiện đáp án…</div>`;
    case 'options':
      return `${qHead(s)}<div class="p-question sm">${esc(p.text)}</div>
        <div class="p-timer"><div class="p-timer-bar" id="tbar"></div><span id="tnum"></span></div>
        <div class="p-options">${LETTERS.map((L) => `
          <button class="opt opt-${L}" data-choice="${L}" id="opt-${L}">
            <span class="opt-letter">${L}</span><span class="opt-text">${esc(p.options[L])}</span>
          </button>`).join('')}</div>
        <div class="p-status" id="pstatus"></div>`;
    case 'result':
      return resultBody(s);
    case 'part_end':
      return `<div class="p-wait">
        <div class="part-tag">Kết thúc phần ${s.part_no}</div>
        <h2>${esc(p.part_name)}</h2>
        <p>${p.next_part ? 'Chờ MC chuyển sang phần tiếp theo…' : 'Chờ công bố kết quả chung cuộc…'}</p>
      </div>${scoreCard()}`;
    default:
      if (s.phase.startsWith('final')) {
        return `<div class="p-wait">
          <div class="big-emoji">🏆</div>
          <h2>Kết quả chung cuộc</h2>
          <p>Mời theo dõi trên màn hình lớn!</p>
        </div>${scoreCard()}`;
      }
      return '';
  }
}

function qHead(s) {
  const p = s.payload;
  return `<div class="p-qhead"><span class="part-tag">Phần ${s.part_no} · ${esc(p.part_name)}</span>
    <span class="q-count">Câu ${p.idx}/${p.q_count}</span></div>`;
}

function resultBody(s) {
  const p = s.payload;
  const correct = p.result.correct;
  const cur = summary?.current && summary.current.q_no === s.q_no ? summary.current : null;
  let banner;
  if (!summary) banner = `<div class="p-result pending">Đang tải kết quả…</div>`;
  else if (!cur) banner = `<div class="p-result none"><div class="res-icon">⏱</div><div>Bạn chưa trả lời câu này</div></div>`;
  else if (cur.is_correct) banner = `<div class="p-result ok"><div class="res-icon">✓</div><div>CHÍNH XÁC!</div><div class="res-sub">+${cur.points} điểm · ${fmtSec(cur.response_ms)}</div></div>`;
  else banner = `<div class="p-result bad"><div class="res-icon">✗</div><div>CHƯA ĐÚNG</div><div class="res-sub">Bạn chọn ${cur.choice}</div></div>`;
  return `${qHead(s)}${banner}
    <div class="card p-correct"><span class="lbl">Đáp án đúng</span>
      <div class="opt opt-${correct} is-correct"><span class="opt-letter">${correct}</span><span class="opt-text">${esc(p.options[correct])}</span></div>
    </div>
    ${scoreCard()}`;
}

// Cập nhật phần động (đáp án hiện dần, đồng hồ) không vẽ lại toàn bộ
function paintOptions() {
  const s = game.state;
  if (!s || s.phase !== 'options') return;
  const t = optionsTiming(s.payload);
  const sel = selection.run === runKey(s) ? selection : { choice: null, confirmed: null };
  LETTERS.forEach((L, i) => {
    const b = root.querySelector(`#opt-${L}`);
    if (!b) return;
    b.classList.toggle('hidden-opt', i >= t.revealed);
    b.classList.toggle('selected', sel.choice === L);
    b.disabled = t.stage !== 'answering';
  });
  const st = root.querySelector('#pstatus');
  if (st) {
    if (t.stage === 'reveal') st.textContent = 'Đọc kỹ đáp án — sắp bắt đầu tính giờ';
    else if (t.stage === 'answering') {
      st.textContent = sel.choice
        ? (sel.confirmed === sel.choice ? `Đã chọn ${sel.choice} — có thể đổi trong thời gian còn lại` : `Đang gửi ${sel.choice}…`)
        : 'Chạm để chọn đáp án';
    } else {
      st.textContent = sel.confirmed ? `Hết giờ — đã chốt đáp án ${sel.confirmed}` : 'Hết giờ — bạn chưa chọn đáp án';
    }
    st.className = 'p-status ' + t.stage;
  }
}

function tick() {
  const s = game.state;
  if (!s || !session) return;
  if (s.phase === 'options') {
    if (keyFor(s) !== lastKey) { render(); return; }
    const t = optionsTiming(s.payload);
    const bar = root.querySelector('#tbar');
    const num = root.querySelector('#tnum');
    if (bar) {
      const frac = t.stage === 'reveal' ? 1 : t.remainingMs / t.totalMs;
      bar.style.width = (frac * 100).toFixed(1) + '%';
      bar.classList.toggle('urgent', t.stage === 'answering' && t.remainingMs <= 5000);
    }
    if (num) num.textContent = t.stage === 'reveal' ? '' : Math.ceil(t.remainingMs / 1000) + 's';
    paintOptions();
  }
}

