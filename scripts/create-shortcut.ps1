[CmdletBinding()]
param(
  [string]$TargetPath,
  [string]$ShortcutPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $TargetPath) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\CTRLbot Mirror\CTRLbot Mirror.exe'),
    (Join-Path $repoRoot 'release\win-unpacked\CTRLbot Mirror.exe')
  )

  $portable = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'release') `
    -Filter 'CTRLbot Mirror-*-portable.exe' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($portable) {
    $candidates += $portable.FullName
  }

  $TargetPath = $candidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
}

if (-not $TargetPath -or -not (Test-Path -LiteralPath $TargetPath -PathType Leaf)) {
  throw 'CTRLbot Mirror.exe was not found. Install the app or run npm run dist:portable first.'
}

$resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
if ([IO.Path]::GetExtension($resolvedTarget) -ne '.exe') {
  throw "Shortcut target must be an .exe: $resolvedTarget"
}

if (-not $ShortcutPath) {
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  $ShortcutPath = Join-Path $desktop 'CTRLbot Mirror.lnk'
}

$shortcutDirectory = Split-Path -Parent $ShortcutPath
if (-not (Test-Path -LiteralPath $shortcutDirectory -PathType Container)) {
  throw "Shortcut directory does not exist: $shortcutDirectory"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $null
try {
  $shortcut = $wsh.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $resolvedTarget
  $shortcut.WorkingDirectory = Split-Path -Parent $resolvedTarget
  $shortcut.IconLocation = "$resolvedTarget,0"
  $shortcut.Description = 'Mirror, control, and capture an Android device'
  $shortcut.Save()
} finally {
  if ($shortcut) {
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)
  }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wsh)
}

if (-not (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
  throw "Windows did not create the shortcut: $ShortcutPath"
}

Write-Output "Created shortcut: $ShortcutPath"
Write-Output "Target: $resolvedTarget"
