---
name: van-phong-alan
description: Tiếp tục xây dự án "Văn phòng AI Agent của Alan Academy" (toà nhà 3D, phòng ban, Trợ lý, họp, lịch việc). Dùng khi người dùng nhắc văn phòng, phòng ban, thêm agent/phòng ban, trưởng phòng, phòng họp, bong bóng thoại, lịch việc, hộp thư, chat thử/huấn luyện agent, hoặc nói "tiếp tục dự án văn phòng".
---

# Văn phòng Alan Academy: hướng dẫn tiếp tục

Đọc `CLAUDE.md` ở thư mục gốc trước (cấu trúc file, quy tắc, chi phí). Skill này là sổ tay thao tác.

## Thêm phòng ban / agent
Cách chính: nút **🏢 Cơ cấu & Nhân sự** (server tự tạo file, state, ô trên bản đồ; danh sách ô trống nằm ở `$SLOTS` trong `hr.ps1`, bản đồ tự nở thêm cột/hàng). Việc nhân sự (tuyển, đình chỉ, sa thải, tinh gọn, mở rộng) nên đi qua Trưởng phòng Nhân sự `tp-nhan-su`: nó chỉ đề xuất, giám đốc duyệt thì `/api/hr/execute` mới thực thi; mọi thao tác ghi vào `hr/history.jsonl`. Phòng cố định: `giam-doc`, `hop`, `nhan-su`, `du-bi` (người bị đình chỉ nằm ở `du-bi`, `status: "suspended"`, `prevRoom` để phục hồi). Bằng tay:
1. Thêm phòng vào `office/org.json` → `rooms` (kind `dept`, `slot` [cột,hàng] còn trống), tạo `workspace/<id>/`.
2. Thêm người vào `people` (role `head` hoặc `staff`, `room` đúng id; nhớ đặt `headId` của phòng).
3. Tạo `.claude/agents/<id>.md` (frontmatter name/description/tools/model; thân; phần "Báo cáo trạng thái lên văn phòng 3D" ở cuối) và `office/state/<id>.js` (idle).
4. Tải lại trang. Mỗi phòng tối đa 3 người ngồi bàn hàng sau, người thứ 4 trở đi ngồi hàng trước (đã có code, chưa chụp thử với >5 người).

## Skill, MCP, công cụ cho agent
- Giao diện: nút **🧩 Năng lực** (tải skill lên, danh sách MCP đã kết nối, ma trận agent × công cụ/skill/MCP). API: `GET /api/capabilities`, `POST /api/capabilities/assign {kind: tool|skill|mcp, name, agents[], mode: add|remove, ack[]}`, `POST /api/skills/upload`, `POST /api/capabilities/scan`.
- Cơ chế đã kiểm tra bằng Claude thật: `tools:` có `Skill` và `skills: [..]` liệt kê skill được phép; hook `guard.ps1` chặn skill/MCP ngoài danh sách; `skills:` frontmatter KHÔNG tự nạp nội dung. Tên MCP: `mcp__claude_ai_<Tên_Đổi_Khoảng_Trắng_Thành_Gạch_Dưới>`.
- Khi sửa `Parse-Agent`/`Build-Agent`, giữ nguyên khối `<!-- office:caps -->` (tự sinh): gán rồi gỡ phải trả file về đúng từng byte (đã kiểm tra với `Get-FileHash`).
- PowerShell: `R`, `rp`, `ls`... là alias, đừng đặt tên hàm trùng; mảng 1 phần tử bị mở ra khi trả về (bọc `@()`); `ConvertTo-Json` biến mảng rỗng thành `[null]` nếu viết `@($x)` với `$x` rỗng (lọc `Where-Object { $_ }`).

## Kiểm tra bằng trình duyệt
- `preview_start` `van-phong`, mở `http://localhost:8766/` (đúng cổng 8766, không qua cổng proxy khác vì kiểm tra Host). Sửa `serve.ps1` thì dừng và chạy lại preview rồi tải lại tab.
- Công cụ kiểm tra có sẵn trong trang: `OA.api(path, body)` (gọi API có token), `NODES`, `NAV`, `ROOMS`, `stateOf(id)`, `OA.demo.start()`, `select(id)`, `selectRoom(id)`.
- Thử nhanh một vòng không tốn token: chọn engine "Chạy thử" rồi bấm 💬 Giao việc, hoặc ▶ Chạy demo.
- Đổi trạng thái thật để xem 3D: ghi `office/state/<id>.js` (window.AGENTS["id"] = {status:"working",...}); trang cập nhật trong ≤3 giây.
- Lưu ý PowerShell: tên biến `$input` là biến tự động, đừng dùng làm tham số; here-string `@'...'@` phải đóng bằng `'@` ở đầu dòng; đừng dán chữ có dấu vào script .ps1 không BOM (dùng `[regex]::Unescape('\u...')`).

## Việc có thể làm tiếp
- Chọn model riêng cho Trợ lý/họp để giảm chi phí; hiện dùng engine đang chọn (haiku/sonnet/mặc định).
- Nút tự bật server khi mở máy (chưa tạo; phải hỏi chủ dự án; cách làm: lối tắt `office/chay-van-phong.bat` trong thư mục Startup, ghi rõ lịch chỉ chạy khi server bật).
- Giao skill cho từng agent trong 🧩 Năng lực (skill tài khoản dùng trực tiếp, không cần chép); mới thử với `viet-kich-ban` và một skill tải lên, chưa thử cả 28 skill.
- Âm thanh (M3) bị bỏ theo yêu cầu; nếu cần lại, `audio.js` của `D:\claude\town\audio.js` dùng được làm gốc (WebAudio, không cần file âm thanh).
- Nhập số liệu phễu (lượt xem, thành viên Nas, email, người tham gia thử thách, người mua) và báo cáo tỷ lệ chuyển đổi: mới có mẫu lịch "Báo cáo phễu tuần" đọc `workspace/giam-doc/so-lieu-phieu.md`, chưa có giao diện nhập.
- Dọn: `office/chat/` (log job) lớn dần, có thể xoá định kỳ.
