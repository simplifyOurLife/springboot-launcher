param([string]$InstallRoot, [switch]$Upgrade, [switch]$NoGui, [switch]$NoOpen, [switch]$StopServices, [switch]$Codex, [switch]$ClaudeCode)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:InstallerScript = $PSCommandPath
$script:Repository = 'https://github.com/simplifyOurLife/springboot-launcher'

function Send-InstallStatus([string]$Message, $Queue) {
    if ($Queue) { $Queue.Enqueue($Message) } else { Write-Host $Message }
}
function Invoke-InstallCommand([string]$FilePath, [string[]]$Arguments, $Queue) {
    [void](Get-Command $FilePath -ErrorAction Stop)
    $previousPreference = $ErrorActionPreference
    $previousExitCode = $global:LASTEXITCODE
    $global:LASTEXITCODE = -1
    try {
        # Windows PowerShell 5 会把重定向的 stderr 变成 ErrorRecord；警告不能替代进程退出码。
        $ErrorActionPreference = 'Continue'
        & $FilePath @Arguments 2>&1 | ForEach-Object { Send-InstallStatus ([string]$_) $Queue }
        $exitCode = $global:LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference; $global:LASTEXITCODE = $previousExitCode }
    return [int]$exitCode
}
function Assert-ChildPath([string]$Parent, [string]$Child) {
    $basePath = [IO.Path]::GetFullPath($Parent).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    $childPath = [IO.Path]::GetFullPath($Child)
    if (-not $childPath.StartsWith($basePath, [StringComparison]::OrdinalIgnoreCase)) { throw '文件路径超出预期目录，安装已取消。' }
    return $childPath
}
function Read-Installation([string]$Root) {
    $record = Join-Path $Root 'installation.json'
    if (-not (Test-Path -LiteralPath $record)) { return $null }
    $data = Get-Content -LiteralPath $record -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($data.product -ne 'springboot-launcher' -or $data.version -notmatch '^\d+\.\d+\.\d+$' -or -not [IO.Path]::IsPathRooted($data.nodePath)) { throw '安装记录无效，请选择新的空目录。' }
    return $data
}
function Get-StableRelease {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    try { $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/simplifyOurLife/springboot-launcher/releases/latest' -Headers @{ Accept='application/vnd.github+json'; 'User-Agent'='springboot-launcher-installer' } -TimeoutSec 20 }
    catch { throw '暂时无法获取正式发行版。请检查网络，或确认维护者已经发布带安装包的 GitHub Release。' }
    $version = [string]$release.tag_name -replace '^v',''
    if ($release.draft -or $release.prerelease -or $version -notmatch '^\d+\.\d+\.\d+$') { throw '未找到有效的正式发行版。' }
    $archiveName = "springboot-launcher-v$version-windows.zip"
    $archive = @($release.assets | Where-Object name -EQ $archiveName)
    $checksums = @($release.assets | Where-Object name -EQ 'checksums.txt')
    if ($archive.Count -ne 1 -or $checksums.Count -ne 1) { throw '该发行版尚未提供完整的安装包和校验文件。' }
    foreach ($asset in @($archive[0],$checksums[0])) {
        if ($asset.browser_download_url -cne "$script:Repository/releases/download/v$version/$($asset.name)") { throw '安装包来源不属于本项目，已取消。' }
    }
    return @{ version=$version; name=$archiveName; archive=$archive[0].browser_download_url; checksums=$checksums[0].browser_download_url }
}
function Expand-CheckedArchive([string]$Archive, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        if ($zip.Entries.Count -gt 30000) { throw '安装包文件数量超限。' }
        $bytes = 0L
        foreach ($entry in $zip.Entries) {
            $bytes += $entry.Length
            if ($bytes -gt 600MB) { throw '安装包展开后超过容量限制。' }
            $relative = $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
            [void](Assert-ChildPath $Destination (Join-Path $Destination $relative))
            if (($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000) { throw '安装包包含符号链接，已取消。' }
        }
    } finally { $zip.Dispose() }
    [IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)
}
function Get-InstallNode([string]$Root, [string]$Stage, $Installed, $Queue) {
    $candidates = @()
    if ($Installed) { $candidates += $Installed.nodePath }
    $systemNode = Get-Command node -ErrorAction SilentlyContinue
    if ($systemNode) { $candidates += $systemNode.Source }
    foreach ($candidate in $candidates) {
        try {
            $nodeVersion = (& $candidate --version).TrimStart('v')
            $candidateNpm = Join-Path (Split-Path -Parent $candidate) 'node_modules/npm/bin/npm-cli.js'
            if ($LASTEXITCODE -eq 0 -and [version]$nodeVersion -ge [version]'22.22.2' -and (Test-Path -LiteralPath $candidateNpm)) { return $candidate }
        } catch { }
    }
    Send-InstallStatus '未发现兼容 Node.js，正在下载官方便携运行环境，无需管理员权限…' $Queue
    $nodeIndex = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $nodeRelease = $nodeIndex | Where-Object { $_.version -match '^v22\.' -and $_.lts -and $_.files -contains "win-$architecture-zip" } | Select-Object -First 1
    if (-not $nodeRelease) { throw '未找到兼容的 Node.js 官方运行环境。' }
    $nodeVersion = $nodeRelease.version
    if ($nodeVersion -notmatch '^v22\.\d+\.\d+$') { throw 'Node.js 版本信息无效。' }
    $nodeName = "node-$nodeVersion-win-$architecture"
    $archiveName = "$nodeName.zip"
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" -TimeoutSec 30).Content
    $hashLine = @($checksums -split '\r?\n' | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+' + [regex]::Escape($archiveName) + '$') })
    if ($hashLine.Count -ne 1) { throw 'Node.js 校验信息无效。' }
    $nodeZip = Join-Path $Stage $archiveName
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nodeVersion/$archiveName" -OutFile $nodeZip -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash -ine ($hashLine[0] -split '\s+')[0]) { throw 'Node.js 下载校验失败。' }
    $nodeStage = Join-Path $Stage 'node-runtime'
    Expand-CheckedArchive $nodeZip $nodeStage
    $runtimeParent = Join-Path $Root 'runtime'
    New-Item -ItemType Directory -Path $runtimeParent -Force | Out-Null
    $runtimeTarget = Assert-ChildPath $Root (Join-Path $runtimeParent $nodeName)
    $runtimeSource = Assert-ChildPath $Stage (Join-Path $nodeStage $nodeName)
    if (-not (Test-Path -LiteralPath $runtimeTarget)) { Move-Item -LiteralPath $runtimeSource -Destination $runtimeTarget }
    return (Join-Path $runtimeTarget 'node.exe')
}
function Write-StableEntry([string]$Root) {
    $shim = @'
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(readFileSync(path.join(root,'installation.json'),'utf8'));
if(data.product!=='springboot-launcher'||!/^\d+\.\d+\.\d+$/.test(data.version))throw new Error('安装记录无效');
const child=spawn(process.execPath,[path.join(root,'versions',data.version,'bin/springboot-launcher.mjs'),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:process.env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code)=>{process.exitCode=code??1;});
'@
    [IO.File]::WriteAllText((Join-Path $Root 'launcher.mjs'),$shim,(New-Object Text.UTF8Encoding($false)))
}
function Invoke-Install($Options, $Queue) {
    $root = [IO.Path]::GetFullPath($Options.Root)
    $installed = Read-Installation $root
    $ownerFile = Join-Path $root '.launcher-install-owned'
    $owned = (Test-Path -LiteralPath $ownerFile) -and (Get-Content -LiteralPath $ownerFile -Raw) -eq 'springboot-launcher/v1'
    if ((Test-Path -LiteralPath $root) -and -not $installed -and -not $owned -and @(Get-ChildItem -LiteralPath $root -Force).Count -gt 0) { throw '所选安装目录不是空目录。请选择新的位置，不会覆盖现有源码或其他文件。' }
    Send-InstallStatus '正在获取正式发行版…' $Queue
    $release = Get-StableRelease
    if ($installed -and [version]$release.version -lt [version]$installed.version) { throw '线上版本比当前安装旧，不会自动降级。' }
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    if (-not $installed -and -not $owned) { [IO.File]::WriteAllText($ownerFile,'springboot-launcher/v1') }
    # 下载、解包和依赖准备都在目标盘，最终以同盘目录移动提交，避免跨卷复制失败留下半成品。
    $stage = Assert-ChildPath $root (Join-Path $root ('.staging-' + [guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $stage | Out-Null
    $committed = $false
    $createdVersion = $false
    $installGuard = $null
    try {
        try { $installGuard=[IO.File]::Open((Join-Path $root '.launcher-install.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
        catch [IO.IOException] { throw '另一个安装或升级正在使用此目录，请等待它完成后重试。' }
        $installed = Read-Installation $root
        if ($installed -and [version]$release.version -lt [version]$installed.version) { throw '线上版本比当前安装旧，不会自动降级。' }
        $versionDir = Assert-ChildPath $root (Join-Path $root ('versions/' + $release.version))
        if ($installed -and $installed.version -eq $release.version) {
            $nodePath = $installed.nodePath
            Send-InstallStatus '当前已是最新版本，正在更新打开入口…' $Queue
        } else {
            if (Test-Path -LiteralPath $versionDir) { throw '该版本目录已存在。为保护已有文件，请先检查之前的安装结果。' }
            Send-InstallStatus "正在下载 $($release.version)…" $Queue
            $zip = Join-Path $stage $release.name
            Invoke-WebRequest -UseBasicParsing -Uri $release.archive -OutFile $zip -TimeoutSec 300
            $checksums = (Invoke-WebRequest -UseBasicParsing -Uri $release.checksums -TimeoutSec 30).Content
            $hashLine = @($checksums -split '\r?\n' | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [regex]::Escape($release.name) + '$') })
            if ($hashLine.Count -ne 1 -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ine ($hashLine[0] -split '\s+')[0]) { throw '安装包 SHA-256 校验失败，旧版本保持不变。' }
            Send-InstallStatus '校验通过，正在准备新版文件…' $Queue
            $unpacked = Join-Path $stage 'package'
            Expand-CheckedArchive $zip $unpacked
            $packageRoot = Assert-ChildPath $stage (Join-Path $unpacked 'springboot-launcher')
            $package = Get-Content -LiteralPath (Join-Path $packageRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
            if ($package.name -ne 'springboot-launcher' -or $package.version -ne $release.version) { throw '安装包的产品或版本信息不匹配。' }
            $nodePath = Get-InstallNode $root $stage $installed $Queue
            $npmCli = Join-Path (Split-Path -Parent $nodePath) 'node_modules/npm/bin/npm-cli.js'
            if (-not (Test-Path -LiteralPath $npmCli)) { throw '该 Node.js 安装缺少 npm，请安装完整 Node.js 运行环境后重试。' }
            Send-InstallStatus '正在安装锁定的运行依赖，不执行工程构建…' $Queue
            Push-Location $packageRoot
            try {
                $dependencyExit = Invoke-InstallCommand $nodePath @($npmCli,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund') $Queue
                if ($dependencyExit -ne 0) { throw '运行依赖准备失败，旧版本保持不变。' }
            } finally { Pop-Location }
            New-Item -ItemType Directory -Path (Split-Path -Parent $versionDir) -Force | Out-Null
            # 所有下载与依赖准备成功后才停旧后台；未勾选时，活跃服务会阻止升级。
            # 首次安装也可能共用源码版后台，必须交接后再打开新版面板。
            Send-InstallStatus '正在检查共享后台和运行中的服务…' $Queue
            $stopArgs = @((Join-Path $packageRoot 'bin/springboot-launcher.mjs'),'daemon','stop')
            if ($Options.StopServices) { $stopArgs += '--stop-services' }
            $stopExit = Invoke-InstallCommand $nodePath $stopArgs $Queue
            if ($stopExit -ne 0) { throw '共享后台尚未退出。请先在面板停止服务后重试；升级时也可勾选“升级前停止托管服务”。' }
            [void](Assert-ChildPath $stage $packageRoot)
            [void](Assert-ChildPath $root $versionDir)
            Move-Item -LiteralPath $packageRoot -Destination $versionDir
            $createdVersion = $true
        }
        $manifest = @{ product='springboot-launcher'; schemaVersion=1; version=$release.version; nodePath=$nodePath; updatedAt=[DateTime]::UtcNow.ToString('o') }
        Write-StableEntry $root
        Copy-Item -LiteralPath (Join-Path $versionDir 'scripts/open-dashboard.ps1') -Destination (Join-Path $root 'open-dashboard.ps1') -Force
        # 快捷方式引用稳定图标路径，升级后不依赖旧版本目录。
        $stableAssets = Join-Path $root 'assets'
        New-Item -ItemType Directory -Path $stableAssets -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $versionDir 'assets/springboot-launcher.ico') -Destination (Join-Path $stableAssets 'springboot-launcher.ico') -Force
        # 安装目录始终保留可双击入口，不依赖用户是否勾选桌面快捷方式。
        $dashboardCommand = @'
@echo off
setlocal
set PSModulePath=
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0open-dashboard.ps1"
'@
        [IO.File]::WriteAllText((Join-Path $root 'Open Dashboard.cmd'),$dashboardCommand.Replace("`r`n","`n").Replace("`n","`r`n"),[Text.Encoding]::ASCII)
        $record = Join-Path $root 'installation.json'
        $temporaryRecord = Join-Path $root ('installation.'+[guid]::NewGuid().ToString('N')+'.tmp')
        [IO.File]::WriteAllText($temporaryRecord,($manifest | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
        Move-Item -LiteralPath $temporaryRecord -Destination $record -Force
        $committed = $true
        $warnings = @()
        if ($Options.Shortcuts) {
            try { & (Join-Path $versionDir 'scripts/create-shortcuts.ps1') -Root $root | Out-Null } catch { $warnings += '快捷方式创建失败，可从安装目录打开面板。' }
        }
        foreach ($clientName in @('Codex','ClaudeCode')) {
            if (-not $Options[$clientName]) { continue }
            $commandName = if ($clientName -eq 'Codex') { 'codex' } else { 'claude' }
            if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) { $warnings += "$commandName 未安装，已跳过客户端接入。"; continue }
            Send-InstallStatus "正在接入 $commandName…" $Queue
            $clientArgs = if ($clientName -eq 'Codex') { @('mcp','add','springboot-launcher','--',$nodePath,(Join-Path $root 'launcher.mjs'),'mcp') } else { @('mcp','add','--transport','stdio','--scope','user','springboot-launcher','--',$nodePath,(Join-Path $root 'launcher.mjs'),'mcp') }
            try { if ((Invoke-InstallCommand $commandName $clientArgs $Queue) -ne 0) { throw '客户端配置失败' } } catch { $warnings += "$commandName 接入失败，可稍后在向导中重试。" }
        }
        if (-not $Options.NoOpen) {
            try { if ((Invoke-InstallCommand $nodePath @((Join-Path $root 'launcher.mjs'),'dashboard') $Queue) -ne 0) { throw '面板未打开' } } catch { $warnings += '面板暂未打开，可使用桌面快捷方式重试。' }
        }
        return @{ version=$release.version; root=$root; warnings=$warnings }
    } catch {
        if ($committed) { throw "版本已安装，但后续配置失败：$($_.Exception.Message)" }
        if ($createdVersion) { $safeVersion=Assert-ChildPath $root $versionDir;Remove-Item -LiteralPath $safeVersion -Recurse -Force -ErrorAction SilentlyContinue }
        throw
    } finally {
        if ($installGuard) { $installGuard.Dispose() }
        # 仅清理本次生成的临时目录；旧版本、运行数据和使用者项目不在清理范围。
        $safeStage = Assert-ChildPath $root $stage
        if ([IO.Path]::GetFileName($safeStage) -match '^\.staging-[a-f0-9]{32}$') { Remove-Item -LiteralPath $safeStage -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Show-InstallGuide {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $form = New-Object Windows.Forms.Form
    $form.Text = 'Spring Boot Launcher 安装向导'
    $form.Size = New-Object Drawing.Size(620,550)
    $form.MinimumSize = $form.Size
    $form.StartPosition = 'CenterScreen'
    $form.BackColor = [Drawing.Color]::FromArgb(248,250,249)
    $form.Font = New-Object Drawing.Font('Microsoft YaHei UI',9)
    $title = New-Object Windows.Forms.Label
    $title.Text = if ($Upgrade) { '升级 Spring Boot Launcher' } else { '安装 Spring Boot Launcher' }
    $title.Location = New-Object Drawing.Point(28,25);$title.Size = New-Object Drawing.Size(550,36);$title.Font = New-Object Drawing.Font('Microsoft YaHei UI',16)
    $description = New-Object Windows.Forms.Label
    $description.Text = '选择位置后，自动下载正式版本并准备运行环境。无需手工替换命令路径。'
    $description.Location = New-Object Drawing.Point(30,75);$description.Size = New-Object Drawing.Size(550,45)
    $directory = New-Object Windows.Forms.TextBox
    $directory.Location = New-Object Drawing.Point(30,130);$directory.Size = New-Object Drawing.Size(450,28);$directory.ReadOnly = $true
    $directory.Text = if ($InstallRoot) { $InstallRoot } else { Join-Path $env:LOCALAPPDATA 'Programs/SpringBootLauncher' }
    $browse = New-Object Windows.Forms.Button
    $browse.Text = '选择目录';$browse.Location = New-Object Drawing.Point(490,128);$browse.Size = New-Object Drawing.Size(85,30);$browse.Enabled = -not $Upgrade
    $browse.Add_Click({$picker=New-Object Windows.Forms.FolderBrowserDialog;$picker.Description='选择安装位置，将在此创建 SpringBootLauncher 子目录。';if($picker.ShowDialog() -eq 'OK'){$directory.Text=if(Test-Path -LiteralPath (Join-Path $picker.SelectedPath 'installation.json')){$picker.SelectedPath}else{Join-Path $picker.SelectedPath 'SpringBootLauncher'}};$picker.Dispose()})
    $shortcuts = New-Object Windows.Forms.CheckBox
    $shortcuts.Text='创建桌面和开始菜单快捷方式';$shortcuts.Checked=$true;$shortcuts.Location=New-Object Drawing.Point(30,184);$shortcuts.Size=New-Object Drawing.Size(520,24)
    $codexOption = New-Object Windows.Forms.CheckBox
    $codexOption.Text='接入 Codex（当前用户）';$codexOption.Location=New-Object Drawing.Point(30,219);$codexOption.Size=New-Object Drawing.Size(260,24);$codexOption.Enabled=[bool](Get-Command codex -ErrorAction SilentlyContinue)
    $claudeOption = New-Object Windows.Forms.CheckBox
    $claudeOption.Text='接入 Claude Code（所有项目）';$claudeOption.Location=New-Object Drawing.Point(300,219);$claudeOption.Size=New-Object Drawing.Size(280,24);$claudeOption.Enabled=[bool](Get-Command claude -ErrorAction SilentlyContinue)
    $stopOption = New-Object Windows.Forms.CheckBox
    $stopOption.Text='升级前停止托管服务（未勾选时，运行中的服务会阻止升级）';$stopOption.Location=New-Object Drawing.Point(30,260);$stopOption.Size=New-Object Drawing.Size(550,34);$stopOption.Enabled=$Upgrade.IsPresent
    $status = New-Object Windows.Forms.Label
    $status.Text='安装只修改所选目录和你勾选的入口；项目和日志保存在独立的本机目录。';$status.Location=New-Object Drawing.Point(30,315);$status.Size=New-Object Drawing.Size(545,66)
    $bar = New-Object Windows.Forms.ProgressBar
    $bar.Location=New-Object Drawing.Point(30,390);$bar.Size=New-Object Drawing.Size(545,9);$bar.Style='Marquee';$bar.Visible=$false
    $installButton = New-Object Windows.Forms.Button
    $installButton.Text=if($Upgrade){'开始升级'}else{'开始安装'};$installButton.Location=New-Object Drawing.Point(440,435);$installButton.Size=New-Object Drawing.Size(135,36);$installButton.BackColor=[Drawing.Color]::FromArgb(14,117,100);$installButton.ForeColor=[Drawing.Color]::White;$installButton.FlatStyle='Flat'
    $cancelButton = New-Object Windows.Forms.Button
    $cancelButton.Text='关闭';$cancelButton.Location=New-Object Drawing.Point(330,435);$cancelButton.Size=New-Object Drawing.Size(95,36);$cancelButton.Add_Click({$form.Close()})
    $form.Controls.AddRange(@($title,$description,$directory,$browse,$shortcuts,$codexOption,$claudeOption,$stopOption,$status,$bar,$installButton,$cancelButton))
    $state = @{ worker=$null; handle=$null; queue=$null; running=$false }
    $timer = New-Object Windows.Forms.Timer;$timer.Interval=200
    $installButton.Add_Click({
        if($state.running){return}
        $state.running=$true;$installButton.Enabled=$false;$cancelButton.Enabled=$false;$browse.Enabled=$false;$bar.Visible=$true
        $shortcuts.Enabled=$false;$codexOption.Enabled=$false;$claudeOption.Enabled=$false;$stopOption.Enabled=$false
        $options=@{Root=$directory.Text;Shortcuts=$shortcuts.Checked;Codex=$codexOption.Checked;ClaudeCode=$claudeOption.Checked;StopServices=$stopOption.Checked;NoOpen=$false}
        $state.queue=New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
        $state.worker=[PowerShell]::Create()
        [void]$state.worker.AddScript({param($file,$options,$queue) . $file;Invoke-Install $options $queue}).AddArgument($script:InstallerScript).AddArgument($options).AddArgument($state.queue)
        $state.handle=$state.worker.BeginInvoke();$timer.Start()
    })
    $timer.Add_Tick({
        $line='';while($state.queue.TryDequeue([ref]$line)){$status.Text=$line}
        if(-not $state.handle.IsCompleted){return}
        $timer.Stop();$bar.Visible=$false;$state.running=$false;$installButton.Enabled=$true;$cancelButton.Enabled=$true;$browse.Enabled=-not $Upgrade
        $shortcuts.Enabled=$true;$codexOption.Enabled=[bool](Get-Command codex -ErrorAction SilentlyContinue);$claudeOption.Enabled=[bool](Get-Command claude -ErrorAction SilentlyContinue);$stopOption.Enabled=$Upgrade.IsPresent
        try {
            $result=$state.worker.EndInvoke($state.handle)
            if($state.worker.HadErrors){throw ($state.worker.Streams.Error | Select-Object -First 1)}
            $last=$result | Select-Object -Last 1
            $status.Text="已完成 $($last.version)。可双击桌面入口打开面板；接入客户端后请重新打开 Codex / Claude Code。"
            if($last.warnings.Count){$status.Text+=' '+($last.warnings -join ' ')}
        }catch{$status.Text='安装未完成：'+$_.Exception.Message}
        finally{$state.worker.Dispose();$state.worker=$null}
    })
    $form.Add_FormClosing({param($sender,$eventArgs) if($state.running){$eventArgs.Cancel=$true}})
    try{[void]$form.ShowDialog()}finally{$timer.Dispose();$form.Dispose()}
}

# 点源导入仅提供函数，供隔离验证和后台工作线程使用，不打开窗口或执行安装。
if ($MyInvocation.InvocationName -eq '.') { return }
if ($NoGui) {
    if (-not $InstallRoot) { throw '命令行安装必须显式指定 -InstallRoot。' }
    Invoke-Install @{Root=$InstallRoot;Shortcuts=$true;Codex=$Codex.IsPresent;ClaudeCode=$ClaudeCode.IsPresent;StopServices=$StopServices.IsPresent;NoOpen=$NoOpen.IsPresent} $null | ConvertTo-Json -Depth 5
} else { Show-InstallGuide }
