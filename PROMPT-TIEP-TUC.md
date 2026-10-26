# Câu lệnh ngắn để dán vào phiên Claude mới

Mở phiên Claude Code ở thư mục `D:\claude\Office online`, rồi dán một trong các câu dưới.

**Tiếp tục dự án**
> Tiếp tục dự án văn phòng Alan Academy. Đọc CLAUDE.md và skill van-phong-alan, rồi cho mình biết hiện trạng và việc nên làm tiếp.

**Chạy và kiểm tra nhanh**
> Chạy preview van-phong, mở trang, bấm thử Chạy demo và Giao việc bằng engine Chạy thử, báo lỗi console nếu có.

**Thêm phòng ban**
> Thêm phòng ban "<tên phòng>" gồm 1 trưởng phòng và 2 nhân viên: <vai trò từng người>. Dùng API của server như nút Tổ chức, rồi kiểm tra trên bản đồ.

**Chỉnh một agent**
> Mình muốn agent <id> làm tốt hơn việc <mô tả>. Mở chat thử với nó bằng engine haiku, thử 3 câu, đề xuất sửa prompt cho mình duyệt.

**Chạy việc thật**
> Chạy thật (engine haiku): <việc cần làm>. Lập kế hoạch trước cho mình duyệt, chỉ soạn bản nháp vào workspace/, không đăng, không gửi.

**Kiểm tra lịch**
> Xem 📅 Lịch và nhật ký schedule-log.jsonl, cho mình biết lịch nào sẽ chạy tiếp, lần nào bị bỏ qua và vì sao.

**Dọn dữ liệu thử**
> Dọn office/chat, office/inbox, workspace/*/mock-*.md và các mục lịch thử. Hỏi mình trước khi xoá thứ gì không phải do mock tạo.

---
Nhắc lại các điều cần nhớ: engine mặc định là "Chạy thử" (không tốn token); Claude thật cần đã chạy `claude auth login`; lịch chỉ chạy khi server (`office/chay-van-phong.bat`) đang mở; agent chỉ soạn bản nháp, không đăng bài, không gửi email, không chi tiền.
