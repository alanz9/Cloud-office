# Gia lap Claude Code chay headless (--output-format stream-json) de thu toan bo luong ma khong ton token.
# Ghi trang thai that vao office/state/*.js, cuoc hop vao office/meetings/current.js, ban nhap vao workspace/ nen van phong 3D hoat dong nhu khi chay that.
param([string]$Kind = 'chat', [string]$Mode = 'run', [string]$PromptFile, [string]$Agent = '', [string]$OfficeDir, [string]$Resume = '', [string]$Meta = '')
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$sid = if ($Resume) { $Resume } else { [guid]::NewGuid().ToString() }
$fs = New-Object IO.FileStream($PromptFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite); $sr = New-Object IO.StreamReader($fs, $utf8); $prompt = $sr.ReadToEnd(); $sr.Close()
$proj = Split-Path $OfficeDir -Parent
$org = [IO.File]::ReadAllText((Join-Path $OfficeDir 'org.json'), $utf8) | ConvertFrom-Json
$nameOf = @{}; foreach ($p in $org.people) { $nameOf[$p.id] = $p.name }

function Emit($o) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Depth 8 -Compress)); [Console]::Out.Flush() }
function Say($text) { Emit @{ type = 'assistant'; message = @{ role = 'assistant'; content = @(@{ type = 'text'; text = $text }) } } }
function ToolUse($name, $inp) { Emit @{ type = 'assistant'; message = @{ role = 'assistant'; content = @(@{ type = 'tool_use'; id = 'mock'; name = $name; input = $inp }) } } }
function Hhmm { (Get-Date).ToString('HH:mm') }
function WriteJs([string]$path, [string]$text) { [IO.File]::WriteAllText($path, $text, $utf8) }
function Set-State($id, $status, $task, $say, $to) {
  $o = @{ status = $status; task = $task; say = $say; log = @("$(Hhmm) $task") }
  if ($to) { $o.to = $to }
  WriteJs (Join-Path $OfficeDir "state\$id.js") ("window.AGENTS = window.AGENTS || {};`nwindow.AGENTS[`"$id`"] = " + (ConvertTo-Json -InputObject $o -Compress -Depth 4) + ";`n")
}
function Draft([string]$room, [string]$title, [string]$body) {
  $dir = Join-Path $proj "workspace\$room"; New-Item -ItemType Directory -Force $dir | Out-Null
  $f = Join-Path $dir ("mock-" + (Get-Date).ToString('HHmmss') + '-' + (Get-Random -Maximum 99) + '.md')
  WriteJs $f ("# $title`n`n(Ban nhap gia lap, khong ton token)`n`n$body`n")
  ToolUse 'Write' @{ file_path = $f }
  return $f
}
Emit @{ type = 'system'; subtype = 'init'; session_id = $sid; mock = $true }

# ---- tach yeu cau cua giam doc ra khoi prompt ----
$req = ''
$m1 = [regex]::Match($prompt, '(?s)(?:YÊU CẦU CỦA GIÁM ĐỐC|VIỆC CẦN LÀM|GIÁM ĐỐC NÓI):\s*\n(.*?)(?:\n\nNGƯỜI NHẬN|\n\nCHẾ ĐỘ|\n\nLOẠI|$)')
if ($m1.Success) { $req = $m1.Groups[1].Value.Trim() }
$reqFile = Join-Path $OfficeDir "chat\$sid.req.txt"
if ($req) { WriteJs $reqFile $req } elseif (Test-Path $reqFile) { $req = [IO.File]::ReadAllText($reqFile, $utf8) }
if (-not $req) { $req = 'việc được giao' }
if ($req.Length -gt 300) { $req = $req.Substring(0, 300) + '...' }

if ($Kind -eq 'trial') {
  $nm = if ($nameOf[$Agent]) { $nameOf[$Agent] } else { $Agent }
  Start-Sleep -Milliseconds 800
  Say "($nm, chạy thử không tốn token) Mình đã nhận: `"$req`". Nếu là việc thật mình sẽ soạn bản nháp ngắn gọn, đúng vai trò, lưu vào khu của mình và báo lại điều cần bạn quyết."
  Emit @{ type = 'result'; subtype = 'success'; is_error = $false; result = 'ok'; session_id = $sid; total_cost_usd = 0 }; exit 0
}
if ($Kind -eq 'improve') {
  $m = [regex]::Match($prompt, '(?s)PROMPT HIỆN TẠI:\s*\n<<<\n(.*?)\n>>>')
  $cur = if ($m.Success) { $m.Groups[1].Value } else { '' }
  Start-Sleep -Milliseconds 800
  Say "## Thay đổi chính`n- (Giả lập) Thêm nguyên tắc: trả lời ngắn gọn, có ví dụ cụ thể.`n- Giữ nguyên quy trình hiện tại.`n`n## Prompt mới`n<<<`n$cur`n`n- Luôn kèm một ví dụ cụ thể trong câu trả lời (đề xuất giả lập).`n>>>"
  Emit @{ type = 'result'; subtype = 'success'; is_error = $false; result = 'ok'; session_id = $sid; total_cost_usd = 0 }; exit 0
}
if ($Kind -eq 'meeting') {
  $parts = $Meta -split '\|', 3; $ids = @($parts[0] -split ',' | Where-Object { $_ }); $mid = $parts[1]; $topic = $parts[2]
  $lines = New-Object System.Collections.ArrayList
  function Save-Meeting([bool]$open) {
    $o = @{ id = $mid; topic = $topic; room = 'hop'; participants = $ids; open = $open; lines = @($lines) }
    WriteJs (Join-Path $OfficeDir 'meetings\current.js') ("window.MEETING = " + (ConvertTo-Json -InputObject $o -Compress -Depth 6) + ";`n")
  }
  function Speak($who, $text) { [void]$lines.Add(@{ who = $who; text = $text; t = (Hhmm) }); Save-Meeting $true; ToolUse 'Agent' @{ subagent_type = $who; description = "Phát biểu: $text" } }
  Set-State 'tro-ly' 'working' "Chủ trì họp: $topic" '' $null
  Save-Meeting $true; Say "Triệu tập họp: $topic. Người dự: $(($ids | ForEach-Object { if ($nameOf[$_]) { $nameOf[$_] } else { $_ } }) -join ', ')."
  Start-Sleep -Seconds 4
  Speak 'tro-ly' "Chào mọi người, hôm nay họp về: $topic."; Start-Sleep -Seconds 3
  $role = @{}; foreach ($p in $org.people) { $role[$p.id] = $p }
  $opinions = @('Phòng mình đề xuất làm trước phần gần người xem nhất, rồi đo kết quả.', 'Mình cần brief rõ hơn về đối tượng và mốc thời gian.', 'Mình sẽ chuẩn bị bản nháp trong hôm nay, kiểm duyệt rà trước khi trình.', 'Đồng ý, nhưng không hứa kết quả chắc chắn trong nội dung nhé.')
  $k = 0
  foreach ($round in 1..2) { foreach ($id in $ids) { if ($id -eq 'tro-ly') { continue }; Speak $id $opinions[$k % $opinions.Count]; $k++; Start-Sleep -Seconds 3 } }
  Speak 'tro-ly' 'Chốt: mỗi phòng làm bản nháp phần mình và báo lại, giám đốc duyệt sau.'; Start-Sleep -Seconds 2
  $bb = ($lines | ForEach-Object { "- **$(if ($nameOf[$_.who]) { $nameOf[$_.who] } else { $_.who })**: $($_.text)" }) -join "`n"
  [void](Draft 'giam-doc' "Biên bản họp: $topic" $bb)
  Save-Meeting $false; Set-State 'tro-ly' 'done' "Họp xong: $topic" 'Họp xong, biên bản đã lưu.' 'giam-doc'
  Say "Họp xong. Biên bản lưu trong workspace/giam-doc/. Các việc chốt: mỗi phòng làm bản nháp phần mình và báo lại."
  Emit @{ type = 'result'; subtype = 'success'; is_error = $false; result = "Họp xong: $topic. Biên bản trong workspace/giam-doc/."; session_id = $sid; total_cost_usd = 0 }; exit 0
}

if ($Kind -eq 'hr') {
  $ovf = Join-Path $OfficeDir 'hr\dossiers\_overview.json'
  $ov = if (Test-Path $ovf) { [IO.File]::ReadAllText($ovf, $utf8) | ConvertFrom-Json } else { $null }
  $rows = @(); if ($ov) { $rows = @($ov.people | Where-Object { $_.status -ne 'suspended' -and @('boss', 'assistant') -notcontains $_.role -and $_.id -ne 'tp-nhan-su' }) }
  Set-State 'tp-nhan-su' 'working' "Phân tích hồ sơ nhân sự: $req" 'Mình đọc hồ sơ và lịch sử làm việc.' $null
  Start-Sleep -Seconds 3
  $acts = @(); $sum = ''; $analysis = "## Phân tích (giả lập, không tốn token)`n"
  $analysis += "Đã đọc hồ sơ $($rows.Count) người đang làm việc. Số liệu có engine mock là chạy thử giả lập nên chưa đủ căn cứ đánh giá năng lực thật.`n"
  $roomOf = 'marketing'; foreach ($k in @('sale', 'cskh', 'marketing')) { if ($req.ToLower().Contains($k)) { $roomOf = $k } }; if ($req -match 'chăm sóc') { $roomOf = 'cskh' }
  switch ($Meta) {
    'recruit' {
      $sum = "Đề xuất tuyển 1 nhân viên cho phòng $roomOf theo yêu cầu."
      $acts += @{ type = 'create_agent'; name = 'Nhân viên mới'; title = "Nhân viên bổ sung ($roomOf)"; room = $roomOf; role = 'staff'; vibe = 'Chăm chỉ, học nhanh.'; color = '#5b8def'; description = "Nhân viên bổ sung cho phòng $roomOf. Dùng khi cần thêm người soạn bản nháp theo brief của trưởng phòng."; tools = 'Read, Write, Edit, Glob'; model = 'haiku'; persona = '' }
      $acts += @{ type = 'note'; id = 'tp-nhan-su'; kind = 'hire'; text = "Tuyển bổ sung theo yêu cầu: $req" }
      $analysis += "Chưa có người nào trong hồ sơ phù hợp hơn để phục hồi hay điều chuyển."
    }
    'lean' {
      $low = @($rows | Where-Object { $_.role -eq 'staff' } | Sort-Object { [int]$_.jobsReal + [int]$_.jobsMock + 3 * [int]$_.thumbsUp - 3 * [int]$_.thumbsDown } | Select-Object -First 2)
      $sum = "Tinh gọn: đình chỉ $($low.Count) người ít việc nhất (có thể phục hồi)."
      foreach ($p in $low) { $acts += @{ type = 'suspend'; id = $p.id; reason = "Ít việc nhất theo lịch sử (giả lập): $([int]$p.jobsReal + [int]$p.jobsMock) lượt, $($p.thumbsUp) 👍, $($p.thumbsDown) 👎." } ; $analysis += "- $($p.name): $([int]$p.jobsReal + [int]$p.jobsMock) lượt chạy.`n" }
    }
    'expand' {
      $sum = 'Mở rộng: lập phòng Nghiên cứu thị trường với 1 trưởng phòng và 1 nhân viên.'
      $acts += @{ type = 'create_room'; name = 'Nghiên cứu thị trường'; color = '#d98e2b' }
      $acts += @{ type = 'create_agent'; name = 'Nam'; title = 'Trưởng phòng Nghiên cứu thị trường'; room = 'Nghiên cứu thị trường'; role = 'head'; vibe = 'Tò mò, thích số liệu.'; color = '#d98e2b'; description = 'Nam, trưởng phòng Nghiên cứu thị trường. Dùng khi cần tìm hiểu thị trường, đối thủ, xu hướng AI.'; tools = 'Read, Write, Edit, Glob, WebSearch, WebFetch'; model = 'sonnet'; persona = '' }
      $acts += @{ type = 'create_agent'; name = 'Hoa'; title = 'Chuyên viên thu thập dữ liệu'; room = 'Nghiên cứu thị trường'; role = 'staff'; vibe = 'Tỉ mỉ.'; color = '#e6b25a'; description = 'Hoa, thu thập và tóm tắt dữ liệu thị trường cho phòng Nghiên cứu.'; tools = 'Read, Write, Edit, Glob, WebSearch'; model = 'haiku'; persona = '' }
      $susp = @(); if ($ov) { $susp = @($ov.people | Where-Object { $_.status -eq 'suspended' } | Select-Object -First 1) }
      foreach ($s in $susp) { $acts += @{ type = 'reinstate'; id = $s.id; room = 'marketing'; reason = 'Phục hồi để mở rộng (giả lập)' } }
    }
    default {
      $sum = 'Đánh giá từng người đang làm việc (giả lập).'
      foreach ($p in $rows) { $n = [int]$p.jobsReal + [int]$p.jobsMock; $v = if ($n -ge 3) { 'Đạt' } elseif ($n -ge 1) { 'Cần cải thiện' } else { 'Chưa đủ dữ liệu' }
        $acts += @{ type = 'note'; id = $p.id; kind = 'evaluation'; text = "$v (giả lập): $n lượt chạy, $($p.thumbsUp) 👍, $($p.thumbsDown) 👎. Góp ý: dùng chat thử để rèn thêm với tình huống thật." }; $analysis += "- $($p.name): $v ($n lượt).`n" }
    }
  }
  $plan = @{ summary = $sum; actions = $acts } | ConvertTo-Json -Depth 6
  $txt = "$analysis`n## Kế hoạch`n$sum`n`n``````office-plan`n$plan`n``````"
  Say $txt; Set-State 'tp-nhan-su' 'review' "Đã lập kế hoạch nhân sự: $sum" 'Kế hoạch xong, chờ giám đốc duyệt.' 'giam-doc'
  Emit @{ type = 'result'; subtype = 'success'; is_error = $false; result = $txt; session_id = $sid; total_cost_usd = 0 }
  Start-Sleep -Seconds 5; Set-State 'tp-nhan-su' 'idle' 'Chưa có việc' '' $null; exit 0
}
# ---- chat / schedule ----
if ($Mode -eq 'plan') {
  Start-Sleep -Seconds 1
  $txt = "## Mình hiểu yêu cầu là`n$req`n`n## Các bước`n1. Trợ lý chia việc cho phòng ban phù hợp.`n2. Trưởng phòng và nhân viên soạn bản nháp trong workspace/.`n3. Kiểm duyệt rà lại trước khi trình giám đốc.`n`n## Cần giám đốc quyết hoặc làm rõ`n- Đối tượng và mốc thời gian (giả lập).`n`n## Rủi ro và chi phí đáng chú ý`n- Chỉ soạn bản nháp, không đăng, không chi tiền."
  if ($req -match '(mỗi ngày|hằng ngày|hàng ngày|hằng tuần|hàng tuần|mỗi tuần|hằng tháng)') { $txt += "`n`n## Đề xuất lịch`n- Chạy mỗi ngày lúc 08:00, Trợ lý phụ trách." }
  Say $txt
  Emit @{ type = 'result'; subtype = 'success'; is_error = $false; result = $txt; session_id = $sid; total_cost_usd = 0 }; exit 0
}
$short = if ($req.Length -gt 60) { $req.Substring(0, 60) + '...' } else { $req }
Set-State 'tro-ly' 'working' "Điều phối: $short" 'Mình chia việc cho các phòng nhé.' $null
Say "Mình đã hiểu việc và bắt đầu chia cho các phòng."
Start-Sleep -Seconds 2
$steps = New-Object System.Collections.ArrayList
if ($Agent) {
  $room = ($org.people | Where-Object { $_.id -eq $Agent } | Select-Object -First 1).room
  [void]$steps.Add(@{ id = $Agent; room = $room; task = "Soạn bản nháp: $short" })
  $mates = @($org.people | Where-Object { $_.room -eq $room -and $_.id -ne $Agent -and $_.role -eq 'staff' } | Select-Object -First 2)
  foreach ($mt in $mates) { [void]$steps.Add(@{ id = $mt.id; room = $room; task = "Phần việc của $($mt.name): $short" }) }
} else {
  foreach ($r in ($org.rooms | Where-Object { $_.kind -eq 'dept' })) {
    $st = @($org.people | Where-Object { $_.room -eq $r.id -and $_.role -eq 'staff' } | Select-Object -First 1)
    if ($st.Count) { [void]$steps.Add(@{ id = $st[0].id; room = $r.id; task = "Soạn bản nháp: $short" }) }
  }
}
foreach ($s in $steps) {
  ToolUse 'Agent' @{ subagent_type = $s.id; description = $s.task }
  Set-State $s.id 'working' $s.task "Mình bắt đầu làm: $short" $null
  Start-Sleep -Seconds 4
  [void](Draft $s.room "Bản nháp của $($nameOf[$s.id])" "Yêu cầu: $req")
  Set-State $s.id 'review' "Xong bản nháp, chờ duyệt" 'Xong rồi, gửi kiểm duyệt!' 'kiem-duyet'
  Start-Sleep -Seconds 1
}
Set-State 'kiem-duyet' 'working' 'Rà soát các bản nháp' 'Mình soát chính tả và lời hứa nhé.' $null
ToolUse 'Agent' @{ subagent_type = 'kiem-duyet'; description = 'Rà các bản nháp' }
Start-Sleep -Seconds 3
$kd = Draft 'giam-doc' 'Nhận xét kiểm duyệt' 'Đạt. Không có lời hứa thu nhập, không lỗi nghiêm trọng (giả lập).'
Set-State 'kiem-duyet' 'done' 'Đã duyệt, đạt' 'Đạt, trình giám đốc.' 'tro-ly'
foreach ($s in $steps) { Set-State $s.id 'done' 'Hoàn thành' '' $null }
Set-State 'tro-ly' 'done' "Hoàn thành: $short" 'Xong, báo giám đốc.' 'giam-doc'
$final = "Đã làm xong (giả lập): $short`nBản nháp nằm trong workspace/ của từng phòng, kiểm duyệt đã rà. Không có việc nào đăng bài hay chi tiền."
Say $final
Emit @{ type = 'result'; subtype = 'success'; is_error = $false; result = $final; session_id = $sid; total_cost_usd = 0 }
Start-Sleep -Seconds 6
foreach ($s in $steps) { Set-State $s.id 'idle' 'Chưa có việc' '' $null }
Set-State 'kiem-duyet' 'idle' 'Chưa có việc' '' $null; Set-State 'tro-ly' 'idle' 'Chưa có việc' '' $null
