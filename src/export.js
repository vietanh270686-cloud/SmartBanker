import { rpc, errText, toast } from './lib.js';

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Không tải được thư viện Excel (kiểm tra mạng).'));
    document.head.appendChild(s);
  });
}

const sec = (ms) => Math.round(Number(ms || 0)) / 1000;

export async function exportExcel(secret) {
  try {
    toast('Đang chuẩn bị file Excel…');
    const [XLSX, data] = await Promise.all([loadSheetJS(), rpc('host_export', { p_secret: secret })]);
    const wb = XLSX.utils.book_new();

    // 1. Xếp hạng cá nhân
    const lb = data.leaderboard.map((r) => ({
      'Hạng': r.rank, 'Mã CB': r.code, 'Họ tên': r.name, 'Đội': r.team_name,
      'Tổng điểm': r.score, 'Số câu đúng': r.correct_count, 'Tổng thời gian câu đúng (giây)': sec(r.time_ms),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lb), 'Xếp hạng cá nhân');

    // 2. Điểm đội (tổng + từng câu)
    const teamRows = data.teams
      .slice()
      .sort((a, b) => b.total - a.total)
      .map((t, i) => ({ 'Hạng': i + 1, 'Đội': t.name, 'Tổng điểm (cộng dồn điểm TB)': Number(t.total) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamRows), 'Điểm đội');

    // 3. Kết quả từng câu
    const qMap = Object.fromEntries(data.questions.map((q) => [q.q_no, q]));
    const perQ = data.runs.map(({ q_no, result }) => {
      const row = {
        'Câu': q_no, 'Phần': qMap[q_no]?.part_no, 'Câu hỏi': qMap[q_no]?.text, 'Đáp án đúng': result.correct,
        'Chọn A': result.counts.A, 'Chọn B': result.counts.B, 'Chọn C': result.counts.C, 'Chọn D': result.counts.D,
      };
      result.teams.forEach((t) => {
        row[`${t.name} - online`] = t.online;
        row[`${t.name} - đúng`] = t.correct;
        row[`${t.name} - sai`] = t.wrong;
        row[`${t.name} - không TL`] = t.none;
        row[`${t.name} - điểm TB`] = Number(t.avg);
      });
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perQ), 'Kết quả từng câu');

    // 4. Chi tiết: mỗi cán bộ 1 dòng, mỗi câu 1 cột
    const byPlayer = {};
    data.answers.forEach((a) => ((byPlayer[a.code] ||= {})[a.q_no] = a));
    const detail = data.leaderboard.map((r) => {
      const row = { 'Hạng': r.rank, 'Mã CB': r.code, 'Họ tên': r.name, 'Đội': r.team_name, 'Tổng điểm': r.score };
      data.questions.forEach((q) => {
        const a = byPlayer[r.code]?.[q.q_no];
        row[`Câu ${q.q_no}`] = a ? `${a.choice} ${a.is_correct === true ? '✓' : a.is_correct === false ? '✗' : ''} ${sec(a.response_ms)}s`.replace('  ', ' ') : '';
      });
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Chi tiết trả lời');

    const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
    XLSX.writeFile(wb, `SmartBanker_ket-qua_${stamp}.xlsx`);
    toast('Đã xuất file Excel', 'ok');
  } catch (err) {
    toast(errText(err), 'error');
  }
}
