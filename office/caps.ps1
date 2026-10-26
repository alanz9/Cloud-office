# Nang luc: skill (du an + tai khoan), MCP, cong cu; tai skill len; gan cho agent; rui ro MCP. Nap bang dot-source tu serve.ps1. ASCII only.
$snapPath = Join-Path $root 'runtime-catalog.json'; $riskPath = Join-Path $root 'risk.json'; $mcpTxt = Join-Path $root 'chat\mcp-list.txt'
$script:mcpProc = $null; $script:mcpAt = [datetime]::MinValue
$ACCOUNT_PREFIX = 'anthropic-skills:'
$syncedRoot = Join-Path $env:USERPROFILE '.claude\skills\synced'
$BAD_EXT = @('.exe', '.dll', '.msi', '.scr', '.com', '.vbs', '.lnk', '.jar', '.appx')
$SCRIPT_EXT = @('.ps1', '.bat', '.cmd', '.sh', '.py', '.js', '.mjs', '.vbs')
$script:risk = Read-Json $riskPath $null

function Mcp-Key([string]$display) { ($display -replace '[^A-Za-z0-9_-]', '_') }
function Is-RiskyTool([string]$tool) {
  $toks = @($tool.ToLower().Split('_') | Where-Object { $_ })
  foreach ($t in $toks) { if (@($script:risk.risky) -contains $t) { return $true } }
  foreach ($t in $toks) { if (@($script:risk.safe) -contains $t) { return $false } }
  return $true
}
function Split-Tools([string]$s) { @(([string]$s) -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
function Mcp-Parts([string]$tok) {                                   # mcp__server[__tool] -> @(server, tool|'')
  $p = $tok -split '__', 3; $srv = ''; $tool = ''
  if ($p.Count -ge 2) { $srv = $p[1] }; if ($p.Count -ge 3) { $tool = $p[2] }
  return @($srv, $tool)
}
function Parse-SkillMd([string]$path) {
  $t = ([IO.File]::ReadAllText($path, $utf8)) -replace "`r`n", "`n"
  $m = [regex]::Match($t, '^---\n(.*?)\n---', 'Singleline'); $r = @{ name = ''; description = '' }
  if ($m.Success) {
    $lines = $m.Groups[1].Value -split "`n"
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^name:\s*(.*)$') { $r.name = (Unquote $Matches[1]) }
      elseif ($lines[$i] -match '^description:\s*(.*)$') {
        $v = $Matches[1].Trim()
        if ($v -match '^[>|][-+]?$') { $buf = @(); for ($j = $i + 1; $j -lt $lines.Count -and $lines[$j] -match '^\s+'; $j++) { $buf += $lines[$j].Trim() }; $v = $buf -join ' ' } else { $v = Unquote $v }
        $r.description = $v
      }
    }
  }
  return $r
}
function Dir-Info([string]$dir) {
  $files = @(Get-ChildItem $dir -Recurse -File -ErrorAction SilentlyContinue)
  $sc = @($files | Where-Object { $SCRIPT_EXT -contains $_.Extension.ToLower() }).Count
  return @{ files = $files.Count; bytes = [long](($files | Measure-Object Length -Sum).Sum); scripts = $sc }
}
function Get-ProjectSkills {
  $out = @(); if (-not (Test-Path $skillsDir)) { return $out }
  foreach ($d in (Get-ChildItem $skillsDir -Directory)) {
    $f = Join-Path $d.FullName 'SKILL.md'; if (-not (Test-Path $f)) { continue }
    $m = Parse-SkillMd $f; $i = Dir-Info $d.FullName
    $out += @{ name = $d.Name; source = 'project'; description = $m.description; files = $i.files; bytes = $i.bytes; scripts = $i.scripts }
  }
  return $out
}
function Get-AccountSkills {
  $out = @(); if (-not (Test-Path $syncedRoot)) { return $out }
  $mf = Get-ChildItem $syncedRoot -Recurse -Filter manifest.json -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $mf) { return $out }
  $j = [IO.File]::ReadAllText($mf.FullName, $utf8) | ConvertFrom-Json
  foreach ($s in $j.skills) {
    $dir = Join-Path $mf.DirectoryName ([string]$s.name); $i = @{ files = 0; bytes = 0; scripts = 0 }; if (Test-Path $dir) { $i = Dir-Info $dir }
    $d = ([string]$s.description); if ($d.Length -gt 300) { $d = $d.Substring(0, 300) }
    $out += @{ name = $ACCOUNT_PREFIX + [string]$s.name; source = 'account'; description = $d; files = $i.files; bytes = $i.bytes; scripts = $i.scripts; dir = $s.name }
  }
  return $out
}
function Get-AllSkillNames { @((Get-ProjectSkills) | ForEach-Object { $_.name }) + @((Get-AccountSkills) | ForEach-Object { $_.name }) }

# ---------- MCP: danh sach (claude mcp list, chay nen) va anh chup cong cu tu lan chay that ----------
function Start-McpRefresh {
  if ($script:mcpProc -and -not $script:mcpProc.HasExited) { return }
  $a = Get-Auth; if (-not $a.found) { return }
  $script:mcpProc = Start-Process -FilePath $a.exe -ArgumentList 'mcp list' -WorkingDirectory $proj -RedirectStandardOutput ($mcpTxt + '.new') -RedirectStandardError (Join-Path $root 'chat\mcp-list.err.txt') -WindowStyle Hidden -PassThru
  $null = $script:mcpProc.Handle; $script:mcpAt = Get-Date
}
function Get-McpList([bool]$force) {
  $updating = ($script:mcpProc -and -not $script:mcpProc.HasExited)
  if (-not $updating -and (Test-Path ($mcpTxt + '.new')) -and ((Get-Item ($mcpTxt + '.new')).Length -gt 0)) { Move-Item ($mcpTxt + '.new') $mcpTxt -Force }
  if (-not $updating -and ($force -or -not (Test-Path $mcpTxt) -or ((Get-Date) - $script:mcpAt).TotalMinutes -gt 5)) { Start-McpRefresh; $updating = $true }
  $list = @()
  if (Test-Path $mcpTxt) {
    $txt = ''; try { $fs = [IO.File]::Open($mcpTxt, 'Open', 'Read', 'ReadWrite'); $sr = New-Object IO.StreamReader($fs, $utf8); $txt = $sr.ReadToEnd(); $sr.Close() } catch {}
    foreach ($l in ($txt -split "`r?`n")) {
      $m = [regex]::Match($l, '^(?<n>.+?): (?<u>\S+) - (?<s>.+)$'); if (-not $m.Success) { continue }
      $st = $m.Groups['s'].Value; $s = 'other'
      if ($st -match 'Connected') { $s = 'connected' } elseif ($st -match 'authentication') { $s = 'needs-auth' } elseif ($st -match 'Fail') { $s = 'failed' }
      $name = $m.Groups['n'].Value
      $list += @{ name = $name; key = (Mcp-Key $name); url = $m.Groups['u'].Value; status = $s; raw = ($st -replace '^[^\w]+', '') }
    }
  }
  return @{ list = $list; updating = $updating }
}
function Get-Snapshot { Read-Json $snapPath $null }
function Save-Snapshot($j) {
  try {
    $first = $null; foreach ($l in (Read-Lines $j.out $false)) { $e = $l | ConvertFrom-Json; if ($e.type -eq 'system' -and $e.subtype -eq 'init') { $first = $e; break } }
    if (-not $first -or -not $first.tools) { return }
    $prev = Get-Snapshot; $tl = @($first.tools); if ($prev) { $have = @{}; foreach ($x in $tl) { $have[[string]$x] = 1 }; foreach ($x in @($prev.tools)) { if (([string]$x).StartsWith('mcp__') -and -not $have[[string]$x]) { $tl += [string]$x } } }
    $o = @{ at = (Get-Date).ToString('s'); tools = $tl; skills = @($first.skills); mcp = @($first.mcp_servers | ForEach-Object { @{ name = $_.name; status = $_.status } }); model = [string]$first.model }
    Write-Json $snapPath $o 6
  } catch {}
}
function Server-Tools([string]$key, $snap) {
  if (-not $snap) { return @() }
  $pre = "mcp__$key" + '__'
  return @(@($snap.tools) | Where-Object { ([string]$_).StartsWith($pre) } | ForEach-Object { ([string]$_).Substring($pre.Length) })
}
function Server-Risky([string]$key, $snap) {
  $t = Server-Tools $key $snap; if (-not $t.Count) { return $true }
  foreach ($x in $t) { if (Is-RiskyTool $x) { return $true } }
  return $false
}
# cac server MCP co rui ro trong chuoi tools (de doi xac nhan)
function Risk-Servers([string]$tools, $snap) {
  $out = @()
  foreach ($tok in (Split-Tools $tools)) {
    if (-not $tok.StartsWith('mcp__')) { continue }
    $p = Mcp-Parts $tok; if (-not $p[0]) { continue }
    $risky = if ($p[1]) { Is-RiskyTool $p[1] } else { Server-Risky $p[0] $snap }
    if ($risky -and $out -notcontains $p[0]) { $out += $p[0] }
  }
  return $out
}
# giu 'Skill' dong bo voi danh sach skill
function Normalize-Caps($a) {
  $tk = @(Split-Tools $a.tools | Where-Object { $_ -ne 'Skill' }); $sk = @(Split-Tools $a.skills)
  if ($sk.Count -and $tk.Count) { $tk += 'Skill' }
  $a.tools = $tk -join ', '; $a.skills = $sk -join ', '
  return $a
}
function Caps-Block($a) {
  $sk = @(Split-Tools $a.skills); $mcp = @(Split-Tools $a.tools | Where-Object { $_.StartsWith('mcp__') })
  if (-not $sk.Count -and -not $mcp.Count) { return '' }
  $pr = Get-Prompts; $lines = @()
  if ($sk.Count) { $lines += $pr.capsSkill.Replace('{list}', (($sk | ForEach-Object { '`' + $_ + '`' }) -join ', ')) }
  if ($mcp.Count) { $lines += $pr.capsMcp.Replace('{list}', (($mcp | ForEach-Object { '`' + $_ + '`' }) -join ', ')) }
  return $pr.capsHead + "`n" + ($lines -join "`n") + "`n<!-- /office:caps -->"
}

# ---------- tong hop nang luc ----------
function Get-Capabilities([bool]$force) {
  $org = Get-Org; $snap = Get-Snapshot; $pr = Get-Prompts
  $agents = @(); $skillUse = @{}; $toolUse = @{}; $mcpUse = @{}
  foreach ($p in $org.people) {
    $f = Join-Path $agentsDir "$($p.id).md"; if (-not (Test-Path $f)) { continue }
    $a = Parse-Agent $f; $toks = @(Split-Tools $a.tools); $sk = @(Split-Tools $a.skills)
    $builtin = @($toks | Where-Object { -not $_.StartsWith('mcp__') -and $_ -ne 'Skill' }); $mcp = @($toks | Where-Object { $_.StartsWith('mcp__') })
    foreach ($t in $builtin) { if (-not $toolUse[$t]) { $toolUse[$t] = @() }; $toolUse[$t] += $p.id }
    foreach ($s in $sk) { if (-not $skillUse[$s]) { $skillUse[$s] = @() }; $skillUse[$s] += $p.id }
    foreach ($m in $mcp) { $k = (Mcp-Parts $m)[0]; if (-not $mcpUse[$k]) { $mcpUse[$k] = @() }; if ($mcpUse[$k] -notcontains $p.id) { $mcpUse[$k] += $p.id } }
    $agents += @{ id = $p.id; name = $p.name; title = $p.title; room = $p.room; role = $p.role; tools = $builtin; skills = $sk; mcp = $mcp; emptyTools = ($toks.Count -eq 0); riskAck = @($p.riskAck | Where-Object { $_ }) }
  }
  $skills = @(); foreach ($s in (@(Get-ProjectSkills) + @(Get-AccountSkills))) { $s.agents = @($skillUse[$s.name] | Where-Object { $_ }); $skills += $s }
  $ml = Get-McpList $force; $mcp = @()
  foreach ($m in $ml.list) {
    $tools = @(Server-Tools $m.key $snap | ForEach-Object { @{ name = $_; risky = (Is-RiskyTool $_) } })
    $mcp += @{ name = $m.name; key = $m.key; url = $m.url; status = $m.status; raw = $m.raw; tools = $tools; scanned = ($tools.Count -gt 0); risky = (Server-Risky $m.key $snap); agents = @($mcpUse[$m.key] | Where-Object { $_ }) }
  }
  $tl = @(); foreach ($t in $TOOLS_OK) { $tl += @{ name = $t; desc = [string]$pr.toolDesc.$t; agents = @($toolUse[$t] | Where-Object { $_ }); risky = ($t -eq 'Bash') } }
  return @{ skills = $skills; mcp = $mcp; mcpUpdating = $ml.updating; tools = $tl; agents = $agents; snapshot = @{ at = $(if ($snap) { $snap.at } else { '' }); tools = $(if ($snap) { @($snap.tools).Count } else { 0 }); model = $(if ($snap) { $snap.model } else { '' }) }; account = (Test-Path $syncedRoot) }
}
# gan / go mot nang luc cho nhieu agent
function Assign-Caps($b) {
  $kind = [string]$b.kind; $name = ([string]$b.name).Trim(); $mode = [string]$b.mode; $ids = @($b.agents | ForEach-Object { [string]$_ })
  if (@('tool', 'skill', 'mcp') -notcontains $kind) { return @{ code = 400; err = 'kind' } }
  if (@('add', 'remove') -notcontains $mode) { return @{ code = 400; err = 'mode' } }
  if (-not $ids.Count) { return @{ code = 400; err = 'chua chon agent' } }
  if ($kind -eq 'tool' -and $TOOLS_OK -notcontains $name) { return @{ code = 400; err = 'tool khong hop le' } }
  if ($kind -eq 'skill' -and (Get-AllSkillNames) -notcontains $name) { return @{ code = 400; err = 'skill khong ton tai' } }
  if ($kind -eq 'mcp' -and $name -notmatch '^mcp__[A-Za-z0-9_-]+(__[A-Za-z0-9_-]+)?$') { return @{ code = 400; err = 'mcp khong hop le' } }
  $org = Get-Org; $snap = Get-Snapshot; $ack = @($b.ack | ForEach-Object { [string]$_ })
  $plan = @(); $need = @()
  foreach ($id in $ids) {
    $person = $org.people | Where-Object { $_.id -eq $id } | Select-Object -First 1; $file = Join-Path $agentsDir "$id.md"
    if (-not $person -or -not (Test-Path $file)) { return @{ code = 400; err = "agent khong hop le: $id" } }
    $a = Parse-Agent $file; $f = @{ description = $a.description; tools = $a.tools; model = $a.model; skills = $a.skills; persona = $a.persona; extra = $a.extra; tail = $a.tail }
    $tk = @(Split-Tools $f.tools); $sk = @(Split-Tools $f.skills)
    if ($kind -eq 'tool' -or $kind -eq 'mcp') { if ($mode -eq 'add') { if ($tk -notcontains $name) { $tk += $name } } else { $tk = @($tk | Where-Object { $_ -ne $name }) } }
    else { if ($mode -eq 'add') { if ($sk -notcontains $name) { $sk += $name } } else { $sk = @($sk | Where-Object { $_ -ne $name }) } }
    $f.tools = $tk -join ', '; $f.skills = $sk -join ', '; $f = Normalize-Caps $f
    if ($mode -eq 'add' -and $kind -eq 'mcp') {
      $rs = @(Risk-Servers $name $snap | Where-Object { @($person.riskAck) -notcontains $_ })
      foreach ($r in $rs) { if ($ack -notcontains $r) { if ($need -notcontains $r) { $need += $r } } }
    }
    $plan += @{ id = $id; f = $f; person = $person }
  }
  if ($need.Count) { return @{ code = 409; err = 'can-xac-nhan'; need = $need } }
  foreach ($x in $plan) {
    [void](Save-AgentFile $x.id $x.f)
    if ($mode -eq 'remove' -and $kind -eq 'mcp') { $srv = (Mcp-Parts $name)[0]; $left = @(Split-Tools $x.f.tools | Where-Object { $_ -eq "mcp__$srv" -or $_.StartsWith("mcp__$srv" + '__') }); if (-not $left.Count) { $x.person | Add-Member -NotePropertyName riskAck -NotePropertyValue @(@($x.person.riskAck) | Where-Object { $_ -and $_ -ne $srv }) -Force } }
    if ($mode -eq 'add' -and $kind -eq 'mcp') { foreach ($r in (Risk-Servers $name $snap)) { $cur = @($x.person.riskAck | Where-Object { $_ }); if ($cur -notcontains $r) { $x.person | Add-Member -NotePropertyName riskAck -NotePropertyValue @($cur + $r) -Force } } }
  }
  Save-Org $org
  return @{ code = 200; ok = $true; changed = $plan.Count }
}

# ---------- tai skill len ----------
function Safe-Rel([string]$p) {
  $p = $p.Replace('\', '/').TrimStart('/'); if (-not $p -or $p.Length -gt 200) { return $null }
  if ($p -match '[:\x00-\x1f]' -or $p -match '(^|/)\.\.(/|$)') { return $null }
  if ($BAD_EXT -contains [IO.Path]::GetExtension($p).ToLower()) { return 'BAD' }
  return $p
}
function Upload-Skill($b) {
  $mode = [string]$b.mode; $stamp = Stamp
  $stage = Join-Path $root "_archive\upload-$stamp"; $x = Join-Path $stage 'x'; New-Item -ItemType Directory -Force $x | Out-Null
  $warn = @(); $total = [long]0; $count = 0
  try {
    $add = {
      param($rel, [byte[]]$bytes)
      $r = Safe-Rel $rel
      if ($r -eq 'BAD') { throw "file bi cam (exe/dll...): $rel" }
      if (-not $r) { throw "duong dan khong hop le: $rel" }
      $script:upTotal += $bytes.Length; $script:upCount++
      if ($script:upTotal -gt 5MB) { throw 'qua 5 MB' }; if ($script:upCount -gt 100) { throw 'qua 100 file' }
      $dst = [IO.Path]::GetFullPath((Join-Path $x $r.Replace('/', '\'))); if (-not $dst.StartsWith($x + '\')) { throw "duong dan khong hop le: $rel" }
      New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null; [IO.File]::WriteAllBytes($dst, $bytes)
    }
    $script:upTotal = [long]0; $script:upCount = 0
    if ($mode -eq 'text') {
      $txt = [string]$b.text; if (-not $txt.Trim() -or $txt.Length -gt 300000) { throw 'noi dung SKILL.md trong hoac qua dai' }
      & $add 'SKILL.md' ($utf8.GetBytes($txt))
    } elseif ($mode -eq 'files') {
      foreach ($f in @($b.files)) { & $add ([string]$f.path) ([Convert]::FromBase64String([string]$f.b64)) }
    } elseif ($mode -eq 'zip') {
      Add-Type -AssemblyName System.IO.Compression
      $zb = [Convert]::FromBase64String([string]$b.zip); if ($zb.Length -gt 8MB) { throw 'zip qua 8 MB' }
      $ms = New-Object IO.MemoryStream(, $zb); $za = New-Object IO.Compression.ZipArchive($ms, [IO.Compression.ZipArchiveMode]::Read)
      foreach ($en in $za.Entries) {
        if ($en.FullName.EndsWith('/') -or -not $en.Name) { continue }
        if ($en.Length -gt 5MB) { throw 'mot file trong zip qua 5 MB' }
        $es = $en.Open(); $mo = New-Object IO.MemoryStream; $es.CopyTo($mo); $es.Close()
        & $add $en.FullName $mo.ToArray()
      }
      $za.Dispose()
    } else { throw 'mode khong hop le' }
    # tim goc skill
    $rootDir = $null
    if (Test-Path (Join-Path $x 'SKILL.md')) { $rootDir = $x }
    else { $subs = @(Get-ChildItem $x -Directory); if ($subs.Count -eq 1 -and (Test-Path (Join-Path $subs[0].FullName 'SKILL.md'))) { $rootDir = $subs[0].FullName } }
    if (-not $rootDir) { throw 'khong thay SKILL.md (o goc hoac trong mot thu muc duy nhat)' }
    $m = Parse-SkillMd (Join-Path $rootDir 'SKILL.md')
    $name = [string]$b.name; if (-not $name) { $name = $m.name }; if (-not $name -and $rootDir -ne $x) { $name = Split-Path $rootDir -Leaf }
    $name = $name.Trim().ToLower()
    if ($name -notmatch '^[a-z0-9][a-z0-9-]{1,40}$') { throw 'ten skill phai la chu thuong, so, dau gach (2-41 ky tu)' }
    if ($name.StartsWith('anthropic')) { throw 'ten khong duoc bat dau bang anthropic' }
    if (-not $m.name) { $warn += 'SKILL.md thieu name trong frontmatter' } elseif ($m.name.ToLower() -ne $name) { $warn += "name trong SKILL.md ($($m.name)) khac ten thu muc ($name)" }
    if (-not $m.description) { throw 'SKILL.md phai co description trong frontmatter (---)' }
    $info = Dir-Info $rootDir; if ($info.scripts) { $warn += "co $($info.scripts) file script (.ps1/.bat/.py/.sh/.js): chi chay khi agent co Bash (mac dinh tat)" }
    $dest = Join-Path $skillsDir $name; $replaced = $false
    if (Test-Path $dest) {
      if ($b.overwrite -ne $true) { return @{ code = 409; err = 'da-ton-tai'; name = $name } }
      Move-Item $dest (Join-Path $root "_archive\skill-$name-$stamp"); $replaced = $true
    }
    New-Item -ItemType Directory -Force $skillsDir | Out-Null
    Move-Item $rootDir $dest
    return @{ code = 200; ok = $true; name = $name; files = $info.files; bytes = $info.bytes; warnings = $warn; replaced = $replaced; description = $m.description }
  } catch { return @{ code = 400; err = $_.Exception.Message } }
  finally { if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue } }
}
function Copy-AccountSkill([string]$full) {
  $s = (Get-AccountSkills) | Where-Object { $_.name -eq $full } | Select-Object -First 1; if (-not $s) { return @{ code = 404; err = 'skill tai khoan' } }
  $mf = Get-ChildItem $syncedRoot -Recurse -Filter manifest.json | Select-Object -First 1; $src = Join-Path $mf.DirectoryName ([string]$s.dir)
  $name = ([string]$s.dir).ToLower() -replace '[^a-z0-9-]', '-'; $dest = Join-Path $skillsDir $name
  if (Test-Path $dest) { return @{ code = 409; err = 'da-ton-tai'; name = $name } }
  New-Item -ItemType Directory -Force $skillsDir | Out-Null; Copy-Item $src $dest -Recurse
  return @{ code = 200; ok = $true; name = $name }
}

function Caps-Api($ctx, $req, [string]$path, [string]$method) {
  if ($path -eq '/api/capabilities' -and $method -eq 'GET') { Send $ctx 200 (Json (Get-Capabilities ([string]$req.QueryString['refresh'] -eq '1')) 10); return }
  if ($path -eq '/api/capabilities/scan' -and $method -eq 'POST') {
    $b = Read-Body $req; $engine = [string]$b.engine; if ($engine -notmatch '^claude(:(haiku|sonnet|opus))?$') { $engine = 'claude:haiku' }
    $r = Start-JobSpec @{ kind = 'scan'; engine = $engine; mode = 'plan'; prompt = 'ok'; agent = ''; resume = ''; label = 'scan'; source = ''; allowBash = $false; sandbox = $false; meta = '' }
    if ($r.error) { Err $ctx 409 $r.error; return }; Send $ctx 200 (Json $r); return
  }
  if ($path -eq '/api/capabilities/assign' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $r = Assign-Caps $b; if ($r.code -eq 200) { Send $ctx 200 (Json $r) } else { $r.error = $r.err; Send $ctx $r.code (Json $r) }; return
  }
  if ($path -eq '/api/skills/upload' -and $method -eq 'POST') {
    $b = Read-Body $req; if (-not $b) { Err $ctx 400 'body'; return }
    $r = Upload-Skill $b; if ($r.code -eq 200) { Send $ctx 200 (Json $r) } else { $r.error = $r.err; Send $ctx $r.code (Json $r) }; return
  }
  if ($path -eq '/api/skills/import' -and $method -eq 'POST') {
    $b = Read-Body $req; $r = Copy-AccountSkill ([string]$b.name); if ($r.code -eq 200) { Send $ctx 200 (Json $r) } else { $r.error = $r.err; Send $ctx $r.code (Json $r) }; return
  }
  if ($path -eq '/api/skills/view' -and $method -eq 'GET') {
    $n = [string]$req.QueryString['name']; $file = $null
    if ($n.StartsWith($ACCOUNT_PREFIX)) { $s = (Get-AccountSkills) | Where-Object { $_.name -eq $n } | Select-Object -First 1; if ($s) { $mf = Get-ChildItem $syncedRoot -Recurse -Filter manifest.json | Select-Object -First 1; $file = Join-Path (Join-Path $mf.DirectoryName ([string]$s.dir)) 'SKILL.md' } }
    elseif ($n -match '^[a-z0-9-]+$') { $file = Join-Path (Join-Path $skillsDir $n) 'SKILL.md' }
    if (-not $file -or -not (Test-Path $file)) { Err $ctx 404 'skill'; return }
    $t = [IO.File]::ReadAllText($file, $utf8); if ($t.Length -gt 100000) { $t = $t.Substring(0, 100000) }
    Send $ctx 200 (Json @{ name = $n; text = $t }); return
  }
  if ($path -match '^/api/skills/([a-z0-9-]+)/archive$' -and $method -eq 'POST') {
    $n = $Matches[1]; $dir = Join-Path $skillsDir $n; if (-not (Test-Path $dir)) { Err $ctx 404 'skill'; return }
    $users = @(); foreach ($p in (Get-Org).people) { $f = Join-Path $agentsDir "$($p.id).md"; if (Test-Path $f) { if ((Split-Tools (Parse-Agent $f).skills) -contains $n) { $users += $p.id } } }
    if ($users.Count) { Send $ctx 409 (Json @{ error = 'dang-duoc-dung'; agents = $users }); return }
    Move-Item $dir (Join-Path $root "_archive\skill-$n-$(Stamp)"); Send $ctx 200 (Json @{ ok = $true }); return
  }
  Err $ctx 404 'not found'
}

# ---------- loc MCP cho tung lan chay (--allowedTools) ----------
# readOnly/unattended: bo moi MCP co rui ro; chay thuong: chi giu MCP co rui ro neu agent da duoc xac nhan (riskAck)
function Filter-Mcp([string]$tools, [string]$agentId, [bool]$readOnly, [bool]$unattended) {
  $snap = Get-Snapshot; $person = $null
  if ($agentId) { $person = (Get-Org).people | Where-Object { $_.id -eq $agentId } | Select-Object -First 1 }
  $out = @()
  foreach ($tok in (Split-Tools $tools)) {
    if (-not $tok.StartsWith('mcp__')) { $out += $tok; continue }
    $rs = @(Risk-Servers $tok $snap)
    if ($rs.Count -eq 0) { $out += $tok; continue }
    if ($readOnly -or $unattended) { continue }
    $ok = $true; foreach ($r in $rs) { if (-not $person -or @($person.riskAck) -notcontains $r) { $ok = $false } }
    if ($ok) { $out += $tok }
  }
  return ($out -join ',')
}
# phien chinh (Tro ly) goi subagent: cho phep hop cua cac agent de subagent khong bi tu choi quyen khi chay nen; hook chan theo tung agent
function Union-Caps([bool]$unattended) {
  $org = Get-Org; $set = @(); $hasSkill = $false
  foreach ($p in $org.people) {
    $f = Join-Path $agentsDir "$($p.id).md"; if (-not (Test-Path $f)) { continue }
    if ($p.status -eq 'suspended') { continue }; $a = Parse-Agent $f; if (Split-Tools $a.skills) { $hasSkill = $true }
    $m = Filter-Mcp (((Split-Tools $a.tools) | Where-Object { $_.StartsWith('mcp__') }) -join ',') $p.id $false $unattended
    foreach ($x in (Split-Tools $m)) { if ($set -notcontains $x) { $set += $x } }
  }
  $r = ''; if ($hasSkill) { $r += ',Skill' }; if ($set.Count) { $r += ',' + ($set -join ',') }
  return $r
}
# ---------- chay claude, tu thu lai neu ket noi MCP cua claude.ai chua kip (init khong co cong cu MCP can dung) ----------
function Launch-Claude($exe, [string]$argStr, $inF, $outF, $errF, $need) {
  $p = $null
  for ($try = 1; $try -le 3; $try++) {
    $p = Start-Process -FilePath $exe -ArgumentList $argStr -WorkingDirectory $proj -RedirectStandardInput $inF -RedirectStandardOutput $outF -RedirectStandardError $errF -WindowStyle Hidden -PassThru
    $null = $p.Handle
    if (-not $need.Count -or $try -eq 3) { break }
    $ok = $false; $t0 = Get-Date
    while (((Get-Date) - $t0).TotalSeconds -lt 15 -and -not $p.HasExited) {
      Start-Sleep -Milliseconds 400
      $init = $null
      try { foreach ($l in @(Read-Lines $outF $true)) { if ($l -like '*"subtype":"init"*') { $init = $l | ConvertFrom-Json; break } } } catch {}
      if ($init) {
        $have = @($init.tools | ForEach-Object { [string]$_ }); $miss = 0
        foreach ($n in $need) { $any = $false; foreach ($h in $have) { if ($h -eq $n -or $h.StartsWith($n + '__')) { $any = $true; break } }; if (-not $any) { $miss++ } }
        $ok = ($miss -eq 0); break
      }
    }
    if ($ok) { break }
    if (-not $p.HasExited) { Start-Process taskkill -ArgumentList "/PID $($p.Id) /T /F" -WindowStyle Hidden -Wait }
    Log-Sched 'mcp' 'retry' "init thieu cong cu MCP, thu lai lan $try"
    Start-Sleep -Milliseconds 500
  }
  return $p
}