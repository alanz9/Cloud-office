# Kiểm duyệt: 4 bản nháp Marketing và Nhân sự

Người rà: Chi (kiem-duyet). Ngày: 2026-10-25. Chỉ nhận xét, không sửa file gốc.

## Kết luận nhanh

| # | File | Kết quả | Lý do chính |
|---|---|---|---|
| 1 | `workspace/marketing/nhiem-vu-truong-phong.md` | Cần sửa (nhỏ) | Đường dẫn lưu không khớp với prompt `tp-marketing` |
| 2 | `workspace/marketing/quy-trinh-ngay.md` | Cần sửa | Thứ tự giờ chưa hợp lý; dòng đăng qua MCP cần ghi rõ xin phép từng lần |
| 3 | `workspace/nhan-su/mo-ta-vi-tri-editor-media.md` | Cần sửa (nhỏ) | Đường dẫn file media; khi có skill phải bật công cụ Skill |
| 4 | `workspace/nhan-su/prompt-cap-nhat-marketing.md` | Cần sửa (nhỏ) | Đường dẫn lưu của Minh, Khoa, Lan không khớp các file khác; cần xác nhận ưu đãi 50% |

Không có lời hứa thu nhập hay kết quả chắc chắn nào. Không có chỗ nào cho phép đăng bài hoặc tốn credit mà thiếu xin phép. Chữ "Nas" chỉ còn ở các câu chuyển đổi có chủ ý ("từ Nas sang Skool", "thay cho Nas") và id `cong-dong-nas` giữ nguyên, không có chỗ nào mô tả Nas như kênh hiện tại.

## Chi tiết từng file

### 1. nhiem-vu-truong-phong.md

- Đường dẫn không khớp (dòng 7, 20, 22): nhiệm vụ ghi `tin-sang/YYYY-MM-DD.md`, `skool/`, `lich-dang/`, `media/`. Prompt `tp-marketing` ghi `tin-ai-<yyyy-mm-dd>.md`; prompt Lan ghi `cong-dong-<chu-de>.md` và `lich-dang-<yyyy-mm-dd>.md`; mô tả editor-media ghi `media-<chu-de>.md`. Đề xuất: chọn một cách và sửa cả bốn file cho khớp. Gợi ý: dùng tên file theo prompt (phẳng trong `workspace/marketing/`), vì agent được hướng dẫn theo tên đó.
- Dòng 13: "tỉ lệ" (ở `mo-ta-vi-tri-editor-media.md` là "tỷ lệ"). Thống nhất một cách, gợi ý "tỷ lệ".
- Dòng 20: "chuyển hướng cộng đồng từ Nas sang Skool" là đúng ý, giữ nguyên.

### 2. quy-trinh-ngay.md

- Thứ tự giờ (dòng 11, 14): Editor media bắt đầu 11:00 dựa trên kịch bản của Khoa (9:30), nhưng Chi chỉ rà lúc 15:00. Mô tả editor-media cũng ghi "kịch bản đã được Chi rà hoặc brief từ Minh". Đề xuất: ghi rõ bước 4 chạy trên brief đã qua Minh, còn bản chính thức chỉ bắt đầu sau khi Chi rà. Hoặc đẩy bước 4 sang sau 15:00 và ghi rõ giờ đó sẽ làm storyboard tiếp.
- Dòng 14: Chi rà 15:00 và chỉ cho tối đa 1 vòng sửa, trong khi giám đốc duyệt lúc 16:00. Nếu Khoa hoặc Lan phải sửa sau khi Chi rà thì không kịp giờ. Đề xuất: ghi "vòng sửa xong trước 15:45, nếu không kịp thì chuyển sang ngày hôm sau".
- Dòng 16: "Giám đốc hoặc MCP" ở bước đăng dễ hiểu là MCP được đăng. Đề xuất: ghi "Mỗi lần đăng cần giám đốc xác nhận riêng; MCP đăng bài là rủi ro và cần riskAck; lịch chạy tự động không bao giờ đăng". Giữ "Hiện tại không đăng".
- Dòng 12 và 11: đường dẫn `media/`, `skool/`, `lich-dang/` cần khớp với mục 1.

### 3. mo-ta-vi-tri-editor-media.md

- Dòng 15 và 27: tools là Read, Write, Edit, Glob, không có Skill. Khi giám đốc gửi skill thì phải thêm công cụ Skill và khai báo skill ở 🧩 Năng lực, nếu không skill sẽ không được nạp. Đề xuất: ghi thêm vào mục 9 "Khi có skill thì bật Skill qua 🧩 Năng lực, cần duyệt lại mô tả".
- Dòng 82: đường dẫn `workspace/marketing/media-<chu-de>.md` đúng với prompt; nhưng dòng 22 của nhiệm vụ ghi `media/`. Xem mục 1.
- Dòng 25: "tỷ lệ khung hình" đúng. Các dòng 74 và 89 không có vấn đề.
- Ranh giới credit (dòng 34, 87) và hình người thật (dòng 35, 88) đã rõ. Không có lỗ hổng.

### 4. prompt-cap-nhat-marketing.md

- Đường dẫn Minh (dòng 48) ghi `tin-ai-<yyyy-mm-dd>.md`, khớp với bản nháp Minh nếu chọn cách phẳng. Đường dẫn Khoa (dòng 108 trong khối 2) ghi `kich-ban-<chu-de>.md`; nhiệm vụ ghi `kich-ban/`. Lan (dòng 149) ghi `cong-dong-<chu-de>.md`. Xem mục 1 để thống nhất.
- Ưu đãi "giảm 50% cho người tham gia thử thách" xuất hiện ở dòng 37 và 142 (và mô tả editor-media dòng 74). Đây là thông tin bán hàng, không phải lời hứa kết quả, nhưng nên giám đốc xác nhận ưu đãi còn hiệu lực và điều kiện (thời hạn, đối tượng). Bài đăng cần ghi rõ điều kiện trước khi dùng. Chưa tìm thấy mã giảm giá cụ thể trong các bản nháp này.
- Dòng 28: `tp-marketing` có công cụ Agent, WebSearch, WebFetch. Cần giám đốc biết đây là quyền đọc web, không đăng; phù hợp với mục nghiên cứu tin. Không có vấn đề về tốn credit.
- Dòng 173-176 đã ghi các mục giám đốc cần cung cấp: kênh mạng xã hội, link Skool, model của Lan. Giữ nguyên.

## Việc giám đốc cần quyết (từ bản nháp)

1. Chọn một cách đặt tên file trong `workspace/marketing/` (mục 1 và 4).
2. Xác nhận ưu đãi 50% còn hiệu lực và điều kiện.
3. Chốt giờ chạy cho bước Chi rà và vòng sửa (mục 2).
4. Quy định xin phép đăng bài qua MCP (mục 2, dòng 16).

Chưa kiểm tra: không có file agent thật để đối chiếu với prompt; chưa chạy kiểm tra trong `.claude/agents/`.
