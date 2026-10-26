# Nhan su: lich su lam viec, ho so, dinh chi / phuc hoi / sa thai, thanh lap / giai the phong ban, ke hoach nhan su (HR de xuat, giam doc duyet, server thuc thi).
# Nap bang dot-source tu serve.ps1. ASCII only (chu Viet nam trong prompts.json).
$hrDir = Join-Path $root 'hr'; $histPath = Join-Path $hrDir 'history.jsonl'; $dosDir = Join-Path $hrDir 'dossiers'; $notesDir = Join-Path $hrDir 'notes'
foreach ($d in $hrDir, $dosDir, $notesDir) { New-Item -ItemType Directory -Force $d | Out-Null }
$RESERVE_ID = 'du-bi'; $HR_ID = 'nhan-su'; $HR_HEAD = 'tp-nhan-su'
$PROTECTED = @('giam-doc', 'tro-ly', $HR_HEAD)
$FIXED_ROOMS = @('giam-doc', 'hop', $HR_ID, $RESERVE_ID)
$SLOTS = @(@(-1, 0), @(1, 0), @(0, 1), @(-1, 1), @(1, 1), @(-2, 0), @(2, 0), @(-2, -1), @(2, -1), @(-2, 1), @(2, 1), @(-3, 0), @(3, 0), @(0, -2), @(-1, -2), @(1, -2))
$MAX_ROOMS = 16
$script:lastStatus = @{}

function Hr-Log([hashtable]$e) { $e.t = (Get-Date).ToString('s'); try { [IO.File]::AppendAllText($histPath, (Json $e 6) + "`n", $utf8) } catch {} }
function Hr-History([int]$max) {
  if (-not (Test-Path $histPath)) { return @() }
  $txt = ''; try { $fs = [IO.File]::Open($histPath, 'Open', 'Read', 'ReadWrite'); $sr = New-Object IO.StreamReader($fs, $utf8); $txt = $sr.ReadToEnd(); $sr.Close() } catch { return @() }
  $ls = @($txt -split "`r?`n" | Where-Object { $_.StartsWith('{') }); if ($ls.Count -gt $max) { $ls = @($ls[($ls.Count - $max)..($ls.Count - 1)]) }
  $out = @(); foreach ($l in $ls) { try { $out += ($l | ConvertFrom-Json) } catch {} }; return $out
}
function Get-Person($org, [string]$id) { $org.people | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
function Get-RoomById($org, [string]$id) { $org.rooms | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
function Resolve-Room($org, [string]$ref) {
  if (-not $ref) { return $null }
  $r = Get-RoomById $org $ref; if ($r) { return $r }
  $s = Slug $ref; return ($org.rooms | Where-Object { $_.id -eq $s -or (Slug $_.name) -eq $s } | Select-Object -First 1)
}
function Is-Suspended($p) { return ($p -and [string]$p.status -eq 'suspended') }
function Set-Prop($o, [string]$name, $value) { $o | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }
function Write-IdleState([string]$id, [string]$task) {
  $pr = Get-Prompts; if (-not $task) { $task = $pr.idleTask }
  $js = "window.AGENTS = window.AGENTS || {};`nwindow.AGENTS[`"$id`"] = { status: `"idle`", task: `"$($task.Replace('"', ''))`", say: `"`", log: [`"$((Get-Date).ToString('HH:mm')) $($task.Replace('"', ''))`"] };`n"
  [IO.File]::WriteAllText((Join-Path $root "state\$id.js"), $js, $utf8)
}

# ---------- ghi lai lich su: doi trang thai (poll file state) va cong viec (khi job ket thuc) ----------
function Hr-PollStates {
  $org = Get-Org
  foreach ($p in $org.people) {
    if ($p.id -eq 'giam-doc') { continue }
    $f = Join-Path $root "state\$($p.id).js"; if (-not (Test-Path $f)) { continue }
    $t = ''; try { $t = [IO.File]::ReadAllText($f, $utf8) } catch { continue }
    $m = [regex]::Match($t, 'status"?:\s*"(\w+)"'); if (-not $m.Success) { continue }
    $st = $m.Groups[1].Value; $old = $script:lastStatus[$p.id]
    if ($old -ne $null -and $old -ne $st) {
      $task = [regex]::Match($t, 'task"?:\s*"([^"]*)"').Groups[1].Value; if ($task.Length -gt 120) { $task = $task.Substring(0, 120) }
      Hr-Log @{ ev = 'status'; id = $p.id; from = $old; to = $st; task = $task }
    }
    $script:lastStatus[$p.id] = $st
  }
}
function Hr-RecordJob($j, [string]$id, $sum) {
  $ag = @{}; if ($j.agent) { $ag[[string]$j.agent] = 1 }
  foreach ($l in (Read-Lines $j.out $false)) {
    try { $e = $l | ConvertFrom-Json } catch { continue }
    if ($e.type -eq 'assistant' -and $e.message -and $e.message.content) {
      foreach ($c in $e.message.content) { if ($c.type -eq 'tool_use' -and ($c.name -eq 'Agent' -or $c.name -eq 'Task') -and $c.input.subagent_type) { $k = [string]$c.input.subagent_type; $ag[$k] = 1 + [int]$ag[$k] } }
    }
  }
  $ok = (-not $sum.isError) -and [bool]$sum.result
  Hr-Log @{ ev = 'job'; job = $id; kind = $j.kind; label = $j.label; engine = $(if ($j.engine -eq 'mock') { 'mock' } else { 'claude' }); ok = $ok; cost = $sum.cost; agents = @($ag.Keys); files = @($sum.files).Count }
}

# ---------- ghi chu nhan su ----------
function Add-Note([string]$id, [string]$kind, [string]$text, [string]$by) {
  if (@('evaluation', 'feedback', 'warning', 'praise', 'suspend', 'reinstate', 'fire', 'move', 'training', 'hire') -notcontains $kind) { $kind = 'feedback' }
  $line = Json @{ t = (Get-Date).ToString('s'); kind = $kind; text = (One-Line $text 2000); by = $by } 3
  [IO.File]::AppendAllText((Join-Path $notesDir "$id.jsonl"), $line + "`n", $utf8)
}
function Get-Notes([string]$id, [int]$max) {
  $f = Join-Path $notesDir "$id.jsonl"; if (-not (Test-Path $f)) { return @() }
  $ls = @([IO.File]::ReadAllLines($f, $utf8) | Where-Object { $_.StartsWith('{') }); if ($ls.Count -gt $max) { $ls = @($ls[($ls.Count - $max)..($ls.Count - 1)]) }
  $out = @(); foreach ($l in $ls) { try { $out += ($l | ConvertFrom-Json) } catch {} }; return $out
}

# ---------- ho so nhan su (cho Truong phong Nhan su doc) ----------
function Build-Dossier($org, $hist, $p) {
  $id = [string]$p.id; $jobs = @($hist | Where-Object { $_.ev -eq 'job' -and @($_.agents) -contains $id })
  $real = @($jobs | Where-Object { $_.engine -eq 'claude' }); $mock = @($jobs | Where-Object { $_.engine -eq 'mock' })
  $sc = @($hist | Where-Object { $_.ev -eq 'status' -and $_.id -eq $id })
  $workSec = @(); $start = $null
  foreach ($e in $sc) { $t = [datetime]::Parse([string]$e.t); if ($e.to -eq 'working') { $start = $t } elseif ($start -and ($e.to -eq 'review' -or $e.to -eq 'done' -or $e.to -eq 'idle')) { $workSec += [int]($t - $start).TotalSeconds; $start = $null } }
  $avg = 0; if ($workSec.Count) { $avg = [int](($workSec | Measure-Object -Average).Average) }
  $f = Join-Path $agentsDir "$id.md"; $a = $null; if (Test-Path $f) { $a = Parse-Agent $f }
  $up = 0; $down = 0; $comments = @()
  $td = Join-Path $root "trials\$id"
  if (Test-Path $td) { foreach ($tf in (Get-ChildItem $td -Filter *.json)) { try { $tj = [IO.File]::ReadAllText($tf.FullName, $utf8) | ConvertFrom-Json; foreach ($m in @($tj.messages)) { if ($m.vote -eq 'up') { $up++ } elseif ($m.vote -eq 'down') { $down++; if ($m.fb) { $comments += [string]$m.fb } } } } catch {} } }
  $tests = Read-Json (Join-Path $root "tests\$id.json") $null; $cert = (Read-Json $certPath ([pscustomobject]@{})).$id
  $vdir = Join-Path $root "agent-versions\$id"; $versions = 0; if (Test-Path $vdir) { $versions = @(Get-ChildItem $vdir -Filter *.md).Count }
  $room = Get-RoomById $org ([string]$p.room)
  $d = [ordered]@{
    id = $id; name = $p.name; title = $p.title; room = $p.room; roomName = $(if ($room) { $room.name } else { '' }); role = $p.role; status = $(if ($p.status) { [string]$p.status } else { 'active' })
    joinedAt = [string]$p.joinedAt; suspendedAt = [string]$p.suspendedAt; reason = [string]$p.reason; prevRoom = [string]$p.prevRoom; model = $(if ($a) { $a.model } else { '' })
    capabilities = [ordered]@{ tools = $(if ($a) { $a.tools } else { '' }); skills = $(if ($a) { $a.skills } else { '' }) }
    promptHead = $(if ($a -and $a.persona.Length -gt 400) { $a.persona.Substring(0, 400) } elseif ($a) { $a.persona } else { '' })
    stats = [ordered]@{ jobsReal = $real.Count; jobsRealOk = @($real | Where-Object { $_.ok }).Count; jobsRealFailed = @($real | Where-Object { -not $_.ok }).Count; jobsMock = $mock.Count; statusChanges = $sc.Count; workSessions = $workSec.Count; avgWorkSeconds = $avg; lastActive = $(if ($sc.Count) { [string]$sc[-1].t } else { '' }) }
    recentJobs = @($jobs | Select-Object -Last 10 | ForEach-Object { [ordered]@{ t = $_.t; label = $_.label; kind = $_.kind; engine = $_.engine; ok = $_.ok } })
    feedback = [ordered]@{ up = $up; down = $down; comments = @($comments | Select-Object -Last 8) }
    trials = [ordered]@{ testCases = $(if ($tests) { @($tests.cases).Count } else { 0 }); certified = $(if ($cert) { [string]$cert.at } else { '' }); promptVersions = $versions }
    notes = @(Get-Notes $id 12)
  }
  return $d
}
function Build-AllDossiers {
  $org = Get-Org; $hist = Hr-History 3000; $rows = @()
  foreach ($p in $org.people) {
    if ($p.id -eq 'giam-doc') { continue }
    $d = Build-Dossier $org $hist $p; Write-Json (Join-Path $dosDir "$($p.id).json") $d 8
    $rows += [ordered]@{ id = $p.id; name = $p.name; title = $p.title; room = $p.room; role = $p.role; status = $d.status; jobsReal = $d.stats.jobsReal; jobsRealOk = $d.stats.jobsRealOk; jobsMock = $d.stats.jobsMock; thumbsUp = $d.feedback.up; thumbsDown = $d.feedback.down; lastActive = $d.stats.lastActive }
  }
  $present = @($org.people | ForEach-Object { $_.id })
  Get-ChildItem $dosDir -Filter *.json | Where-Object { $_.BaseName -ne '_overview' -and $present -notcontains $_.BaseName } | Remove-Item -Force
  $rooms = @($org.rooms | ForEach-Object { $r = $_; $m = @($org.people | Where-Object { $_.room -eq $r.id }); [ordered]@{ id = $r.id; name = $r.name; kind = $r.kind; head = [string]$r.headId; members = $m.Count; suspended = @($m | Where-Object { Is-Suspended $_ }).Count } })
  $ov = [ordered]@{ generatedAt = (Get-Date).ToString('s'); note = 'engine mock = chay thu gia lap, khong tinh vao danh gia nang luc that'; rooms = $rooms; people = $rows }
  Write-Json (Join-Path $dosDir '_overview.json') $ov 8
  return $ov
}

# ---------- cac hanh dong nhan su (dung chung cho nut tren giao dien va ke hoach da duyet) ----------
function R-Ok([string]$msg, $extra) { $r = @{ ok = $true; msg = $msg }; if ($extra) { foreach ($k in $extra.Keys) { $r[$k] = $extra[$k] } }; return $r }
function R-Err([string]$msg) { return @{ ok = $false; msg = $msg } }
function Do-Suspend([string]$id, [string]$reason, [string]$by) {
  $org = Get-Org; $p = Get-Person $org $id; $pr = Get-Prompts
  if (-not $p) { return R-Err 'khong-co-nguoi-nay' }
  if ($PROTECTED -contains $id) { return R-Err 'khong-duoc-dinh-chi-nguoi-nay' }
  if (Is-Suspended $p) { return R-Err 'da-bi-dinh-chi' }
  if (-not (Get-RoomById $org $RESERVE_ID)) { return R-Err 'thieu-phong-du-bi' }
  $old = Get-RoomById $org ([string]$p.room); if ($old -and [string]$old.headId -eq $id) { $old.headId = '' }
  Set-Prop $p 'prevRoom' ([string]$p.room); Set-Prop $p 'status' 'suspended'; Set-Prop $p 'suspendedAt' ((Get-Date).ToString('s')); Set-Prop $p 'reason' (One-Line $reason 300)
  $p.room = $RESERVE_ID; $p.role = 'staff'; Save-Org $org
  Write-IdleState $id $pr.hrSuspendedTask
  Hr-Log @{ ev = 'suspend'; id = $id; reason = (One-Line $reason 300); from = [string]$p.prevRoom; by = $by }; Add-Note $id 'suspend' $reason $by
  return R-Ok 'suspended'
}
function Do-Reinstate([string]$id, [string]$roomRef, [string]$reason, [string]$by) {
  $org = Get-Org; $p = Get-Person $org $id
  if (-not $p) { return R-Err 'khong-co-nguoi-nay' }
  if (-not (Is-Suspended $p)) { return R-Err 'khong-bi-dinh-chi' }
  $ref = $roomRef; if (-not $ref) { $ref = [string]$p.prevRoom }
  $room = Resolve-Room $org $ref
  if (-not $room -or @('dept', 'boss', 'hr') -notcontains $room.kind) { return R-Err 'can-chon-phong-hop-le' }
  Set-Prop $p 'status' 'active'; $p.room = $room.id; $p.role = 'staff'; Set-Prop $p 'suspendedAt' ''; Set-Prop $p 'reason' ''; Set-Prop $p 'prevRoom' ''
  Save-Org $org; Write-IdleState $id ''
  Hr-Log @{ ev = 'reinstate'; id = $id; room = $room.id; by = $by }; Add-Note $id 'reinstate' ("-> " + $room.id + ". " + $reason) $by
  return R-Ok 'reinstated' @{ room = $room.id }
}
function Do-Move([string]$id, [string]$roomRef, [string]$by) {
  $org = Get-Org; $p = Get-Person $org $id; if (-not $p) { return R-Err 'khong-co-nguoi-nay' }
  if ($PROTECTED -contains $id) { return R-Err 'khong-duoc-chuyen-nguoi-nay' }
  if (Is-Suspended $p) { return R-Err 'dang-bi-dinh-chi-hay-phuc-hoi-truoc' }
  $room = Resolve-Room $org $roomRef; if (-not $room -or @('dept', 'boss', 'hr') -notcontains $room.kind) { return R-Err 'phong-khong-hop-le' }
  if ($room.id -eq $p.room) { return R-Ok 'unchanged' }
  $old = Get-RoomById $org ([string]$p.room); if ($old -and [string]$old.headId -eq $id) { $old.headId = '' }
  $from = [string]$p.room; $p.room = $room.id; $p.role = 'staff'; Save-Org $org
  Hr-Log @{ ev = 'move'; id = $id; from = $from; to = $room.id; by = $by }; Add-Note $id 'move' ("$from -> " + $room.id) $by
  return R-Ok 'moved'
}
function Do-SetHead([string]$roomRef, [string]$id, [string]$by) {
  $org = Get-Org; $room = Resolve-Room $org $roomRef; $p = Get-Person $org $id
  if (-not $room -or @('dept', 'hr') -notcontains $room.kind) { return R-Err 'phong-khong-hop-le' }
  if (-not $p -or [string]$p.room -ne $room.id -or (Is-Suspended $p)) { return R-Err 'nguoi-phai-dang-lam-viec-trong-phong' }
  foreach ($q in $org.people) { if ($q.room -eq $room.id -and $q.role -eq 'head') { $q.role = 'staff' } }
  $p.role = 'head'; $room.headId = $id; Save-Org $org; Hr-Log @{ ev = 'sethead'; id = $id; room = $room.id; by = $by }
  return R-Ok 'head-set'
}
function Do-Fire([string]$id, [string]$reason, [string]$by) {
  $org = Get-Org; $p = Get-Person $org $id
  if (-not $p) { return R-Err 'khong-co-nguoi-nay' }
  if ($PROTECTED -contains $id) { return R-Err 'khong-duoc-sa-thai-nguoi-nay' }
  $ad = Join-Path $root '_archive'; $st = Stamp
  try { $d = Build-Dossier $org (Hr-History 3000) $p; Write-Json (Join-Path $ad "hr-$id-$st.json") $d 8 } catch {}
  $f = Join-Path $agentsDir "$id.md"; if (Test-Path $f) { Move-Item $f (Join-Path $ad "agent-$id-$st.md") }
  $s = Join-Path $root "state\$id.js"; if (Test-Path $s) { Move-Item $s (Join-Path $ad "state-$id-$st.js") }
  foreach ($r in $org.rooms) { if ($r.headId -eq $id) { $r.headId = '' } }
  $org.people = @($org.people | Where-Object { $_.id -ne $id }); Save-Org $org
  Hr-Log @{ ev = 'fire'; id = $id; name = $p.name; reason = (One-Line $reason 300); by = $by }; Add-Note $id 'fire' $reason $by
  $dis = Join-Path $dosDir "$id.json"; if (Test-Path $dis) { Remove-Item $dis -Force }
  return R-Ok 'fired'
}
function Do-CreateRoom([string]$name, [string]$color, [string]$by) {
  $org = Get-Org; $name = One-Line $name 40
  if (-not $name) { return R-Err 'ten-phong-rong' }
  if ($color -notmatch '^#[0-9a-fA-F]{6}$') { $color = '#2aa198' }
  if (@($org.rooms).Count -ge $MAX_ROOMS) { return R-Err 'toi-da-phong' }
  $id = Slug $name; if ($id -notmatch '^[a-z0-9][a-z0-9-]{1,29}$') { $id = 'phong-' + (Get-Random -Maximum 999) }
  $base = $id; $n = 2; while ($org.rooms | Where-Object { $_.id -eq $id }) { $id = "$base-$n"; $n++ }
  $used = @($org.rooms | ForEach-Object { "$($_.slot[0]),$($_.slot[1])" }); $slot = $null
  foreach ($c in $SLOTS) { if ($used -notcontains "$($c[0]),$($c[1])") { $slot = $c; break } }
  if (-not $slot) { return R-Err 'het-o-trong' }
  $room = [pscustomobject]@{ id = $id; name = $name; kind = 'dept'; slot = @($slot[0], $slot[1]); color = $color; headId = '' }
  $org.rooms = @($org.rooms) + $room; Save-Org $org; New-Item -ItemType Directory -Force (Join-Path $wsDir $id) | Out-Null
  Hr-Log @{ ev = 'room-create'; room = $id; name = $name; by = $by }
  return R-Ok 'room-created' @{ id = $id }
}
function Do-Dissolve([string]$roomRef, [string]$by) {
  $org = Get-Org; $room = Resolve-Room $org $roomRef; $pr = Get-Prompts
  if (-not $room) { return R-Err 'khong-co-phong' }
  if ($room.kind -ne 'dept' -or $FIXED_ROOMS -contains $room.id) { return R-Err 'phong-co-dinh-khong-giai-the-duoc' }
  $moved = @(); foreach ($p in @($org.people | Where-Object { $_.room -eq $room.id })) { $r = Do-Suspend $p.id ($pr.hrDissolveReason + ': ' + $room.name) $by; if ($r.ok) { $moved += $p.id } }
  $org = Get-Org; $room = Get-RoomById $org $room.id
  Write-Json (Join-Path $root "_archive\room-$($room.id)-$(Stamp).json") $room 4
  $org.rooms = @($org.rooms | Where-Object { $_.id -ne $room.id }); Save-Org $org
  $sc = Read-Json $schedPath $null
  if ($sc) { foreach ($it in $sc.items) { if ([string]$it.target -eq "dept:$($room.id)") { $it.enabled = $false } }; Write-Json $schedPath $sc }
  Hr-Log @{ ev = 'room-dissolve'; room = $room.id; moved = $moved; by = $by }
  return R-Ok 'dissolved' @{ moved = $moved }
}
function Do-CreateAgent($a, [string]$by) {
  $org = Get-Org; $pr = Get-Prompts
  if (@($org.people | Where-Object { $_.role -ne 'boss' -and $_.id -ne 'tro-ly' }).Count -ge 30) { return R-Err 'toi-da-30-agent' }
  $name = One-Line ([string]$a.name) 40; $title = One-Line ([string]$a.title) 120
  if (-not $name -or -not $title) { return R-Err 'thieu-ten-hoac-chuc-danh' }
  $room = Resolve-Room $org ([string]$a.room)
  if (-not $room -or @('dept', 'boss', 'hr') -notcontains $room.kind) { return R-Err 'phong-khong-hop-le' }
  $role = [string]$a.role; if (@('head', 'staff') -notcontains $role -or $room.kind -eq 'boss') { $role = 'staff' }
  $color = [string]$a.color; if ($color -notmatch '^#[0-9a-fA-F]{6}$') { $color = [string]$room.color }
  $id = [string]$a.id; if (-not $id) { $id = Slug $title }
  if ($id.Length -gt 30) { $id = $id.Substring(0, 30).Trim('-') }
  if ($id -notmatch '^[a-z0-9][a-z0-9-]{1,29}$' -or $RESERVED -contains $id) { $id = 'nv-' + (Get-Random -Maximum 9999) }
  $base = $id; $n = 2; while ($org.people | Where-Object { $_.id -eq $id }) { $id = "$base-$n"; $n++ }
  $persona = [string]$a.persona; if (-not $persona.Trim()) { $persona = $pr.agentTemplate.Replace('{name}', $name).Replace('{title}', $title).Replace('{room}', $room.id) }
  $tools = One-Line ([string]$a.tools) 300; if (-not $tools) { $tools = 'Read, Write, Edit, Glob' }
  $model = [string]$a.model; if ($MODELS_OK -notcontains $model -or -not $model) { $model = 'haiku' }
  $desc = One-Line ([string]$a.description) 600; if (-not $desc) { $desc = "$name, $title." }
  $x = @{ description = $desc; tools = $tools; model = $model; skills = (One-Line ([string]$a.skills) 300); persona = $persona }
  $e = Check-AgentFields $x; if ($e) { return R-Err $e }
  $x = Normalize-Caps $x; $snap = Get-Snapshot
  if (@(Risk-Servers $x.tools $snap).Count) { return R-Err 'mcp-rui-ro-can-giam-doc-xac-nhan-thu-cong' }
  $f = @{ description = $x.description; tools = $x.tools; model = $x.model; skills = $x.skills; persona = $x.persona; extra = ''; tail = $pr.statusTail.Replace('{id}', $id) }
  [void](Save-AgentFile $id $f); Write-IdleState $id ''
  if ($role -eq 'head') { foreach ($q in $org.people) { if ($q.room -eq $room.id -and $q.role -eq 'head') { $q.role = 'staff' } }; $room.headId = $id }
  $person = [pscustomobject]@{ id = $id; name = $name; title = $title; room = $room.id; role = $role; vibe = (One-Line ([string]$a.vibe) 300); color = $color; status = 'active'; joinedAt = (Get-Date).ToString('s') }
  $org.people = @($org.people) + $person; Save-Org $org; New-Item -ItemType Directory -Force (Join-Path $wsDir $room.id) | Out-Null
  Hr-Log @{ ev = 'hire'; id = $id; name = $name; room = $room.id; by = $by }; Add-Note $id 'hire' ("$title / " + $room.id) $by
  return R-Ok 'hired' @{ id = $id }
}
function Do-UpdatePrompt([string]$id, [string]$persona, [string]$reason, [string]$by) {
  $f = Join-Path $agentsDir "$id.md"; if (-not (Test-Path $f)) { return R-Err 'khong-co-file-agent' }
  $a = Parse-Agent $f; if (-not $persona.Trim() -or $persona.Length -gt 20000) { return R-Err 'prompt-khong-hop-le' }
  $n = @{ description = $a.description; tools = $a.tools; model = $a.model; skills = $a.skills; persona = $persona.Replace("`r`n", "`n").Trim(); extra = $a.extra; tail = $a.tail }
  [void](Save-AgentFile $id $n); Hr-Log @{ ev = 'coach'; id = $id; reason = (One-Line $reason 300); by = $by }; Add-Note $id 'training' $reason $by
  return R-Ok 'prompt-updated'
}
function Do-Action($act, [string]$by) {
  $t = [string]$act.type
  switch ($t) {
    'create_agent' { return Do-CreateAgent $act $by }
    'suspend' { return Do-Suspend ([string]$act.id) ([string]$act.reason) $by }
    'reinstate' { return Do-Reinstate ([string]$act.id) ([string]$act.room) ([string]$act.reason) $by }
    'move' { return Do-Move ([string]$act.id) ([string]$act.room) $by }
    'fire' { return Do-Fire ([string]$act.id) ([string]$act.reason) $by }
    'create_room' { return Do-CreateRoom ([string]$act.name) ([string]$act.color) $by }
    'dissolve_room' { return Do-Dissolve ([string]$act.room) $by }
    'set_head' { return Do-SetHead ([string]$act.room) ([string]$act.id) $by }
    'update_prompt' { return Do-UpdatePrompt ([string]$act.id) ([string]$act.persona) ([string]$act.reason) $by }
    'note' { $p = Get-Person (Get-Org) ([string]$act.id); if (-not $p) { return R-Err 'khong-co-nguoi-nay' }; Add-Note ([string]$act.id) ([string]$act.kind) ([string]$act.text) $by; return R-Ok 'noted' }
    default { return R-Err "loai-hanh-dong-khong-hop-le: $t" }
  }
}
# trich ke hoach tu van ban tra loi cua Truong phong Nhan su
function Parse-HrPlan([string]$text) {
  $m = [regex]::Match($text, '```office-plan\s*(.*?)```', 'Singleline'); if (-not $m.Success) { return $null }
  try { $p = $m.Groups[1].Value | ConvertFrom-Json } catch { return $null }
  if (-not $p -or -not $p.actions) { return $null }
  $acts = @($p.actions | Select-Object -First 40); return @{ summary = [string]$p.summary; actions = $acts }
}

# ---------- API ----------
function Hr-Api($ctx, $req, [string]$path, [string]$method) {
  $by = 'giam-doc'
  if ($path -eq '/api/hr/overview' -and $method -eq 'GET') { Send $ctx 200 (Json (Build-AllDossiers) 8); return }
  if ($path -eq '/api/hr/dossiers/refresh' -and $method -eq 'POST') { [void](Build-AllDossiers); Send $ctx 200 (Json @{ ok = $true }); return }
  if ($path -eq '/api/hr/dossier' -and $method -eq 'GET') {
    $id = [string]$req.QueryString['id']; if ($id -notmatch '^[a-z0-9-]+$') { Err $ctx 400 'id'; return }
    $org = Get-Org; $p = Get-Person $org $id; if (-not $p) { Err $ctx 404 'nguoi'; return }
    Send $ctx 200 (Json (Build-Dossier $org (Hr-History 3000) $p) 8); return
  }
  if ($path -eq '/api/hr/history' -and $method -eq 'GET') {
    $id = [string]$req.QueryString['id']; $h = @(Hr-History 3000 | Where-Object { -not $id -or $_.id -eq $id -or @($_.agents) -contains $id })
    Send $ctx 200 (Json @{ events = @($h | Select-Object -Last 120) } 6); return
  }
  if ($path -eq '/api/hr/note' -and $method -eq 'POST') {
    $b = Read-Body $req; $id = [string]$b.id; if (-not (Get-Person (Get-Org) $id)) { Err $ctx 404 'nguoi'; return }
    if (-not ([string]$b.text).Trim()) { Err $ctx 400 'noi dung rong'; return }
    Add-Note $id ([string]$b.kind) ([string]$b.text) $by; Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($method -eq 'POST' -and $path -match '^/api/hr/(suspend|reinstate|fire|dissolve|move)$') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $act = $Matches[1]; $r = $null
    switch ($act) {
      'suspend' { $r = Do-Suspend ([string]$b.id) ([string]$b.reason) $by }
      'reinstate' { $r = Do-Reinstate ([string]$b.id) ([string]$b.room) ([string]$b.reason) $by }
      'fire' { $r = Do-Fire ([string]$b.id) ([string]$b.reason) $by }
      'dissolve' { $r = Do-Dissolve ([string]$b.room) $by }
      'move' { $r = Do-Move ([string]$b.id) ([string]$b.room) $by }
    }
    if ($r.ok) { Send $ctx 200 (Json $r) } else { $r.error = $r.msg; Send $ctx 409 (Json $r) }; return
  }
  if ($method -eq 'POST' -and $path -match '^/api/agents/([a-z0-9-]+)/archive$') {
    $b = Read-Body $req; $r = Do-Fire $Matches[1] ([string]$b.reason) $by; if ($r.ok) { Send $ctx 200 (Json $r) } else { $r.error = $r.msg; Send $ctx 409 (Json $r) }; return
  }
  if ($method -eq 'POST' -and $path -match '^/api/departments/([a-z0-9-]+)/archive$') {
    $r = Do-Dissolve $Matches[1] $by; if ($r.ok) { Send $ctx 200 (Json $r) } else { $r.error = $r.msg; Send $ctx 409 (Json $r) }; return
  }
  if ($path -eq '/api/hr/execute' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b -or -not $b.actions) { Err $ctx 400 'khong co hanh dong'; return }
    $results = @(); $acts = @($b.actions | Select-Object -First 40)
    # tao phong truoc, roi nguoi, roi cac viec con lai (de nguoi moi co the vao phong moi tao trong cung ke hoach)
    $order = @('create_room', 'reinstate', 'create_agent', 'move', 'set_head', 'update_prompt', 'note', 'suspend', 'fire', 'dissolve_room')
    $sorted = @($acts | Sort-Object { $i = [array]::IndexOf($order, [string]$_.type); if ($i -lt 0) { 99 } else { $i } })
    foreach ($a in $sorted) { $r = Do-Action $a $by; $results += @{ type = [string]$a.type; id = [string]$a.id; ok = $r.ok; msg = $r.msg } }
    if ($b.inboxId -and ([string]$b.inboxId) -match '^[0-9a-z-]+$') {
      $f = Join-Path $root "inbox\$($b.inboxId).json"
      if (Test-Path $f) { $it = [IO.File]::ReadAllText($f, $utf8) | ConvertFrom-Json; Set-Prop $it 'status' 'approved'; Set-Prop $it 'results' @($results); Write-Json $f $it 8 }
    }
    [void](Build-AllDossiers); Send $ctx 200 (Json @{ results = $results } 6); return
  }
  if ($path -eq '/api/hr/request' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $kind = [string]$b.kind; $text = ([string]$b.text).Trim(); $engine = [string]$b.engine; $pr = Get-Prompts
    if (@('recruit', 'review', 'lean', 'expand', 'other') -notcontains $kind) { Err $ctx 400 'kind'; return }
    if (-not $text -or $text.Length -gt 4000) { Err $ctx 400 'yeu cau (1..4000)'; return }
    if ($engine -notmatch '^(mock|claude(:(haiku|sonnet|opus))?)$') { Err $ctx 400 'engine'; return }
    $org = Get-Org; $hp = Get-Person $org $HR_HEAD; if (-not $hp -or (Is-Suspended $hp) -or -not (Test-Path (Join-Path $agentsDir "$HR_HEAD.md"))) { Err $ctx 409 'khong co Truong phong Nhan su'; return }
    [void](Build-AllDossiers)
    $prompt = $pr.hrHead.Replace('{request}', $text) + $pr.hrKinds.$kind + "`n`n" + $pr.hrSchema
    $label = [string]$pr.hrLabel.$kind + (One-Line $text 60)
    $r = Start-JobSpec @{ kind = 'hr'; engine = $engine; mode = 'plan'; prompt = $prompt; agent = $HR_HEAD; resume = ''; label = $label; source = ''; allowBash = $false; sandbox = $false; meta = $kind }
    if ($r.error) { Err $ctx 409 $r.error; return }; Send $ctx 200 (Json $r); return
  }
  Err $ctx 404 'not found'
}
