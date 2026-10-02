# SmartBanker — web thi kiến thức 3 đội (BIDV CN Tràng Tiền – Hà Nội, thi ngày 03/10/2026)

Vite + JS thuần + Supabase (project `rytyeinzptsijkthgnez`). Deploy GitHub Pages qua
`.github/workflows/deploy.yml` mỗi khi push `main`. Live: https://vietanh270686-cloud.github.io/SmartBanker/

- `/` người chơi · `#host` MC · `#view` màn chiếu LED + âm thanh · `#thuky` thư ký nhập điểm BGK.
- Chương trình: Phần 1 Giới thiệu (bốc thăm thứ tự bằng điện thoại đội trưởng, 90s) → Phần 2 quiz 4 vòng × 10 câu
  → Top 10 → Phần 3 Hùng biện (Top 3; bốc thứ tự + bốc 1 trong 6 câu; chuẩn bị 2' + trình bày 3')
  → trao giải CÁ NHÂN trước, ĐỒNG ĐỘI sau, rồi kết quả chung cuộc.
- Điểm đội = TB GK Phần 1 + điểm đội Phần 2; điểm cá nhân = Phần 2 + TB GK Phần 3.
  TB GK = trung bình các ô ĐÃ CÓ điểm (không chia cố định 4), giữ 3 chữ số thập phân.
- Repo PUBLIC → `sql/` và `assets-src/` bị gitignore (mật khẩu, câu hỏi thật). Không commit dữ liệu thật.
- Claude KHÔNG có quyền chạy SQL: giao file `.sql` (copy ra Downloads) cho user chạy trong SQL Editor.
  File SQL đánh số 01..11; file sau `create or replace` lại hàm của file trước — khi sửa hàm phải sửa cả file gốc (06).
- Không có Supabase Auth: mọi ghi dữ liệu qua RPC `security definer`; anon chỉ SELECT `game_state/teams/parts`.
  Tài khoản host/view/secretary trong bảng `accounts`, client gửi `p_secret = 'username|password'`.
- Trạng thái game = 1 dòng `game_state` (phase + payload jsonb + version), realtime + poll dự phòng.
  Đồng hồ dùng giờ máy chủ; đáp án đúng chỉ có trong payload sau `finalize`.
  Lệnh MC → màn chiếu không qua DB (vd dừng nhạc) đi bằng realtime broadcast kênh `sb-control`.
- Âm thanh: tổng hợp Web Audio (`src/sound.js`) + nhạc trao giải `public/sounds/award.mp3` (cá nhân, Top 3)
  và `award2.mp3` (đồng đội, chung cuộc); thiếu file thì tự dùng âm thanh tổng hợp.
- Test trên DB thật: ĐỌC & sao lưu trước, khôi phục sau; KHÔNG reset / xoá dữ liệu khi chưa hỏi user.
  Test giao diện có thể giả state chỉ trong trình duyệt (`lib.game.state = {...}` với version rất lớn) — không đụng DB.
- Dev local: cổng 5180 thường bị dự án khác của user chiếm → dùng cổng khác (vd 5190).
