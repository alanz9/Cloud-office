# Dự án: Văn phòng AI Agent của Alan Academy

Chủ dự án là người Việt, làm việc bằng tiếng Việt. Trả lời tiếng Việt, ngắn gọn, nói rõ file đã đổi và cái gì chưa kiểm tra.

**Đây là dự án riêng, không liên quan Đảo Hoàng Sa** (`D:\claude\town`, agent `son-tinh`...). Thư mục này là gốc git riêng để Claude không thừa hưởng agent và skill của thư mục cha. Chỉ chép code từ `town`, không sửa nó.

## Đây là gì
Trang web 3D (three.js r128, chạy offline) mô phỏng một tầng toà nhà văn phòng của Alan Academy (chia sẻ kiến thức AI, bán khóa học). Mỗi phòng ban là một phòng, mỗi nhân viên là **subagent thật của Claude Code** trong `.claude/agents/`. Trang 3D hiển thị và điều khiển; việc thật do Claude Code làm phía sau qua máy chủ cục bộ.

Phễu kinh doanh: video viral → cộng đồng Nas (thu email, bài hướng dẫn, sản phẩm số) → thử thách 3 ngày làm chủ video AI → khóa học (giảm 50% cho người tham gia thử thách).

## Vai trò
- **Giám đốc = chủ dự án** (`giam-doc`). Không phải agent, chỉ là nhân vật đại diện.
- **Trợ lý** (`tro-ly`) = phiên Claude chính (không có file agent): nhận lời giám đốc, chia việc, chủ trì họp, gom báo cáo. Cách làm việc của Trợ lý nằm trong `office/prompts.json`.
- **Trưởng phòng** (`tp-*`, role `head`) và **nhân viên** (role `staff`) đều là subagent. Subagent không gọi được subagent: nên Trợ lý giao trực tiếp cho nhân viên; riêng việc giao thẳng cho phòng ban/trưởng phòng thì server chạy `claude -p --agent <tp-id>` (khi đó trưởng phòng là phiên chính và gọi được nhân viên; đã kiểm tra).

## Đội hình (tên đặt tạm, đổi được trên giao diện)
Phòng giám đốc: Alan (bạn), `tro-ly`, `kiem-duyet`. Marketing: `tp-marketing`, `bien-kich-video`, `cong-dong-nas`. Sale: `tp-sale`, `email-chot`, `tu-van`. CSKH: `tp-cskh`, `hlv-thu-thach`, `ho-tro-hoc-vien`. **Phòng Nhân sự** (cố định): `tp-nhan-su` (Linh, trưởng phòng), `chuyen-vien-nhan-su` (Quân). **Phòng nhân sự dự bị** (cố định): nơi người bị đình chỉ hoặc mất phòng. Phòng họp: ai cũng vào được. Quản lý bằng nút 🏢 Cơ cấu & Nhân sự (tối đa 16 phòng, 30 agent).

## Cấu trúc file
- `office/org.json`: nguồn dữ liệu phòng ban + nhân vật (tên, chức danh, màu, vibe, ô `slot` trên lưới). Giao diện chỉ đọc từ đây.
- `.claude/agents/<id>.md`: định nghĩa subagent (frontmatter name/description/tools/model/skills). Phần cuối "Báo cáo trạng thái lên văn phòng 3D" phải giữ nguyên khi sửa (server giữ sẵn, lưu nguyên giá trị thì file giống hệt từng byte).
- `office/state/<id>.js`: trạng thái `{status: idle|working|review|done, task, say, to, log}`. Mỗi agent chỉ ghi file của mình. Trang đọc lại mỗi 3 giây bằng thẻ script `?t=`.
- `office/meetings/current.js`: cuộc họp đang mở `{id, topic, room, participants[], open, lines:[{who,text,t}]}`. Trợ lý ghi; mỗi dòng mới thành bong bóng thoại, người dự tự đi tới phòng họp.
- `office/world.js` (toà nhà, phòng, nội thất), `nav.js` (đồ thị đường đi, chặn phòng lạ), `actors.js` (nhân vật, đi lại, bong bóng thoại, hồ sơ bay, bảng thông tin), `ui.js` (nền api/modal, quản lý tổ chức, hộp thư, lịch việc), `chat.js` (giao việc + triệu tập họp), `trainer.js` (chat thử và huấn luyện từng agent), `demo.js` (chế độ demo), `index.html`.
- `office/serve.ps1`: máy chủ localhost (cổng 8766) + toàn bộ API. Mọi API cần token chèn vào index.html và đúng Host/Origin. File tĩnh chỉ phục vụ: file gốc `.html/.js/.json/.css`, `lib/`, `state/`, `meetings/`. File `.ps1` phải lưu UTF-8 có BOM (PowerShell 5.1); không để chữ Việt trong `serve.ps1`, chữ Việt nằm trong `prompts.json`.
- `office/guard.ps1` + `guard-settings.json` (server tự sinh): hook PreToolUse chặn Write/Edit ngoài khu của agent (xem Quy tắc).
- `office/mock-claude.ps1`: giả lập Claude cho engine "Chạy thử" (không tốn token): chat, họp, trial, sửa prompt, lịch. Ghi trạng thái thật nên 3D chạy y như thật.
- `office/caps.ps1` (nạp bởi serve.ps1): danh mục skill/MCP/công cụ, tải skill lên (zip/thư mục/SKILL.md/dán, chống zip-slip, cấm .exe/.dll), gán cho agent, phân loại rủi ro MCP, lọc `--allowedTools`, `Launch-Claude`. `office/caps.js`: giao diện 🧩 Năng lực (tab Skill, MCP, Công cụ, Ma trận agent). `office/risk.json`: từ khoá phân loại công cụ MCP. `office/runtime-catalog.json`: ảnh chụp công cụ MCP lấy từ sự kiện init của lần chạy Claude thật (nút "Quét công cụ" hoặc tự cập nhật; gộp qua nhiều lần quét).
- `office/hr.ps1` (nạp bởi serve.ps1): lịch sử, hồ sơ, hành động nhân sự (`Do-Suspend/Reinstate/Fire/Dissolve/CreateAgent/...`), trích và thực thi kế hoạch, API `/api/hr/*`. `office/hr.js`: giao diện Cơ cấu & Nhân sự. `office/hr/`: `history.jsonl`, `notes/<id>.jsonl`, `dossiers/` (sinh lại được).
- `office/prompts.json`: mọi lời nhắc gửi cho Claude (Trợ lý, họp, trial, sửa prompt, lịch, mẫu agent mới).
- `office/schedule.json`, `schedule-log.jsonl`, `inbox/`, `chat/` (log job), `trials/`, `tests/`, `agent-versions/`, `certified.json`, `_archive/`: dữ liệu chạy; có thể xoá sạch để làm lại (trừ khi muốn giữ lịch sử).
- `workspace/<phòng>/`: nơi agent lưu bản nháp; `workspace/_thu-nghiem/<id>/`: hộp cát chat thử.

## Chạy
`office/chay-van-phong.bat` (mở `http://localhost:8766/`), hoặc preview `van-phong` trong `.claude/launch.json`. Máy không có node/python, server là PowerShell 5.1. Sửa `serve.ps1` thì phải khởi động lại server; tải lại tab sau mỗi lần sửa (tab cũ giữ token cũ).
Engine chọn ở thanh trên: "Chạy thử" (mặc định) hoặc Claude thật (haiku / sonnet / mặc định). Claude thật cần `claude auth login` một lần (đường dẫn hiện trong giao diện); không tự đăng nhập hộ chủ dự án.

## Tính năng chính
- Bản đồ 3D, đi lại, họp có bong bóng thoại, hồ sơ bay giữa người giao và người nhận (suy ra từ việc đổi trạng thái), Trợ lý cầm cuộn giấy đi giao việc.
- ▶ Chạy demo (×1/×2/×4, lặp): kịch bản trong trình duyệt, dùng chính cơ chế trạng thái thật.
- 💬 Giao việc: giao cho Trợ lý / phòng ban / một người; mặc định lập kế hoạch → Duyệt/Chỉnh/Bỏ → chạy → báo cáo; nút "Thêm vào lịch" khi kế hoạch có mục "Đề xuất lịch". 🗣️ Họp: chọn chủ đề và người dự. Mỗi cuộc trò chuyện là một phiên Claude: tin nhắn sau (kể cả câu trả lời khác các phương án) nối tiếp phiên bằng `--resume` (prompt `reply`/`followPlan`/`followRun`); nút 🆕 Mới, đổi người nhận hoặc đổi engine thì mở phiên mới; phiên mất ("No conversation found") thì tự mở phiên mới và gửi lại. Chat thử lưu phiên theo engine (`claude:<sid>`).
- Máy chủ phải chạy suốt khi dùng (cửa sổ `chay-van-phong.bat`). Trang tự ping `/api/ping` mỗi 8 giây và hiện băng đỏ khi mất kết nối hoặc máy chủ vừa khởi động lại (token đổi → cần tải lại trang). Preview trong app Claude có thể bị app tự tắt.
- 🏢 Cơ cấu & Nhân sự (`hr.js`): cây phòng ban/nhân sự thu gọn được (trạng thái nhớ trong localStorage, cũng áp dụng cho danh sách bên trái). **Tuyển** (form hoặc nhờ Trưởng phòng Nhân sự), **đình chỉ** (người chuyển sang phòng dự bị, `status: "suspended"`, không được giao việc, không họp, lịch bỏ qua; hook chặn gọi họ bằng Agent tool), **phục hồi**, **sa thải** (hồ sơ + file agent vào `office/_archive/`, không xoá hẳn), **thành lập phòng**, **giải thể phòng** (người KHÔNG bị xoá: chuyển sang dự bị và bị đình chỉ; lịch giao cho phòng bị tắt). Không đình chỉ/sa thải được `giam-doc`, `tro-ly`, `tp-nhan-su`; không giải thể được phòng cố định (`giam-doc`, `hop`, `nhan-su`, `du-bi`).
- **Phòng Nhân sự**: Trưởng phòng đọc hồ sơ + lịch sử trong `office/hr/dossiers/` (server tự tạo từ `hr/history.jsonl` = đổi trạng thái + việc đã chạy + đình chỉ/tuyển/sa thải, góp ý 👍/👎, phiên bản prompt, ghi chú nhân sự) và chỉ ĐỀ XUẤT kế hoạch (khối `office-plan` JSON: create_agent, suspend, reinstate, move, fire, create_room, dissolve_room, set_head, update_prompt, note). Giám đốc tick từng mục rồi Duyệt thì server mới thực thi (`/api/hr/execute`); mục đình chỉ/sa thải/giải thể mặc định chưa tick. Số liệu engine mock không tính vào đánh giá năng lực thật. Yêu cầu: tuyển dụng, đánh giá, tinh gọn, mở rộng (tab "Nhờ Nhân sự"); hồ sơ và lịch sử từng người ở tab "Hồ sơ & lịch sử".
- 💬 Chat thử (trong bảng thông tin nhân vật): chat trong hộp cát, 👍/👎, Trợ lý đề xuất sửa prompt (so sánh trước/sau), hỏi lại với bản mới, bộ câu hỏi kiểm tra, lịch sử phiên bản/khôi phục, ⭐ đạt chuẩn.
- 📅 Lịch: hằng ngày/tuần/tháng/một lần, chạy bù khi lỡ giờ, giới hạn lượt/ngày, mỗi lúc 1 job Claude thật, mẫu gợi ý (tắt sẵn). **Chỉ chạy khi server đang bật.**
- 📥 Hộp thư giám đốc: kết quả của giao việc, họp, lịch; kế hoạch chờ duyệt của lịch ở chế độ plan.

## Quy tắc
- Không đăng bài, gửi email, chi tiền, tạo mã giảm giá thật, tạo ảnh/video tốn credit khi chủ dự án chưa đồng ý rõ. Agent và lịch chỉ soạn bản nháp vào `workspace/`; không hứa thu nhập hay kết quả chắc chắn.
- Lịch và giao việc không bật Bash (Bash chỉ bật khi chủ dự án tick tay trong khung chat).
- Hook `guard.ps1` (đã kiểm tra với Claude thật): agent chỉ ghi `workspace/<phòng mình>/` và `office/state/<id>.js` của mình; chat thử chỉ ghi `workspace/_thu-nghiem/<id>/`; phiên chính (Trợ lý) ghi `workspace/`, `office/state/tro-ly.js`, `office/meetings/current.js`.
- Không xoá file của chủ dự án. Agent/phòng ban bỏ đi thì chuyển vào `office/_archive/`, không xoá. Mỗi lần lưu agent, bản cũ được chép vào `office/agent-versions/<id>/`.
- **Skill, MCP, công cụ theo từng agent** (🧩 Năng lực): skill của tài khoản (`anthropic-skills:*`, đồng bộ ở `~/.claude/skills/synced/`) và skill của dự án (`.claude/skills/`, tải lên được) đều dùng được trong `claude -p`. Khoá `skills:` trong frontmatter KHÔNG tự nạp nội dung (đã thử); cách chạy được là agent có công cụ `Skill` + hook chặn skill ngoài danh sách `skills:` của agent. MCP giao bằng `mcp__claude_ai_<Tên>` (cả connector) hoặc `mcp__claude_ai_<Tên>__<công cụ>` trong `tools:`. Trợ lý (phiên chính) không dùng Skill/MCP, chỉ giao việc.
- MCP có thể gửi/đăng/tốn tiền (phân loại theo tên công cụ, `office/risk.json`) chỉ giao được sau khi giám đốc xác nhận (`riskAck` trong `org.json`); việc chạy theo lịch không bao giờ dùng được chúng. Connector claude.ai đôi khi chưa kịp kết nối khi `claude -p` khởi động: `Launch-Claude` tự thử lại tối đa 3 lần nếu init thiếu công cụ MCP cần dùng.
- `.claude/settings.json` có `claudeMdExcludes` để không nạp `D:\claude\CLAUDE.md` của Đảo Hoàng Sa (đã kiểm tra).
- Chi phí tham khảo (đo thật): chat thử với agent haiku ≈ $0.003/lượt; job của phiên chính (Trợ lý) tối thiểu ≈ $0.09 vì nạp cả ngữ cảnh; họp thật 2 người ≈ $0.33 ở model mặc định. Dùng "haiku" hoặc "Chạy thử" khi thử nghiệm.

## Tiếp tục dự án
Dùng skill `van-phong-alan` (`/van-phong-alan`) và `PROMPT-TIEP-TUC.md`. Kế hoạch gốc: `C:\Users\PCLTC\.claude\plans\velvety-percolating-wind.md`. Đã xong M0 đến M9 (không làm M3 âm thanh theo yêu cầu).
