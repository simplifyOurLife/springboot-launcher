# 隔离安装流程验证：网络、Node/npm、客户端和快捷方式均不真实执行。
$ErrorActionPreference='Stop'
$repositoryRoot=Split-Path -Parent $PSScriptRoot
. (Join-Path $repositoryRoot 'scripts/install.ps1')
$testParent=Join-Path $repositoryRoot '.superpowers/tmp'
New-Item -ItemType Directory -Path $testParent -Force | Out-Null
$testRoot=Assert-ChildPath $testParent (Join-Path $testParent ('installer-test-'+[guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$script:testVersion='0.2.0';$script:tampered=$false;$script:binaryChecksum=$true
$fakeNode=Join-Path $testRoot 'mock-node.cmd'
[IO.File]::WriteAllText($fakeNode,"@echo off`r`necho fixture-warning 1>&2`r`nif `"%SBL_TEST_BUSY%`"==`"1`" if `"%~2`"==`"daemon`" exit /b 1`r`nexit /b 0`r`n")
$mockNpm=Join-Path $testRoot 'node_modules/npm/bin'
New-Item -ItemType Directory -Path $mockNpm -Force | Out-Null
Set-Content -LiteralPath (Join-Path $mockNpm 'npm-cli.js') -Value '模拟，不执行'
function Assert-Test($Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Get-StableRelease{return @{version=$script:testVersion;name='fixture.zip';archive='https://fixture.invalid/package.zip';checksums='https://fixture.invalid/checksums.txt'}}
function Get-InstallNode {
    param($Root,$Stage,$Installed,$Queue)
    Assert-Test ($Stage.StartsWith($Root.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) '安装暂存目录必须位于目标目录内，避免跨盘提交失败留下半成品'
    return $fakeNode
}
function Invoke-WebRequest {
    param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing)
    if($OutFile){Copy-Item -LiteralPath (Join-Path $testRoot 'fixture.zip') -Destination $OutFile}
    else{
        $checksumText=if($script:tampered){('0'*64)+'  fixture.zip'}else{(Get-FileHash (Join-Path $testRoot 'fixture.zip') -Algorithm SHA256).Hash+'  fixture.zip'}
        # GitHub 实际以 application/octet-stream 返回校验文件；首次安装覆盖 UTF-8 BOM 与 byte[]。
        $responseContent=$checksumText
        if($script:binaryChecksum){$responseContent=[Text.Encoding]::UTF8.GetBytes(([char]0xFEFF)+$checksumText)}
        return @{Content=$responseContent}
    }
}
function New-FixtureArchive {
    param([string]$Version)
    $fixtureDir=Join-Path $testRoot ('fixture-'+$Version)
    $package=Join-Path $fixtureDir 'springboot-launcher'
    New-Item -ItemType Directory -Path (Join-Path $package 'scripts'),(Join-Path $package 'bin') -Force | Out-Null
    @{name='springboot-launcher';version=$Version}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $package 'package.json') -Encoding UTF8
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts/open-dashboard.ps1') -Destination (Join-Path $package 'scripts/open-dashboard.ps1')
    New-Item -ItemType Directory -Path (Join-Path $package 'assets') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'assets/springboot-launcher.ico') -Destination (Join-Path $package 'assets/springboot-launcher.ico')
    Set-Content -LiteralPath (Join-Path $package 'bin/springboot-launcher.mjs') -Value '// 模拟，不执行'
    Compress-Archive -LiteralPath $package -DestinationPath (Join-Path $testRoot 'fixture.zip') -Force
}
try {
    $target=Join-Path $testRoot '中文 安装位置'
    $options=@{Root=$target;Shortcuts=$false;Codex=$false;ClaudeCode=$false;StopServices=$false;NoOpen=$true}
    New-FixtureArchive '0.2.0'
    $env:SBL_TEST_BUSY='1';$blockedRoot=Join-Path $testRoot '源码后台运行中的初次安装'
    $failed=$false;try{Invoke-Install (@{Root=$blockedRoot;Shortcuts=$false;Codex=$false;ClaudeCode=$false;StopServices=$false;NoOpen=$true}) $null|Out-Null}catch{$failed=$true}
    Assert-Test $failed '首次安装没有保护共用源码版后台的活跃服务'
    Assert-Test (-not (Test-Path (Join-Path $blockedRoot 'installation.json'))) '首次安装停止失败后仍提交了版本'
    Remove-Item Env:SBL_TEST_BUSY
    $installed=Invoke-Install $options $null
    Assert-Test ($installed.version -eq '0.2.0') '首次安装失败'
    Assert-Test ((Read-Installation $target).nodePath -eq $fakeNode) '中文目录中的安装记录损坏'
    Assert-Test (Test-Path (Join-Path $target 'launcher.mjs')) '缺少稳定 MCP 入口'
    Assert-Test (Test-Path (Join-Path $target 'Open Dashboard.cmd')) '未创建安装目录的可双击面板入口'
    Assert-Test (Test-Path (Join-Path $target 'assets/springboot-launcher.ico')) '安装根缺少稳定图标资源'
    # 使用模拟 Node 实际执行安装根入口，确保无需传 -Root，且不启动真实后台。
    & (Join-Path $target 'open-dashboard.ps1')
    Write-Host '通过：隔离首次安装与中文空格目录'
    $script:binaryChecksum=$false
    $script:testVersion='0.3.0';New-FixtureArchive '0.3.0';$script:tampered=$true
    $failed=$false;try{Invoke-Install $options $null|Out-Null}catch{$failed=$true}
    Assert-Test $failed '篡改安装包未被拒绝'
    Assert-Test ((Read-Installation $target).version -eq '0.2.0') '校验失败改变了旧版本'
    Write-Host '通过：校验失败保留旧版本'
    $script:tampered=$false;$env:SBL_TEST_BUSY='1'
    $failed=$false;try{Invoke-Install $options $null|Out-Null}catch{$failed=$true}
    Assert-Test $failed '活跃服务没有阻止升级'
    Assert-Test ((Read-Installation $target).version -eq '0.2.0') '停止失败改变了旧版本'
    Write-Host '通过：停止失败保护旧版本'
    Remove-Item Env:SBL_TEST_BUSY
    Invoke-Install $options $null|Out-Null
    Assert-Test ((Read-Installation $target).version -eq '0.3.0') '升级没有切换版本'
    Assert-Test (Test-Path (Join-Path $target 'versions/0.2.0')) '旧版本被删除'
    Write-Host '通过：升级切换稳定入口并保留旧版本'
    $outside=Join-Path $testRoot '../escape'
    $failed=$false;try{Assert-ChildPath $testRoot $outside|Out-Null}catch{$failed=$true};Assert-Test $failed '目录越界未被拒绝'
    Write-Host '通过：拒绝越界路径'
    $badZip=Join-Path $testRoot 'traversal.zip'
    $archive=[IO.Compression.ZipFile]::Open($badZip,[IO.Compression.ZipArchiveMode]::Create)
    try{[void]$archive.CreateEntry('../outside.txt')}finally{$archive.Dispose()}
    $failed=$false;try{Expand-CheckedArchive $badZip (Join-Path $testRoot 'unpacked') }catch{$failed=$true};Assert-Test $failed '压缩包越界条目未被拒绝'
    Write-Host '通过：拒绝压缩包路径穿越'
} finally {
    if(Test-Path Env:SBL_TEST_BUSY){Remove-Item Env:SBL_TEST_BUSY}
    $safeTest=Assert-ChildPath $testParent $testRoot
    if([IO.Path]::GetFileName($safeTest) -match '^installer-test-[a-f0-9]{32}$'){Remove-Item -LiteralPath $safeTest -Recurse -Force}
}
