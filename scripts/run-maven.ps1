$ErrorActionPreference = 'Stop'
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    $preparation = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $command = [string]$preparation.executable
    $arguments = @($preparation.args | ForEach-Object { [string]$_ })
    # .cmd 会经过 cmd.exe；拒绝其元字符，避免二次解析项目路径形成额外命令。
    foreach ($value in @($command) + $arguments) {
        if ($value -match '[&|<>^%!"\r\n()]') { throw 'Maven 路径或参数包含不支持的 CMD 特殊字符，请换用不含特殊字符的目录。' }
    }
    if ($command -eq 'mvn') {
        $mavenRoot = if ($env:MAVEN_HOME) { $env:MAVEN_HOME } else { $env:M2_HOME }
        $candidate = if ($mavenRoot) { Join-Path $mavenRoot 'bin/mvn.cmd' } else { $null }
        $command = if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $candidate } else { (Get-Command mvn.cmd -CommandType Application -ErrorAction Stop).Source }
    }
    if ($command -match '[&|<>^%!"\r\n()]') { throw 'Maven 可执行文件路径包含不支持的 CMD 特殊字符。' }
    & $command @arguments
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine('[启动器] Maven 准备失败：' + $_.Exception.Message)
    exit 1
}
