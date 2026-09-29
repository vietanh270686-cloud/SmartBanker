# SmartBanker — web thi quiz 3 đội (BIDV CN Tràng Tiền, thi ngày 03/10/2026)

Vite + JS thuần + Supabase (project `rytyeinzptsijkthgnez`). Deploy GitHub Pages qua
`.github/workflows/deploy.yml` mỗi khi push `main`. Live: https://vietanh270686-cloud.github.io/SmartBanker/

- `/` người chơi (điện thoại) · `#host` MC (điện thoại) · `#view` màn chiếu LED + âm thanh (laptop).
- Repo PUBLIC → thư mục `sql/` bị gitignore (có mật khẩu MC/View + câu hỏi thật). Không commit dữ liệu thật.
- Claude KHÔNG có quyền chạy SQL: giao file `.sql` (copy ra Downloads) cho user chạy trong SQL Editor.
- Không có Supabase Auth: mọi ghi dữ liệu qua RPC `security definer`; anon chỉ SELECT được `game_state/teams/parts`.
  MC/View gửi `p_secret = 'username|password'` (bảng `accounts`, role host/view — view chỉ được `finalize`).
- Trạng thái game = 1 dòng `game_state` (phase + payload jsonb + version), đẩy realtime + poll dự phòng.
  Đồng hồ dùng giờ máy chủ (`server_time`), thời gian trả lời tính ở server.
- Đáp án đúng chỉ xuất hiện trong payload sau `finalize`.
- Âm thanh tự tổng hợp bằng Web Audio (`src/sound.js`), không dùng file.

File SQL (thứ tự): `01-schema.sql` (1 lần, có DROP) → `04-them-chu-de-phan-thi.sql` (an toàn chạy lại)
→ `02-du-lieu-mau.sql` (dữ liệu giả) hoặc `03-mau-du-lieu-that.sql` (dữ liệu thật).
