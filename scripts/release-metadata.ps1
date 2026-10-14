# 只查询固定公共仓库，使用 Windows 系统代理；不读取或发送本机项目与凭据。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://api.github.com/repos/simplifyOurLife/springboot-launcher/releases/latest' -Headers @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'springboot-launcher' } -TimeoutSec 10
    if ($response.Content.Length -gt 262144) { throw '发行信息过大' }
    @{ status = 200; release = ($response.Content | ConvertFrom-Json) } | ConvertTo-Json -Depth 12 -Compress
} catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    @{ status = $code } | ConvertTo-Json -Compress
}
