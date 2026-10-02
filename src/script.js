// Lời dẫn MC (theo "3_Loi_dan_MC_SmartBanker_2026") gắn với từng bước trên màn MC.
// Tên đội / thí sinh / thứ tự được tự điền từ dữ liệu hệ thống.
import { esc, isRevealed, perfTiming } from './lib.js';

const P = (t) => `<p>${t}</p>`;
const CUE = (t) => `<p class="cue">${t}</p>`;            // hiệu lệnh — đọc xong thì bấm nút
const NOTE = (t) => `<p class="note">${t}</p>`;          // ghi chú cho MC, không đọc
const H = (t) => `<h4>${t}</h4>`;
const b = (t) => `<b>${esc(t)}</b>`;
const blank = '<span class="blank">……</span>';

const ORDINAL = ['đầu tiên', 'thứ hai', 'cuối cùng'];
const ROUND_START = { 1: '01', 2: '11', 3: '21', 4: '31' };

// ---------------- 1–4: phòng chờ ----------------
function lobby() {
  return H('1. Ổn định tổ chức')
    + P('Kính mời các thành viên của ba đội ổn định vị trí, ngồi đúng khu vực đã được Ban Tổ chức bố trí.')
    + P('Chương trình sẽ bắt đầu trong ít phút. Kính mời quý vị cùng hướng lên sân khấu và màn hình chính.')
    + H('2. Tuyên bố lý do và giới thiệu đại biểu')
    + P('Xin được trân trọng kính chào Ban Giám đốc, Ban Giám khảo, quý vị khách quý cùng toàn thể 60 thí sinh đã có mặt tại hội trường ngày hôm nay!')
    + P('Lời đầu tiên, thay mặt Ban Tổ chức, xin kính chúc quý vị sức khỏe, hạnh phúc và có những giây phút thật hào hứng, sôi nổi tại Hội thi SmartBanker Tràng Tiền - Hà Nội 2026!')
    + P('Kính thưa quý vị!')
    + P('Trong không khí phấn khởi chào mừng kỷ niệm ngày thành lập BIDV Chi nhánh Tràng Tiền - Hà Nội, hôm nay chúng ta cùng hội tụ tại đây để tham dự Hội thi SmartBanker 2026 - sân chơi của kiến thức, bản lĩnh nghề nghiệp, tinh thần sáng tạo và sự gắn kết.')
    + P('Đến tham dự và đồng hành cùng Hội thi ngày hôm nay, Ban Tổ chức xin trân trọng giới thiệu:')
    + P('• Chị <b>Nguyễn Thanh Tú</b> - Giám đốc Chi nhánh, Trưởng Ban Giám khảo Hội thi.<br>'
      + '• Anh <b>Đỗ Mạnh Hùng</b> - Chủ tịch Công đoàn, Phó Giám đốc Chi nhánh, Trưởng Ban Tổ chức và là lãnh đạo đồng hành cùng Đội 1.<br>'
      + '• Anh <b>Nguyễn Huy Thủy</b> - Phó Giám đốc Chi nhánh, lãnh đạo đồng hành cùng Đội 2.<br>'
      + '• Anh <b>Dương Anh Tuấn</b> - Phó Giám đốc Chi nhánh, lãnh đạo đồng hành cùng Đội 3.')
    + P('Đặc biệt, Ban Tổ chức rất vinh dự được đón tiếp chị <b>Nguyễn Thị Hoài</b> - Phó Giám đốc Trung tâm Dịch vụ Kho quỹ, khách mời danh dự của chương trình.')
    + P('Xin quý vị dành một tràng pháo tay nồng nhiệt để chào mừng các đồng chí lãnh đạo, Ban Giám khảo và vị khách quý của Hội thi ngày hôm nay!')
    + P('Đồng hành cùng với em ngày hôm nay, xin giới thiệu thư ký Hội thi: <b>Nguyễn Hồng Nhung</b>, và phụ trách kỹ thuật: <b>Nguyễn Bá Khánh Duy</b>. Xin tất cả mọi người một tràng pháo tay thật lớn chào mừng các thành viên Ban Tổ chức được không ạ!')
    + H('3. Giới thiệu đội thi')
    + P('Và bây giờ, chúng ta hãy cùng kiểm tra năng lượng của ba đội thi!')
    + P('Đội 1 đang ở đâu ạ?<br>Đội 2 đã sẵn sàng chưa ạ?<br>Và năng lượng của Đội 3 đâu rồi ạ?')
    + P('Xin trân trọng giới thiệu ba đội trưởng sẽ dẫn dắt các đội trong Hội thi ngày hôm nay:')
    + P('• Anh <b>Nguyễn Đức Huân</b> - Đội trưởng Đội 1.<br>• Chị <b>Trần Thùy Dương</b> - Đội trưởng Đội 2.<br>• Anh <b>Trần Văn Long</b> - Đội trưởng Đội 3.')
    + P('Xin mời ba đội trưởng đứng lên chào Ban Giám khảo, quý vị khách quý và toàn thể Hội thi!')
    + H('4. Hướng dẫn đăng nhập và khởi động hệ thống')
    + P('Kính thưa Ban Giám khảo, kính thưa toàn thể thí sinh ngày hôm nay! Một điểm mới đặc biệt của Hội thi SmartBanker Tràng Tiền – Hà Nội 2026 là lần đầu tiên Chi nhánh ứng dụng công nghệ xuyên suốt quá trình tổ chức thi. Từ hệ thống thi, bốc thăm, tiếp nhận câu hỏi, ghi nhận đáp án đến tổng hợp điểm và xếp hạng đều được thực hiện trên hệ thống, góp phần bảo đảm kết quả nhanh chóng, chính xác và minh bạch.')
    + P('Ngay bây giờ, xin mời toàn thể 60 thí sinh chuẩn bị điện thoại, kiểm tra kết nối 3G, 4G hoặc Wi-Fi; mở camera và quét mã QR đang hiển thị trên màn hình chính.')
    + P('Sau khi đăng nhập, xin vui lòng xác nhận đúng họ tên và đội thi. Trường hợp cần hỗ trợ, xin giơ tay để bộ phận kỹ thuật tiếp cận.')
    + NOTE('Theo dõi số người online ở thanh trên cùng màn MC (ví dụ 60/60) trước khi chuyển bước.')
    + P('Và bây giờ, xin mời toàn thể 60 thí sinh cùng giơ cao điện thoại đã đăng nhập thành công! Xin giữ nguyên trong giây lát để bộ phận quay phim, chụp ảnh ghi lại khoảnh khắc công nghệ chính thức đồng hành cùng Hội thi SmartBanker 2026.')
    + P('Thiết bị đã sẵn sàng, hệ thống đã sẵn sàng; hy vọng tinh thần của các đội còn sẵn sàng hơn nữa!')
    + NOTE('Tiếp theo: bấm <b>Phần 1: Bốc thăm thứ tự Giới thiệu</b>.');
}

// ---------------- 5: bốc thăm Phần 1 ----------------
function introDraw(p) {
  const entries = p.entries || [];
  const done = entries.length && entries.every((e) => isRevealed(e));
  let html = H('5. Bốc thăm thứ tự phần thi Giới thiệu đội')
    + P('Để chính thức khởi động Hội thi, xin mời ba đội trưởng mang theo điện thoại đã đăng nhập và cùng tiến lên sân khấu!')
    + P('Trước khi bốc thăm, MC xin mời một đội trưởng chia sẻ thật nhanh cảm xúc của mình: Ngay lúc này, anh/chị cảm thấy thế nào và muốn gửi thông điệp gì đến các thành viên của đội mình?')
    + P('Xin cảm ơn phần chia sẻ rất tự tin và đầy quyết tâm!')
    + P('Và bây giờ là thời khắc xác định thứ tự thực hiện phần thi Giới thiệu đội. Xin mời ba đội trưởng mở chức năng bốc thăm và đưa điện thoại lên cao. Các anh, chị sẽ cùng nhấn nút sau hiệu lệnh của MC.')
    + CUE('Toàn thể hội trường hãy cùng đếm ngược: Ba - Hai - Một - Bốc thăm!');
  if (done) {
    const o = entries.slice().sort((a, x) => a.order_no - x.order_no);
    html += P(`Kết quả đã có: Đội thi đầu tiên là ${b(o[0].name)}; tiếp theo là ${b(o[1]?.name || '')}; và đội thực hiện phần thi cuối cùng là ${b(o[2]?.name || '')}.`)
      + P('Công nghệ đã đưa ra thứ tự; còn phần thể hiện có thực sự ấn tượng hay không sẽ phụ thuộc vào tài năng và sự chuẩn bị của mỗi đội!');
  } else {
    html += NOTE('Kết quả bốc thăm sẽ tự hiện ở đây khi cả 3 đội đã bốc xong.');
  }
  return html;
}

// ---------------- 6: Phần 1 – Giới thiệu đội ----------------
function introPerf(p) {
  const t = perfTiming(p);
  const ord = ORDINAL[(p.order_no || 1) - 1] || '';
  let html = '';
  if (p.order_no === 1 && t.mode === 'idle') {
    html += H('6. Phần thi Giới thiệu đội')
      + P('Mở đầu phần tranh tài chính thức là phần Giới thiệu đội. Mỗi đội có tối đa 90 giây, với hình thức video hoặc tiểu phẩm sáng tạo. Phần thi có tổng điểm 40, được đánh giá theo tên và nhận diện đội; thông điệp, bản sắc văn hóa; tính sáng tạo; hình thức thể hiện và việc bảo đảm thời lượng.');
  }
  if (t.mode === 'idle') {
    html += CUE(`Xin mời ${b(p.name)} - đội có thứ tự ${ord} - bước vào phần thi của mình. Ba - Hai - Một - Bắt đầu!`)
      + NOTE('Đọc xong hiệu lệnh thì bấm <b>Bắt đầu tính giờ</b>.');
  } else if (t.mode === 'run' || t.mode === 'over') {
    html += NOTE(`${esc(p.name)} đang trình bày. Bấm <b>Dừng giờ</b> khi đội kết thúc.`);
  } else if (t.mode === 'stopped') {
    html += P(`Xin cảm ơn ${b(p.name)} với phần giới thiệu đầy màu sắc. Kính mời Ban Giám khảo ghi điểm.`)
      + CUE('Ba - Hai - Một - Xin mời Ban Giám khảo giơ bảng điểm!');
    if (!p.next) {
      html += P('Xin cảm ơn cả ba đội. Chúng ta vừa thấy rằng cán bộ ngân hàng không chỉ vững nghiệp vụ mà còn có rất nhiều ý tưởng sáng tạo và bất ngờ!')
        + P('Chúng ta vừa kết thúc phần Giới thiệu đội đầy màu sắc. Xin dành một tràng pháo tay thật lớn cho sự chuẩn bị của cả ba đội!');
    }
  }
  return html;
}

// ---------------- 7: Phần Kiến thức ----------------
const ROUND_TEXT = {
  1: [P('Ngay sau đây là Vòng 1 - Mở màn, với các nội dung về BIDV, định hướng chiến lược và hoạt động của Chi nhánh. Xin hỏi các thí sinh đã sẵn sàng chưa ạ?'),
    P('Các thí sinh vui lòng kiểm tra tên hiển thị trên điện thoại.')],
  2: [P('Năng lượng đã được làm mới. Chúng ta bước vào Vòng 2 - Bứt tốc, với các tình huống nghiệp vụ ở nhiều vị trí công tác trong Chi nhánh.'),
    P('Xin mời các thí sinh trở lại hệ thống. Hãy bình tĩnh, chính xác và đừng để tên gọi Bứt tốc làm chúng ta bấm đáp án trước khi đọc hết câu hỏi!')],
  3: [P('Tiếp nối chương trình là Vòng 3 - Bản sắc, tập trung vào giá trị cốt lõi, văn hóa BIDV và tinh thần kiểm soát rủi ro trong từng vị trí công tác.'),
    P('Ba đội đã sẵn sàng chưa ạ?')],
  4: [P('Chúng ta bước vào Vòng 4 - Thực chiến, với các tình huống công việc, định hướng năm 2026, chuyển đổi số và ứng dụng trí tuệ nhân tạo.'),
    P('Đây là 10 câu hỏi cuối cùng để xác định kết quả phần kiến thức. Xin các thí sinh tập trung cao độ.')],
};

function partIntro(s) {
  const n = s.part_no;
  let html = '';
  if (n === 1) {
    html += H('7. Phần thi Kiến thức')
      + P('<b>Mỗi câu trả lời đúng được 10 điểm; trả lời sai hoặc quá thời gian sẽ không được tính điểm. Trường hợp các thí sinh bằng điểm, tổng thời gian trả lời các câu đúng sẽ là căn cứ xếp hạng (ai trả lời nhanh hơn sẽ có ưu thế). Vì vậy, hãy đọc kỹ câu hỏi: nhanh là lợi thế, nhưng chính xác mới là quyết định!</b>')
      + P('<b>Điểm của đội tại mỗi câu hỏi là điểm trung bình của các thành viên đang trực tuyến trên hệ thống ở câu hỏi đó; thành viên trả lời sai hoặc không trả lời được tính 0 điểm. Điểm phần Kiến thức của đội là tổng điểm trung bình qua 40 câu hỏi, vì vậy mỗi câu trả lời đều góp phần vào kết quả chung.</b>')
      + P('<b>Để bảo đảm phần thi công bằng, Ban Tổ chức kính mời các anh, chị Trưởng phòng hỗ trợ giám sát tại hai bên khu vực thi. Đề nghị các thí sinh làm bài độc lập, nghiêm túc, không trao đổi, không sử dụng ứng dụng hỗ trợ.</b>');
  }
  html += H(`Vòng ${n}`) + (ROUND_TEXT[n] || []).join('')
    + CUE(`Xin mời Câu số ${ROUND_START[n] || ''}!`)
    + NOTE('Đọc xong thì bấm <b>Bắt đầu câu</b>.');
  return html;
}

function partEnd(s) {
  const n = s.part_no;
  let html = H(`🎲 Mini game ${n}`) + NOTE(`Đến phần Mini game ${n} (thực hiện ngoài hệ thống).`);
  if (s.payload?.next_part) {
    html += NOTE(`Xong mini game thì bấm <b>Chuyển sang Vòng ${s.payload.next_part}</b>.`);
  } else {
    html += H('8. Công bố kết quả phần thi Kiến thức')
      + P('Phần thi kiến thức đã kết thúc. Hệ thống đang khóa dữ liệu, tổng hợp điểm và xếp hạng thí sinh.')
      + P('Nhờ ứng dụng công nghệ, kết quả được xử lý nhanh chóng và chính xác; đồng thời Ban Tổ chức và Thư ký vẫn tiến hành đối soát lần cuối trước khi công bố chính thức.')
      + P('Trong giây lát, màn hình sẽ lần lượt hiển thị 10 thí sinh có kết quả cao nhất, từ vị trí thứ 10 đến vị trí dẫn đầu. Hệ thống có thể xử lý rất nhanh; còn cảm giác hồi hộp thì xin phép để MC và quý vị đảm nhiệm!')
      + P('Theo thể lệ, trường hợp bằng điểm, thí sinh có tổng thời gian trả lời các câu đúng ngắn hơn sẽ xếp trên.')
      + NOTE('Đọc xong thì bấm <b>Công bố Top 10 cá nhân</b>.');
  }
  return html;
}

function congrats(p) {
  const l = (p.list || []).slice(0, 3);
  const names = l.length ? l.map((r) => `anh/chị ${b(r.name)} (${esc(r.team_name)})`).join('; ') : blank;
  return P(`Xin chúc mừng ba thí sinh xuất sắc nhất: ${names} đã giành quyền bước vào vòng Chung kết hùng biện!`)
    + NOTE('Tiếp theo: bấm <b>Phần 3: Bốc thăm thứ tự Hùng biện</b>.');
}

// ---------------- 9: Chung kết hùng biện ----------------
function speechDraw(p) {
  const entries = p.entries || [];
  const done = entries.length && entries.every((e) => isRevealed(e));
  let html = H('9. Chung kết hùng biện')
    + P('Ở vòng Chung kết hùng biện, mỗi thí sinh có 02 phút chuẩn bị và tối đa 03 phút trình bày. Phần thi có tổng điểm 40, gồm: nội dung đúng trọng tâm và phù hợp chủ đề 15 điểm; lập luận, phân tích và giải pháp 10 điểm; kỹ năng trình bày và sức thuyết phục 10 điểm; bảo đảm thời lượng 05 điểm.')
    + P('Điểm cá nhân chung cuộc là tổng điểm phần Kiến thức và điểm Chung kết hùng biện.')
    + CUE('Ba thí sinh sẽ bốc thăm thứ tự trình bày trên hệ thống. Xin mời cả ba thí sinh đưa điện thoại lên cao. Ba - Hai - Một - Bốc thăm!');
  if (done) {
    const o = entries.slice().sort((a, x) => a.order_no - x.order_no);
    html += P('Thứ tự trình bày: ' + o.map((e) => `số ${String(e.order_no).padStart(2, '0')} – ${b(e.name)}`).join('; ') + '.');
  }
  return html;
}

function speechPerf(p) {
  const t = perfTiming(p);
  const no = String(p.order_no || '').padStart(2, '0');
  let html = H(`Thí sinh số ${no}: ${esc(p.name)} (${esc(p.team_name)})`);
  if (!p.question) {
    html += CUE(`Xin mời thí sinh có thứ tự số ${no} - anh/chị ${b(p.name)} - bốc thăm đề trên điện thoại!`);
  } else if (t.mode === 'idle') {
    html += CUE(`Xin mời thí sinh có thứ tự số ${no} nhận đề. Thời gian chuẩn bị 02 phút bắt đầu!`)
      + NOTE('Đọc xong thì bấm <b>Bắt đầu chuẩn bị</b>.');
  } else if (t.mode === 'prep' || t.mode === 'prep_over') {
    html += CUE('Hết thời gian chuẩn bị: Xin mời anh/chị bước vào phần trình bày. Ba - Hai - Một - Bắt đầu!')
      + NOTE('Đọc xong thì bấm <b>Bắt đầu trình bày</b>.');
  } else if (t.mode === 'run' || t.mode === 'over') {
    html += NOTE('Thí sinh đang trình bày. Bấm <b>Dừng giờ</b> khi thí sinh kết thúc.');
  } else {
    html += P(`Xin cảm ơn thí sinh ${b(p.name)}. Kính mời Ban Giám khảo chấm điểm.`);
    if (!p.next) {
      html += P('Xin dành một tràng pháo tay chúc mừng cả ba thí sinh đã hoàn thành phần thi đòi hỏi không chỉ kiến thức mà còn cả sự bình tĩnh và khả năng thuyết phục!')
        + P('Ba phần hùng biện đã khép lại vòng chung kết. Hệ thống đang tổng hợp điểm kiến thức và điểm hùng biện để xác định kết quả cá nhân chung cuộc.')
        + P('Không biết quý vị có hồi hộp không, nhưng nhìn về phía ba thí sinh, tôi tin rằng câu trả lời đã khá rõ ràng!')
        + P('Trong thời gian chờ kết quả được Ban Giám khảo và Thư ký xác nhận, xin mời quý vị cùng nhìn lại những hình ảnh nổi bật của chương trình chạy bộ buổi sáng và Hội thi SmartBanker 2026.')
        + H('10. Tổng kết và trao thưởng') + H('10.1 Trao giải chương trình chạy bộ')
        + P('Kính thưa quý vị! Mở đầu phần tổng kết và trao thưởng là các giải thưởng của chương trình chạy bộ kỷ niệm ngày thành lập Chi nhánh diễn ra vào sáng nay.')
        + P('Mỗi bước chạy không chỉ thể hiện sức khỏe và sự bền bỉ mà còn lan tỏa tinh thần gắn kết của tập thể BIDV Tràng Tiền - Hà Nội.')
        + P(`Ban Tổ chức xin công bố:<br>• Giải Nhì nữ, trị giá 1.000.000 đồng, thuộc về chị ${blank}<br>• Giải Nhì nam, trị giá 1.000.000 đồng, thuộc về anh ${blank}<br>• Giải Nhất nữ, trị giá 2.000.000 đồng, thuộc về chị ${blank}<br>• Giải Nhất nam, trị giá 2.000.000 đồng, thuộc về anh ${blank}`)
        + P('Xin trân trọng kính mời đại diện Ban Giám đốc lên sân khấu trao thưởng. Xin mời bốn vận động viên bước lên sân khấu!')
        + P('Xin chúc mừng các anh, chị - những người đã hoàn thành đường chạy bằng đôi chân và mở đầu ngày hội bằng một nguồn năng lượng thật tích cực!')
        + H('10.2 Trao giải mini game')
        + P('Tiếp theo, Ban Tổ chức trân trọng trao thưởng cho 04 cá nhân chiến thắng bốn mini game. Mỗi phần thưởng trị giá 500.000 đồng.')
        + P(`Xin mời các anh, chị có tên sau đây bước lên sân khấu: ${blank}; ${blank}; ${blank}; ${blank}`)
        + P('Xin trân trọng kính mời đại diện Ban Giám đốc trao thưởng và chụp ảnh lưu niệm.')
        + P('Xin chúc mừng các anh, chị. Cảm ơn toàn thể hội trường đã chứng minh rằng không cần điện thoại, chúng ta vẫn có thể tương tác rất nhanh và rất vui!')
        + NOTE('Xong trao giải chạy bộ và mini game thì bấm <b>Sang trao giải</b> (giải cá nhân SmartBanker).');
    }
  }
  return html;
}

// ---------------- 10.3 / 10.4 / 11 ----------------
const PRIZE_PERSON = ['Giải Ba, trị giá 2.000.000 đồng', 'Giải Nhì, trị giá 3.000.000 đồng'];
const PRIZE_TEAM = ['Giải Ba, trị giá 4.000.000 đồng', 'Giải Nhì, trị giá 6.000.000 đồng'];

function awardIndividual(p) {
  const step = p.step || 0;
  const people = p.people || [];          // [hạng 3, hạng 2, hạng 1]
  const nameAt = (i) => (i < step && people[i] ? `anh/chị ${b(people[i].name)}` : `anh/chị ${blank}`);
  let html = H('10.3 Trao giải cá nhân SmartBanker')
    + P('Sau đây là phần công bố kết quả cá nhân SmartBanker 2026. Kết quả được xác định từ tổng điểm phần Kiến thức trên hệ thống và điểm vòng Chung kết hùng biện do Ban Giám khảo chấm.')
    + P(`Xin chúc mừng ${nameAt(0)} đạt ${PRIZE_PERSON[0]}.`)
    + P(`Xin chúc mừng ${nameAt(1)} đạt ${PRIZE_PERSON[1]}.`)
    + P(`Và danh hiệu cá nhân xuất sắc nhất SmartBanker 2026, cùng phần thưởng trị giá 5.000.000 đồng, thuộc về ${nameAt(2)}!`);
  if (step >= 3) {
    html += P('Xin trân trọng kính mời đại diện Ban Giám đốc lên sân khấu trao giải và chụp ảnh cùng ba cá nhân xuất sắc nhất Hội thi.')
      + P('Xin chúc mừng các thí sinh! Kết quả hôm nay là sự ghi nhận xứng đáng cho kiến thức, bản lĩnh và khả năng trình bày thuyết phục của các anh, chị.');
  } else {
    html += NOTE('Tên người đạt giải tự hiện sau mỗi lần bấm <b>Công bố</b>.');
  }
  return html;
}

function awardTeams(p) {
  const step = p.step || 0;
  const teams = p.teams || [];
  const nameAt = (i) => (i < step && teams[i] ? b(teams[i].name) : `Đội ${blank}`);
  let html = H('10.4 Trao giải đồng đội SmartBanker')
    + P('Và bây giờ là kết quả giải đồng đội SmartBanker 2026. Điểm đồng đội là tổng điểm phần Giới thiệu đội và điểm phần Kiến thức của đội - cộng dồn điểm trung bình của các thành viên qua 40 câu hỏi.')
    + P(`Xin chúc mừng ${nameAt(0)} đạt ${PRIZE_TEAM[0]}.`)
    + P(`Xin chúc mừng ${nameAt(1)} đạt ${PRIZE_TEAM[1]}.`)
    + P(`Và Giải Nhất đồng đội SmartBanker 2026, trị giá 8.000.000 đồng, thuộc về ${nameAt(2)}!`);
  if (step >= 3) {
    html += P('Xin trân trọng kính mời đại diện Ban Giám đốc trao giải cho ba đội. Xin mời các lãnh đạo đồng hành, đội trưởng và đại diện các đội tiến lên sân khấu.')
      + P('Một lần nữa, xin chúc mừng tinh thần đoàn kết, sự chuẩn bị chu đáo và phần thể hiện đầy ấn tượng của cả ba đội!');
  } else {
    html += NOTE('Tên đội đạt giải tự hiện sau mỗi lần bấm <b>Công bố</b>.');
  }
  return html;
}

function closing() {
  return H('11. Bế mạc và chụp ảnh lưu niệm')
    + P('Kính thưa quý vị! Hội thi SmartBanker 2026 đã hoàn thành toàn bộ nội dung trong không khí sôi nổi, sáng tạo và gắn kết.')
    + P('Hội thi không chỉ ghi nhận kiến thức và bản lĩnh của cán bộ mà còn đánh dấu một cách thức tổ chức mới, trong đó công nghệ được ứng dụng để nâng cao tốc độ, tính chính xác, minh bạch và trải nghiệm của người tham gia.')
    + P('Ban Tổ chức trân trọng cảm ơn sự quan tâm của Ban Giám đốc; sự công tâm của Ban Giám khảo; sự phối hợp của Công đoàn, Đoàn Thanh niên, các đầu mối tổ chức và sự tham gia tích cực của toàn thể cán bộ.')
    + P('Kính chúc quý vị sức khỏe, hạnh phúc và tiếp tục lan tỏa tinh thần SmartBanker trong công việc hằng ngày. Xin trân trọng cảm ơn!')
    + P('Kính mời Ban Giám đốc, Ban Giám khảo, quý vị khách quý, các đội thi và toàn thể cán bộ cùng lên sân khấu chụp ảnh lưu niệm.');
}

export function scriptFor(s) {
  if (!s) return '';
  const p = s.payload || {};
  switch (s.phase) {
    case 'lobby': return lobby();
    case 'intro_draw': return introDraw(p);
    case 'intro_perf': return introPerf(p);
    case 'part_intro': return partIntro(s);
    case 'part_end': return partEnd(s);
    case 'final_congrats': return congrats(p);
    case 'speech_draw': return speechDraw(p);
    case 'speech_perf': return speechPerf(p);
    case 'award_individual': return awardIndividual(p);
    case 'award_teams': return awardTeams(p);
    case 'award_summary': return closing();
    default: return '';
  }
}
