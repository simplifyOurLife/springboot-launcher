param([Parameter(Mandatory=$true)][string]$Root, [switch]$DesktopOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function New-LauncherShortcut([string]$Root, [string]$ShortcutPath, [string]$IconCacheDirectory) {
    $Root = [IO.Path]::GetFullPath($Root)
    $helper = Join-Path $Root 'open-dashboard.ps1'
    if (-not (Test-Path -LiteralPath $helper)) { $helper = Join-Path $Root 'scripts/open-dashboard.ps1' }
    if (-not (Test-Path -LiteralPath $helper)) { throw '未找到面板打开脚本' }
    $icon = Join-Path $Root 'assets/springboot-launcher.ico'
    if (-not (Test-Path -LiteralPath $icon)) { throw '未找到启动器图标，请检查安装包是否完整。' }
    if (-not $IconCacheDirectory) { $IconCacheDirectory = Join-Path $env:LOCALAPPDATA 'springboot-launcher/icons' }
    New-Item -ItemType Directory -Path $IconCacheDirectory -Force | Out-Null
    # 内容变化时使用新文件名，避免 Shell 继续复用此前的空白或旧版图标。
    $fullIconHash = (Get-FileHash -LiteralPath $icon -Algorithm SHA256).Hash
    $iconHash = $fullIconHash.Substring(0,16).ToLowerInvariant()
    $cachedIcon = Join-Path $IconCacheDirectory ('springboot-launcher-' + $iconHash + '.ico')
    # 重复创建时复用完整缓存，避免覆盖正在被 Shell 读取的同一图标文件。
    if (-not (Test-Path -LiteralPath $cachedIcon) -or (Get-FileHash -LiteralPath $cachedIcon -Algorithm SHA256).Hash -ne $fullIconHash) {
        Copy-Item -LiteralPath $icon -Destination $cachedIcon -Force
    }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    # 入口按自身位置识别根目录；不传末尾可能带反斜杠的 Root，避免 Windows 吞掉结束引号。
    $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $helper + '"'
    $shortcut.WorkingDirectory = $Root
    $shortcut.Description = '打开 Spring Boot 服务管理与日志面板'
    # IconLocation 是属性而非命令行；路径内不加引号，逗号后的 0 为图标索引。
    $shortcut.IconLocation = $cachedIcon + ',0'
    $shortcut.Save()
    if (-not ('SpringBootLauncher.ShortcutShell' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace SpringBootLauncher {
  public static class ShortcutShell {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
    public static extern void SHChangeNotify(int eventId, uint flags, string path, IntPtr other);
  }
}
'@
    }
    # 只通知当前快捷方式更新，不清空系统图标缓存，也不重启资源管理器。
    [SpringBootLauncher.ShortcutShell]::SHChangeNotify(0x2000,0x2005,$ShortcutPath,[IntPtr]::Zero)
    return $ShortcutPath
}

# 点源导入只提供函数，隔离验证不会修改真实桌面或开始菜单。
if ($MyInvocation.InvocationName -eq '.') { return }
$Root = [IO.Path]::GetFullPath($Root)
$destinations = @([Environment]::GetFolderPath('DesktopDirectory'))
if (-not $DesktopOnly) { $destinations += Join-Path ([Environment]::GetFolderPath('Programs')) 'Spring Boot Launcher' }
$created = @()
foreach ($destination in $destinations) {
    if (-not (Test-Path -LiteralPath $destination)) { New-Item -ItemType Directory -Path $destination -Force | Out-Null }
    $shortcutPath = Join-Path $destination 'Spring Boot Launcher.lnk'
    $created += New-LauncherShortcut $Root $shortcutPath
}
@{ created = $created } | ConvertTo-Json -Compress
