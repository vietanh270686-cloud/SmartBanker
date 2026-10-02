import QRCode from 'qrcode';
import {
  rpc, errText, esc, fmtSec, fmtScore, LETTERS, TEAM_CLASS, logoHtml, BASE_URL, toast,
  game, onState, startStateSync, optionsTiming, top10Auto, serverNow, loadParts, partTopic,
  perfTiming, fmtClock, fmtOver, isRevealed, isDrawing,
} from './lib.js';
import * as snd from './sound.js';
import { exportExcel } from './export.js';
import { openReport } from './report.js';

const KEY = 'sb_view_secret';
const SUSPENSE_MS = 1900;
let root;
let secret = localStorage.getItem(KEY);
let online = null;
let progress = null;
let lastKey = '';
let lastPhaseSig = '';
let qrDataUrl = '';

// theo dõi để phát âm thanh đúng 1 lần
let snd_revealed = -1;
let snd_stage = '';
let snd_sec = -1;
let snd_top10 = -1;
let snd_draw = '';
let snd_perf = '';
let snd_perfSec = -1;
let finalizing = false;
let lastFinalizeTry = 0;

// hồi hộp trước khi công bố (trống cuộn): { sig, until }
let suspense = null;
const seenStep = {};

export function mountView(el) {
  root = el;
  if (secret) verify(); else renderLogin();
}

function renderLogin(msg = '') {
  root.innerHTML = `
    <div class="v-login">
      ${logoHtml('logo-lg', true)}
      <div class="brand-title xl">Smart<span>Banker</span></div>
      <form class="card v-login-form" id="f" autocomplete="off">
        <div class="form-title">Màn hình trình chiếu</div>
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
      await rpc('account_login', { p_secret: s });
      secret = s;
      localStorage.setItem(KEY, s);
      showStartOverlay();
    } catch (err) {
      renderLogin(errText(err));
    }
  });
}

async function verify() {
  try {
    await rpc('account_login', { p_secret: secret });
    showStartOverlay();
  } catch (err) {
    if (/SAI_MAT_KHAU/.test(err?.message)) {
      localStorage.removeItem(KEY);
      renderLogin('Phiên đăng nhập không còn hợp lệ.');
    } else {
      renderLogin(errText(err));
    }
  }
}

function showStartOverlay() {
  root.innerHTML = `
    <div class="v-start">
      ${logoHtml('logo-lg', true)}
      <div class="brand-title xl">Smart<span>Banker</span></div>
      <button class="btn btn-gold btn-xl" id="go">▶ Bắt đầu trình chiếu</button>
      <p class="muted">Bấm để bật âm thanh và toàn màn hình</p>
    </div>`;
  root.querySelector('#go').addEventListener('click', () => {
    snd.unlockAudio();
    document.documentElement.requestFullscreen?.().catch(() => {});
    start();
  });
}

async function start() {
  qrDataUrl = await QRCode.toDataURL(BASE_URL, { margin: 1, width: 520, color: { dark: '#044B47', light: '#ffffff' } });
  root.innerHTML = `
    <div class="v-wrap">
      <header class="v-top">
        <div class="v-brand">${logoHtml('logo-md', true)}<div class="brand-title">Smart<span>Banker</span></div></div>
        <div class="v-online" id="online"></div>
        <div class="v-tools">
          <button class="icon-btn" id="mute" title="Tắt/bật âm thanh">🔊</button>
          <button class="icon-btn" id="fs" title="Toàn màn hình">⛶</button>
          <button class="icon-btn" id="xls" title="Xuất Excel">⬇</button>
          <button class="icon-btn" id="report" title="Xuất biên bản tổng hợp">📄</button>
        </div>
      </header>
      <main class="v-stage" id="stage"></main>
    </div>`;
  root.querySelector('#mute').addEventListener('click', (e) => {
    snd.setMuted(!snd.isMuted());
    e.currentTarget.textContent = snd.isMuted() ? '🔇' : '🔊';
  });
  root.querySelector('#fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  });
  root.querySelector('#xls').addEventListener('click', () => exportExcel(secret));
  root.querySelector('#report').addEventListener('click', () => openReport(secret));

  await loadParts();
  startStateSync({ pollMs: 3000 });
  onState(() => render());
  pollOnline();
  setInterval(pollOnline, 3000);
  setInterval(pollProgress, 1000);
  setInterval(tick, 100);
}

// ---------------- Số người online ----------------
async function pollOnline() {
  try {
    online = await rpc('online_counts');
    paintOnline();
  } catch { /* giữ số cũ */ }
}

function paintOnline() {
  const el = root.querySelector('#online');
  if (!el || !online) return;
  el.innerHTML = online.teams.map((t) => `
      <div class="chip ${TEAM_CLASS[t.id]}"><span class="dot"></span>${esc(t.name)} <b>${t.online}</b>/${t.registered}</div>`).join('')
    + `<div class="chip total">Online <b>${online.total}</b>/${online.registered}</div>`;
  const big = root.querySelector('#lobby-online');
  if (big) big.innerHTML = lobbyOnline();
}

async function pollProgress() {
  const s = game.state;
  if (!s || s.phase !== 'options') { progress = null; return; }
  const t = optionsTiming(s.payload);
  if (t.stage === 'reveal') { progress = null; return; }
  try {
    progress = await rpc('answer_progress');
    const el = root.querySelector('#progress');
    if (el) el.innerHTML = progressHtml();
  } catch { /* bỏ qua */ }
}

function progressHtml() {
  if (progress == null) return '';
  const tot = online?.total ?? '';
  return `Đã trả lời <b>${progress}</b>${tot !== '' ? ` / ${tot}` : ''}`;
}

// ---------------- Render ----------------
function suspenseActive(sig) {
  return suspense && suspense.sig === sig && Date.now() < suspense.until;
}

// Bắt đầu hồi hộp khi bước công bố tăng lên (chỉ khi đang xem trực tiếp, không phải lúc tải lại trang)
function trackStep(phase, step) {
  const prev = seenStep[phase];
  seenStep[phase] = step;
  if (prev != null && step > prev) {
    suspense = { sig: `${phase}:${step}`, until: Date.now() + SUSPENSE_MS, fanfare: true };
    snd.playDrumroll(SUSPENSE_MS / 1000);
  }
}

function keyFor(s) {
  if (!s) return 'loading';
  let k = `${s.phase}:${s.version}`;
  if (s.phase === 'options') k += ':' + optionsTiming(s.payload).stage;
  if (s.phase === 'final_top10') {
    k += ':' + top10Auto(s.payload).shown + ':' + (suspenseActive(`final_top10:${s.payload.step}`) ? 's' : '');
  }
  if (s.phase === 'final_teams') k += ':' + (suspenseActive(`final_teams:${s.payload.step}`) ? 's' : '');
  if (s.phase === 'award_teams' || s.phase === 'award_individual') k += ':' + (suspenseActive(`${s.phase}:${s.payload.step}`) ? 's' : '');
  if (s.phase === 'intro_draw' || s.phase === 'speech_draw') {
    k += ':' + (s.payload.entries || []).map((e) => (isRevealed(e) ? 'r' : isDrawing(e) ? 'd' : '-')).join('');
  }
  if (s.phase === 'intro_perf' || s.phase === 'speech_perf') {
    const p = s.payload;
    k += ':' + perfTiming(p).mode + ':' + (p.question ? (serverNow() >= p.question_reveal_at ? 'Q' : 'q') : '');
  }
  return k;
}

function render() {
  const s = game.state;
  const stage = root.querySelector('#stage');
  if (!stage) return;
  if (['final_teams', 'final_top10', 'award_teams', 'award_individual'].includes(s?.phase)) trackStep(s.phase, s.payload.step ?? 0);
  const k = keyFor(s);
  if (k === lastKey) return;
  lastKey = k;

  const phaseSig = s ? `${s.phase}:${s.q_no}:${s.part_no}` : '';
  if (phaseSig !== lastPhaseSig) {
    lastPhaseSig = phaseSig;
    onPhaseEnter(s);
  }
  stage.className = `v-stage ph-${s?.phase || 'loading'}`;
  stage.innerHTML = body(s);
  tick();
}

function onPhaseEnter(s) {
  if (!s) return;
  snd_revealed = -1; snd_stage = ''; snd_sec = -1; snd_top10 = -1; snd_draw = ''; snd_perf = ''; snd_perfSec = -1;
  finalizing = false;
  switch (s.phase) {
    case 'question': snd.playQuestion(); break;
    case 'result': snd.playCorrect(); break;
    case 'part_intro': case 'part_end': snd.playStinger(); break;
    case 'final_teams': case 'final_top10': snd.playStinger(); break;
    case 'final_board': case 'final_congrats': case 'award_summary': snd.playFanfare(); break;
    case 'intro_draw': case 'speech_draw': case 'intro_perf': case 'speech_perf':
    case 'award_teams': case 'award_individual': snd.playStinger(); break;
    default: break;
  }
}

function body(s) {
  if (!s) return `<div class="v-center"><div class="spinner lg"></div></div>`;
  const p = s.payload || {};
  switch (s.phase) {
    case 'lobby': return lobby();
    case 'part_intro': return partIntro(s, p);
    case 'question': return questionView(s, p, false);
    case 'options': return questionView(s, p, true);
    case 'result': return resultView(s, p);
    case 'part_end': return partEnd(s, p);
    case 'final_teams': return finalTeams(p);
    case 'final_top10': return finalTop10(p);
    case 'final_board': return finalBoard(p);
    case 'final_congrats': return congrats(p);
    case 'intro_draw': case 'speech_draw': return drawView(s, p);
    case 'intro_perf': case 'speech_perf': return perfView(s, p);
    case 'award_teams': return awardPodium(s.phase, p.step || 0, p.teams || [], 'GIẢI ĐỒNG ĐỘI', teamAwardCard);
    case 'award_individual': return awardPodium(s.phase, p.step || 0, p.people || [], 'GIẢI CÁ NHÂN', personAwardCard);
    case 'award_summary': return awardSummary(p);
    default: return '';
  }
}

function lobbyOnline() {
  if (!online) return '';
  return online.teams.map((t) => `
    <div class="lobby-team ${TEAM_CLASS[t.id]}">
      <div class="lt-name">${esc(t.name)}</div>
      <div class="lt-num">${t.online}<small>/${t.registered}</small></div>
      <div class="lt-lbl">đang online</div>
    </div>`).join('');
}

function lobby() {
  return `
    <div class="v-lobby">
      <div class="lobby-left">
        <div class="eyebrow">Cuộc thi kiến thức</div>
        <div class="brand-title hero">Smart<span>Banker</span></div>
        <div class="lobby-sub">
          <span class="ls-branch">Tràng Tiền – Hà Nội 2026</span>
          <span class="ls-date">Ngày thi 03/10/2026</span>
        </div>
        <div class="lobby-steps">
          <div><b>1</b> Quét mã QR bằng điện thoại</div>
          <div><b>2</b> Nhập mã cán bộ và mật khẩu</div>
          <div><b>3</b> Chờ MC bắt đầu phần thi</div>
        </div>
        <div class="lobby-online" id="lobby-online">${lobbyOnline()}</div>
      </div>
      <div class="lobby-right">
        <div class="qr-card"><img src="${qrDataUrl}" alt="QR"></div>
        <div class="qr-caption">Quét mã để vào thi</div>
      </div>
    </div>`;
}

function totalsBars(totals, { sort = true } = {}) {
  if (!totals?.length) return '';
  const list = sort ? totals.slice().sort((a, b) => b.total - a.total) : totals;
  const max = Math.max(1, ...list.map((t) => Number(t.total)));
  return `<div class="totals">${list.map((t, i) => `
    <div class="tot-row ${TEAM_CLASS[t.id]}" style="--d:${i * 0.15}s">
      <div class="tot-name">${esc(t.name)}</div>
      <div class="tot-bar"><div style="width:${(Number(t.total) / max) * 100}%"></div></div>
      <div class="tot-val">${fmtScore(t.total)}</div>
    </div>`).join('')}</div>`;
}

function partIntro(s, p) {
  const hasScore = (p.totals || []).some((t) => Number(t.total) > 0);
  return `
    <div class="v-part">
      <div class="part-eyebrow">PHẦN 2 · THI KIẾN THỨC</div>
      <div class="part-num">VÒNG ${s.part_no}</div>
      <div class="part-name">${esc(p.part_name)}</div>
      ${partTopic(s.part_no) ? `<div class="part-topic">Chủ đề: ${esc(partTopic(s.part_no))}</div>` : ''}
      <div class="part-meta">${p.q_count} câu hỏi</div>
      ${hasScore ? `<div class="part-totals"><div class="sec-title">Điểm các đội hiện tại</div>${totalsBars(p.totals)}</div>` : ''}
    </div>`;
}

function qBadge(s, p) {
  return `<div class="q-badge"><span>Vòng ${s.part_no} · ${esc(p.part_name)}</span><b>Câu ${p.idx}/${p.q_count}</b></div>`;
}

function questionView(s, p, withOptions) {
  return `
    <div class="v-question ${withOptions ? 'has-opts' : ''}">
      ${qBadge(s, p)}
      <div class="q-text">${esc(p.text)}</div>
      ${withOptions ? `
        <div class="q-bottom">
          <div class="v-options">${LETTERS.map((L) => `
            <div class="v-opt opt-${L}" id="vopt-${L}"><span class="opt-letter">${L}</span><span class="opt-text">${esc(p.options[L])}</span></div>`).join('')}
          </div>
          <div class="v-timer" id="vtimer">
            <svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring" id="ring" cx="60" cy="60" r="52"/></svg>
            <div class="t-num" id="tnum"></div>
            <div class="t-progress" id="progress"></div>
          </div>
        </div>` : ''}
    </div>`;
}

function resultView(s, p) {
  const r = p.result;
  const total = Math.max(1, LETTERS.reduce((a, L) => a + Number(r.counts[L] || 0), 0));
  const maxAvg = Math.max(1, ...r.teams.map((t) => Number(t.avg)));
  const totals = Object.fromEntries((r.totals || []).map((t) => [t.id, t.total]));
  return `
    <div class="v-result">
      ${qBadge(s, p)}
      <div class="q-text sm">${esc(p.text)}</div>
      <div class="res-grid">
        <div class="res-opts">${LETTERS.map((L, i) => {
          const n = Number(r.counts[L] || 0);
          return `<div class="res-opt ${L === r.correct ? 'is-correct' : 'is-wrong'}" style="--d:${0.1 + i * 0.1}s">
            <span class="opt-letter">${L}</span>
            <span class="opt-text">${esc(p.options[L])}</span>
            <span class="res-bar"><span style="width:${(n / total) * 100}%"></span></span>
            <span class="res-count">${n}</span>
          </div>`;
        }).join('')}</div>
        <div class="res-teams">${r.teams.map((t, i) => `
          <div class="team-card ${TEAM_CLASS[t.id]}" style="--d:${0.7 + i * 0.25}s">
            <div class="tc-name">${esc(t.name)}</div>
            <div class="tc-avg"><span>${fmtScore(t.avg)}</span><small>điểm TB câu này</small></div>
            <div class="tc-bar"><div style="width:${(Number(t.avg) / maxAvg) * 100}%"></div></div>
            <div class="tc-stats">
              <span class="ok">✓ ${t.correct} đúng</span>
              <span class="bad">✗ ${t.wrong} sai</span>
              <span class="none">– ${t.none} không TL</span>
            </div>
            <div class="tc-total">Tổng cộng dồn: <b>${fmtScore(totals[t.id])}</b></div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function partEnd(s, p) {
  return `
    <div class="v-part">
      <div class="part-num sm">KẾT THÚC VÒNG ${s.part_no}</div>
      <div class="part-name md">${esc(p.part_name)}</div>
      <div class="part-totals wide"><div class="sec-title">Bảng điểm đồng đội</div>${totalsBars(p.totals)}</div>
      <div class="part-meta">${p.next_part ? `Tiếp theo: Vòng ${p.next_part} — ${esc(p.next_part_name)}` : 'Chuẩn bị công bố Top 10 cá nhân!'}</div>
    </div>`;
}

// payload.teams sắp tăng dần: [hạng 3, hạng 2, hạng 1]
function finalTeams(p) {
  const step = p.step || 0;
  const sus = suspenseActive(`final_teams:${step}`);
  const slot = (idx, rankNo) => {
    const t = p.teams[idx];
    const revealed = idx < step && !(sus && idx === step - 1);
    const pending = sus && idx === step - 1;
    return `
      <div class="podium-col rank-${rankNo} ${revealed ? 'revealed ' + TEAM_CLASS[t.id] : ''} ${pending ? 'pending' : ''}">
        <div class="podium-card">
          ${revealed ? `<div class="pc-name">${esc(t.name)}</div><div class="pc-score">${fmtScore(t.total)}</div><div class="pc-lbl">điểm</div>` : `<div class="pc-q">?</div>`}
        </div>
        <div class="podium-base"><span>${rankNo === 1 ? '🏆' : ''} Hạng ${rankNo}</span></div>
      </div>`;
  };
  return `
    <div class="v-final">
      <div class="final-title">KẾT QUẢ ĐỒNG ĐỘI</div>
      <div class="podium">${slot(1, 2)}${slot(2, 1)}${slot(0, 3)}</div>
    </div>`;
}

function personCard(r, big = false) {
  return `
    <div class="person ${big ? 'big' : ''} ${TEAM_CLASS[r.team_id]}">
      <div class="ps-rank">${r.rank}</div>
      <div class="ps-info"><div class="ps-name">${esc(r.name)}</div><div class="ps-team">${esc(r.team_name)}</div></div>
      <div class="ps-score"><b>${r.score}</b><small>${fmtSec(r.time_ms)}</small></div>
    </div>`;
}

function finalTop10(p) {
  const auto = top10Auto(p);
  const step = p.step || 0;
  const sus = suspenseActive(`final_top10:${step}`);
  const byRank = Object.fromEntries(p.list.map((r) => [r.rank, r]));
  const visible = (rank) => {
    if (rank >= 4) return rank >= 11 - auto.shown;
    if (!byRank[rank]) return false;
    if (sus && rank === 4 - step) return false;
    return true;
  };
  // người đang được "rọi đèn"
  let spot = null;
  if (sus) spot = { pending: true, rank: 4 - step };
  else if (step > 0 && byRank[4 - step]) spot = { r: byRank[4 - step] };
  else if (!auto.done && auto.shown > 0) spot = { r: byRank[11 - auto.shown] };
  else if (auto.done) spot = { next: true };

  const maxRank = Math.max(...p.list.map((r) => r.rank), 3);
  const rows = [];
  for (let rank = 1; rank <= Math.min(10, Math.max(maxRank, 3)); rank++) {
    rows.push(visible(rank) && byRank[rank]
      ? `<div class="t10-row show">${personCard(byRank[rank])}</div>`
      : `<div class="t10-row"><div class="person empty"><div class="ps-rank">${rank}</div><div class="ps-info">?</div></div></div>`);
  }
  let spotHtml;
  if (!spot) spotHtml = `<div class="spot-wait">Chuẩn bị…</div>`;
  else if (spot.pending) spotHtml = `<div class="spot-pending"><div class="sp-rank">HẠNG ${spot.rank}</div><div class="drum">🥁</div></div>`;
  else if (spot.next) spotHtml = `<div class="spot-wait"><div class="sp-rank">TOP 3</div><div>sắp được công bố…</div></div>`;
  else spotHtml = `<div class="spot-person ${spot.r.rank <= 3 ? 'top3' : ''}" key="${spot.r.rank}">
      <div class="sp-rank">HẠNG ${spot.r.rank}</div>
      ${personCard(spot.r, true)}
    </div>`;
  return `
    <div class="v-top10">
      <div class="final-title">TOP 10 CÁ NHÂN XUẤT SẮC</div>
      <div class="t10-grid">
        <div class="t10-spot">${spotHtml}</div>
        <div class="t10-list">${rows.join('')}</div>
      </div>
    </div>`;
}

function finalBoard(p) {
  return `
    <div class="v-board">
      <div class="final-title">BẢNG TỔNG SẮP TOP 10</div>
      <table class="board">
        <thead><tr><th>Hạng</th><th>Họ tên</th><th>Đội</th><th>Số câu đúng</th><th>Điểm</th><th>Thời gian</th></tr></thead>
        <tbody>${p.list.map((r, i) => `
          <tr class="${r.rank <= 3 ? 'medal m' + r.rank : ''}" style="--d:${i * 0.08}s">
            <td class="rk">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
            <td class="nm">${esc(r.name)}</td>
            <td><span class="team-pill ${TEAM_CLASS[r.team_id]}">${esc(r.team_name)}</span></td>
            <td>${r.correct_count}</td>
            <td class="sc">${r.score}</td>
            <td>${fmtSec(r.time_ms)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function congrats(p) {
  const confetti = Array.from({ length: 70 }, (_, i) =>
    `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 4).toFixed(2)}s;--t:${(4 + Math.random() * 3).toFixed(2)}s;--c:${['#FBBA20', '#ffffff', '#3FD0C0', '#FF8A65'][i % 4]};--r:${Math.floor(Math.random() * 360)}deg"></i>`).join('');
  const order = [p.list[1], p.list[0], p.list[2]].filter(Boolean);
  return `
    <div class="v-congrats">
      <div class="confetti">${confetti}</div>
      <div class="final-title">CHÚC MỪNG</div>
      <div class="congrats-sub">3 cán bộ xuất sắc bước vào vòng thi <b>HÙNG BIỆN</b></div>
      <div class="congrats-row">${order.map((r) => `
        <div class="congrats-card rank-${r.rank} ${TEAM_CLASS[r.team_id]}">
          <div class="cc-medal">${['🥇', '🥈', '🥉'][r.rank - 1]}</div>
          <div class="cc-name">${esc(r.name)}</div>
          <div class="cc-team">${esc(r.team_name)}</div>
          <div class="cc-score">${r.score} điểm · ${fmtSec(r.time_ms)}</div>
        </div>`).join('')}
      </div>
    </div>`;
}

// ================= PHẦN 1 (Giới thiệu) & PHẦN 3 (Hùng biện) =================
const STAGE_TITLE = { intro: 'PHẦN 1 · GIỚI THIỆU ĐỘI THI', speech: 'PHẦN 3 · HÙNG BIỆN' };

function drawView(s, p) {
  const stage = p.stage;
  const entries = p.entries || [];
  const allDone = entries.length > 0 && entries.every((e) => isRevealed(e));
  const cards = entries.map((e) => {
    const rev = isRevealed(e);
    const drawing = isDrawing(e);
    const who = stage === 'intro'
      ? `<div class="dc-sub">Đội trưởng: ${e.captain_name ? esc(e.captain_name) : '<i>chưa chỉ định</i>'}</div>`
      : `<div class="dc-sub">${esc(e.team_name)}</div>`;
    return `
      <div class="draw-card ${TEAM_CLASS[e.team_id]} ${rev ? 'revealed' : drawing ? 'drawing' : ''}">
        <div class="dc-name">${esc(e.name)}</div>
        ${who}
        <div class="dc-slot"><span class="dc-num" data-spin="${drawing ? 1 : 0}">${rev ? e.order_no : drawing ? '1' : '?'}</span></div>
        <div class="dc-state">${rev ? `Thi lượt thứ ${e.order_no}` : drawing ? 'Đang bốc thăm…' : 'Chờ bốc thăm'}</div>
      </div>`;
  }).join('');
  const order = allDone
    ? `<div class="draw-order">${entries.slice().sort((a, b) => a.order_no - b.order_no)
      .map((e) => `<span class="${TEAM_CLASS[e.team_id]}"><b>${e.order_no}</b>${esc(e.name)}</span>`).join('<i>→</i>')}</div>`
    : `<div class="draw-hint">${stage === 'intro' ? 'Mời đội trưởng các đội bấm <b>BỐC THĂM</b> trên điện thoại' : 'Mời 3 thí sinh bấm <b>BỐC THĂM</b> trên điện thoại'}</div>`;
  return `
    <div class="v-draw">
      <div class="stage-eyebrow">${STAGE_TITLE[stage]}</div>
      <div class="final-title">BỐC THĂM THỨ TỰ THI</div>
      <div class="draw-grid">${cards}</div>
      ${order}
    </div>`;
}

function perfView(s, p) {
  const stage = p.stage;
  const t = perfTiming(p);
  const now = serverNow();
  let question = '';
  if (stage === 'speech') {
    if (!p.question) question = `<div class="sp-q waiting">Mời thí sinh bấm <b>BỐC THĂM CÂU HỎI</b> trên điện thoại<small>Còn ${p.questions_left} câu hỏi</small></div>`;
    else if (now < p.question_reveal_at) question = `<div class="sp-q drawing"><span class="dc-num" data-spin="6">1</span><small>Đang bốc thăm câu hỏi…</small></div>`;
    else question = `<div class="sp-q"><div class="sp-q-lbl">Câu hỏi số ${p.question.id}</div>${esc(p.question.text)}</div>`;
  }
  const label = {
    idle: stage === 'speech' ? 'Chuẩn bị' : 'Thời gian giới thiệu',
    prep: 'Thời gian chuẩn bị',
    prep_over: 'Hết giờ chuẩn bị',
    run: stage === 'speech' ? 'Thời gian trình bày' : 'Thời gian giới thiệu',
    over: 'QUÁ GIỜ',
    stopped: 'Kết thúc',
  }[t.mode];
  return `
    <div class="v-perf ${stage}">
      <div class="stage-eyebrow">${STAGE_TITLE[stage]} · Lượt ${p.order_no ?? '–'}/${p.total}</div>
      <div class="perf-who ${TEAM_CLASS[p.team_id]}">
        <div class="pw-name">${esc(p.name)}</div>
        ${stage === 'speech' ? `<div class="pw-team">${esc(p.team_name)}</div>` : ''}
      </div>
      ${question}
      <div class="perf-clock mode-${t.mode}" id="pclock">
        <div class="pc-label">${label}</div>
        <div class="pc-time" id="pc-time"></div>
        <div class="pc-bar"><div id="pc-bar"></div></div>
        <div class="pc-note" id="pc-note"></div>
      </div>
    </div>`;
}

function paintPerf(p) {
  const t = perfTiming(p);
  const time = root.querySelector('#pc-time');
  if (!time) return;
  const bar = root.querySelector('#pc-bar');
  const note = root.querySelector('#pc-note');
  const clock = root.querySelector('#pclock');
  if (t.mode === 'over' || t.mode === 'prep_over') time.textContent = '+' + fmtOver(t.overMs);
  else if (t.mode === 'stopped') time.textContent = fmtOver(t.elapsedMs);
  else time.textContent = fmtClock(t.remainingMs);
  bar.style.width = (t.mode === 'idle' ? 100 : (t.remainingMs / Math.max(1, t.totalMs)) * 100).toFixed(1) + '%';
  clock.classList.toggle('urgent', (t.mode === 'run' || t.mode === 'prep') && t.remainingMs <= 10000);
  if (t.mode === 'stopped') note.textContent = t.overMs > 0 ? `Quá giờ ${fmtOver(t.overMs)}` : 'Trong thời gian quy định';
  else if (t.mode === 'idle') {
    note.textContent = p.stage === 'speech'
      ? `Chuẩn bị ${fmtClock(p.prep_s * 1000)} · Trình bày ${fmtClock(p.duration_s * 1000)}`
      : `Tối đa ${fmtClock(p.duration_s * 1000)}`;
  } else if (t.mode === 'prep_over') note.textContent = 'Mời thí sinh bắt đầu trình bày';
  else note.textContent = '';
}

// Số quay khi đang bốc thăm
function spinNumbers(max) {
  root.querySelectorAll('.dc-num[data-spin]').forEach((el) => {
    const m = Number(el.dataset.spin);
    if (m) el.textContent = 1 + Math.floor(Math.random() * (m === 1 ? max : m));
  });
}

function teamAwardCard(t) {
  return `<div class="pc-name">${esc(t.name)}</div><div class="pc-score">${fmtScore(t.total)}</div><div class="pc-lbl">điểm</div>
    <div class="pc-break">Giới thiệu ${fmtScore(t.intro_avg)} + Kiến thức ${fmtScore(t.quiz_total)}</div>`;
}
function personAwardCard(r) {
  return `<div class="pc-name sm">${esc(r.name)}</div><div class="pc-team">${esc(r.team_name)}</div>
    <div class="pc-score">${fmtScore(r.total)}</div><div class="pc-lbl">điểm</div>
    <div class="pc-break">Kiến thức ${fmtScore(r.quiz_score)} + Hùng biện ${fmtScore(r.speech_avg)}</div>`;
}

// items sắp theo hạng giảm dần: [hạng 3, hạng 2, hạng 1]
function awardPodium(phase, step, items, title, cardFn) {
  const sus = suspenseActive(`${phase}:${step}`);
  const slot = (idx, rankNo) => {
    const it = items[idx];
    if (!it) return `<div class="podium-col rank-${rankNo}"></div>`;
    const revealed = idx < step && !(sus && idx === step - 1);
    const pending = sus && idx === step - 1;
    return `
      <div class="podium-col rank-${rankNo} ${revealed ? 'revealed ' + TEAM_CLASS[it.team_id ?? it.id] : ''} ${pending ? 'pending' : ''}">
        <div class="podium-card">${revealed ? cardFn(it) : `<div class="pc-q">?</div>`}</div>
        <div class="podium-base"><span>${rankNo === 1 ? '🏆 GIẢI NHẤT' : rankNo === 2 ? 'GIẢI NHÌ' : 'GIẢI BA'}</span></div>
      </div>`;
  };
  return `
    <div class="v-final award">
      <div class="stage-eyebrow">TRAO GIẢI</div>
      <div class="final-title">${title}</div>
      <div class="podium">${slot(1, 2)}${slot(2, 1)}${slot(0, 3)}</div>
    </div>`;
}

function awardSummary(p) {
  const medal = ['🥇', '🥈', '🥉'];
  const confetti = Array.from({ length: 60 }, (_, i) =>
    `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 4).toFixed(2)}s;--t:${(4 + Math.random() * 3).toFixed(2)}s;--c:${['#FBBA20', '#ffffff', '#3FD0C0', '#FF8A65'][i % 4]};--r:${Math.floor(Math.random() * 360)}deg"></i>`).join('');
  const row = (m, name, sub, total, tid) => `
    <div class="sum-row ${TEAM_CLASS[tid]}"><span class="sum-medal">${m}</span>
      <div class="sum-info"><div class="sum-name">${esc(name)}</div>${sub ? `<div class="sum-sub">${esc(sub)}</div>` : ''}</div>
      <b class="sum-total">${fmtScore(total)}</b></div>`;
  return `
    <div class="v-summary">
      <div class="confetti">${confetti}</div>
      <div class="final-title">KẾT QUẢ CHUNG CUỘC</div>
      <div class="sum-grid">
        <div class="sum-col"><div class="sec-title">Giải đồng đội</div>
          ${(p.teams || []).slice(0, 3).map((t, i) => row(medal[i], t.name, '', t.total, t.id)).join('')}</div>
        <div class="sum-col"><div class="sec-title">Giải cá nhân</div>
          ${(p.people || []).slice(0, 3).map((r, i) => row(medal[i], r.name, r.team_name, r.total, r.team_id)).join('')}</div>
      </div>
    </div>`;
}

// ---------------- Cập nhật theo thời gian + âm thanh ----------------
function tick() {
  const s = game.state;
  if (!s) return;
  if (keyFor(s) !== lastKey) { render(); return; }

  if (suspense && Date.now() >= suspense.until && suspense.fanfare) {
    suspense.fanfare = false;
    snd.playFanfare();
  }

  if (s.phase === 'options') {
    const t = optionsTiming(s.payload);
    LETTERS.forEach((L, i) => root.querySelector(`#vopt-${L}`)?.classList.toggle('show', i < t.revealed));
    if (t.revealed > snd_revealed) {
      if (snd_revealed >= 0 || t.revealed > 0) for (let i = Math.max(0, snd_revealed); i < t.revealed; i++) snd.playReveal(i);
      snd_revealed = t.revealed;
    }
    const timer = root.querySelector('#vtimer');
    const ring = root.querySelector('#ring');
    const num = root.querySelector('#tnum');
    if (timer) {
      timer.classList.toggle('active', t.stage !== 'reveal');
      timer.classList.toggle('urgent', t.stage === 'answering' && t.remainingMs <= 5000);
      timer.classList.toggle('ended', t.stage === 'ended');
      const C = 2 * Math.PI * 52;
      ring.style.strokeDasharray = C;
      ring.style.strokeDashoffset = t.stage === 'reveal' ? 0 : C * (1 - t.remainingMs / t.totalMs);
      num.textContent = t.stage === 'reveal' ? '' : t.stage === 'ended' ? 'HẾT GIỜ' : Math.ceil(t.remainingMs / 1000);
    }
    if (t.stage !== snd_stage) {
      if (snd_stage === 'reveal' && t.stage === 'answering') snd.playGo();
      if (snd_stage === 'answering' && t.stage === 'ended') snd.playTimeUp();
      snd_stage = t.stage;
    }
    if (t.stage === 'answering') {
      const sec = Math.ceil(t.remainingMs / 1000);
      if (sec !== snd_sec) {
        if (snd_sec !== -1 && sec > 0) snd.playTick(sec <= 5);
        snd_sec = sec;
      }
    }
    // tự chốt kết quả khi hết giờ
    if (t.stage === 'ended' && serverNow() > s.payload.countdown_end_at + 1000 && !finalizing && Date.now() - lastFinalizeTry > 2000) {
      finalizing = true;
      lastFinalizeTry = Date.now();
      rpc('host_action', { p_secret: secret, p_action: 'finalize', p_arg: 0 })
        .catch((err) => { if (!/SAI_BUOC/.test(err?.message)) toast(errText(err), 'error'); })
        .finally(() => { finalizing = false; });
    }
  }

  if (s.phase === 'intro_draw' || s.phase === 'speech_draw') {
    const entries = s.payload.entries || [];
    spinNumbers(entries.length || 3);
    const sig = entries.map((e) => (isRevealed(e) ? 'r' : isDrawing(e) ? 'd' : '-')).join('');
    if (sig !== snd_draw) {
      if (snd_draw) {
        entries.forEach((e, i) => {
          if (sig[i] === 'd' && snd_draw[i] === '-') snd.playDrumroll(Math.max(1, (e.reveal_at - serverNow()) / 1000));
          if (sig[i] === 'r' && snd_draw[i] !== 'r') snd.playCorrect();
        });
        if (!/[-d]/.test(sig) && /[-d]/.test(snd_draw)) setTimeout(() => snd.playFanfare(), 600);
      }
      snd_draw = sig;
    }
  }

  if (s.phase === 'intro_perf' || s.phase === 'speech_perf') {
    const p = s.payload;
    const t = perfTiming(p);
    paintPerf(p);
    if (p.question && serverNow() < p.question_reveal_at) spinNumbers(6);
    const qsig = p.question ? (serverNow() >= p.question_reveal_at ? 'Q' : 'q') : '';
    const cur = `${t.mode}|${qsig}`;
    if (cur !== snd_perf) {
      if (snd_perf) {
        const [pm, pq] = snd_perf.split('|');
        if ((t.mode === 'run' && pm !== 'run') || (t.mode === 'prep' && pm !== 'prep')) snd.playGo();
        if ((t.mode === 'over' && pm === 'run') || (t.mode === 'prep_over' && pm === 'prep')) snd.playTimeUp();
        if (qsig === 'q' && pq !== 'q') snd.playDrumroll(Math.max(1, (p.question_reveal_at - serverNow()) / 1000));
        if (qsig === 'Q' && pq === 'q') snd.playCorrect();
      }
      snd_perf = cur;
    }
    if (t.mode === 'run' || t.mode === 'prep') {
      const sec = Math.ceil(t.remainingMs / 1000);
      if (sec !== snd_perfSec) {
        if (snd_perfSec !== -1 && sec > 0 && sec <= 10) snd.playTick(sec <= 5);
        snd_perfSec = sec;
      }
    }
  }

  if (s.phase === 'final_top10') {
    const a = top10Auto(s.payload);
    if (a.shown !== snd_top10) {
      if (a.shown > 0 && !a.done) snd.playPop();
      snd_top10 = a.shown;
    }
  }
}
