# Hook PreToolUse (Write/Edit/Skill/MCP): chan agent ghi file ngoai khu cua minh, dung skill/MCP ngoai danh sach duoc giao. ASCII only.
# Che do trial (OFFICE_MODE=trial): chi duoc ghi vao workspace\_thu-nghiem\<agent>\.
# Agent thuong: chi ghi vao workspace\<phong>\ va office\state\<id>.js cua chinh minh.
# Phien chinh (Tro ly, khong co agent_type): workspace\, office\state\tro-ly.js, office\meetings\current.js; KHONG dung Skill/MCP.
# Skill: phai nam trong skills: cua agent. MCP: phai nam trong tools: cua agent; neu rui ro thi agent phai co riskAck va khong chay che do schedule.
$ErrorActionPreference = 'Stop'
function Deny([string]$m) { [Console]::Error.WriteLine($m); exit 2 }
try {
  $raw = [Console]::In.ReadToEnd()
  $j = $raw | ConvertFrom-Json
  $agent = [string]$j.agent_type
  $tn = [string]$j.tool_name
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $org = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'org.json'), $utf8) | ConvertFrom-Json
  $root = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\')

  if ($tn -eq 'Agent' -or $tn -eq 'Task') {
    $sub = [string]$j.tool_input.subagent_type
    $sp = $org.people | Where-Object { $_.id -eq $sub } | Select-Object -First 1
    if ($sp -and [string]$sp.status -eq 'suspended') { Deny "Khong giao viec cho nguoi dang bi dinh chi: $sub" }
    exit 0
  }

  if ($tn -eq 'Skill' -or $tn.StartsWith('mcp__')) {
    if (-not $agent) { Deny 'Tro ly khong tu dung Skill/MCP. Hay giao viec cho agent duoc cap quyen do.' }
    $af = Join-Path $root ".claude\agents\$agent.md"
    if (-not (Test-Path $af)) { Deny "Khong tim thay file agent $agent" }
    $txt = [IO.File]::ReadAllText($af, $utf8) -replace "`r`n", "`n"
    $fm = [regex]::Match($txt, '^---\n(.*?)\n---', 'Singleline').Groups[1].Value
    $toolsLine = [regex]::Match($fm, '(?m)^tools:\s*(.*)$').Groups[1].Value
    $skillsLine = [regex]::Match($fm, '(?m)^skills:\s*(.*)$').Groups[1].Value
    $tools = @($toolsLine -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $skills = @($skillsLine.Trim().TrimStart('[').TrimEnd(']') -split ',' | ForEach-Object { $_.Trim().Trim('"') } | Where-Object { $_ })
    if ($tn -eq 'Skill') {
      $sn = [string]$j.tool_input.skill
      if ($skills -contains $sn) { exit 0 }
      Deny "Skill '$sn' khong nam trong danh sach skill cua $agent. Chi dung skill duoc giao: $($skills -join ', ')."
    }
    $parts = $tn -split '__', 3; $srv = $parts[1]; $tool = ''; if ($parts.Count -ge 3) { $tool = $parts[2] }
    if (($tools -notcontains "mcp__$srv") -and ($tools -notcontains $tn)) { Deny "Cong cu MCP '$tn' khong duoc giao cho $agent." }
    $risk = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'risk.json'), $utf8) | ConvertFrom-Json
    $toks = @($tool.ToLower().Split('_') | Where-Object { $_ }); $risky = $true
    foreach ($t in $toks) { if (@($risk.risky) -contains $t) { $risky = $true; $found = $true; break } }
    if (-not $found) { $risky = $true; foreach ($t in $toks) { if (@($risk.safe) -contains $t) { $risky = $false; break } } }
    if ($risky) {
      if ($env:OFFICE_MODE -eq 'schedule') { Deny "Cong cu MCP co the gui/dang/ton tien ('$tn') khong duoc chay trong viec tu dong theo lich." }
      $me = $org.people | Where-Object { $_.id -eq $agent } | Select-Object -First 1
      if (-not $me -or @($me.riskAck) -notcontains $srv) { Deny "Cong cu MCP '$tn' co the gui/dang/ton tien, chua duoc giam doc xac nhan cho $agent (xac nhan trong giao dien Nang luc)." }
    }
    exit 0
  }

  $ti = $j.tool_input
  $p = $null
  if ($ti.file_path) { $p = [string]$ti.file_path } elseif ($ti.notebook_path) { $p = [string]$ti.notebook_path }
  if (-not $p) { exit 0 }
  if (-not [IO.Path]::IsPathRooted($p)) { $p = Join-Path $root $p }
  $full = [IO.Path]::GetFullPath($p)
  $low = $full.ToLower(); $rl = $root.ToLower()
  $allow = @()
  if ($env:OFFICE_MODE -eq 'trial' -and $env:OFFICE_AGENT) {
    $allow += "$rl\workspace\_thu-nghiem\$($env:OFFICE_AGENT.ToLower())\"
  } elseif ($agent) {
    $me = $org.people | Where-Object { $_.id -eq $agent } | Select-Object -First 1
    if ($me) { $allow += "$rl\workspace\$($me.room)\"; $allow += "$rl\office\state\$agent.js" }
  } else {
    $allow += "$rl\workspace\"; $allow += "$rl\office\state\tro-ly.js"; $allow += "$rl\office\meetings\current.js"
  }
  foreach ($a in $allow) { if ($a.EndsWith('\')) { if ($low.StartsWith($a)) { exit 0 } } elseif ($low -eq $a) { exit 0 } }
  Deny "Khong duoc ghi file nay: $full. Chi duoc ghi trong khu cua minh (workspace/<phong>/ va state cua chinh minh)."
} catch {
  [Console]::Error.WriteLine("guard loi: " + $_.Exception.Message)
  exit 2
}
