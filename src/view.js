import QRCode from 'qrcode';
import {
  rpc, errText, esc, fmtSec, fmtScore, LETTERS, TEAM_CLASS, logoHtml, BASE_URL, toast,
  game, onState, startStateSync, optionsTiming, top10Auto, serverNow,
} from './lib.js';
import * as snd from './sound.js';
import { exportExcel } from './export.js';

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
      ${logoHtml('logo-lg')}
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
      ${logoHtml('logo-lg')}
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
        <div class="v-brand">${logoHtml('logo-md')}<div class="brand-title">Smart<span>Banker</span></div></div>
        <div class="v-online" id="online"></div>
        <div class="v-tools">
          <button class="icon-btn" id="mute" title="Tắt/bật âm thanh">🔊</button>
          <button class="icon-btn" id="fs" title="Toàn màn hình">⛶</button>
          <button class="icon-btn" id="xls" title="Xuất Excel">⬇</button>
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
  return k;
}

function render() {
  const s = game.state;
  const stage = root.querySelector('#stage');
  if (!stage) return;
  if (s?.phase === 'final_teams' || s?.phase === 'final_top10') trackStep(s.phase, s.payload.step ?? 0);
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
  snd_revealed = -1; snd_stage = ''; snd_sec = -1; snd_top10 = -1;
  finalizing = false;
  switch (s.phase) {
    case 'question': snd.playQuestion(); break;
    case 'result': snd.playCorrect(); break;
    case 'part_intro': case 'part_end': snd.playStinger(); break;
    case 'final_teams': case 'final_top10': snd.playStinger(); break;
    case 'final_board': case 'final_congrats': snd.playFanfare(); break;
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
        <div class="lobby-steps">
          <div><b>1</b> Quét mã QR bằng điện thoại</div>
          <div><b>2</b> Nhập mã cán bộ và mật khẩu</div>
          <div><b>3</b> Chờ MC bắt đầu phần thi</div>
        </div>
        <div class="lobby-online" id="lobby-online">${lobbyOnline()}</div>
      </div>
      <div class="lobby-right">
        <div class="qr-card"><img src="${qrDataUrl}" alt="QR"><div class="qr-url">${esc(BASE_URL.replace(/^https?:\/\//, ''))}</div></div>
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
      <div class="part-num">PHẦN ${s.part_no}</div>
      <div class="part-name">${esc(p.part_name)}</div>
      <div class="part-meta">${p.q_count} câu hỏi</div>
      ${hasScore ? `<div class="part-totals"><div class="sec-title">Điểm các đội hiện tại</div>${totalsBars(p.totals)}</div>` : ''}
    </div>`;
}

function qBadge(s, p) {
  return `<div class="q-badge"><span>Phần ${s.part_no} · ${esc(p.part_name)}</span><b>Câu ${p.idx}/${p.q_count}</b></div>`;
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
      <div class="part-num sm">KẾT THÚC PHẦN ${s.part_no}</div>
      <div class="part-name">${esc(p.part_name)}</div>
      <div class="part-totals wide"><div class="sec-title">Bảng điểm đồng đội</div>${totalsBars(p.totals)}</div>
      <div class="part-meta">${p.next_part ? `Tiếp theo: Phần ${p.next_part} — ${esc(p.next_part_name)}` : 'Chuẩn bị công bố kết quả chung cuộc!'}</div>
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

  if (s.phase === 'final_top10') {
    const a = top10Auto(s.payload);
    if (a.shown !== snd_top10) {
      if (a.shown > 0 && !a.done) snd.playPop();
      snd_top10 = a.shown;
    }
  }
}
