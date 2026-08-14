param(
  [Parameter(Mandatory = $true)]
  [string]$Executable,
  [switch]$AllowTrustedElectronFallback
)

$ErrorActionPreference = "Stop"
$resolvedExecutable = (Resolve-Path -LiteralPath $Executable).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$tempRoot = if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  [System.IO.Path]::GetTempPath()
}
else {
  $env:RUNNER_TEMP
}
$profile = Join-Path $tempRoot ("silfable-win-smoke-" + [guid]::NewGuid().ToString("N"))
$stdout = Join-Path $profile "stdout.log"
$stderr = Join-Path $profile "stderr.log"
New-Item -ItemType Directory -Path $profile | Out-Null

$process = $null
try {
  $arguments = @(
    "--user-data-dir=$profile",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$port"
  )
  try {
    $process = Start-Process -FilePath $resolvedExecutable -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  }
  catch {
    $blockedByApplicationControl = $_.Exception.Message -like "*Application Control policy has blocked this file*"
    if (-not $AllowTrustedElectronFallback -or -not $blockedByApplicationControl) {
      throw
    }

    $repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    $trustedElectron = (Resolve-Path -LiteralPath (Join-Path $repoRoot "node_modules/electron/dist/electron.exe")).Path
    $packagedAsar = (Resolve-Path -LiteralPath (Join-Path (Split-Path -Parent $resolvedExecutable) "resources/app.asar")).Path
    $arguments = @($packagedAsar) + $arguments
    Write-Host "Application Control blocked the unsigned QA executable; testing the exact packaged app.asar through the trusted Electron runtime."
    $process = Start-Process -FilePath $trustedElectron -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  }
  node scripts/assert-electron-renderer.mjs "http://127.0.0.1:$port"
  if ($process.HasExited) { throw "Packaged Electron process exited during smoke QA." }
  Write-Host "Windows packaged app.asar renderer and secure preload bridge passed smoke QA."
}
finally {
  if ($null -ne $process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  if (Test-Path -LiteralPath $stderr) {
    Get-Content -LiteralPath $stderr | Write-Host
  }
}
