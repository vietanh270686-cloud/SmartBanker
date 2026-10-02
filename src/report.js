// Biên bản tổng hợp cuộc thi — mở trang A4 (in / lưu PDF / tải Word)
import { rpc, supabase, errText, toast, loadParts } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v, d = 3) => {
  if (v === null || v === undefined || v === '') return '–';
  const x = Math.round(Number(v) * 10 ** d) / 10 ** d;
  return String(x).replace('.', ',');
};
const secs = (ms) => (ms == null ? '–' : num(ms / 1000, 2) + 's');
const mmss = (ms) => {
  if (ms == null) return '–';
  const t = Math.round(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const PRIZE = ['Giải Nhất', 'Giải Nhì', 'Giải Ba'];

// Phải gọi đồng bộ trong sự kiện click (trước mọi await) để trình duyệt không chặn cửa sổ mới
export function openReport(secret) {
  const win = window.open('', '_blank');
  if (!win) { toast('Trình duyệt chặn cửa sổ mới — hãy cho phép pop-up', 'error'); return; }
  win.document.write('<p style="font-family:sans-serif;padding:24px">Đang tổng hợp số liệu…</p>');
  build(secret)
    .then((html) => { win.document.open(); win.document.write(html); win.document.close(); })
    .catch((err) => { win.close(); toast(errText(err), 'error'); });
}

async function build(secret) {
  const [data, teamsRes, parts] = await Promise.all([
    rpc('host_export', { p_secret: secret }),
    supabase.from('teams').select('*').order('id'),
    loadParts(),
  ]);
  const teams = teamsRes.data || [];
  const lb = data.leaderboard;
  const byCode = Object.fromEntries(lb.map((p) => [p.code, p]));
  const qPart = Object.fromEntries(data.questions.map((q) => [q.q_no, q.part_no]));
  const partNos = Object.keys(parts).map(Number).sort((a, b) => a - b);
  const perf = Object.fromEntries((data.performances || []).map((x) => [`${x.stage}:${x.target}`, x]));
  const cfg = data.config || { intro_seconds: 90, speech_seconds: 180 };

  // --- Số lượng thành viên ---
  const answered = new Set(data.answers.map((a) => a.code));
  const members = teams.map((t) => {
    const list = lb.filter((p) => p.team_id === t.id);
    return {
      ...t, registered: list.length, joined: list.filter((p) => answered.has(p.code)).length,
      captain: t.captain_code ? byCode[t.captain_code]?.name : '',
    };
  });

  // --- Điểm đội theo vòng (tổng điểm TB từng câu) ---
  const teamRound = {};
  data.runs.forEach(({ q_no, result }) => {
    result.teams.forEach((t) => {
      const k = `${t.id}:${qPart[q_no]}`;
      teamRound[k] = (teamRound[k] || 0) + Number(t.avg);
    });
  });
  // --- Điểm cá nhân theo vòng ---
  const personRound = {};
  data.answers.forEach((a) => {
    const k = `${a.code}:${qPart[a.q_no]}`;
    personRound[k] = (personRound[k] || 0) + Number(a.points || 0);
  });

  const timing = (key, limitS) => {
    const x = perf[key];
    if (!x?.started_at || !x?.stopped_at) return { t: '–', over: '–' };
    const el = x.stopped_at - x.started_at;
    const over = el - limitS * 1000;
    return { t: mmss(el), over: over > 0 ? mmss(over) : 'Không' };
  };

  const ft = data.final_teams || [];
  const fi = data.final_individuals || [];
  const totalReg = members.reduce((a, m) => a + m.registered, 0);
  const totalJoin = members.reduce((a, m) => a + m.joined, 0);
  const now = new Date(Date.now() + 7 * 3600e3);
  const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} ngày ${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;

  const sec1 = `
    <table>
      <tr><th>STT</th><th>Đội thi</th><th>Đội trưởng</th><th>Số thành viên đăng ký</th><th>Số thành viên tham gia thi</th></tr>
      ${members.map((m, i) => `<tr><td class="c">${i + 1}</td><td>${esc(m.name)}</td><td>${esc(m.captain || '–')}</td><td class="c">${m.registered}</td><td class="c">${m.joined}</td></tr>`).join('')}
      <tr class="sum"><td></td><td colspan="2"><b>Tổng cộng</b></td><td class="c"><b>${totalReg}</b></td><td class="c"><b>${totalJoin}</b></td></tr>
    </table>
    <p class="note">(*) "Tham gia thi": thành viên có trả lời ít nhất 1 câu hỏi ở Phần 2.</p>`;

  const sec2a = `
    <p><b>a) Phần 1 – Giới thiệu đội thi</b> (thang điểm 40; thời gian tối đa ${mmss(cfg.intro_seconds * 1000)})</p>
    <table>
      <tr><th>Đội thi</th><th>GK 1</th><th>GK 2</th><th>GK 3</th><th>GK 4</th><th>Điểm TB</th><th>Thời gian</th><th>Quá giờ</th></tr>
      ${ft.slice().sort((a, b) => a.id - b.id).map((t) => {
        const tm = timing(`intro:${t.id}`, cfg.intro_seconds);
        return `<tr><td>${esc(t.name)}</td>${[0, 1, 2, 3].map((j) => `<td class="c">${num(t.intro_scores?.[j])}</td>`).join('')}
          <td class="c"><b>${num(t.intro_avg)}</b></td><td class="c">${tm.t}</td><td class="c">${tm.over}</td></tr>`;
      }).join('')}
    </table>
    <p class="note">Điểm TB = trung bình cộng điểm các giám khảo đã chấm.</p>`;

  const sec2b = `
    <p><b>b) Phần 2 – Thi kiến thức</b> (điểm đội mỗi câu = tổng điểm thành viên ÷ số thành viên online; cộng dồn qua các câu)</p>
    <table>
      <tr><th>Đội thi</th>${partNos.map((n) => `<th>Vòng ${n}<br><small>${esc(parts[n].name)}</small></th>`).join('')}<th>Tổng Phần 2</th></tr>
      ${ft.slice().sort((a, b) => a.id - b.id).map((t) => `<tr><td>${esc(t.name)}</td>
        ${partNos.map((n) => `<td class="c">${num(teamRound[`${t.id}:${n}`] || 0, 2)}</td>`).join('')}
        <td class="c"><b>${num(t.quiz_total, 2)}</b></td></tr>`).join('')}
    </table>`;

  const sec2c = `
    <p><b>c) Tổng hợp & xếp giải đồng đội</b> (Tổng = Phần 1 + Phần 2)</p>
    <table>
      <tr><th>Xếp hạng</th><th>Đội thi</th><th>Phần 1</th><th>Phần 2</th><th>Tổng điểm</th><th>Giải thưởng</th></tr>
      ${ft.map((t) => `<tr><td class="c">${t.rank}</td><td>${esc(t.name)}</td><td class="c">${num(t.intro_avg)}</td>
        <td class="c">${num(t.quiz_total, 2)}</td><td class="c"><b>${num(t.total)}</b></td><td class="c"><b>${PRIZE[t.rank - 1] || ''}</b></td></tr>`).join('')}
    </table>`;

  const sec3 = fi.length ? `
    <p><b>a) Phần 2 – Thi kiến thức</b> (10 điểm/câu đúng)</p>
    <table>
      <tr><th>Họ và tên</th><th>Mã CB</th><th>Đội</th>${partNos.map((n) => `<th>Vòng ${n}</th>`).join('')}<th>Số câu đúng</th><th>Thời gian câu đúng</th><th>Tổng Phần 2</th><th>Hạng P2</th></tr>
      ${fi.slice().sort((a, b) => a.quiz_rank - b.quiz_rank).map((r) => {
        const p = byCode[r.code] || {};
        return `<tr><td>${esc(r.name)}</td><td class="c">${esc(r.code)}</td><td>${esc(r.team_name)}</td>
          ${partNos.map((n) => `<td class="c">${num(personRound[`${r.code}:${n}`] || 0)}</td>`).join('')}
          <td class="c">${p.correct_count ?? '–'}</td><td class="c">${secs(r.time_ms)}</td><td class="c"><b>${num(r.quiz_score)}</b></td><td class="c">${r.quiz_rank}</td></tr>`;
      }).join('')}
    </table>
    <p><b>b) Phần 3 – Hùng biện</b> (thang điểm 40; chuẩn bị ${mmss(cfg.speech_prep_seconds ? cfg.speech_prep_seconds * 1000 : 120000)}, trình bày tối đa ${mmss(cfg.speech_seconds * 1000)})</p>
    <table>
      <tr><th>Thứ tự</th><th>Họ và tên</th><th>Câu hỏi bốc thăm</th><th>GK 1</th><th>GK 2</th><th>GK 3</th><th>GK 4</th><th>Điểm TB</th><th>Thời gian</th><th>Quá giờ</th></tr>
      ${fi.slice().sort((a, b) => (a.order_no ?? 9) - (b.order_no ?? 9)).map((r) => {
        const tm = timing(`speech:${r.code}`, cfg.speech_seconds);
        return `<tr><td class="c">${r.order_no ?? '–'}</td><td>${esc(r.name)}</td><td class="q">${esc(r.question || '–')}</td>
          ${[0, 1, 2, 3].map((j) => `<td class="c">${num(r.speech_scores?.[j])}</td>`).join('')}
          <td class="c"><b>${num(r.speech_avg)}</b></td><td class="c">${tm.t}</td><td class="c">${tm.over}</td></tr>`;
      }).join('')}
    </table>
    <p><b>c) Tổng hợp & xếp giải cá nhân</b> (Tổng = Phần 2 + Phần 3)</p>
    <table>
      <tr><th>Xếp hạng</th><th>Họ và tên</th><th>Đội</th><th>Phần 2</th><th>Phần 3</th><th>Tổng điểm</th><th>Giải thưởng</th></tr>
      ${fi.map((r) => `<tr><td class="c">${r.rank}</td><td>${esc(r.name)}</td><td>${esc(r.team_name)}</td><td class="c">${num(r.quiz_score)}</td>
        <td class="c">${num(r.speech_avg)}</td><td class="c"><b>${num(r.total)}</b></td><td class="c"><b>${PRIZE[r.rank - 1] || ''}</b></td></tr>`).join('')}
    </table>` : '<p><i>Chưa có dữ liệu Phần 3 – Hùng biện.</i></p>';

  const top10 = `
    <table>
      <tr><th>Hạng</th><th>Họ và tên</th><th>Mã CB</th><th>Đội</th><th>Số câu đúng</th><th>Điểm</th><th>Thời gian câu đúng</th></tr>
      ${lb.slice(0, 10).map((r) => `<tr><td class="c">${r.rank}</td><td>${esc(r.name)}</td><td class="c">${esc(r.code)}</td><td>${esc(r.team_name)}</td>
        <td class="c">${r.correct_count}</td><td class="c">${r.score}</td><td class="c">${secs(r.time_ms)}</td></tr>`).join('')}
    </table>`;

  const body = `
  <div class="page">
    <table class="hdr"><tr>
      <td><b>NGÂN HÀNG TMCP ĐẦU TƯ VÀ<br>PHÁT TRIỂN VIỆT NAM</b><br><b><u>CHI NHÁNH TRÀNG TIỀN – HÀ NỘI</u></b></td>
      <td><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b><u>Độc lập – Tự do – Hạnh phúc</u></b><br><i>Hà Nội, ngày 03 tháng 10 năm 2026</i></td>
    </tr></table>

    <h1>BIÊN BẢN TỔNG HỢP KẾT QUẢ<br>CUỘC THI KIẾN THỨC "SMARTBANKER" NĂM 2026</h1>

    <p>Thời gian: ngày 03/10/2026. Địa điểm: ……………………………………………………………</p>
    <p>Ban giám khảo: Giám khảo 1: ………………………… Giám khảo 2: …………………………<br>
       Giám khảo 3: ………………………… Giám khảo 4: …………………………</p>
    <p>Thư ký: ……………………………………</p>
    <p class="j">Cuộc thi gồm 03 phần: <b>Phần 1 – Giới thiệu đội thi</b>; <b>Phần 2 – Thi kiến thức</b> (${partNos.length} vòng: ${partNos.map((n) => `Vòng ${n} "${esc(parts[n].name)}"`).join(', ')}; ${data.questions.length} câu hỏi); <b>Phần 3 – Hùng biện</b> dành cho 03 cá nhân có kết quả Phần 2 cao nhất.</p>

    <h2>I. SỐ LƯỢNG THÀNH VIÊN THAM GIA</h2>
    ${sec1}

    <h2>II. KẾT QUẢ ĐỒNG ĐỘI</h2>
    ${sec2a}${sec2b}${sec2c}

    <h2>III. KẾT QUẢ CÁ NHÂN (03 THÍ SINH THI HÙNG BIỆN)</h2>
    ${sec3}

    <h2>IV. TOP 10 CÁ NHÂN PHẦN 2 – THI KIẾN THỨC</h2>
    ${top10}

    <p class="j">Biên bản được lập lúc ${stamp} trên cơ sở số liệu ghi nhận tại hệ thống thi SmartBanker và điểm chấm của Ban giám khảo do Thư ký cập nhật.</p>

    <table class="sign"><tr>
      <td><b>THƯ KÝ</b><br><i>(Ký, ghi rõ họ tên)</i></td>
      <td><b>TRƯỞNG BAN GIÁM KHẢO</b><br><i>(Ký, ghi rõ họ tên)</i></td>
      <td><b>TRƯỞNG BAN TỔ CHỨC</b><br><i>(Ký, ghi rõ họ tên)</i></td>
    </tr></table>
  </div>`;

  const css = `
    body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; color: #000; margin: 0; background: #e9eeed; }
    .page { background: #fff; width: 210mm; min-height: 297mm; margin: 12px auto; padding: 18mm 16mm; box-sizing: border-box; }
    h1 { text-align: center; font-size: 15pt; margin: 18px 0 14px; }
    h2 { font-size: 13pt; margin: 18px 0 6px; }
    p { margin: 6px 0; line-height: 1.4; }
    p.j { text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 8px; }
    th, td { border: 1px solid #000; padding: 4px 5px; font-size: 11.5pt; vertical-align: middle; }
    th { background: #eef4f3; font-weight: bold; text-align: center; }
    th small { font-weight: normal; font-size: 9.5pt; }
    td.c { text-align: center; }
    td.q { font-size: 10.5pt; }
    tr.sum td { background: #f6f6f6; }
    .note { font-size: 10.5pt; font-style: italic; margin-top: 0; }
    table.hdr td, table.sign td { border: 0; text-align: center; vertical-align: top; font-size: 12pt; }
    table.hdr td:first-child { width: 42%; } table.hdr td:last-child { width: 58%; white-space: nowrap; }
    table.sign { margin-top: 26px; }
    table.sign td { width: 33%; height: 120px; }
    .bar { position: sticky; top: 0; background: #066e69; padding: 10px; text-align: center; z-index: 2; }
    .bar button { font: 600 14px system-ui, sans-serif; margin: 0 6px; padding: 9px 16px; border: 0; border-radius: 8px; cursor: pointer; }
    .bar .p { background: #fbba20; color: #022e2b; } .bar .w { background: #fff; color: #066e69; }
    @page { size: A4; margin: 14mm 12mm; }
    @media print { body { background: #fff; } .bar { display: none; } .page { width: auto; min-height: 0; margin: 0; padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }`;

  const title = 'Bien-ban-tong-hop-SmartBanker-2026';
  const script = `
    function dl() {
      var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>'
        + document.getElementById('st').textContent + '</style></head><body>' + document.querySelector('.page').outerHTML + '</body></html>';
      var blob = new Blob(['\\ufeff', html], { type: 'application/msword' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '${title}.doc'; a.click();
    }`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title><style id="st">${css}</style></head>
    <body><div class="bar"><button class="p" onclick="print()">🖨 In / Lưu PDF</button><button class="w" onclick="dl()">⬇ Tải file Word</button></div>
    ${body}<script>${script}</script></body></html>`;
}
