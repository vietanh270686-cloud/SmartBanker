import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rytyeinzptsijkthgnez.supabase.co';
// anon key là khoá công khai (chạy trên trình duyệt) — dữ liệu được bảo vệ bằng RLS + RPC
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5dHllaW56cHRzaWprdGhnbmV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODYzNjgsImV4cCI6MjEwNjI2MjM2OH0.cIiSdDUn6uPYkrebi11yVlhOhrOGrwYKqWgIUXg4Buo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 20 } },
});

export const BASE_URL = new URL(import.meta.env.BASE_URL, location.origin).href;

// ---------------- Lỗi ----------------
const ERROR_TEXT = {
  KHONG_CO_MA: 'Không tìm thấy mã cán bộ này.',
  SAI_MAT_KHAU: 'Sai tài khoản hoặc mật khẩu.',
  DA_DANG_NHAP_MAY_KHAC: 'Mã cán bộ này đang đăng nhập trên máy khác. Hãy đăng xuất ở máy kia hoặc nhờ MC mở khoá.',
  PHIEN_HET_HAN: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  KHONG_NHAN_DAP_AN: 'Câu hỏi này đã đóng.',
  CHUA_BAT_DAU: 'Chưa đến giờ trả lời.',
  HET_GIO: 'Đã hết giờ trả lời.',
  KHONG_CO_QUYEN: 'Tài khoản không có quyền thực hiện thao tác này.',
  SAI_BUOC: 'Thao tác không hợp lệ ở bước hiện tại.',
  CHUA_HET_GIO: 'Chưa hết giờ trả lời.',
  KHONG_PHAI_DOI_TRUONG: 'Bạn không phải đội trưởng — chỉ đội trưởng được bốc thăm.',
  KHONG_DUOC_BOC: 'Bạn không thuộc danh sách bốc thăm.',
  CHUA_DEN_LUOT: 'Chưa đến lượt của bạn.',
  CHUA_MO_BOC_THAM: 'MC chưa mở bốc thăm.',
  HET_CAU_HOI: 'Đã hết câu hỏi để bốc.',
  DA_CONG_BO: 'Đã công bố kết quả — không sửa điểm được nữa.',
  KHONG_CO_LUOT: 'Không tìm thấy lượt thi này.',
};

export function errText(err) {
  const msg = err?.message || String(err);
  for (const k of Object.keys(ERROR_TEXT)) if (msg.includes(k)) return ERROR_TEXT[k];
  if (/fetch|network|Failed/i.test(msg)) return 'Mất kết nối mạng, đang thử lại…';
  return msg;
}

export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// ---------------- Đồng hồ theo giờ máy chủ ----------------
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

export async function syncClock() {
  let best = null;
  for (let i = 0; i < 4; i++) {
    try {
      const t0 = Date.now();
      const s = Number(await rpc('server_time'));
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: s - (t0 + t1) / 2 };
    } catch { /* thử lại lần sau */ }
  }
  if (best) clockOffset = best.offset;
}

export function startClockSync() {
  syncClock();
  setInterval(syncClock, 60_000);
}

// ---------------- Trạng thái game (realtime + polling dự phòng) ----------------
const listeners = new Set();
export const game = { state: null };

function applyState(s) {
  if (!s) return;
  if (game.state && s.version < game.state.version) return;
  if (game.state && s.version === game.state.version) return;
  game.state = s;
  listeners.forEach((fn) => fn(s));
}

export async function fetchState() {
  const { data, error } = await supabase.from('game_state').select('*').eq('id', 1).single();
  if (!error) applyState(data);
  return game.state;
}

export function onState(fn) {
  listeners.add(fn);
  if (game.state) fn(game.state);
  return () => listeners.delete(fn);
}

// Người chơi truyền pollMs = 0 (dùng heartbeat trả về version); host/view poll định kỳ
export function startStateSync({ pollMs = 3000 } = {}) {
  fetchState();
  supabase
    .channel('game_state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, (p) => applyState(p.new))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') fetchState();
    });
  if (pollMs) setInterval(fetchState, pollMs);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { fetchState(); syncClock(); }
  });
  window.addEventListener('online', () => { fetchState(); syncClock(); });
}

export function notifyVersion(v) {
  if (!game.state || v > game.state.version) fetchState();
}

// ---------------- Lệnh điều khiển MC -> màn chiếu (vd dừng nhạc) ----------------
let controlCh = null;
export function controlChannel(onMessage) {
  if (!controlCh) {
    controlCh = supabase.channel('sb-control', { config: { broadcast: { self: false, ack: true } } });
    if (onMessage) controlCh.on('broadcast', { event: 'control' }, ({ payload }) => onMessage(payload));
    controlCh.subscribe();
  }
  return controlCh;
}
export async function sendControl(action) {
  const ch = controlChannel();
  const res = await ch.send({ type: 'broadcast', event: 'control', payload: { action, at: Date.now() } });
  if (res !== 'ok') throw new Error('Chưa gửi được lệnh tới màn chiếu (' + res + ')');
}

// ---------------- Phần thi (tên + chủ đề) ----------------
export const parts = {};
export async function loadParts() {
  const { data } = await supabase.from('parts').select('*').order('part_no');
  (data || []).forEach((p) => (parts[p.part_no] = p));
  return parts;
}
export const partTopic = (no) => parts[no]?.topic || '';

// ---------------- Tính trạng thái con theo thời gian ----------------
// Pha 'options': đang hiện dần đáp án -> đang đếm ngược -> hết giờ
export function optionsTiming(payload, now = serverNow()) {
  const start = payload.options_at;
  const durs = payload.durations_ms || [3000, 3000, 3000, 3000];
  let revealed = 0;
  let acc = start;
  for (let i = 0; i < 4; i++) {
    if (now >= acc) revealed = i + 1;
    acc += durs[i];
  }
  const cs = payload.countdown_start_at;
  const ce = payload.countdown_end_at;
  let stage = 'reveal';
  if (now >= ce) stage = 'ended';
  else if (now >= cs) stage = 'answering';
  const remainingMs = Math.max(0, ce - Math.max(now, cs));
  const totalMs = ce - cs;
  return { revealed: now < start ? 0 : revealed, stage, remainingMs, totalMs };
}

// Pha 'intro_perf' / 'speech_perf': đồng hồ đếm ngược + đếm quá giờ
// mode: idle | prep | prep_over | run | over | stopped
export function perfTiming(p, now = serverNow()) {
  const dur = (p.duration_s || 0) * 1000;
  if (p.started_at) {
    const end = p.stopped_at || now;
    const elapsed = Math.max(0, end - p.started_at);
    return {
      mode: p.stopped_at ? 'stopped' : elapsed > dur ? 'over' : 'run',
      remainingMs: Math.max(0, dur - elapsed), overMs: Math.max(0, elapsed - dur), totalMs: dur, elapsedMs: elapsed,
    };
  }
  if (p.prep_started_at) {
    const pd = (p.prep_s || 0) * 1000;
    const elapsed = Math.max(0, now - p.prep_started_at);
    return { mode: elapsed > pd ? 'prep_over' : 'prep', remainingMs: Math.max(0, pd - elapsed), overMs: Math.max(0, elapsed - pd), totalMs: pd, elapsedMs: elapsed };
  }
  return { mode: 'idle', remainingMs: dur, overMs: 0, totalMs: dur, elapsedMs: 0 };
}

export function fmtClock(ms) {
  const t = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
export function fmtOver(ms) {
  const t = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Bốc thăm: mục nào đã bốc và đã qua thời gian "quay số"
export const isRevealed = (e, now = serverNow()) => e.order_no != null && e.reveal_at != null && now >= e.reveal_at;
export const isDrawing = (e, now = serverNow()) => e.order_no != null && e.reveal_at != null && now < e.reveal_at;

export const TOP10_STEP_MS = 3000;
// Pha 'final_top10': hạng 10 -> 4 tự chạy, mỗi người 3s
export function top10Auto(payload, now = serverNow()) {
  const elapsed = now - payload.auto_start_at;
  if (elapsed < 0) return { shown: 0, done: false };
  const shown = Math.min(7, Math.floor(elapsed / TOP10_STEP_MS) + 1);
  return { shown, done: elapsed >= 7 * TOP10_STEP_MS };
}

// ---------------- Tiện ích ----------------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const fmtSec = (ms) => (Number(ms || 0) / 1000).toFixed(2).replace('.', ',') + 's';
// Tối đa 3 chữ số thập phân, bỏ số 0 thừa (36,625 · 7,33 · 40)
export const fmtScore = (n) => {
  const v = Math.round(Number(n || 0) * 1000) / 1000;
  return String(v).replace('.', ',');
};

export const LETTERS = ['A', 'B', 'C', 'D'];
export const TEAM_CLASS = { 1: 't1', 2: 't2', 3: 't3' };

// dark = true: logo chữ trắng cho nền tối (màn chiếu, header MC); false: logo màu cho nền sáng
export function logoHtml(cls = '', dark = false) {
  const file = dark ? 'logo-white.png' : 'logo-color.png';
  return `<img class="logo ${cls}" src="${import.meta.env.BASE_URL}${file}" alt="BIDV" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo-fallback ${cls}',textContent:'BIDV'}))">`;
}

export function deviceId() {
  let id = localStorage.getItem('sb_device');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem('sb_device', id);
  }
  return id;
}

// ---------------- Hộp xác nhận Có/Không ----------------
export function confirmBox(message, { yes = 'Có', no = 'Không', danger = false } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-msg">${message}</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-r="0">${esc(no)}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(yes)}</button>
          </div>
        </div>
      </div>`;
    root.querySelectorAll('[data-r]').forEach((b) =>
      b.addEventListener('click', () => {
        root.innerHTML = '';
        resolve(b.dataset.r === '1');
      }),
    );
  });
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3500);
}
