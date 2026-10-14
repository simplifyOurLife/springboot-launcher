# 验证真实 .lnk 参数通过 Windows PowerShell 启动入口；Node 入口仅记录参数，不启动服务。
$ErrorActionPreference='Stop'
$repositoryRoot=Split-Path -Parent $PSScriptRoot
$testParent=Join-Path $repositoryRoot '.superpowers/tmp'
$testRoot=Join-Path $testParent ('shortcut-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
. (Join-Path $repositoryRoot 'scripts/create-shortcuts.ps1') -Root $testRoot
$nodePath=(Get-Command node -ErrorAction Stop).Source
$fakeEntry=@'
import {writeFileSync} from 'node:fs';
writeFileSync(process.env.SBL_SHORTCUT_RESULT,JSON.stringify({entry:process.argv[1],args:process.argv.slice(2)}));
'@
function Assert-Shortcut($Condition,[string]$Message){if(-not $Condition){throw $Message}}
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LauncherShortcutIconCheck {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Info { public IntPtr icon; public int index; public uint attrs; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string name; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=80)] public string type; }
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SHGetFileInfo(string path,uint attrs,ref Info info,uint size,uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
}
'@
function Assert-ShellIcon([string]$ShortcutPath){
    $info=New-Object LauncherShortcutIconCheck+Info
    $result=[LauncherShortcutIconCheck]::SHGetFileInfo($ShortcutPath,0,[ref]$info,[Runtime.InteropServices.Marshal]::SizeOf($info),0x100)
    Assert-Shortcut ($result -ne [IntPtr]::Zero -and $info.icon -ne [IntPtr]::Zero) 'Windows Shell 无法读取快捷方式图标'
    $bitmap=[Drawing.Icon]::FromHandle($info.icon).ToBitmap()
    try{
        $green=0
        for($x=0;$x -lt $bitmap.Width;$x++){for($y=0;$y -lt $bitmap.Height;$y++){$pixel=$bitmap.GetPixel($x,$y);if($pixel.A -gt 100 -and $pixel.G -gt ($pixel.R+20) -and $pixel.G -gt ($pixel.B+20)){$green++}}}
        Assert-Shortcut ($green/($bitmap.Width*$bitmap.Height) -gt 0.2) 'Windows Shell 返回了空白图标，未显示绿色品牌图标'
    }finally{$bitmap.Dispose();[void][LauncherShortcutIconCheck]::DestroyIcon($info.icon)}
}
function Assert-IconFile([string]$IconPath){
    # 直接通过 Windows 图标解码接口读取资产，不依赖服务器是否装载 .lnk 的 Shell 处理器。
    $icon=New-Object Drawing.Icon($IconPath)
    $bitmap=$icon.ToBitmap()
    try{
        $green=0
        for($x=0;$x -lt $bitmap.Width;$x++){for($y=0;$y -lt $bitmap.Height;$y++){$pixel=$bitmap.GetPixel($x,$y);if($pixel.A -gt 100 -and $pixel.G -gt ($pixel.R+20) -and $pixel.G -gt ($pixel.B+20)){$green++}}}
        Assert-Shortcut ($green/($bitmap.Width*$bitmap.Height) -gt 0.2) 'ICO 资产无法显示绿色品牌图标'
    }finally{$bitmap.Dispose();$icon.Dispose()}
}
try {
    foreach($kind in @('source','installed')){
        $fixture=Join-Path $testRoot ($kind+' 中文, 路径 & launcher')
        New-Item -ItemType Directory -Path (Join-Path $fixture 'assets') -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $repositoryRoot 'assets/springboot-launcher.ico') -Destination (Join-Path $fixture 'assets/springboot-launcher.ico')
        if($kind -eq 'source'){
            New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts'),(Join-Path $fixture 'bin') -Force | Out-Null
            $helper=Join-Path $fixture 'scripts/open-dashboard.ps1'
            $entry=Join-Path $fixture 'bin/springboot-launcher.mjs'
        }else{
            $helper=Join-Path $fixture 'open-dashboard.ps1'
            $entry=Join-Path $fixture 'launcher.mjs'
            [IO.File]::WriteAllText((Join-Path $fixture 'installation.json'),(@{product='springboot-launcher';version='0.2.0';nodePath=$nodePath}|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
        }
        Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts/open-dashboard.ps1') -Destination $helper
        [IO.File]::WriteAllText($entry,$fakeEntry,(New-Object Text.UTF8Encoding($false)))
        $link=Join-Path $testRoot ($kind+'.lnk')
        # 复现后台 sourceRoot 的尾随反斜杠，并覆盖中文、空格、逗号与 &。
        [void](New-LauncherShortcut ($fixture+'\') $link (Join-Path $testRoot '中文, icon cache'))
        $shortcut=[SpringBootLauncher.ShortcutShell]::Read($link)
        Assert-Shortcut ($shortcut.IconLocation -like '*springboot-launcher*.ico*') '快捷方式没有使用产品图标'
        Assert-Shortcut ($shortcut.IconLocation -match ',0$' -and -not $shortcut.IconLocation.Contains('"')) '图标路径或资源索引不正确'
        $cachedIcon=$shortcut.IconLocation -replace ',0$',''
        Assert-Shortcut ((Get-FileHash -LiteralPath $cachedIcon -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath (Join-Path $fixture 'assets/springboot-launcher.ico') -Algorithm SHA256).Hash) '图标缓存与源文件不一致'
        Assert-IconFile $cachedIcon
        Assert-ShellIcon $link
        $resultFile=Join-Path $testRoot ($kind+'-result.json')
        $processInfo=New-Object Diagnostics.ProcessStartInfo
        $processInfo.FileName=$shortcut.TargetPath;$processInfo.Arguments=$shortcut.Arguments;$processInfo.WorkingDirectory=$shortcut.WorkingDirectory
        $processInfo.UseShellExecute=$false;$processInfo.CreateNoWindow=$true;$processInfo.RedirectStandardOutput=$true;$processInfo.RedirectStandardError=$true
        $processInfo.EnvironmentVariables['PSModulePath']='';$processInfo.EnvironmentVariables['SBL_SHORTCUT_RESULT']=$resultFile
        $process=[Diagnostics.Process]::Start($processInfo)
        if(-not $process.WaitForExit(15000)){$process.Kill();throw '快捷方式启动超时，可能出现了错误弹窗'}
        $diagnostic=$process.StandardError.ReadToEnd()
        Assert-Shortcut ($process.ExitCode -eq 0) ('快捷方式启动失败：'+$diagnostic)
        Assert-Shortcut (Test-Path -LiteralPath $resultFile) '快捷方式没有执行 Node 面板入口'
        $result=Get-Content -LiteralPath $resultFile -Encoding UTF8 -Raw|ConvertFrom-Json
        Assert-Shortcut ([IO.Path]::GetFullPath($result.entry) -eq [IO.Path]::GetFullPath($entry)) '快捷方式错误解析了工程根目录'
        Assert-Shortcut ($result.args.Count -eq 1 -and $result.args[0] -eq 'dashboard') '快捷方式没有调用 dashboard'
        Write-Host "通过：$kind 快捷方式在 Windows PowerShell 下启动，中文／特殊字符／尾随反斜杠路径正确"
    }
} finally {
    $safeParent=[IO.Path]::GetFullPath($testParent).TrimEnd('\')+'\'
    $safeRoot=[IO.Path]::GetFullPath($testRoot)
    if($safeRoot.StartsWith($safeParent,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($safeRoot) -match '^shortcut-test-[a-f0-9]{32}$'){Remove-Item -LiteralPath $safeRoot -Recurse -Force}
}
