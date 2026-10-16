param(
  [Parameter(Mandatory=$true)][ValidateSet('check','migrate','upgrade','upgrade-check','upgrade-verify','api','web')][string]$Mode,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]{10,25}$')][string]$SystemIdentifier,
  [switch]$Apply,
  [switch]$Start
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
if ($root -ine 'C:\Users\hayel\Desktop\CCNA-Platform' -or (Get-Location).Path.TrimEnd('\') -ine $root) { throw 'Run from the approved Phase 6A worktree.' }
if (($Mode -in @('migrate','upgrade') -and !$Apply) -or ($Mode -in @('api','web') -and !$Start)) { throw 'Explicit Apply/Start plus separate approval is required.' }
if (($Mode -notin @('migrate','upgrade') -and $Apply) -or ($Mode -notin @('api','web') -and $Start)) { throw 'Unexpected operation flag.' }
if ($Mode.StartsWith('upgrade') -and $SystemIdentifier -cne '7694701597474139084') { throw 'Upgrade requires the exact approved PostgreSQL system identifier.' }
function Read-PrivateValue([string]$Label) {
  $secret = Read-Host $Label -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$databaseRole = if($Mode -eq 'migrate' -or $Mode.StartsWith('upgrade')){'ccna_phase6a_migrator'}else{'ccna_phase6a_app'}
$config = @{
  host='127.0.0.1'; port=5432; database='ccna_phase6a_dev'
  role=$databaseRole
  systemIdentifier=$SystemIdentifier
  password=(Read-PrivateValue "Known $databaseRole password (hidden, process memory only)")
}
if ($Mode -ne 'migrate' -and !$Mode.StartsWith('upgrade')) {
  $config.ledgerPassword = Read-PrivateValue 'ccna_phase6a_migrator password for SELECT-only ledger verification (hidden; API still uses ccna_phase6a_app)'
  $config.publishableKey = Read-PrivateValue 'Clerk development publishable key (hidden)'
  if ($Mode -ne 'web') { $config.secretKey = Read-PrivateValue 'Clerk development secret key (hidden)' }
}
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = $nodeExe
$flags = if($Apply){' --apply'}elseif($Start){' --start'}else{''}
$info.Arguments = '"' + (Join-Path $PSScriptRoot 'run.mjs') + '" ' + $Mode + $flags
$info.WorkingDirectory = $root
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $false
$info.RedirectStandardError = $true
# Whitelist before Node starts: inherited NODE_OPTIONS cannot preload env files.
$info.EnvironmentVariables.Clear()
foreach($name in @('SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE')) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if($null -ne $value){$info.EnvironmentVariables[$name]=$value}
}
# Existing ignored Windows binaries only; no secret/config copy or install.
$native = Join-Path $root '.local/native-deps/node_modules'
$esbuild = Join-Path $native '.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe'
if(Test-Path -LiteralPath $esbuild){$info.EnvironmentVariables['NODE_PATH']=$native;$info.EnvironmentVariables['ESBUILD_BINARY_PATH']=$esbuild}
$child = New-Object System.Diagnostics.Process
$child.StartInfo = $info
$started = $false
try {
  if(!$child.Start()){throw 'Cannot launch local operation'}
  $started = $true
  $child.StandardInput.WriteLine(($config | ConvertTo-Json -Compress))
  $child.StandardInput.Close()
  $config.Clear()
  $diagnostic = $child.StandardError.ReadToEnd()
$child.WaitForExit()
if ($diagnostic) {
  Write-Host $diagnostic
}
  if($child.ExitCode -ne 0){throw 'Guarded local operation failed; see sanitized diagnostic above.'}
} finally {
  $config.Clear()
  if($started -and !$child.HasExited){$child.Kill()}
  $child.Dispose()
}
