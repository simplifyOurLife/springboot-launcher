param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$taskDir=Get-Item -LiteralPath $Directory
if (-not $taskDir.PSIsContainer -or ($taskDir.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Invalid runtime directory' }
$taskMarker=Join-Path $taskDir.FullName '.launcher-owned'
if ((Get-Content -LiteralPath $taskMarker -Raw) -ne 'springboot-launcher/v1') { throw 'Runtime ownership marker missing' }
$taskSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
function Test-PrivateAcl($taskCheck) {
  if (-not $taskCheck.AreAccessRulesProtected) { return $false }
  if ($taskCheck.GetOwner([System.Security.Principal.SecurityIdentifier]) -ne $taskSid) { return $false }
  $taskFull=$false
  foreach ($taskAce in $taskCheck.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
    if ($taskAce.AccessControlType -eq 'Allow') {
      if ($taskAce.IdentityReference -ne $taskSid) { return $false }
      if (($taskAce.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $taskFull=$true }
    }
  }
  return $taskFull
}
# 已私有化的目录只验证，不重复修改安全描述符，也不要求管理审计特权。
if (Test-PrivateAcl (Get-Acl -LiteralPath $taskDir.FullName)) { exit 0 }
$taskAcl=New-Object System.Security.AccessControl.DirectorySecurity
$taskAcl.SetOwner($taskSid)
$taskAcl.SetAccessRuleProtection($true,$false)
$taskRule=New-Object System.Security.AccessControl.FileSystemAccessRule($taskSid,'FullControl','ContainerInherit, ObjectInherit','None','Allow')
$taskAcl.AddAccessRule($taskRule)
try { Set-Acl -LiteralPath $taskDir.FullName -AclObject $taskAcl } catch {
  if (-not (Test-PrivateAcl (Get-Acl -LiteralPath $taskDir.FullName))) { throw }
}
$taskActual=Get-Acl -LiteralPath $taskDir.FullName
if (-not (Test-PrivateAcl $taskActual)) { throw 'Runtime ACL verification failed' }
