import {
  rpc, errText, esc, fmtScore, LETTERS, TEAM_CLASS, logoHtml, confirmBox, toast,
  game, onState, startStateSync, fetchState, optionsTiming, top10Auto,
} from './lib.js';
import { exportExcel } from './export.js';

const KEY = 'sb_host_secret';
let root;
let secret = localStorage.getItem(KEY);
let overview = null;       // parts, questions (kèm đáp án)
let players = [];
let online = null;
let tab = 'control';
let busy = false;
let lastKey = '';

const PHASE_LABEL = {
  lobby: 'Phòng chờ', part_intro: 'Giới thiệu phần thi', question: 'Đang hiện câu hỏi', options: 'Đáp án / đếm ngược',
  result: 'Kết quả câu hỏi', part_end: 'Tổng kết phần', final_teams: 'Công bố điểm đội', final_top10: 'Công bố top 10',
  final_board: 'Bảng tổng sắp', final_congrats: 'Chúc mừng top 3',
};

export function mountHost(el) {
  root = el;
  if (secret) verify(); else renderLogin();
}

function renderLogin(msg = '') {
  root.innerHTML = `
    <div class="p-login">
      <div class="p-login-brand">${logoHtml('logo-lg')}<div class="brand-title">Smart<span>Banker</span></div><div class="brand-sub">Bảng điều khiển MC</div></div>
      <form class="card p-login-form" id="f" autocomplete="off">
        <label>Tài khoản<input id="u" inputmode="numeric" required></label>
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
      if (role !== 'host') throw new Error('KHONG_CO_QUYEN');
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
    if (role !== 'host') throw new Error('SAI_MAT_KHAU');
    start();
  } catch (err) {
    if (/SAI_MAT_KHAU/.test(err?.message)) {
      localStorage.removeItem(KEY);
      renderLogin('Phiên đăng nhập không còn hợp lệ.');
    } else renderLogin(errText(err));
  }
}

async function start() {
  root.innerHTML = `
    <div class="h-wrap">
      <header class="h-top">
        ${logoHtml('logo-sm', true)}
        <div class="h-title">SmartBanker <small>MC</small></div>
        <div class="h-online" id="h-online"></div>
      </header>
      <main class="h-main" id="h-main"></main>
      <nav class="h-tabs">
        <button data-tab="control">🎮<span>Điều khiển</span></button>
        <button data-tab="players">👥<span>Người chơi</span></button>
        <button data-tab="questions">❓<span>Câu hỏi</span></button>
        <button data-tab="more">⚙️<span>Khác</span></button>
      </nav>
    </div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    lastKey = '';
    render();
    if (tab === 'players') loadPlayers();
    if (tab === 'questions') loadOverview();
  }));
  await loadOverview();
  startStateSync({ pollMs: 2500 });
  onState(() => { render(); if (game.state?.phase === 'result' || game.state?.phase === 'part_intro') loadOverview(); });
  pollOnline();
  setInterval(pollOnline, 3000);
  setInterval(() => { if (tab === 'players') loadPlayers(); }, 4000);
  setInterval(tick, 200);
}

async function loadOverview() {
  try {
    overview = await rpc('host_overview', { p_secret: secret });
    if (tab === 'questions') { lastKey = ''; render(); }
  } catch (err) { toast(errText(err), 'error'); }
}

async function loadPlayers() {
  try {
    players = await rpc('host_players', { p_secret: secret });
    if (tab === 'players') { lastKey = ''; render(); }
  } catch { /* thử lại lần sau */ }
}

async function pollOnline() {
  try {
    online = await rpc('online_counts');
    const el = root.querySelector('#h-online');
    if (el) el.innerHTML = online.teams.map((t) => `<span class="mini ${TEAM_CLASS[t.id]}">${t.online}</span>`).join('') + `<span class="mini total">${online.total}/${online.registered}</span>`;
  } catch { /* bỏ qua */ }
}

async function act(action, arg = null, confirmMsg = null) {
  if (busy) return;
  if (confirmMsg && !(await confirmBox(confirmMsg))) return;
  busy = true;
  lastKey = '';
  render();
  try {
    await rpc('host_action', { p_secret: secret, p_action: action, p_arg: arg });
    await fetchState();
  } catch (err) {
    toast(errText(err), 'error');
  } finally {
    busy = false;
    lastKey = '';
    render();
  }
}

// ---------------- Render ----------------
function keyFor() {
  const s = game.state;
  let k = `${tab}:${busy}:${s?.phase}:${s?.version}`;
  if (s?.phase === 'options') k += ':' + optionsTiming(s.payload).stage;
  if (s?.phase === 'final_top10') k += ':' + top10Auto(s.payload).done;
  return k;
}

function render() {
  const main = root.querySelector('#h-main');
  if (!main) return;
  const k = keyFor();
  if (k === lastKey) return;
  lastKey = k;
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  main.innerHTML = tab === 'control' ? controlTab() : tab === 'players' ? playersTab() : tab === 'questions' ? questionsTab() : moreTab();
  wire(main);
  tick();
}

function wire(main) {
  main.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const arg = b.dataset.arg === undefined ? null : Number(b.dataset.arg);
    act(b.dataset.act, arg, b.dataset.confirm || null);
  }));
  main.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox(`Mở khoá / đăng xuất <b>${esc(b.dataset.name)}</b> khỏi thiết bị hiện tại?`, { yes: 'Kick', danger: true }))) return;
    try {
      await rpc('host_kick', { p_secret: secret, p_code: b.dataset.kick });
      toast('Đã kick ' + b.dataset.name, 'ok');
      loadPlayers();
    } catch (err) { toast(errText(err), 'error'); }
  }));
  main.querySelector('#export')?.addEventListener('click', () => exportExcel(secret));
  main.querySelector('#reset')?.addEventListener('click', () => doReset(false));
  main.querySelector('#reset-all')?.addEventListener('click', () => doReset(true));
  main.querySelector('#logout')?.addEventListener('click', async () => {
    if (!(await confirmBox('Đăng xuất tài khoản MC?'))) return;
    localStorage.removeItem(KEY);
    location.reload();
  });
  main.querySelector('#player-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    main.querySelectorAll('.pl-row').forEach((r) => { r.style.display = r.dataset.s.includes(q) ? '' : 'none'; });
  });
}

async function doReset(logoutAll) {
  const msg = logoutAll
    ? 'XOÁ TOÀN BỘ kết quả thi <b>và đăng xuất tất cả người chơi</b>?<br><small>Không thể hoàn tác.</small>'
    : 'XOÁ TOÀN BỘ kết quả thi và quay về phòng chờ?<br><small>Người chơi vẫn giữ đăng nhập. Không thể hoàn tác.</small>';
  if (!(await confirmBox(msg, { yes: 'Xoá', danger: true }))) return;
  if (!(await confirmBox('Xác nhận lần 2: chắc chắn xoá?', { yes: 'Chắc chắn xoá', danger: true }))) return;
  try {
    await rpc('host_reset', { p_secret: secret, p_logout_all: logoutAll });
    toast('Đã reset', 'ok');
    await fetchState();
    loadOverview();
  } catch (err) { toast(errText(err), 'error'); }
}

const q = (no) => overview?.questions.find((x) => x.q_no === no);
const partName = (no) => overview?.parts.find((x) => x.part_no === no)?.name || '';
const firstPart = () => overview?.parts[0]?.part_no ?? 1;

function btn(label, action, arg = null, { confirm = null, cls = 'btn-primary', disabled = false } = {}) {
  return `<button class="btn ${cls} btn-block btn-xl" data-act="${action}" ${arg !== null ? `data-arg="${arg}"` : ''}
    ${confirm ? `data-confirm="${esc(confirm)}"` : ''} ${disabled || busy ? 'disabled' : ''}>${label}</button>`;
}

function currentQuestionCard(s) {
  const qq = q(s.q_no);
  if (!qq) return '';
  return `<div class="card h-qcard">
    <div class="h-qmeta">Câu ${s.q_no} · Phần ${qq.part_no}</div>
    <div class="h-qtext">${esc(qq.text)}</div>
    <div class="h-qopts">${LETTERS.map((L) => `<div class="${qq.correct === L ? 'correct' : ''}"><b>${L}.</b> ${esc(qq[L.toLowerCase()])}</div>`).join('')}</div>
  </div>`;
}

function controlTab() {
  const s = game.state;
  if (!s || !overview) return `<div class="p-wait"><div class="spinner"></div></div>`;
  const p = s.payload || {};
  let status = `<div class="h-phase">${PHASE_LABEL[s.phase] || s.phase}</div>`;
  let main = '';
  let extra = '';

  switch (s.phase) {
    case 'lobby':
      main = btn(`▶ Bắt đầu Phần ${firstPart()}: ${esc(partName(firstPart()))}`, 'open_part', firstPart(),
        { confirm: `Bắt đầu <b>Phần ${firstPart()}</b>?` });
      break;
    case 'part_intro':
      status += `<div class="h-sub">Phần ${s.part_no}: ${esc(p.part_name)}</div>`
        + (overview?.parts.find((x) => x.part_no === s.part_no)?.topic ? `<div class="h-topic">${esc(overview.parts.find((x) => x.part_no === s.part_no).topic)}</div>` : '');
      main = btn(`▶ Bắt đầu câu ${p.first_q}`, 'start_question', p.first_q);
      break;
    case 'question':
      status += `<div class="h-sub">Câu ${s.q_no} — đang hiện câu hỏi</div>`;
      main = btn('👁 Hiện đáp án', 'show_options');
      extra = currentQuestionCard(s);
      break;
    case 'options': {
      const t = optionsTiming(p);
      status += `<div class="h-sub">Câu ${s.q_no} — <span id="h-timer"></span></div>`;
      main = t.stage === 'ended'
        ? btn('📊 Hiện kết quả', 'finalize')
        : `<button class="btn btn-ghost btn-block btn-xl" disabled>${t.stage === 'reveal' ? 'Đang hiện đáp án…' : 'Đang đếm ngược…'}</button>`;
      extra = currentQuestionCard(s)
        + (t.stage === 'answering' ? `<button class="btn btn-ghost btn-block" data-act="finalize" data-arg="1" data-confirm="Dừng câu hỏi và chốt kết quả NGAY (chưa hết giờ)?">⏹ Chốt kết quả ngay</button>` : '');
      break;
    }
    case 'result': {
      const r = p.result;
      status += `<div class="h-sub">Câu ${s.q_no} · Đáp án đúng: <b>${r.correct}</b></div>`;
      extra = `<div class="card h-res">${r.teams.map((t) => `
        <div class="h-res-row ${TEAM_CLASS[t.id]}"><b>${esc(t.name)}</b><span>TB ${fmtScore(t.avg)}</span><span>✓${t.correct} ✗${t.wrong} –${t.none}</span></div>`).join('')}</div>`;
      main = p.is_last_in_part
        ? btn(`🏁 Tổng kết Phần ${s.part_no}`, 'part_end')
        : btn(`▶ Câu tiếp theo (${p.next_q})`, 'start_question', p.next_q);
      break;
    }
    case 'part_end':
      status += `<div class="h-sub">Kết thúc Phần ${s.part_no}</div>`;
      main = p.next_part
        ? btn(`▶ Chuyển sang Phần ${p.next_part}: ${esc(p.next_part_name)}`, 'open_part', p.next_part,
          { confirm: `Chuyển sang <b>Phần ${p.next_part}: ${esc(p.next_part_name)}</b>?` })
        : btn('🏆 Sang màn hình kết thúc', 'final_teams', 0, { confirm: 'Kết thúc phần thi và sang <b>màn hình kết quả chung cuộc</b>?', cls: 'btn-gold' });
      break;
    case 'final_teams': {
      const step = p.step || 0;
      status += `<div class="h-sub">Đã công bố ${step}/3 đội</div>`;
      main = step < 3
        ? btn(`🥁 Công bố Hạng ${3 - step}`, 'final_teams', step + 1, { cls: 'btn-gold' })
        : btn('▶ Sang bảng xếp hạng cá nhân', 'final_top10', 0, { confirm: 'Chuyển sang <b>công bố Top 10 cá nhân</b>?' });
      break;
    }
    case 'final_top10': {
      const step = p.step || 0;
      const a = top10Auto(p);
      status += `<div class="h-sub">${a.done ? `Đã công bố hạng 10 → 4${step ? ` và ${step} người Top 3` : ''}` : 'Đang tự công bố hạng 10 → 4…'}</div>`;
      main = !a.done
        ? `<button class="btn btn-ghost btn-block btn-xl" disabled>Đang công bố hạng 10 → 4…</button>`
        : step < 3
          ? btn(`🥁 Công bố Hạng ${3 - step}`, 'final_top10', step + 1, { cls: 'btn-gold' })
          : btn('📋 Bảng tổng sắp Top 10', 'final_board');
      break;
    }
    case 'final_board':
      main = btn('🎉 Chúc mừng Top 3 vào Hùng biện', 'final_congrats', null, { cls: 'btn-gold' });
      break;
    case 'final_congrats':
      status += `<div class="h-sub">Kết thúc chương trình 🎉</div>`;
      main = btn('📋 Quay lại bảng tổng sắp', 'final_board', null, { cls: 'btn-ghost' });
      break;
    default: break;
  }

  const rerun = ['question', 'options', 'result'].includes(s.phase)
    ? `<button class="btn btn-ghost btn-block" data-act="start_question" data-arg="${s.q_no}" data-confirm="Chạy lại <b>câu ${s.q_no}</b> từ đầu?<br><small>Toàn bộ câu trả lời của câu này sẽ bị xoá.</small>">↻ Chạy lại câu này</button>`
    : '';
  return `
    <div class="card h-status">${status}</div>
    <div class="h-primary">${main}</div>
    ${extra}
    ${rerun}`;
}

function playersTab() {
  if (!players.length) return `<div class="p-wait"><div class="spinner"></div>Đang tải…</div>`;
  const groups = [1, 2, 3].map((tid) => {
    const list = players.filter((x) => x.team_id === tid);
    const on = list.filter((x) => x.online).length;
    return `<div class="card h-team">
      <div class="h-team-head ${TEAM_CLASS[tid]}"><b>Đội ${tid}</b><span>${on}/${list.length} online</span></div>
      ${list.map((x) => `
        <div class="pl-row" data-s="${esc((x.name + ' ' + x.code).toLowerCase())}">
          <span class="dot ${x.online ? 'on' : x.logged_in ? 'idle' : 'off'}"></span>
          <div class="pl-info"><div>${esc(x.name)}</div><small>${esc(x.code)} · ${x.score} điểm</small></div>
          ${x.logged_in ? `<button class="btn btn-sm btn-ghost" data-kick="${esc(x.code)}" data-name="${esc(x.name)}">Kick</button>` : '<small class="muted">chưa vào</small>'}
        </div>`).join('')}
    </div>`;
  }).join('');
  return `<div class="card"><input id="player-search" class="search" placeholder="Tìm tên hoặc mã cán bộ…"></div>
    <div class="legend"><span class="dot on"></span>online <span class="dot idle"></span>mất kết nối <span class="dot off"></span>chưa đăng nhập</div>
    ${groups}`;
}

function questionsTab() {
  if (!overview) return '';
  const s = game.state;
  return overview.parts.map((pt) => `
    <div class="card">
      <div class="h-part-title">Phần ${pt.part_no}: ${esc(pt.name)}${pt.topic ? `<small class="h-topic">${esc(pt.topic)}</small>` : ''}</div>
      ${overview.questions.filter((x) => x.part_no === pt.part_no).map((x) => `
        <div class="h-q-row ${x.done ? 'done' : ''} ${s?.q_no === x.q_no ? 'current' : ''}">
          <span class="h-q-no">${x.q_no}</span>
          <div class="h-q-body"><div>${esc(x.text)}</div><small>Đáp án: <b>${x.correct}</b>${x.done ? ' · đã chơi' : ''}</small></div>
          <button class="btn btn-sm btn-ghost" data-act="start_question" data-arg="${x.q_no}"
            data-confirm="Nhảy tới <b>câu ${x.q_no}</b>?${x.done ? '<br><small>Câu này đã chơi — kết quả cũ sẽ bị xoá.</small>' : ''}">Mở</button>
        </div>`).join('')}
    </div>`).join('');
}

function moreTab() {
  const parts = overview?.parts || [];
  return `
    <div class="card"><div class="h-part-title">Kết quả</div>
      <button class="btn btn-primary btn-block" id="export">⬇ Xuất Excel kết quả</button>
    </div>
    <div class="card"><div class="h-part-title">Chuyển màn hình</div>
      <div class="grid2">
        <button class="btn btn-ghost" data-act="lobby" data-confirm="Về <b>phòng chờ</b>?">Phòng chờ</button>
        ${parts.map((pt) => `<button class="btn btn-ghost" data-act="open_part" data-arg="${pt.part_no}" data-confirm="Mở màn giới thiệu <b>Phần ${pt.part_no}</b>?">Mở Phần ${pt.part_no}</button>`).join('')}
        <button class="btn btn-ghost" data-act="final_teams" data-arg="0" data-confirm="Sang <b>công bố điểm đội</b>?">Công bố đội</button>
        <button class="btn btn-ghost" data-act="final_top10" data-arg="0" data-confirm="Sang <b>công bố Top 10</b>?">Công bố Top 10</button>
        <button class="btn btn-ghost" data-act="final_board" data-confirm="Sang <b>bảng tổng sắp</b>?">Bảng tổng sắp</button>
        <button class="btn btn-ghost" data-act="final_congrats" data-confirm="Sang <b>chúc mừng Top 3</b>?">Chúc mừng Top 3</button>
      </div>
    </div>
    <div class="card"><div class="h-part-title">Chạy thử / làm lại</div>
      <button class="btn btn-danger btn-block" id="reset">Xoá kết quả, giữ người chơi đăng nhập</button>
      <button class="btn btn-danger btn-block" id="reset-all">Xoá kết quả + đăng xuất tất cả</button>
    </div>
    <div class="card">
      <div class="muted small">Link màn chiếu: <b>…/SmartBanker/#view</b> · Link MC: <b>…/SmartBanker/#host</b></div>
      <button class="btn btn-ghost btn-block" id="logout">Đăng xuất MC</button>
    </div>`;
}

function tick() {
  const s = game.state;
  if (!s) return;
  if (keyFor() !== lastKey) { render(); return; }
  if (s.phase === 'options') {
    const el = root.querySelector('#h-timer');
    if (el) {
      const t = optionsTiming(s.payload);
      el.textContent = t.stage === 'reveal' ? `đang hiện đáp án (${t.revealed}/4)` : t.stage === 'answering' ? `còn ${Math.ceil(t.remainingMs / 1000)}s` : 'hết giờ';
    }
  }
}

