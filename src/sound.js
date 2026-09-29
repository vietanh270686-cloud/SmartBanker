// Âm thanh tổng hợp bằng Web Audio — không cần file, không lo bản quyền.
// Chỉ phát trên màn View (laptop nối loa). Trình duyệt yêu cầu 1 lần bấm để bật âm thanh.
let ctx = null;
let master = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.9;
}
export const isMuted = () => muted;

function ready() {
  return ctx && !muted;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.3, attack = 0.005, release = null, slideTo = null } = {}) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + (release ?? dur) + 0.05);
}

function noise(start, dur, { vol = 0.2, filter = 1200, q = 0.7, type = 'bandpass', env = null } = {}) {
  const t = ctx.currentTime + start;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filter;
  f.Q.value = q;
  const g = ctx.createGain();
  if (env) env(g.gain, t, dur);
  else {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// Câu hỏi xuất hiện: "whoosh" + 2 nốt
export function playQuestion() {
  if (!ready()) return;
  noise(0, 0.5, {
    filter: 800, q: 0.9,
    env: (g, t, d) => { g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(0.25, t + d * 0.6); g.exponentialRampToValueAtTime(0.0001, t + d); },
  });
  tone(523, 0.35, 0.25, { type: 'triangle', vol: 0.25 });
  tone(784, 0.5, 0.45, { type: 'triangle', vol: 0.25 });
}

// Mỗi đáp án hiện ra
export function playReveal(i = 0) {
  if (!ready()) return;
  const base = [659, 740, 831, 880][i] || 660;
  tone(base, 0, 0.18, { type: 'sine', vol: 0.3 });
  tone(base * 2, 0.02, 0.12, { type: 'sine', vol: 0.08 });
}

// Bắt đầu đếm ngược
export function playGo() {
  if (!ready()) return;
  tone(880, 0, 0.12, { type: 'square', vol: 0.12 });
  tone(1320, 0.12, 0.3, { type: 'square', vol: 0.12 });
}

// Tiếng tích tắc mỗi giây (gấp hơn ở 5 giây cuối)
export function playTick(urgent = false) {
  if (!ready()) return;
  if (urgent) {
    tone(1000, 0, 0.08, { type: 'square', vol: 0.18 });
    tone(1500, 0.0, 0.05, { type: 'sine', vol: 0.12 });
  } else {
    noise(0, 0.05, { vol: 0.35, filter: 3000, q: 2 });
    tone(1800, 0, 0.03, { type: 'sine', vol: 0.06 });
  }
}

// Hết giờ
export function playTimeUp() {
  if (!ready()) return;
  tone(220, 0, 0.7, { type: 'sawtooth', vol: 0.18 });
  tone(233, 0, 0.7, { type: 'sawtooth', vol: 0.12 });
  tone(110, 0, 0.8, { type: 'square', vol: 0.08 });
}

// Công bố đáp án đúng
export function playCorrect() {
  if (!ready()) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, { type: 'triangle', vol: 0.22 }));
  tone(1568, 0.36, 0.8, { type: 'sine', vol: 0.1 });
}

// Trống cuộn (trước khi công bố)
export function playDrumroll(sec = 1.8) {
  if (!ready()) return;
  const hits = Math.floor(sec * 22);
  for (let i = 0; i < hits; i++) {
    const vol = 0.08 + 0.22 * (i / hits);
    noise(i / 22, 0.07, { vol, filter: 180 + Math.random() * 60, q: 1.2, type: 'lowpass' });
    noise(i / 22, 0.05, { vol: vol * 0.6, filter: 1800, q: 0.8 });
  }
  noise(sec, 0.5, { vol: 0.45, filter: 6000, q: 0.5, type: 'highpass' }); // cymbal
  tone(80, sec, 0.4, { type: 'sine', vol: 0.4, slideTo: 40 });
}

// Kèn chiến thắng
export function playFanfare() {
  if (!ready()) return;
  const notes = [
    [523, 0, 0.18], [523, 0.2, 0.12], [523, 0.34, 0.12], [698, 0.48, 0.7],
    [784, 1.2, 0.2], [698, 1.42, 0.2], [880, 1.64, 1.0],
  ];
  notes.forEach(([f, t, d]) => {
    tone(f, t, d, { type: 'sawtooth', vol: 0.12, attack: 0.02 });
    tone(f * 1.5, t, d, { type: 'triangle', vol: 0.07, attack: 0.02 });
  });
  tone(174, 0.48, 2.2, { type: 'triangle', vol: 0.15 });
}

// Xuất hiện 1 người trong top 10 (hạng 10 -> 4)
export function playPop() {
  if (!ready()) return;
  tone(392, 0, 0.15, { type: 'triangle', vol: 0.2, slideTo: 784 });
  tone(1175, 0.08, 0.3, { type: 'sine', vol: 0.1 });
}

// Chuyển phần / màn hình lớn
export function playStinger() {
  if (!ready()) return;
  noise(0, 0.9, {
    filter: 500, q: 0.6, type: 'lowpass',
    env: (g, t, d) => { g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(0.35, t + 0.4); g.exponentialRampToValueAtTime(0.0001, t + d); },
  });
  [392, 494, 587].forEach((f) => tone(f, 0.4, 1.2, { type: 'sawtooth', vol: 0.08, attack: 0.05 }));
  tone(98, 0.4, 1.3, { type: 'sine', vol: 0.35 });
}
