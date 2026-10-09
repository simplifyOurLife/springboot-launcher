param([Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference='Stop'
if ($Url -notmatch '^http://127\.0\.0\.1:\d{1,5}/#ticket=[A-Za-z0-9_-]+$') { throw 'Invalid local dashboard URL' }
Start-Process -FilePath $Url -WindowStyle Hidden
