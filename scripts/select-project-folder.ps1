$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$projectDialog = [System.Windows.Forms.FolderBrowserDialog]::new()
$projectOwner = [System.Windows.Forms.Form]::new()
try {
    $projectDialog.Description = '选择 Spring Boot 应用模块或包含多个模块的项目目录'
    $projectDialog.ShowNewFolderButton = $false
    if ($projectDialog.PSObject.Properties.Name -contains 'UseDescriptionForTitle') { $projectDialog.UseDescriptionForTitle = $true }
    # 透明拥有者让目录对话框出现在当前桌面前方，不打开命令行窗口。
    $projectOwner.ShowInTaskbar = $false
    $projectOwner.Opacity = 0
    $projectOwner.TopMost = $true
    $projectOwner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $projectOwner.Show()
    $projectOwner.Activate()
    $projectResult = $projectDialog.ShowDialog($projectOwner)
    if ($projectResult -eq [System.Windows.Forms.DialogResult]::OK) {
        @{ cancelled = $false; dir = $projectDialog.SelectedPath } | ConvertTo-Json -Compress
    } else {
        @{ cancelled = $true } | ConvertTo-Json -Compress
    }
} finally {
    $projectDialog.Dispose()
    $projectOwner.Dispose()
}
