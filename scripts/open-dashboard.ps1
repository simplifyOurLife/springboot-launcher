param([string]$Root)
$ErrorActionPreference = 'Stop'
try {
    # 同一入口同时支持源码 scripts 目录和安装根目录，双击时无需传入路径。
    if (-not $Root) {
        $Root = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'installation.json')) { $PSScriptRoot } else { Split-Path -Parent $PSScriptRoot }
    }
    $manifest = Join-Path $Root 'installation.json'
    if (Test-Path -LiteralPath $manifest) {
        $installed = Get-Content -LiteralPath $manifest -Encoding UTF8 -Raw | ConvertFrom-Json
        if ($installed.product -ne 'springboot-launcher' -or $installed.version -notmatch '^\d+\.\d+\.\d+$') { throw '安装记录无效，请重新打开安装向导。' }
        $nodePath = $installed.nodePath
        $entry = Join-Path $Root 'launcher.mjs'
    } else {
        $nodePath = (Get-Command node -ErrorAction Stop).Source
        $entry = Join-Path $Root 'bin/springboot-launcher.mjs'
    }
    & $nodePath $entry dashboard
    if ($LASTEXITCODE -ne 0) { throw '面板未能打开，请检查 Node.js 和安装目录，或在终端执行 dashboard 查看详情。' }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Spring Boot Launcher', 'OK', 'Error')
    exit 1
}
