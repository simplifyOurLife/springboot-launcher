@echo off
setlocal
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $taskDir=Join-Path ([IO.Path]::GetTempPath()) ('sbl-guide-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $taskDir | Out-Null; $installer=Join-Path $taskDir 'install.ps1'; Write-Host 'Downloading Spring Boot Launcher installer...'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/simplifyOurLife/springboot-launcher/releases/latest/download/install.ps1' -OutFile $installer -TimeoutSec 60; & powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File $installer; exit $LASTEXITCODE"
if errorlevel 1 (
  echo Installation guide could not start. Check the network or GitHub Releases.
  pause
)
