# Server cuc bo cho van phong 3D: phuc vu file tinh + cau noi API (to chuc, chat/job Claude Code, hop, lich viec, hop thu).
# Chi nghe o localhost. Moi API can token (chen vao index.html) va dung Host/Origin. File nay luu UTF-8 co BOM (PowerShell 5.1). Chu Viet nam trong prompts.json, khong nam o day.
param([int]$Port = 8766)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$proj = Split-Path $root -Parent
$agentsDir = Join-Path $proj '.claude\agents'
$skillsDir = Join-Path $proj '.claude\skills'
$wsDir = Join-Path $proj 'workspace'
foreach ($n in 'chat', 'inbox', 'trials', 'tests', 'agent-versions', '_archive', 'state', 'meetings') { New-Item -ItemType Directory -Force (Join-Path $root $n) | Out-Null }
New-Item -ItemType Directory -Force $wsDir, $agentsDir | Out-Null
$token = [guid]::NewGuid().ToString('N')
$utf8 = New-Object System.Text.UTF8Encoding($false)
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.png'='image/png'; '.svg'='image/svg+xml' }
$orgPath = Join-Path $root 'org.json'; $schedPath = Join-Path $root 'schedule.json'; $certPath = Join-Path $root 'certified.json'
$promptsPath = Join-Path $root 'prompts.json'; $logPath = Join-Path $root 'schedule-log.jsonl'
$script:jobs = @{}; $script:queue = New-Object System.Collections.ArrayList
$script:auth = $null; $script:authAt = [datetime]::MinValue; $script:lastTick = [datetime]::MinValue
$TOOLS_OK = @('Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Agent', 'Bash')
$MODELS_OK = @('', 'sonnet', 'opus', 'haiku', 'inherit')
$RESERVED = @('tro-ly', 'giam-doc')

# ---------- tien ich ----------
function Send($ctx, [int]$code, [string]$body, [string]$type = 'application/json; charset=utf-8') {
  $b = $utf8.GetBytes($body)
  $ctx.Response.StatusCode = $code; $ctx.Response.ContentType = $type
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.ContentLength64 = $b.Length
  $ctx.Response.OutputStream.Write($b, 0, $b.Length); $ctx.Response.Close()
}
function Json($o, [int]$depth = 10) { ConvertTo-Json -InputObject $o -Depth $depth -Compress }
function Err($ctx, [int]$code, [string]$msg) { Send $ctx $code (Json @{ error = $msg }) }
function Read-Body($req) {
  $sr = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8); $t = $sr.ReadToEnd(); $sr.Close()
  if ($t) { $t | ConvertFrom-Json } else { $null }
}
function One-Line([string]$s, [int]$max) { $s = ($s -replace '[\r\n]+', ' ').Trim(); if ($s.Length -gt $max) { $s = $s.Substring(0, $max) }; $s }
function Read-Json([string]$p, $default) { if (Test-Path $p) { $t = [IO.File]::ReadAllText($p, $utf8); if ($t.Trim()) { return ($t | ConvertFrom-Json) } }; return $default }
function Write-Json([string]$p, $o, [int]$depth = 10) { [IO.File]::WriteAllText($p, (ConvertTo-Json -InputObject $o -Depth $depth), $utf8) }
function Stamp { (Get-Date).ToString('yyyyMMdd-HHmmss-fff') }
function Slug([string]$s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD); $sb = New-Object Text.StringBuilder
  foreach ($c in $n.ToCharArray()) { if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne 'NonSpacingMark') { [void]$sb.Append($c) } }
  $t = $sb.ToString().Replace([string][char]0x111, 'd').Replace([string][char]0x110, 'D').ToLower()
  return (($t -replace '[^a-z0-9]+', '-').Trim('-'))
}
function Get-Prompts { Read-Json $promptsPath $null }
function Get-Org { Read-Json $orgPath $null }
function Save-Org($o) { Write-Json $orgPath $o }
function Log-Sched([string]$id, [string]$ev, [string]$msg) {
  $line = Json @{ t = (Get-Date).ToString('s'); id = $id; ev = $ev; msg = $msg } 3
  [IO.File]::AppendAllText($logPath, $line + "`n", $utf8)
}

# ---------- Claude Code dong lenh ----------
function Find-Claude {
  $c = Get-Command claude -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $base = Join-Path $env:LOCALAPPDATA 'Claude-Data'
  if (Test-Path $base) {
    $f = Get-ChildItem $base -Recurse -Filter claude.exe -Depth 5 -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($f) { return $f.FullName }
  }
  return $null
}
function Get-Auth {
  if ($script:auth -and ((Get-Date) - $script:authAt).TotalSeconds -lt 10) { return $script:auth }
  $exe = Find-Claude
  $r = @{ found = [bool]$exe; exe = $exe; loggedIn = $false; version = '' }
  if ($exe) {
    try { $r.version = ((& $exe --version 2>$null) | Out-String).Trim() } catch {}
    try { $j = ((& $exe auth status 2>$null) | Out-String) | ConvertFrom-Json; $r.loggedIn = [bool]$j.loggedIn } catch {}
  }
  $script:auth = $r; $script:authAt = Get-Date
  return $r
}
# file cai dat cho hook chan ghi sai khu (guard.ps1)
$guardSettings = Join-Path $root 'guard-settings.json'
$guardCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $root 'guard.ps1')`""
Write-Json $guardSettings @{ hooks = @{ PreToolUse = @(@{ matcher = 'Write|Edit|MultiEdit|NotebookEdit|Skill|Agent|Task|mcp__.*'; hooks = @(@{ type = 'command'; command = $guardCmd }) }) } } 8

# ---------- doc/ghi file agent (.claude/agents/<id>.md): giu nguyen khoa la, phan bao cao trang thai o cuoi ----------
function Unquote([string]$s) { $s = $s.Trim(); if ($s.Length -ge 2 -and $s.StartsWith('"') -and $s.EndsWith('"')) { $s = $s.Substring(1, $s.Length - 2).Replace('\"', '"') }; $s }
function Parse-Agent([string]$path) {
  $t = [IO.File]::ReadAllText($path, $utf8) -replace "`r`n", "`n"
  $m = [regex]::Match($t, '^---\n(.*?)\n---\n(.*)$', 'Singleline')
  $ent = New-Object System.Collections.ArrayList
  foreach ($l in ($m.Groups[1].Value -split "`n")) {
    if ($l -match '^(\w+):\s*(.*)$') { [void]$ent.Add(@{ key = $Matches[1]; val = $Matches[2]; raw = (New-Object System.Collections.ArrayList) }); [void]$ent[$ent.Count - 1].raw.Add($l) }
    elseif ($ent.Count) { [void]$ent[$ent.Count - 1].raw.Add($l) }
  }
  $f = @{ id = [IO.Path]::GetFileNameWithoutExtension($path); description = ''; tools = ''; model = ''; skills = ''; extra = '' }
  $extra = New-Object System.Collections.ArrayList
  foreach ($e in $ent) {
    switch ($e.key) {
      'name' { }
      'description' { $f.description = Unquote $e.val }
      'tools' { $f.tools = Unquote $e.val }
      'model' { $f.model = Unquote $e.val }
      'skills' {
        $items = @()
        if ($e.val.Trim()) { $items = @(($e.val.Trim().TrimStart('[').TrimEnd(']') -split ',') | ForEach-Object { $_.Trim().Trim('"') } | Where-Object { $_ }) }
        else { $items = @($e.raw | Select-Object -Skip 1 | ForEach-Object { ($_ -replace '^\s*-\s*', '').Trim() } | Where-Object { $_ }) }
        $f.skills = $items -join ', '
      }
      default { foreach ($r in $e.raw) { [void]$extra.Add($r) } }
    }
  }
  $f.extra = $extra -join "`n"
  $body = $m.Groups[2].Value.TrimStart("`n")
  $i = [regex]::Match($body, '(?m)^## B.o c.o tr.ng th.i').Index
  if ($i -gt 0) { $f.persona = $body.Substring(0, $i).TrimEnd(); $f.tail = $body.Substring($i) } else { $f.persona = $body.TrimEnd(); $f.tail = '' }; $f.persona = [regex]::Replace($f.persona, '\s*<!-- office:caps -->.*?<!-- /office:caps -->', '', 'Singleline').TrimEnd()
  return $f
}
function Build-Agent([string]$id, $f) {
  $fm = "---`nname: $id`ndescription: `"" + ([string]$f.description).Replace('"', '\"') + "`"`n"
  if ($f.tools) { $fm += "tools: $($f.tools)`n" }
  if ($f.model) { $fm += "model: $($f.model)`n" }
  if ($f.skills) { $fm += 'skills: [' + $f.skills + "]`n" }
  if ($f.extra) { $fm += $f.extra + "`n" }
  $fm += "---`n"
  $cb = Caps-Block $f; if ($cb) { $cb = "`n`n" + $cb }; return $fm + ([string]$f.persona).Trim() + $cb + "`n`n" + $f.tail
}
function Backup-Agent([string]$id) {
  $file = Join-Path $agentsDir "$id.md"; if (-not (Test-Path $file)) { return }
  $d = Join-Path $root "agent-versions\$id"; New-Item -ItemType Directory -Force $d | Out-Null
  Copy-Item $file (Join-Path $d ((Stamp) + '.md'))
}
function Save-AgentFile([string]$id, $f) {
  $file = Join-Path $agentsDir "$id.md"; $new = Build-Agent $id $f
  if (Test-Path $file) {
    $cur = ([IO.File]::ReadAllText($file, $utf8)) -replace "`r`n", "`n"
    if ($cur -eq $new) { return $false }
    Backup-Agent $id
  }
  [IO.File]::WriteAllText($file, $new, $utf8); return $true
}
function Get-Catalog {
  $sk = @(Get-AllSkillNames)
  return @{ tools = $TOOLS_OK; skills = $sk; models = @('sonnet', 'opus', 'haiku', 'inherit') }
}
function Check-AgentFields($a) {                                      # tra ve chuoi loi hoac $null
  if (-not ([string]$a.description).Trim()) { return 'description rong' }
  if (-not ([string]$a.persona).Trim()) { return 'prompt rong' }
  if (([string]$a.persona).Length -gt 20000) { return 'prompt qua dai' }
  if (([string]$a.description).Length -gt 600) { return 'description qua dai' }
  if ($MODELS_OK -notcontains [string]$a.model) { return 'model khong hop le' }
  foreach ($t in ([string]$a.tools -split ',')) { $t = $t.Trim(); if ($t -and $TOOLS_OK -notcontains $t -and $t -ne 'Skill' -and $t -notmatch '^mcp__[A-Za-z0-9_-]+(__[A-Za-z0-9_-]+)?$') { return "tool khong hop le: $t" } }
  $cat = Get-Catalog
  foreach ($s in ([string]$a.skills -split ',')) { $s = $s.Trim(); if ($s -and $cat.skills -notcontains $s) { return "skill khong ton tai: $s" } }
  return $null
}

# ---------- doc ket qua mot tien trinh Claude ----------
function Read-Lines([string]$path, [bool]$running) {
  if (-not (Test-Path $path)) { return @() }
  $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
  $sr = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8); $t = $sr.ReadToEnd(); $sr.Close()
  $ls = @($t -split "`r?`n")
  if ($running -and -not $t.EndsWith("`n") -and $ls.Count -gt 0) { $ls = @($ls[0..($ls.Count - 2)]) }
  return @($ls | Where-Object { $_.StartsWith('{') })
}
function Read-JobSummary($j) {
  $res = ''; $files = New-Object System.Collections.ArrayList; $cost = 0; $sid = ''; $isErr = $false
  foreach ($l in (Read-Lines $j.out $false)) {
    try { $e = $l | ConvertFrom-Json } catch { continue }
    if ($e.type -eq 'system' -and $e.session_id) { $sid = [string]$e.session_id }
    if ($e.type -eq 'result') { $res = [string]$e.result; $cost = $e.total_cost_usd; $isErr = [bool]$e.is_error; if ($e.session_id) { $sid = [string]$e.session_id } }
    if ($e.type -eq 'assistant' -and $e.message -and $e.message.content) {
      foreach ($c in $e.message.content) {
        if ($c.type -eq 'tool_use' -and ($c.name -eq 'Write' -or $c.name -eq 'Edit') -and $c.input.file_path) {
          $p = ([string]$c.input.file_path).Replace('/', '\'); $rel = $p
          if ($p.ToLower().StartsWith($proj.ToLower() + '\')) { $rel = $p.Substring($proj.Length + 1) }
          $rel = $rel.Replace('\', '/')
          if ($rel -like 'workspace/*' -and -not $files.Contains($rel)) { [void]$files.Add($rel) }
        }
      }
    }
  }
  return @{ result = $res; files = @($files); cost = $cost; sid = $sid; isError = $isErr }
}

# ---------- chay job (Claude that hoac mock) ----------
function Start-JobSpec($s) {
  $a = $null
  if ($s.engine -ne 'mock') { $a = Get-Auth; if (-not $a.found) { return @{ error = 'not-found' } }; if (-not $a.loggedIn) { return @{ error = 'not-logged-in' } } }
  $id = (Get-Date).ToString('yyMMdd-HHmmss') + '-' + (Get-Random -Maximum 9999).ToString('0000')
  $dir = Join-Path $root 'chat'
  $inF = Join-Path $dir "$id.in.txt"; $outF = Join-Path $dir "$id.out.jsonl"; $errF = Join-Path $dir "$id.err.txt"
  [IO.File]::WriteAllText($inF, [string]$s.prompt, $utf8)
  $agent = [string]$s.agent
  if ($s.engine -eq 'mock') {
    $exe = 'powershell.exe'
    $argStr = "-NoProfile -ExecutionPolicy Bypass -File `"$root\mock-claude.ps1`" -Kind $($s.kind) -Mode $($s.mode) -PromptFile `"$inF`" -Agent `"$agent`" -OfficeDir `"$root`" -Resume `"$($s.resume)`" -Meta `"$(([string]$s.meta).Replace([string][char]34, ''))`""
  } else {
    $exe = $a.exe
    if ($s.mode -eq 'plan') { $pm = 'plan'; $tools = 'Read,Glob,Grep,WebSearch,WebFetch' }
    else { $pm = 'acceptEdits'; $tools = 'Agent,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch' }
    if ($agent) {
      $af = Join-Path $agentsDir "$agent.md"
      if (Test-Path $af) { $at = (Parse-Agent $af).tools; if ($at) { $tools = (@($at -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and ($TOOLS_OK -contains $_ -or $_ -eq 'Skill' -or $_ -like 'mcp__*') }) -join ',') } }
      if ($s.mode -eq 'plan') { $tools = (@($tools -split ',' | Where-Object { @('Write', 'Edit', 'Agent') -notcontains $_ }) -join ',') }
    }
    $unatt = [bool]$s.source; $tools = (Filter-Mcp $tools $agent ($s.mode -eq 'plan') $unatt)
    if (-not $agent -and $s.mode -ne 'plan') { $tools += (Union-Caps $unatt) }
    if ($s.allowBash -eq $true -and $s.mode -ne 'plan') { $tools += ',Bash' } else { $tools = (@($tools -split ',' | Where-Object { $_ -ne 'Bash' }) -join ',') }
    $argStr = "-p --output-format stream-json --verbose --permission-mode $pm --allowedTools `"$tools`" --settings `"$guardSettings`""
    if ($agent) { $argStr += " --agent $agent" } elseif ([string]$s.engine -match ':(haiku|sonnet|opus)$') { $argStr += " --model " + $Matches[1] }
    if ($s.resume) { $argStr += " --resume $($s.resume)" }
  }
  $env:OFFICE_MODE = if ($s.sandbox) { 'trial' } elseif ($s.source) { 'schedule' } else { '' }; $env:OFFICE_AGENT = if ($s.sandbox) { $agent } else { '' }
  $need = @(); if ($s.engine -ne 'mock') { $need = @(Split-Tools $tools | Where-Object { $_.StartsWith('mcp__') }) }
  $p = Launch-Claude $exe $argStr $inF $outF $errF $need
  $null = $p.Handle
  $env:OFFICE_MODE = ''; $env:OFFICE_AGENT = ''
  $script:jobs[$id] = @{ proc = $p; out = $outF; err = $errF; kind = [string]$s.kind; label = [string]$s.label; source = [string]$s.source; engine = [string]$s.engine; mode = [string]$s.mode; agent = $agent; started = (Get-Date); final = $false }
  return @{ job = $id }
}
function Real-Running { @($script:jobs.Values | Where-Object { $_.engine -ne 'mock' -and -not $_.proc.HasExited }).Count -gt 0 }
function Finalize-Job([string]$id) {
  $j = $script:jobs[$id]; $sum = Read-JobSummary $j; if ($j.engine -ne 'mock' -and -not $j.agent) { Save-Snapshot $j }; Hr-RecordJob $j $id $sum
  $toInbox = ($j.kind -eq 'chat' -and $j.mode -eq 'run') -or $j.kind -eq 'meeting' -or $j.kind -eq 'schedule' -or $j.kind -eq 'hr'
  if ($toInbox) {
    $status = 'new'; if ($j.kind -eq 'schedule' -and $j.mode -eq 'plan') { $status = 'pending' }
    $res = [string]$sum.result; if ($res.Length -gt 4000) { $res = $res.Substring(0, 4000) }
    $err = ''; if (-not $sum.result -and (Test-Path $j.err)) { $err = [IO.File]::ReadAllText($j.err, $utf8); if ($err.Length -gt 500) { $err = $err.Substring(0, 500) } }
    $item = @{ id = $id; kind = $j.kind; title = $j.label; status = $status; created = (Get-Date).ToString('s'); summary = $res; files = @($sum.files); cost = $sum.cost; sid = $sum.sid; isError = $sum.isError; engine = $j.engine; source = $j.source; error = $err; mode = $j.mode }
    if ($j.kind -eq 'hr') { $hp = Parse-HrPlan ([string]$sum.result); if ($hp) { $item.plan = $hp; $item.status = 'pending' } }
    Write-Json (Join-Path $root "inbox\$id.json") $item 9
  }
  if ($j.source) {
    $sc = Read-Json $schedPath $null
    if ($sc) { foreach ($it in $sc.items) { if ($it.id -eq $j.source) { $it.lastJob = $id; $it.lastResult = if ($sum.isError -or -not $sum.result) { 'error' } else { 'ok' } } }; Write-Json $schedPath $sc }
    Log-Sched $j.source 'done' ("job $id " + $(if ($sum.isError) { 'error' } else { 'ok' }))
  }
}

# ---------- lich viec ----------
function Get-NextRun($r, [datetime]$from) {
  $t = [datetime]::ParseExact([string]$r.time, 'HH:mm', $null); $h = $t.Hour; $mi = $t.Minute
  switch ([string]$r.type) {
    'once' { $d = [datetime]::ParseExact(("$($r.date) $($r.time)"), 'yyyy-MM-dd HH:mm', $null); if ($d -gt $from) { return $d } else { return $null } }
    'daily' { $c = $from.Date.AddHours($h).AddMinutes($mi); if ($c -le $from) { $c = $c.AddDays(1) }; return $c }
    'weekly' {
      for ($i = 0; $i -le 7; $i++) { $d = $from.Date.AddDays($i).AddHours($h).AddMinutes($mi); $dow = [int]$d.DayOfWeek; if ($dow -eq 0) { $dow = 7 }; if (@($r.days) -contains $dow -and $d -gt $from) { return $d } }
      return $null }
    'monthly' {
      for ($m = 0; $m -le 13; $m++) {
        $base = $from.Date.AddDays(1 - $from.Date.Day).AddMonths($m); $dim = [datetime]::DaysInMonth($base.Year, $base.Month)
        $day = [Math]::Min([int]$r.day, $dim); $d = $base.AddDays($day - 1).AddHours($h).AddMinutes($mi); if ($d -gt $from) { return $d } }
      return $null }
  }
  return $null
}
function Check-Repeat($r) {
  if (@('once', 'daily', 'weekly', 'monthly') -notcontains [string]$r.type) { return 'repeat.type' }
  if ([string]$r.time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { return 'repeat.time (HH:mm)' }
  if ($r.type -eq 'once' -and [string]$r.date -notmatch '^\d{4}-\d{2}-\d{2}$') { return 'repeat.date (yyyy-MM-dd)' }
  if ($r.type -eq 'weekly') { $d = @($r.days); if (-not $d.Count) { return 'repeat.days' }; foreach ($x in $d) { if ([int]$x -lt 1 -or [int]$x -gt 7) { return 'repeat.days 1..7' } } }
  if ($r.type -eq 'monthly' -and ([int]$r.day -lt 1 -or [int]$r.day -gt 31)) { return 'repeat.day 1..31' }
  return $null
}
function Start-ScheduleItem($it, [bool]$manual) {
  $org = Get-Org; $pr = Get-Prompts
  $target = [string]$it.target; $agent = ''
  if ($target -like 'dept:*') { $room = $org.rooms | Where-Object { $_.id -eq $target.Substring(5) } | Select-Object -First 1; if ($room -and $room.headId) { $agent = [string]$room.headId } }
  elseif ($target -like 'agent:*') { $agent = $target.Substring(6) }
  if ($agent -and (Is-Suspended (Get-Person $org $agent))) { Log-Sched $it.id 'skip' 'agent suspended'; return @{ error = 'dinh-chi' } }
  $prompt = $pr.scheduleHead.Replace('{name}', [string]$it.name).Replace('{request}', [string]$it.prompt)
  if (-not $agent) { $prompt = $pr.assistantHead.Replace('{request}', $prompt).Replace('{target}', $pr.targetAssistant) + $(if ($it.mode -eq 'plan') { $pr.planMode } else { $pr.runRules }) }
  else { $prompt += $(if ($it.mode -eq 'plan') { $pr.planMode } else { 'Ghi trang thai vao office/state cua chinh ban nhu da huong dan trong file dinh nghia.' }) }
  $spec = @{ kind = 'schedule'; engine = [string]$it.engine; mode = [string]$it.mode; prompt = $prompt; agent = $agent; label = [string]$it.name; source = [string]$it.id; allowBash = $false; sandbox = $false; resume = ''; meta = '' }
  $r = Start-JobSpec $spec
  if ($r.error) { Log-Sched $it.id 'error' $r.error; return $r }
  Log-Sched $it.id 'start' ($(if ($manual) { 'manual ' } else { '' }) + "job $($r.job)")
  return $r
}
function Sched-Tick {
  $sc = Read-Json $schedPath $null; if (-not $sc) { return }
  $now = Get-Date; $changed = $false; $today = $now.ToString('yyyy-MM-dd')
  if ($sc.settings.countDate -ne $today) { $sc.settings.countDate = $today; $sc.settings.countToday = 0; $changed = $true }
  foreach ($it in $sc.items) {
    if (-not $it.enabled) { continue }
    if (-not $it.nextRun) { $n = Get-NextRun $it.repeat $now; $it.nextRun = if ($n) { $n.ToString('s') } else { $null }; $changed = $true; if (-not $n) { $it.enabled = $false }; continue }
    $due = [datetime]::Parse([string]$it.nextRun)
    if ($due -gt $now) { continue }
    $changed = $true
    $late = ($now - $due).TotalMinutes
    $n = Get-NextRun $it.repeat $now
    $it.nextRun = if ($n) { $n.ToString('s') } else { $null }; if (-not $n) { $it.enabled = $false }
    if ($late -gt 2 -and -not ($it.catchUp -and $due.Date -eq $now.Date)) { Log-Sched $it.id 'skip' "missed at $($due.ToString('s'))"; continue }
    $running = @($script:jobs.Values | Where-Object { $_.source -eq $it.id -and -not $_.proc.HasExited }).Count + @($script:queue | Where-Object { $_.id -eq $it.id }).Count
    if ($running) { Log-Sched $it.id 'skip' 'previous run still running'; continue }
    if ([int]$sc.settings.countToday -ge [int]$sc.settings.dailyLimit) { Log-Sched $it.id 'skip' 'daily limit'; continue }
    [void]$script:queue.Add(@{ id = [string]$it.id; manual = $false }); $it.lastRun = $now.ToString('s'); $sc.settings.countToday = [int]$sc.settings.countToday + 1
  }
  if ($changed) { Write-Json $schedPath $sc }
  if ($script:queue.Count) {
    $q = $script:queue[0]; $it = $sc.items | Where-Object { $_.id -eq $q.id } | Select-Object -First 1
    if (-not $it) { $script:queue.RemoveAt(0) }
    elseif ($it.engine -eq 'mock' -or -not (Real-Running)) { $script:queue.RemoveAt(0); [void](Start-ScheduleItem $it $q.manual) }
  }
}
function Tick {
  if (((Get-Date) - $script:lastTick).TotalSeconds -lt 5) { return }
  $script:lastTick = Get-Date
  try {
    foreach ($k in @($script:jobs.Keys)) { $j = $script:jobs[$k]; if ($j.proc.HasExited -and -not $j.final) { $j.final = $true; Finalize-Job $k } }
    Hr-PollStates; Sched-Tick
  } catch { [Console]::Error.WriteLine('tick: ' + $_.Exception.Message) }
}

. (Join-Path $root 'caps.ps1')
. (Join-Path $root 'hr.ps1')
# ---------- API ----------
function Person-Json($org, $p) { $p }
function Api($ctx, $req, [string]$path, [string]$method) {
  if ($req.Headers['X-Town-Token'] -ne $token) { Err $ctx 401 'token'; return }
  $oh = $req.Headers['Origin']
  if ($oh -and (@("http://localhost:$Port", "http://127.0.0.1:$Port") -notcontains $oh)) { Err $ctx 403 'origin'; return }
  $pr = Get-Prompts

  if ($path -like '/api/capabilities*' -or $path -like '/api/skills/*') { Caps-Api $ctx $req $path $method; return }
  if ($path -like '/api/hr/*' -or ($method -eq 'POST' -and $path -match '^/api/(agents|departments)/[a-z0-9-]+/archive$')) { Hr-Api $ctx $req $path $method; return }
  if ($path -eq '/api/ping') { Send $ctx 200 '{"ok":true}'; return }
  if ($path -eq '/api/status' -and $method -eq 'GET') {
    $a = Get-Auth; Send $ctx 200 (Json @{ found = $a.found; loggedIn = $a.loggedIn; version = $a.version; exe = $a.exe; project = $proj }); return
  }
  if ($path -eq '/api/org' -and $method -eq 'GET') {
    $org = Get-Org; $agents = @{}
    foreach ($p in $org.people) { $f = Join-Path $agentsDir "$($p.id).md"; if (Test-Path $f) { $a = Parse-Agent $f; $agents[$p.id] = @{ description = $a.description; tools = $a.tools; model = $a.model; skills = $a.skills; persona = $a.persona } } }
    Send $ctx 200 (Json @{ org = $org; agents = $agents; catalog = (Get-Catalog); certified = (Read-Json $certPath ([pscustomobject]@{})) } 12); return
  }
  if ($path -eq '/api/departments' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $org = Get-Org; $name = One-Line ([string]$b.name) 40
    if (-not $name) { Err $ctx 400 'ten phong khong duoc de trong'; return }
    if ([string]$b.color -notmatch '^#[0-9a-fA-F]{6}$') { Err $ctx 400 'mau khong hop le'; return }
    $room = $null; if ($b.id) { $room = $org.rooms | Where-Object { $_.id -eq [string]$b.id -and $_.kind -eq 'dept' } | Select-Object -First 1; if (-not $room) { Err $ctx 404 'phong'; return } }
    if ($room) {
      $room.name = $name; $room.color = [string]$b.color
      if ($b.headId -ne $null) { $hid = [string]$b.headId; if ($hid -and -not ($org.people | Where-Object { $_.id -eq $hid -and $_.room -eq $room.id })) { Err $ctx 400 'truong phong phai thuoc phong'; return }; $room.headId = $hid; foreach ($p in $org.people) { if ($p.room -eq $room.id -and $p.role -ne 'boss') { $p.role = if ($p.id -eq $hid) { 'head' } else { 'staff' } } } }
    } else {
      if ($org.rooms.Count -ge $MAX_ROOMS) { Err $ctx 409 'toi da so phong'; return }
      $id = Slug $name; if ($id -notmatch '^[a-z0-9][a-z0-9-]{1,29}$') { $id = 'phong-' + (Get-Random -Maximum 999) }
      $base = $id; $n = 2; while ($org.rooms | Where-Object { $_.id -eq $id }) { $id = "$base-$n"; $n++ }
      $used = @($org.rooms | ForEach-Object { "$($_.slot[0]),$($_.slot[1])" })
      $slot = $null; foreach ($c in $SLOTS) { if ($used -notcontains "$($c[0]),$($c[1])") { $slot = $c; break } }
      if (-not $slot) { Err $ctx 409 'het o trong tren ban do'; return }
      $room = [pscustomobject]@{ id = $id; name = $name; kind = 'dept'; slot = @($slot[0], $slot[1]); color = [string]$b.color; headId = '' }
      $org.rooms = @($org.rooms) + $room; New-Item -ItemType Directory -Force (Join-Path $wsDir $id) | Out-Null
    }
    Save-Org $org; Send $ctx 200 (Json @{ ok = $true; id = $room.id }); return
  }
  if ($path -match '^/api/departments/([a-z0-9-]+)/archive$' -and $method -eq 'POST') {
    $id = $Matches[1]; $org = Get-Org; $room = $org.rooms | Where-Object { $_.id -eq $id -and $_.kind -eq 'dept' } | Select-Object -First 1
    if (-not $room) { Err $ctx 404 'phong'; return }
    if ($org.people | Where-Object { $_.room -eq $id }) { Err $ctx 409 'phong con nguoi, hay chuyen hoac luu tru nhan vien truoc'; return }
    Write-Json (Join-Path $root "_archive\room-$id-$(Stamp).json") $room 4
    $org.rooms = @($org.rooms | Where-Object { $_.id -ne $id }); Save-Org $org; Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -eq '/api/catalog' -and $method -eq 'GET') { Send $ctx 200 (Json (Get-Catalog)); return }
  if ($path -eq '/api/agents' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $org = Get-Org
    if (@($org.people | Where-Object { $_.role -ne 'boss' -and $_.id -ne 'tro-ly' }).Count -ge 30) { Err $ctx 409 'toi da 30 agent'; return }
    $name = One-Line ([string]$b.name) 40; $title = One-Line ([string]$b.title) 120
    if (-not $name -or -not $title) { Err $ctx 400 'ten va chuc danh khong duoc de trong'; return }
    $room = $org.rooms | Where-Object { $_.id -eq [string]$b.room -and (@('dept', 'boss', 'hr') -contains $_.kind) } | Select-Object -First 1
    if (-not $room) { Err $ctx 400 'phong khong hop le'; return }
    $role = [string]$b.role; if (@('head', 'staff') -notcontains $role) { $role = 'staff' }; if ($room.kind -eq 'boss') { $role = 'staff' }
    if ([string]$b.color -notmatch '^#[0-9a-fA-F]{6}$') { Err $ctx 400 'mau khong hop le'; return }
    $id = [string]$b.id; if (-not $id) { $id = Slug $title }
    if (-not [string]$b.id -and $id.Length -gt 30) { $id = $id.Substring(0, 30).Trim('-') }
    if ($id -notmatch '^[a-z0-9][a-z0-9-]{1,29}$' -or $RESERVED -contains $id) { Err $ctx 400 'id khong hop le'; return }
    if ($org.people | Where-Object { $_.id -eq $id }) { $base = $id; $n = 2; while ($org.people | Where-Object { $_.id -eq $id }) { $id = "$base-$n"; $n++ } }
    $persona = [string]$b.persona; if (-not $persona.Trim()) { $persona = $pr.agentTemplate.Replace('{name}', $name).Replace('{title}', $title).Replace('{room}', $room.id) }
    $a = @{ description = (One-Line ([string]$b.description) 600); tools = (One-Line ([string]$b.tools) 300); model = [string]$b.model; skills = (One-Line ([string]$b.skills) 300); persona = $persona }
    if (-not $a.description) { $a.description = "$name, $title. Dung khi can: $title." }
    $e = Check-AgentFields $a; if ($e) { Err $ctx 400 $e; return }; $a = Normalize-Caps $a
    $snapC = Get-Snapshot; $needC = @(Risk-Servers $a.tools $snapC); $ackC = @($b.ackRisk | ForEach-Object { [string]$_ }); foreach ($n in $needC) { if ($ackC -notcontains $n) { Send $ctx 409 (Json @{ error = 'can-xac-nhan'; need = $needC }); return } }
    $f = @{ description = $a.description; tools = $a.tools; model = $a.model; skills = $a.skills; persona = $a.persona; extra = ''; tail = $pr.statusTail.Replace('{id}', $id) }
    [void](Save-AgentFile $id $f)
    $idle = "window.AGENTS = window.AGENTS || {};`nwindow.AGENTS[`"$id`"] = { status: `"idle`", task: `"$($pr.idleTask)`", say: `"`", log: [`"$((Get-Date).ToString('HH:mm')) $($pr.ready)`"] };`n"
    [IO.File]::WriteAllText((Join-Path $root "state\$id.js"), $idle, $utf8)
    if ($role -eq 'head') { foreach ($p in $org.people) { if ($p.room -eq $room.id -and $p.role -eq 'head') { $p.role = 'staff' } }; $room.headId = $id }
    $person = [pscustomobject]@{ id = $id; name = $name; title = $title; room = $room.id; role = $role; vibe = (One-Line ([string]$b.vibe) 300); color = [string]$b.color; riskAck = @($needC) }
    $org.people = @($org.people) + $person; Save-Org $org
    New-Item -ItemType Directory -Force (Join-Path $wsDir $room.id) | Out-Null
    Send $ctx 200 (Json @{ ok = $true; id = $id }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)$' -and $method -eq 'POST') {
    $id = $Matches[1]; $org = Get-Org; $person = $org.people | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $person) { Err $ctx 404 'agent'; return }
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $file = Join-Path $agentsDir "$id.md"
    if ($b.agent) {
      if (-not (Test-Path $file)) { Err $ctx 400 'nhan vat nay khong co file agent'; return }
      $cur = Parse-Agent $file
      $a = @{ description = (One-Line ([string]$b.agent.description) 600); tools = (One-Line ([string]$b.agent.tools) 300); model = [string]$b.agent.model; skills = (One-Line ([string]$b.agent.skills) 300); persona = ([string]$b.agent.persona).Replace("`r`n", "`n").Trim() }
      $e = Check-AgentFields $a; if ($e) { Err $ctx 400 $e; return }; $a = Normalize-Caps $a
      $snapU = Get-Snapshot; $oldR = @(Risk-Servers $cur.tools $snapU); $needU = @(Risk-Servers $a.tools $snapU | Where-Object { $oldR -notcontains $_ -and @($person.riskAck) -notcontains $_ }); $ackU = @($b.ackRisk | ForEach-Object { [string]$_ })
      foreach ($n in $needU) { if ($ackU -notcontains $n) { Send $ctx 409 (Json @{ error = 'can-xac-nhan'; need = $needU }); return } }
      if ($needU.Count) { $person | Add-Member -NotePropertyName riskAck -NotePropertyValue @(@($person.riskAck | Where-Object { $_ }) + $needU) -Force; Save-Org $org }
      $tail = $cur.tail; if (-not $tail) { $tail = $pr.statusTail.Replace('{id}', $id) }
      $f = @{ description = $a.description; tools = $a.tools; model = $a.model; skills = $a.skills; persona = $a.persona; extra = $cur.extra; tail = $tail }
      [void](Save-AgentFile $id $f)
    }
    if ($b.display) {
      $d = $b.display; $nm = One-Line ([string]$d.name) 40; if (-not $nm) { Err $ctx 400 'ten khong duoc de trong'; return }
      if ($d.color -and [string]$d.color -notmatch '^#[0-9a-fA-F]{6}$') { Err $ctx 400 'mau khong hop le'; return }
      $person.name = $nm; $person.title = One-Line ([string]$d.title) 120; $person.vibe = One-Line ([string]$d.vibe) 300; if ($d.color) { $person.color = [string]$d.color }
      if ($d.room -and $RESERVED -notcontains $id -and $person.status -ne 'suspended' -and [string]$d.room -ne $person.room) {
        $nr = $org.rooms | Where-Object { $_.id -eq [string]$d.room -and (@('dept', 'boss', 'hr') -contains $_.kind) } | Select-Object -First 1
        if (-not $nr) { Err $ctx 400 'phong khong hop le'; return }
        $old = $org.rooms | Where-Object { $_.id -eq $person.room } | Select-Object -First 1
        if ($old -and $old.headId -eq $id) { $old.headId = '' }
        $person.room = $nr.id; $person.role = 'staff'
      }
      if ($d.role -and $RESERVED -notcontains $id -and $person.role -ne 'boss') {
        $room = $org.rooms | Where-Object { $_.id -eq $person.room } | Select-Object -First 1
        if ([string]$d.role -eq 'head' -and @('dept', 'hr') -contains $room.kind) { foreach ($p in $org.people) { if ($p.room -eq $room.id -and $p.role -eq 'head') { $p.role = 'staff' } }; $person.role = 'head'; $room.headId = $id }
        elseif ([string]$d.role -eq 'staff') { if ($room.headId -eq $id) { $room.headId = '' }; $person.role = 'staff' }
      }
      Save-Org $org
    }
    Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/archive$' -and $method -eq 'POST') {
    $id = $Matches[1]; if ($RESERVED -contains $id) { Err $ctx 400 'khong luu tru duoc nhan vat nay'; return }
    $org = Get-Org; $person = $org.people | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $person) { Err $ctx 404 'agent'; return }
    $ad = Join-Path $root '_archive'; $st = Stamp
    $f = Join-Path $agentsDir "$id.md"; if (Test-Path $f) { Move-Item $f (Join-Path $ad "agent-$id-$st.md") }
    $s = Join-Path $root "state\$id.js"; if (Test-Path $s) { Move-Item $s (Join-Path $ad "state-$id-$st.js") }
    foreach ($r in $org.rooms) { if ($r.headId -eq $id) { $r.headId = '' } }
    $org.people = @($org.people | Where-Object { $_.id -ne $id }); Save-Org $org
    Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/versions$' -and $method -eq 'GET') {
    $id = $Matches[1]; $d = Join-Path $root "agent-versions\$id"; $cert = Read-Json $certPath ([pscustomobject]@{}); $c = $cert.$id
    $list = @(); if (Test-Path $d) { $list = @(Get-ChildItem $d -Filter *.md | Sort-Object Name -Descending | ForEach-Object { @{ name = $_.Name; size = $_.Length; certified = ($c -and $c.file -eq $_.Name) } }) }
    Send $ctx 200 (Json @{ versions = $list } 5); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/version$' -and $method -eq 'GET') {
    $id = $Matches[1]; $nm = [string]$req.QueryString['name']
    if ($nm -notmatch '^[0-9a-z-]+\.md$') { Err $ctx 400 'name'; return }
    $f = Join-Path $root "agent-versions\$id\$nm"; if (-not (Test-Path $f)) { Err $ctx 404 'version'; return }
    $a = Parse-Agent $f; Send $ctx 200 (Json @{ description = $a.description; tools = $a.tools; model = $a.model; skills = $a.skills; persona = $a.persona }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/restore$' -and $method -eq 'POST') {
    $id = $Matches[1]; $b = Read-Body $req; $nm = [string]$b.name
    if ($nm -notmatch '^[0-9a-z-]+\.md$') { Err $ctx 400 'name'; return }
    $src = Join-Path $root "agent-versions\$id\$nm"; if (-not (Test-Path $src)) { Err $ctx 404 'version'; return }
    $o = Parse-Agent $src; $cur = Parse-Agent (Join-Path $agentsDir "$id.md")
    $f = @{ description = $o.description; tools = $o.tools; model = $o.model; skills = $o.skills; persona = $o.persona; extra = $o.extra; tail = $(if ($cur.tail) { $cur.tail } else { $o.tail }) }
    [void](Save-AgentFile $id $f); Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/certify$' -and $method -eq 'POST') {
    $id = $Matches[1]; $f = Join-Path $agentsDir "$id.md"; if (-not (Test-Path $f)) { Err $ctx 404 'agent'; return }
    $d = Join-Path $root "agent-versions\$id"; New-Item -ItemType Directory -Force $d | Out-Null
    $nm = (Stamp) + '-dat-chuan.md'; Copy-Item $f (Join-Path $d $nm)
    $cert = Read-Json $certPath ([pscustomobject]@{}); $entry = [pscustomobject]@{ file = $nm; at = (Get-Date).ToString('s') }
    if ($cert.PSObject.Properties[$id]) { $cert.$id = $entry } else { $cert | Add-Member -NotePropertyName $id -NotePropertyValue $entry }
    Write-Json $certPath $cert 4; Send $ctx 200 (Json @{ ok = $true; file = $nm }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/tests$') {
    $id = $Matches[1]; $tf = Join-Path $root "tests\$id.json"
    if ($method -eq 'GET') { Send $ctx 200 (Json (Read-Json $tf ([pscustomobject]@{ cases = @() })) 6); return }
    $b = Read-Body $req; $cases = @($b.cases | Select-Object -First 20 | ForEach-Object { @{ q = (One-Line ([string]$_.q) 1000); criteria = (One-Line ([string]$_.criteria) 500) } } | Where-Object { $_.q })
    Write-Json $tf @{ cases = $cases } 5; Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -match '^/api/agents/([a-z0-9-]+)/trials$') {
    $id = $Matches[1]; $td = Join-Path $root "trials\$id"; New-Item -ItemType Directory -Force $td | Out-Null
    if ($method -eq 'GET') { $last = Get-ChildItem $td -Filter *.json | Sort-Object Name -Descending | Select-Object -First 1; if ($last) { Send $ctx 200 ([IO.File]::ReadAllText($last.FullName, $utf8)) } else { Send $ctx 200 (Json @{ messages = @(); sid = '' }) }; return }
    $b = Read-Body $req; $msgs = @($b.messages | Select-Object -Last 60 | ForEach-Object { @{ role = [string]$_.role; text = (([string]$_.text)[0..3999] -join ''); vote = [string]$_.vote; fb = (One-Line ([string]$_.fb) 300) } })
    $nm = if ($b.session) { Slug ([string]$b.session) } else { Stamp }; if (-not $nm) { $nm = Stamp }
    Write-Json (Join-Path $td "$nm.json") @{ messages = $msgs; sid = [string]$b.sid; saved = (Get-Date).ToString('s') } 5; Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -eq '/api/chat' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $kind = [string]$b.kind; if (-not $kind) { $kind = 'chat' }
    if (@('chat', 'trial', 'improve', 'test') -notcontains $kind) { Err $ctx 400 'kind'; return }
    $mode = [string]$b.mode; $engine = [string]$b.engine; $prompt = [string]$b.prompt; $resume = [string]$b.resume; $agent = [string]$b.agent
    if (@('plan', 'run') -notcontains $mode) { Err $ctx 400 'mode'; return }
    if ($engine -notmatch '^(mock|claude(:(haiku|sonnet|opus))?)$') { Err $ctx 400 'engine'; return }
    if (-not $prompt -or $prompt.Length -gt 40000) { Err $ctx 400 'prompt'; return }
    if ($resume -and $resume -notmatch '^[0-9a-fA-F-]{36}$') { Err $ctx 400 'resume'; return }
    if ($agent -and -not (Test-Path (Join-Path $agentsDir "$agent.md"))) { Err $ctx 400 'agent'; return }
    if ($agent) { $pp = Get-Person (Get-Org) $agent; if (Is-Suspended $pp) { Err $ctx 409 'dinh-chi'; return } }
    if ($agent -notmatch '^[a-z0-9-]*$') { Err $ctx 400 'agent'; return }
    $r = Start-JobSpec @{ kind = $kind; engine = $engine; mode = $mode; prompt = $prompt; agent = $agent; resume = $resume; label = (One-Line ([string]$b.label) 80); source = ''; allowBash = ($b.allowBash -eq $true); sandbox = ($kind -eq 'trial'); meta = '' }
    if ($r.error) { Err $ctx 409 $r.error; return }
    Send $ctx 200 (Json $r); return
  }
  if ($path -eq '/api/meetings' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $org = Get-Org; $topic = One-Line ([string]$b.topic) 200; $engine = [string]$b.engine
    if (-not $topic) { Err $ctx 400 'chu de rong'; return }
    if ($engine -notmatch '^(mock|claude(:(haiku|sonnet|opus))?)$') { Err $ctx 400 'engine'; return }
    $ids = @($b.participants | ForEach-Object { [string]$_ } | Where-Object { $_ } | Select-Object -Unique)
    if (-not $ids.Count -or $ids.Count -gt 12) { Err $ctx 400 'nguoi du (1..12)'; return }
    foreach ($i in $ids) { if (-not ($org.people | Where-Object { $_.id -eq $i })) { Err $ctx 400 "nguoi du khong ton tai: $i"; return } }
    foreach ($i in $ids) { if (Is-Suspended (Get-Person $org $i)) { Err $ctx 400 "nguoi du dang bi dinh chi: $i"; return } }
    if (@($script:jobs.Values | Where-Object { $_.kind -eq 'meeting' -and -not $_.proc.HasExited }).Count) { Err $ctx 409 'dang co cuoc hop khac'; return }
    $mid = 'm' + (Get-Date).ToString('yyMMddHHmmss')
    $prompt = $pr.meeting.Replace('{topic}', $topic).Replace('{participants}', ($ids -join ', ')).Replace('{mid}', $mid)
    $r = Start-JobSpec @{ kind = 'meeting'; engine = $engine; mode = 'run'; prompt = $prompt; agent = ''; resume = ''; label = ('Hop: ' + $topic); source = ''; allowBash = $false; sandbox = $false; meta = ($ids -join ',') + '|' + $mid + '|' + $topic }
    if ($r.error) { Err $ctx 409 $r.error; return }
    Send $ctx 200 (Json $r); return
  }
  if ($path -match '^/api/chat/([0-9a-z-]+)$' -and $method -eq 'GET') {
    $id = $Matches[1]; $j = $script:jobs[$id]; if (-not $j) { Err $ctx 404 'job'; return }
    $from = 0; [void][int]::TryParse([string]$req.QueryString['from'], [ref]$from)
    $done = $j.proc.HasExited
    $lines = @(Read-Lines $j.out (-not $done))
    $slice = @(); if ($from -lt $lines.Count) { $slice = @($lines[$from..($lines.Count - 1)]) }
    $errText = ''
    if ($done -and (Test-Path $j.err)) { $errText = [IO.File]::ReadAllText($j.err, $utf8); if ($errText.Length -gt 2000) { $errText = $errText.Substring(0, 2000) } }
    $exit = 'null'; if ($done) { $exit = [string]$j.proc.ExitCode }
    Send $ctx 200 ('{"events":[' + ($slice -join ',') + '],"next":' + $lines.Count + ',"done":' + $done.ToString().ToLower() + ',"exit":' + $exit + ',"stderr":' + (Json $errText) + '}'); return
  }
  if ($path -match '^/api/chat/([0-9a-z-]+)/stop$' -and $method -eq 'POST') {
    $j = $script:jobs[$Matches[1]]; if (-not $j) { Err $ctx 404 'job'; return }
    if (-not $j.proc.HasExited) { Start-Process taskkill -ArgumentList "/PID $($j.proc.Id) /T /F" -WindowStyle Hidden -Wait }
    Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -eq '/api/jobs' -and $method -eq 'GET') {
    $list = @($script:jobs.GetEnumerator() | ForEach-Object { @{ id = $_.Key; kind = $_.Value.kind; label = $_.Value.label; source = $_.Value.source; engine = $_.Value.engine; running = (-not $_.Value.proc.HasExited); started = $_.Value.started.ToString('s') } } | Sort-Object { $_.started } -Descending | Select-Object -First 30)
    Send $ctx 200 (Json @{ jobs = $list } 5); return
  }
  if ($path -eq '/api/inbox' -and $method -eq 'GET') {
    $items = @(Get-ChildItem (Join-Path $root 'inbox') -Filter *.json | Sort-Object Name -Descending | Select-Object -First 100 | ForEach-Object { [IO.File]::ReadAllText($_.FullName, $utf8) | ConvertFrom-Json })
    Send $ctx 200 (Json @{ items = $items } 8); return
  }
  if ($path -match '^/api/inbox/([0-9a-z-]+)/(seen|approve|dismiss)$' -and $method -eq 'POST') {
    $id = $Matches[1]; $act = $Matches[2]; $f = Join-Path $root "inbox\$id.json"; if (-not (Test-Path $f)) { Err $ctx 404 'inbox'; return }
    $it = [IO.File]::ReadAllText($f, $utf8) | ConvertFrom-Json
    if ($act -eq 'seen') { $it.status = 'seen' }
    elseif ($act -eq 'dismiss') { $it.status = 'dismissed' }
    else {
      if ($it.status -ne 'pending' -or -not $it.sid) { Err $ctx 409 'khong co ke hoach cho duyet'; return }
      $b = Read-Body $req; $note = ''; if ($b -and $b.note) { $note = ' (ghi chu: ' + (One-Line ([string]$b.note) 500) + ')' }
      $prompt = $pr.approve.Replace('{note}', $note) + $pr.runRules
      $r = Start-JobSpec @{ kind = 'schedule'; engine = [string]$it.engine; mode = 'run'; prompt = $prompt; agent = ''; resume = [string]$it.sid; label = [string]$it.title; source = [string]$it.source; allowBash = $false; sandbox = $false; meta = '' }
      if ($r.error) { Err $ctx 409 $r.error; return }
      $it.status = 'approved'
    }
    Write-Json $f $it 6; Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -eq '/api/file' -and $method -eq 'GET') {
    $rel = [string]$req.QueryString['path']; if ($rel -notlike 'workspace/*') { Err $ctx 400 'chi doc workspace/'; return }
    $full = [IO.Path]::GetFullPath((Join-Path $proj $rel.Replace('/', '\')))
    if (-not $full.StartsWith($wsDir + '\') -or -not (Test-Path $full -PathType Leaf)) { Err $ctx 404 'file'; return }
    $fi = Get-Item $full; if ($fi.Length -gt 300000) { Err $ctx 413 'file qua lon'; return }
    Send $ctx 200 (Json @{ path = $rel; text = [IO.File]::ReadAllText($full, $utf8) }); return
  }
  if ($path -eq '/api/schedule' -and $method -eq 'GET') {
    $sc = Read-Json $schedPath ([pscustomobject]@{ settings = [pscustomobject]@{ dailyLimit = 12; countDate = ''; countToday = 0 }; items = @() })
    $logs = @(); if (Test-Path $logPath) { $logs = @(Get-Content $logPath -Tail 30 -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json }) }
    Send $ctx 200 (Json @{ schedule = $sc; log = $logs; queued = $script:queue.Count } 8); return
  }
  if ($path -eq '/api/schedule' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $sc = Read-Json $schedPath $null; $org = Get-Org
    $name = One-Line ([string]$b.name) 80; if (-not $name) { Err $ctx 400 'ten rong'; return }
    $prompt = ([string]$b.prompt).Trim(); if (-not $prompt -or $prompt.Length -gt 4000) { Err $ctx 400 'prompt (1..4000)'; return }
    $target = [string]$b.target
    if ($target -ne 'assistant') {
      if ($target -notmatch '^(dept|agent):[a-z0-9-]+$') { Err $ctx 400 'target'; return }
      $tid = $target.Substring($target.IndexOf(':') + 1)
      if ($target -like 'dept:*' -and -not ($org.rooms | Where-Object { $_.id -eq $tid -and $_.headId })) { Err $ctx 400 'phong chua co truong phong'; return }
      if ($target -like 'agent:*' -and -not (Test-Path (Join-Path $agentsDir "$tid.md"))) { Err $ctx 400 'agent'; return }
    }
    if (@('run', 'plan') -notcontains [string]$b.mode) { Err $ctx 400 'mode'; return }
    if ([string]$b.engine -notmatch '^(mock|claude(:(haiku|sonnet|opus))?)$') { Err $ctx 400 'engine'; return }
    $re = Check-Repeat $b.repeat; if ($re) { Err $ctx 400 $re; return }
    $rep = [pscustomobject]@{ type = [string]$b.repeat.type; time = [string]$b.repeat.time; days = @($b.repeat.days | ForEach-Object { [int]$_ }); day = [int]$b.repeat.day; date = [string]$b.repeat.date }
    $it = $null; if ($b.id) { $it = $sc.items | Where-Object { $_.id -eq [string]$b.id } | Select-Object -First 1 }
    if (-not $it) {
      if (@($sc.items).Count -ge 40) { Err $ctx 409 'toi da 40 muc lich'; return }
      $id = 's' + (Get-Date).ToString('yyMMddHHmmss') + (Get-Random -Maximum 99).ToString('00')
      $it = [pscustomobject]@{ id = $id; name = ''; enabled = $false; target = ''; prompt = ''; repeat = $rep; mode = 'run'; engine = 'mock'; catchUp = $false; lastRun = ''; nextRun = ''; lastJob = ''; lastResult = '' }
      $sc.items = @($sc.items) + $it
    }
    $it.name = $name; $it.prompt = $prompt; $it.target = $target; $it.repeat = $rep; $it.mode = [string]$b.mode; $it.engine = [string]$b.engine; $it.catchUp = ($b.catchUp -eq $true); $it.enabled = ($b.enabled -eq $true)
    $n = Get-NextRun $rep (Get-Date); $it.nextRun = if ($n) { $n.ToString('s') } else { '' }
    Write-Json $schedPath $sc; Send $ctx 200 (Json @{ ok = $true; id = $it.id; nextRun = $it.nextRun }); return
  }
  if ($path -eq '/api/schedule/settings' -and $method -eq 'POST') {
    $b = Read-Body $req; $n = [int]$b.dailyLimit; if ($n -lt 1 -or $n -gt 100) { Err $ctx 400 'dailyLimit 1..100'; return }
    $sc = Read-Json $schedPath $null; $sc.settings.dailyLimit = $n; Write-Json $schedPath $sc; Send $ctx 200 (Json @{ ok = $true }); return
  }
  if ($path -eq '/api/schedule/preview' -and $method -eq 'POST') {
    $b = Read-Body $req; $re = Check-Repeat $b.repeat; if ($re) { Err $ctx 400 $re; return }
    $from = Get-Date; if ($b.from) { $from = [datetime]::Parse([string]$b.from) }
    $out = @(); for ($i = 0; $i -lt 3; $i++) { $n = Get-NextRun $b.repeat $from; if (-not $n) { break }; $out += $n.ToString('s'); $from = $n }
    Send $ctx 200 (Json @{ next = $out } 3); return
  }
  if ($path -match '^/api/schedule/([0-9a-z]+)/(toggle|run-now|delete)$' -and $method -eq 'POST') {
    $id = $Matches[1]; $act = $Matches[2]; $sc = Read-Json $schedPath $null; $it = $sc.items | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $it) { Err $ctx 404 'lich'; return }
    if ($act -eq 'toggle') {
      $it.enabled = -not $it.enabled
      if ($it.enabled) { $n = Get-NextRun $it.repeat (Get-Date); $it.nextRun = if ($n) { $n.ToString('s') } else { '' }; if (-not $n) { $it.enabled = $false } }
      Write-Json $schedPath $sc; Send $ctx 200 (Json @{ ok = $true; enabled = $it.enabled; nextRun = $it.nextRun }); return
    }
    if ($act -eq 'delete') { $sc.items = @($sc.items | Where-Object { $_.id -ne $id }); Write-Json $schedPath $sc; Send $ctx 200 (Json @{ ok = $true }); return }
    $running = @($script:jobs.Values | Where-Object { $_.source -eq $id -and -not $_.proc.HasExited }).Count
    if ($running) { Err $ctx 409 'dang chay'; return }
    $r = Start-ScheduleItem $it $true; if ($r.error) { Err $ctx 409 $r.error; return }
    $it.lastRun = (Get-Date).ToString('s'); Write-Json $schedPath $sc; Send $ctx 200 (Json $r); return
  }
  Err $ctx 404 'not found'
}

# ---------- file tinh ----------
$STATIC_DIRS = @('lib', 'state', 'meetings'); $DENY = @('runtime-catalog.json', 'schedule.json', 'certified.json', 'guard-settings.json', 'schedule-log.jsonl')
function Handle($ctx) {
  $req = $ctx.Request; $path = $req.Url.AbsolutePath
  if (@("localhost:$Port", "127.0.0.1:$Port") -notcontains $req.Headers['Host']) { Err $ctx 403 'host'; return }
  if ($path.StartsWith('/api/')) { Api $ctx $req $path $req.HttpMethod; return }
  $rel = [Uri]::UnescapeDataString($path.TrimStart('/')); if ($rel -eq '') { $rel = 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if (-not $file.StartsWith($root + '\') -or -not (Test-Path $file -PathType Leaf)) { Send $ctx 404 'not found' 'text/plain'; return }
  $sub = $file.Substring($root.Length + 1); $parts = $sub -split '\\'
  $ext = [IO.Path]::GetExtension($file).ToLower()
  $ok = ($parts.Count -eq 1 -and @('.html', '.js', '.json', '.css') -contains $ext -and $DENY -notcontains $parts[0]) -or ($parts.Count -gt 1 -and $STATIC_DIRS -contains $parts[0])
  if (-not $ok) { Send $ctx 404 'not found' 'text/plain'; return }
  $type = 'application/octet-stream'; if ($types.ContainsKey($ext)) { $type = $types[$ext] }
  if ($rel -eq 'index.html') {
    $html = [IO.File]::ReadAllText($file, $utf8).Replace('</head>', "<meta name=`"town-token`" content=`"$token`"></head>")
    Send $ctx 200 $html $type; return
  }
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.ContentType = $type; $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.ContentLength64 = $bytes.Length; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length); $ctx.Response.Close()
}

# ---------- khoi dong ----------
if (-not (Test-Path $schedPath)) { Write-Json $schedPath @{ settings = @{ dailyLimit = 12; countDate = ''; countToday = 0 }; items = @() } }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Van phong Alan Academy: http://localhost:$Port/"
while ($listener.IsListening) {
  $task = $listener.GetContextAsync()
  while (-not $task.Wait(1000)) { Tick }
  $ctx = $task.Result
  try { Handle $ctx } catch { try { Err $ctx 500 $_.Exception.Message } catch {} }
  Tick
}
