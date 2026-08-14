param(
  [string]$Executable = "apps/desktop/release/win-unpacked/silfable.exe",
  [string]$EvidenceDirectory = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath ".").Path
$resolvedExecutable = (Resolve-Path -LiteralPath $Executable).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if ([string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
  $EvidenceDirectory = Join-Path $repoRoot "artifacts/p2-windows/$timestamp"
}
elseif (-not [System.IO.Path]::IsPathRooted($EvidenceDirectory)) {
  $EvidenceDirectory = Join-Path $repoRoot $EvidenceDirectory
}

$evidencePath = [System.IO.Path]::GetFullPath($EvidenceDirectory)
$profilePath = Join-Path $evidencePath "isolated-profile"
New-Item -ItemType Directory -Path $profilePath -Force | Out-Null

$installer = Get-ChildItem -LiteralPath (Join-Path $repoRoot "apps/desktop/release") `
  -Filter "Silfable-*-windows-x64-setup.exe" -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -gt 50000000 } |
  Select-Object -First 1
$authenticode = Get-AuthenticodeSignature -LiteralPath $resolvedExecutable
$executableSha256 = (Get-FileHash -LiteralPath $resolvedExecutable -Algorithm SHA256).Hash
$manifest = [ordered]@{
  schemaVersion = 2
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  executableName = [System.IO.Path]::GetFileName($resolvedExecutable)
  executableSha256 = $executableSha256
  authenticodeStatus = [string]$authenticode.Status
  authenticodeSubject = if ($null -eq $authenticode.SignerCertificate) { $null } else { $authenticode.SignerCertificate.Subject }
  installerName = if ($null -eq $installer) { $null } else { $installer.Name }
  installerSha256 = if ($null -eq $installer) { $null } else { (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash }
  profileMode = "isolated"
  checklist = "docs/SILFABLE_PROJECT_REFERENCE.md"
}
$manifest | ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $evidencePath "manifest.json") -Encoding utf8

$caseDefinitions = @(
  @("P2-01", "Packaged startup and vault recovery"),
  @("P2-02", "USDC to SOL reverse swap"),
  @("P2-03", "Insufficient balance"),
  @("P2-04", "Changed quote or route"),
  @("P2-05", "RPC timeout before signing"),
  @("P2-06", "Broadcast result unknown"),
  @("P2-07", "Receipt restart recovery"),
  @("P2-08", "Portfolio reconciliation"),
  @("P2-09", "Fee and account-funding evidence")
)
$cases = [ordered]@{
  schemaVersion = 1
  buildSha256 = $executableSha256.ToLowerInvariant()
  cases = @($caseDefinitions | ForEach-Object {
    [ordered]@{
      id = $_[0]
      title = $_[1]
      status = "pending"
      checkedAt = $null
      publicSignatures = @()
      artifacts = @()
      notes = $null
    }
  })
}
$cases | ConvertTo-Json -Depth 6 |
  Set-Content -LiteralPath (Join-Path $evidencePath "cases.json") -Encoding utf8

$arguments = @("--user-data-dir=$profilePath")
$process = Start-Process -FilePath $resolvedExecutable -ArgumentList $arguments -PassThru

@"
Silfable Windows P2 QA

Build SHA-256: $executableSha256
Process ID (not part of submitted evidence): $($process.Id)

Follow the Windows P2 acceptance checklist in docs/SILFABLE_PROJECT_REFERENCE.md.
Never paste a seed phrase, private key, API key, or master password into this folder.
The launcher does not execute or approve a transaction.
Record each result in cases.json, then validate it with:
npm.cmd run qa:desktop:p2:validate -- <evidence-directory>
"@ | Set-Content -LiteralPath (Join-Path $evidencePath "README.txt") -Encoding utf8

Write-Host "Silfable P2 QA launched with an isolated profile."
Write-Host "Evidence: $evidencePath"
Write-Host "Checklist: docs/SILFABLE_PROJECT_REFERENCE.md"
Write-Host "Authenticode: $($authenticode.Status)"
