import {
  rpc, errText, esc, fmtScore, LETTERS, TEAM_CLASS, logoHtml, confirmBox, toast,
  game, onState, startStateSync, fetchState, optionsTiming, top10Auto,
  perfTiming, fmtClock, fmtOver, isRevealed, isDrawing, serverNow, sendControl, controlChannel,
} from './lib.js';
import { exportExcel } from './export.js';
import { openReport } from './report.js';

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
  intro_draw: 'Phần 1 · Bốc thăm thứ tự', intro_perf: 'Phần 1 · Giới thiệu đội thi',
  speech_draw: 'Phần 3 · Bốc thăm thứ tự', speech_perf: 'Phần 3 · Hùng biện',
  award_teams: 'Trao giải đồng đội', award_individual: 'Trao giải cá nhân', award_summary: 'Kết quả chung cuộc',
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
  controlChannel();
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

async function stageAct(action, target = null, arg = null, confirmMsg = null) {
  if (busy) return;
  if (confirmMsg && !(await confirmBox(confirmMsg))) return;
  busy = true;
  lastKey = '';
  render();
  try {
    await rpc('host_stage', { p_secret: secret, p_action: action, p_target: target, p_arg: arg });
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
  if (s?.phase === 'intro_draw' || s?.phase === 'speech_draw') {
    k += ':' + (s.payload.entries || []).map((e) => (isRevealed(e) ? 'r' : isDrawing(e) ? 'd' : '-')).join('');
  }
  if (s?.phase === 'intro_perf' || s?.phase === 'speech_perf') {
    const t = perfTiming(s.payload);
    k += ':' + (t.mode === 'over' ? 'run' : t.mode === 'prep_over' ? 'prep' : t.mode);
  }
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
  main.querySelectorAll('[data-sact]').forEach((b) => b.addEventListener('click', () => {
    const arg = b.dataset.arg === undefined ? null : Number(b.dataset.arg);
    stageAct(b.dataset.sact, b.dataset.target ?? null, arg, b.dataset.confirm || null);
  }));
  main.querySelectorAll('[data-captain]').forEach((b) => b.addEventListener('click', async () => {
    const [team, code, name] = [Number(b.dataset.team), b.dataset.captain, b.dataset.name];
    if (!(await confirmBox(`Chỉ định <b>${esc(name)}</b> làm đội trưởng <b>Đội ${team}</b>?`))) return;
    try {
      await rpc('host_set_captain', { p_secret: secret, p_team: team, p_code: code });
      toast('Đã chỉ định đội trưởng', 'ok');
      loadPlayers();
      loadOverview();
    } catch (err) { toast(errText(err), 'error'); }
  }));
  main.querySelectorAll('[data-music]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await sendControl(b.dataset.music);
      toast(b.dataset.music === 'music_stop' ? 'Đã gửi lệnh dừng nhạc (nhỏ dần)' : 'Đã gửi lệnh phát nhạc', 'ok');
    } catch (err) { toast(errText(err), 'error'); }
  }));
  main.querySelector('#export')?.addEventListener('click', () => exportExcel(secret));
  main.querySelector('#report')?.addEventListener('click', () => openReport(secret));
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

function sbtn(label, action, { target = null, arg = null, confirm = null, cls = 'btn-primary', block = true, xl = true } = {}) {
  return `<button class="btn ${cls} ${block ? 'btn-block' : ''} ${xl ? 'btn-xl' : ''}" data-sact="${action}"
    ${target !== null ? `data-target="${esc(target)}"` : ''} ${arg !== null ? `data-arg="${arg}"` : ''}
    ${confirm ? `data-confirm="${esc(confirm)}"` : ''} ${busy ? 'disabled' : ''}>${label}</button>`;
}
const waitBtn = (label) => `<button class="btn btn-ghost btn-block btn-xl" disabled>${label}</button>`;
const RANK_NAME = ['Ba', 'Nhì', 'Nhất'];

function drawControl(s, p) {
  const stage = p.stage;
  const entries = p.entries || [];
  const done = entries.filter((e) => isRevealed(e)).length;
  const list = entries.map((e) => `
    <div class="h-res-row ${TEAM_CLASS[e.team_id]}">
      <b>${esc(e.name)}</b>
      <span>${stage === 'intro' ? (e.captain_name ? 'ĐT: ' + esc(e.captain_name) : '<span class="warn">chưa có đội trưởng</span>') : esc(e.team_name)}</span>
      <span>${e.order_no != null ? (isRevealed(e) ? `Lượt <b>${e.order_no}</b>` : 'đang quay…')
        : sbtn('Bốc hộ', 'draw_for', { target: e.target, cls: 'btn-ghost btn-sm', block: false, xl: false,
          confirm: `MC bốc thăm hộ <b>${esc(e.name)}</b>?` })}</span>
    </div>`).join('');
  const first = entries.find((e) => e.order_no === 1);
  const main = done === entries.length && first
    ? sbtn(`▶ Mời lượt 1: ${esc(first.name)}`, stage === 'intro' ? 'intro_perf' : 'speech_perf', { target: first.target })
    : waitBtn(`Đang chờ bốc thăm (${done}/${entries.length})`);
  return {
    status: `<div class="h-sub">Bốc thăm thứ tự thi</div>`,
    main,
    extra: `<div class="card h-res">${list}</div>
      ${sbtn('↻ Bốc thăm lại từ đầu', 'reset_draw', { target: stage, cls: 'btn-ghost', xl: false, confirm: 'Huỷ kết quả bốc thăm hiện tại và <b>bốc lại từ đầu</b>?' })}`,
  };
}

function perfControl(s, p) {
  const stage = p.stage;
  const t = perfTiming(p);
  const perfAction = stage === 'intro' ? 'intro_perf' : 'speech_perf';
  let main = '';
  let extra = '';
  if (stage === 'speech' && !p.question) {
    main = waitBtn('Chờ thí sinh bốc câu hỏi…');
    extra += sbtn('🎲 Bốc hộ câu hỏi', 'draw_for', { cls: 'btn-ghost', xl: false, confirm: `MC bốc câu hỏi hộ <b>${esc(p.name)}</b>?` });
  } else if (t.mode === 'idle') {
    main = stage === 'speech'
      ? sbtn(`▶ Bắt đầu chuẩn bị ${fmtClock(p.prep_s * 1000)}`, 'timer_prep', { cls: 'btn-gold' })
      : sbtn(`▶ Bắt đầu tính giờ ${fmtClock(p.duration_s * 1000)}`, 'timer_start', { cls: 'btn-gold' });
    if (stage === 'speech') extra += sbtn('▶ Bỏ qua chuẩn bị — trình bày luôn', 'timer_start', { cls: 'btn-ghost', xl: false });
  } else if (t.mode === 'prep' || t.mode === 'prep_over') {
    main = sbtn(`▶ Bắt đầu trình bày ${fmtClock(p.duration_s * 1000)}`, 'timer_start', { cls: 'btn-gold' });
  } else if (t.mode === 'run' || t.mode === 'over') {
    main = sbtn('⏹ Dừng giờ', 'timer_stop', { cls: 'btn-danger' });
  } else {
    // đã dừng: sang lượt tiếp / phần tiếp
    if (p.next) main = sbtn(`▶ Mời lượt ${p.next.order_no}`, perfAction, { target: p.next.target });
    else if (stage === 'intro') {
      main = `<button class="btn btn-primary btn-block btn-xl" data-act="open_part" data-arg="${firstPart()}"
        data-confirm="Kết thúc Phần 1, sang <b>Phần 2 – Vòng 1</b>?" ${busy ? 'disabled' : ''}>▶ Sang Phần 2 – Vòng 1</button>`;
    } else {
      main = sbtn('🏆 Sang trao giải', 'award_individual', { arg: 0, cls: 'btn-gold', confirm: 'Kết thúc Hùng biện, sang <b>trao giải</b>?<br><small>Điểm BGK sẽ bị khoá.</small>' });
    }
  }
  if (t.mode !== 'idle') extra += sbtn('↻ Bấm giờ lại từ đầu', 'timer_reset', { cls: 'btn-ghost', xl: false, confirm: 'Xoá thời gian đã bấm của lượt này và <b>bấm lại từ đầu</b>?' });
  if (stage === 'speech' && p.question) extra += sbtn('🎲 Bốc lại câu hỏi', 'redraw_question', { cls: 'btn-ghost', xl: false, confirm: 'Huỷ câu hỏi đã bốc và cho thí sinh <b>bốc lại</b>?' });
  const q = stage === 'speech' && p.question ? `<div class="card h-qcard"><div class="h-qmeta">Câu hỏi hùng biện số ${p.question.id}</div>
    ${p.question.title ? `<div class="h-qtext">“${esc(p.question.title)}”</div>` : ''}<div>${esc(p.question.text)}</div></div>` : '';
  return {
    status: `<div class="h-sub">Lượt ${p.order_no}/${p.total}: ${esc(p.name)}</div><div class="h-bigtime" id="h-perf-time"></div>`,
    main,
    extra: q + extra,
  };
}

function currentQuestionCard(s) {
  const qq = q(s.q_no);
  if (!qq) return '';
  return `<div class="card h-qcard">
    <div class="h-qmeta">Câu ${s.q_no} · Vòng ${qq.part_no}</div>
    <div class="h-qtext">${esc(qq.text)}</div>
    <div class="h-qopts">${LETTERS.map((L) => `<div class="${qq.correct === L ? 'correct' : ''}"><b>${L}.</b> ${esc(qq[L.toLowerCase()])}</div>`).join('')}</div>
  </div>`;
}

function musicButtons() {
  return `<div class="grid2 music-btns">
    <button class="btn btn-ghost" data-music="music_stop">🔉 Dừng nhạc (nhỏ dần)</button>
    <button class="btn btn-ghost" data-music="music_play">🎵 Phát lại nhạc</button>
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
      main = sbtn('▶ Phần 1: Bốc thăm thứ tự Giới thiệu', 'intro_open', { cls: 'btn-gold', confirm: 'Bắt đầu <b>Phần 1 – Giới thiệu đội thi</b> (bốc thăm thứ tự)?' });
      extra = btn(`Bỏ qua Phần 1 → Phần 2, Vòng ${firstPart()}`, 'open_part', firstPart(),
        { cls: 'btn-ghost', confirm: `Bỏ qua Phần 1, bắt đầu luôn <b>Vòng ${firstPart()}: ${esc(partName(firstPart()))}</b>?` });
      break;
    case 'intro_draw': case 'speech_draw':
    case 'intro_perf': case 'speech_perf': {
      const r = s.phase.endsWith('draw') ? drawControl(s, p) : perfControl(s, p);
      status += r.status; main = r.main; extra = r.extra;
      break;
    }
    case 'award_teams': case 'award_individual': {
      const step = p.step || 0;
      const kind = s.phase === 'award_teams' ? 'đồng đội' : 'cá nhân';
      status += `<div class="h-sub">Đã công bố ${step}/3 giải ${kind}</div>`;
      main = step < 3
        ? sbtn(`🥁 Công bố Giải ${RANK_NAME[step]} ${kind}`, s.phase, { arg: step + 1, cls: 'btn-gold' })
        : s.phase === 'award_individual'
          ? sbtn('▶ Sang giải đồng đội', 'award_teams', { arg: 0, confirm: 'Chuyển sang <b>trao giải đồng đội</b>?' })
          : sbtn('🎉 Màn hình kết quả chung cuộc', 'award_summary', { cls: 'btn-gold' });
      const items = s.phase === 'award_teams' ? p.teams : p.people;
      extra = `<div class="card h-res">${(items || []).slice().reverse().map((it) => `
        <div class="h-res-row ${TEAM_CLASS[it.team_id ?? it.id]}"><b>${it.rank}. ${esc(it.name)}</b><span>${fmtScore(it.total)} điểm</span>
          <span>${s.phase === 'award_teams' ? `GT ${fmtScore(it.intro_avg)} + KT ${fmtScore(it.quiz_total)}` : `KT ${fmtScore(it.quiz_score)} + HB ${fmtScore(it.speech_avg)}`}</span>
          ${(s.phase === 'award_teams' ? it.intro_n : it.speech_n) < 4 ? `<span class="warn">⚠ TB tính trên ${s.phase === 'award_teams' ? it.intro_n : it.speech_n}/4 GK</span>` : ''}</div>`).join('')}</div>`;
      break;
    }
    case 'award_summary':
      status += `<div class="h-sub">Kết thúc chương trình 🎉</div>`;
      main = sbtn('↩ Quay lại giải đồng đội', 'award_teams', { arg: 3, cls: 'btn-ghost' });
      break;
    case 'part_intro':
      status += `<div class="h-sub">Vòng ${s.part_no}: ${esc(p.part_name)}</div>`
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
        ? btn(`🏁 Tổng kết Vòng ${s.part_no}`, 'part_end')
        : btn(`▶ Câu tiếp theo (${p.next_q})`, 'start_question', p.next_q);
      break;
    }
    case 'part_end':
      status += `<div class="h-sub">Kết thúc Vòng ${s.part_no}</div>`;
      main = p.next_part
        ? btn(`▶ Chuyển sang Vòng ${p.next_part}: ${esc(p.next_part_name)}`, 'open_part', p.next_part,
          { confirm: `Chuyển sang <b>Vòng ${p.next_part}: ${esc(p.next_part_name)}</b>?` })
        : btn('🏆 Công bố Top 10 cá nhân', 'final_top10', 0, { confirm: 'Kết thúc Phần 2 và <b>công bố Top 10 cá nhân</b>?', cls: 'btn-gold' });
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
      status += `<div class="h-sub">3 thí sinh vào vòng Hùng biện</div>`;
      main = sbtn('🎤 Phần 3: Bốc thăm thứ tự Hùng biện', 'speech_open', { cls: 'btn-gold', confirm: 'Sang <b>Phần 3 – Hùng biện</b> (bốc thăm thứ tự)?' });
      extra = btn('📋 Quay lại bảng tổng sắp', 'final_board', null, { cls: 'btn-ghost' });
      break;
    default: break;
  }

  if (['final_congrats', 'award_individual', 'award_teams', 'award_summary'].includes(s.phase)) extra += musicButtons();
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
          <div class="pl-info"><div>${esc(x.name)}${x.is_captain ? ' <span class="captain-tag">Đội trưởng</span>' : ''}</div><small>${esc(x.code)} · ${x.score} điểm</small></div>
          <button class="btn btn-sm btn-ghost star ${x.is_captain ? 'on' : ''}" data-captain="${esc(x.code)}" data-team="${x.team_id}" data-name="${esc(x.name)}" ${x.is_captain ? 'disabled' : ''} title="Chỉ định đội trưởng">★</button>
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
      <div class="h-part-title">Vòng ${pt.part_no}: ${esc(pt.name)}${pt.topic ? `<small class="h-topic">${esc(pt.topic)}</small>` : ''}</div>
      ${overview.questions.filter((x) => x.part_no === pt.part_no).map((x) => `
        <div class="h-q-row ${x.done ? 'done' : ''} ${s?.q_no === x.q_no ? 'current' : ''}">
          <span class="h-q-no">${x.q_no}</span>
          <div class="h-q-body"><div>${esc(x.text)}</div><small>Đáp án: <b>${x.correct}</b>${x.done ? ' · đã chơi' : ''}</small></div>
          <button class="btn btn-sm btn-ghost" data-act="start_question" data-arg="${x.q_no}"
            data-confirm="Nhảy tới <b>câu ${x.q_no}</b>?${x.done ? '<br><small>Câu này đã chơi — kết quả cũ sẽ bị xoá.</small>' : ''}">Mở</button>
        </div>`).join('')}
    </div>`).join('') + `
    <div class="card">
      <div class="h-part-title">Câu hỏi Hùng biện (${(overview.speech_questions || []).length})</div>
      ${(overview.speech_questions || []).map((x) => `<div class="h-q-row"><span class="h-q-no">${x.id}</span><div class="h-q-body">${x.title ? `<b>“${esc(x.title)}”</b><br>` : ''}${esc(x.text)}</div></div>`).join('')}
    </div>`;
}

function moreTab() {
  const parts = overview?.parts || [];
  return `
    <div class="card"><div class="h-part-title">Nhạc trao giải (trên màn chiếu)</div>${musicButtons()}</div>
    <div class="card"><div class="h-part-title">Kết quả</div>
      <button class="btn btn-gold btn-block" id="report">📄 Xuất biên bản tổng hợp</button>
      <button class="btn btn-primary btn-block" id="export">⬇ Xuất Excel kết quả</button>
    </div>
    <div class="card"><div class="h-part-title">Chuyển màn hình</div>
      <div class="grid2">
        <button class="btn btn-ghost" data-act="lobby" data-confirm="Về <b>phòng chờ</b>?">Phòng chờ</button>
        ${sbtn('P1: Bốc thăm', 'intro_open', { cls: 'btn-ghost', block: false, xl: false, confirm: 'Mở <b>bốc thăm Phần 1</b>?' })}
        ${parts.map((pt) => `<button class="btn btn-ghost" data-act="open_part" data-arg="${pt.part_no}" data-confirm="Mở màn giới thiệu <b>Vòng ${pt.part_no}</b>?">Mở Vòng ${pt.part_no}</button>`).join('')}
        <button class="btn btn-ghost" data-act="final_top10" data-arg="0" data-confirm="Sang <b>công bố Top 10</b>?">Công bố Top 10</button>
        <button class="btn btn-ghost" data-act="final_board" data-confirm="Sang <b>bảng tổng sắp</b>?">Bảng tổng sắp</button>
        <button class="btn btn-ghost" data-act="final_congrats" data-confirm="Sang <b>chúc mừng Top 3</b>?">Chúc mừng Top 3</button>
        ${sbtn('P3: Bốc thăm', 'speech_open', { cls: 'btn-ghost', block: false, xl: false, confirm: 'Mở <b>bốc thăm Phần 3</b>?' })}
        ${sbtn('Trao giải cá nhân', 'award_individual', { arg: 0, cls: 'btn-ghost', block: false, xl: false, confirm: 'Sang <b>trao giải cá nhân</b>?<br><small>Điểm BGK sẽ bị khoá.</small>' })}
        ${sbtn('Trao giải đội', 'award_teams', { arg: 0, cls: 'btn-ghost', block: false, xl: false, confirm: 'Sang <b>trao giải đồng đội</b>?<br><small>Điểm BGK sẽ bị khoá.</small>' })}
        ${sbtn('KQ chung cuộc', 'award_summary', { cls: 'btn-ghost', block: false, xl: false, confirm: 'Sang <b>màn kết quả chung cuộc</b>?' })}
      </div>
    </div>
    <div class="card"><div class="h-part-title">Chạy thử / làm lại</div>
      <button class="btn btn-danger btn-block" id="reset">Xoá kết quả, giữ người chơi đăng nhập</button>
      <button class="btn btn-danger btn-block" id="reset-all">Xoá kết quả + đăng xuất tất cả</button>
    </div>
    <div class="card">
      <div class="muted small">Màn chiếu: <b>…/SmartBanker/#view</b> · MC: <b>…/SmartBanker/#host</b> · Thư ký: <b>…/SmartBanker/#thuky</b></div>
      <button class="btn btn-ghost btn-block" id="logout">Đăng xuất MC</button>
    </div>`;
}

function tick() {
  const s = game.state;
  if (!s) return;
  if (keyFor() !== lastKey) { render(); return; }
  if (s.phase === 'intro_perf' || s.phase === 'speech_perf') {
    const el = root.querySelector('#h-perf-time');
    if (el) {
      const t = perfTiming(s.payload);
      const lbl = { idle: 'Chưa bấm giờ', prep: 'Chuẩn bị', prep_over: 'Hết giờ chuẩn bị', run: 'Còn lại', over: 'QUÁ GIỜ', stopped: 'Đã dừng' }[t.mode];
      const val = t.mode === 'over' || t.mode === 'prep_over' ? '+' + fmtOver(t.overMs)
        : t.mode === 'stopped' ? fmtOver(t.elapsedMs) + (t.overMs > 0 ? ` (quá ${fmtOver(t.overMs)})` : '')
          : t.mode === 'idle' ? '' : fmtClock(t.remainingMs);
      el.className = 'h-bigtime mode-' + t.mode;
      el.innerHTML = `<small>${lbl}</small>${val}`;
    }
  }
  if (s.phase === 'options') {
    const el = root.querySelector('#h-timer');
    if (el) {
      const t = optionsTiming(s.payload);
      el.textContent = t.stage === 'reveal' ? `đang hiện đáp án (${t.revealed}/4)` : t.stage === 'answering' ? `còn ${Math.ceil(t.remainingMs / 1000)}s` : 'hết giờ';
    }
  }
}

