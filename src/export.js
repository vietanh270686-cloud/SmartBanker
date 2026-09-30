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
    const perf = Object.fromEntries((data.performances || []).map((x) => [`${x.stage}:${x.target}`, x]));
    const timing = (key, limitS) => {
      const x = perf[key];
      if (!x?.started_at || !x?.stopped_at) return { t: '', over: '' };
      const el = (x.stopped_at - x.started_at) / 1000;
      return { t: Math.round(el), over: Math.max(0, Math.round(el - limitS)) };
    };

    // 0a. Kết quả chung cuộc đội = Phần 1 (TB 4 GK) + Phần 2 (quiz)
    const ft = (data.final_teams || []).map((t) => {
      const tm = timing(`intro:${t.id}`, data.config?.intro_seconds || 90);
      return {
        'Hạng': t.rank, 'Đội': t.name,
        'P1 - GK1': t.intro_scores?.[0] ?? '', 'P1 - GK2': t.intro_scores?.[1] ?? '', 'P1 - GK3': t.intro_scores?.[2] ?? '', 'P1 - GK4': t.intro_scores?.[3] ?? '',
        'Phần 1 - Giới thiệu (TB GK)': Number(t.intro_avg),
        'P1 - Thời gian (giây)': tm.t, 'P1 - Quá giờ (giây)': tm.over,
        'Phần 2 - Kiến thức (tổng điểm TB)': Number(t.quiz_total),
        'TỔNG ĐIỂM ĐỘI': Number(t.total),
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ft), 'Chung cuộc - Đội');

    // 0b. Kết quả chung cuộc cá nhân = Phần 2 (điểm quiz) + Phần 3 (TB 4 GK hùng biện)
    const fi = (data.final_individuals || []).map((r) => {
      const tm = timing(`speech:${r.code}`, data.config?.speech_seconds || 180);
      return {
        'Hạng': r.rank, 'Mã CB': r.code, 'Họ tên': r.name, 'Đội': r.team_name,
        'Phần 2 - Kiến thức': Number(r.quiz_score), 'Hạng Phần 2': r.quiz_rank, 'Thời gian câu đúng (giây)': sec(r.time_ms),
        'Thứ tự hùng biện': r.order_no ?? '', 'Câu hỏi hùng biện': r.question ?? '',
        'P3 - GK1': r.speech_scores?.[0] ?? '', 'P3 - GK2': r.speech_scores?.[1] ?? '', 'P3 - GK3': r.speech_scores?.[2] ?? '', 'P3 - GK4': r.speech_scores?.[3] ?? '',
        'Phần 3 - Hùng biện (TB GK)': Number(r.speech_avg),
        'P3 - Thời gian (giây)': tm.t, 'P3 - Quá giờ (giây)': tm.over,
        'TỔNG ĐIỂM CÁ NHÂN': Number(r.total),
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fi), 'Chung cuộc - Cá nhân');

    // 1. Xếp hạng cá nhân
    const lb = data.leaderboard.map((r) => ({
      'Hạng': r.rank, 'Mã CB': r.code, 'Họ tên': r.name, 'Đội': r.team_name,
      'Tổng điểm': r.score, 'Số câu đúng': r.correct_count, 'Tổng thời gian câu đúng (giây)': sec(r.time_ms),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lb), 'P2 - Xếp hạng cá nhân');

    // 2. Điểm đội (tổng + từng câu)
    const teamRows = data.teams
      .slice()
      .sort((a, b) => b.total - a.total)
      .map((t, i) => ({ 'Hạng': i + 1, 'Đội': t.name, 'Tổng điểm (cộng dồn điểm TB)': Number(t.total) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamRows), 'P2 - Điểm đội');

    // 3. Kết quả từng câu
    const qMap = Object.fromEntries(data.questions.map((q) => [q.q_no, q]));
    const perQ = data.runs.map(({ q_no, result }) => {
      const row = {
        'Câu': q_no, 'Vòng': qMap[q_no]?.part_no, 'Câu hỏi': qMap[q_no]?.text, 'Đáp án đúng': result.correct,
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perQ), 'P2 - Kết quả từng câu');

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'P2 - Chi tiết trả lời');

    const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
    XLSX.writeFile(wb, `SmartBanker_ket-qua_${stamp}.xlsx`);
    toast('Đã xuất file Excel', 'ok');
  } catch (err) {
    toast(errText(err), 'error');
  }
}
