$ErrorActionPreference = "Stop"

$productName = -join @(
  [char]0x6D1B,
  [char]0x514B,
  [char]0x8BA1,
  [char]0x7B97,
  [char]0x5668
)
$subject = "CN=$productName"
$certificate = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object {
    $_.Subject -eq $subject -and
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date).AddDays(30)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $subject `
    -FriendlyName "Rock Calculator Code Signing" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(5)
}

$signingDirectory = Join-Path $env:LOCALAPPDATA "RockCalculator\signing-temp"
New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
$temporaryPfx = Join-Path $signingDirectory (
  "rock-calculator-" + [guid]::NewGuid().ToString("N") + ".pfx"
)
$passwordBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($passwordBytes)
$password = [Convert]::ToBase64String($passwordBytes)
$securePassword = ConvertTo-SecureString -String $password -AsPlainText -Force

Export-PfxCertificate `
  -Cert $certificate `
  -FilePath $temporaryPfx `
  -Password $securePassword `
  -ChainOption EndEntityCertOnly | Out-Null

$env:CSC_LINK = $temporaryPfx
$env:CSC_KEY_PASSWORD = $password
$env:WIN_CSC_LINK = $temporaryPfx
$env:WIN_CSC_KEY_PASSWORD = $password

try {
  npm run desktop:pack
  if ($LASTEXITCODE -ne 0) {
    throw "desktop:pack failed with exit code $LASTEXITCODE"
  }
} finally {
  Remove-Item Env:CSC_LINK -ErrorAction SilentlyContinue
  Remove-Item Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue
  Remove-Item Env:WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $temporaryPfx) {
    Remove-Item -LiteralPath $temporaryPfx -Force
  }
}

$certificateOutput = Join-Path $PSScriptRoot (
  "..\installers\$productName-self-signed-code-signing.cer"
)
Export-Certificate -Cert $certificate -FilePath $certificateOutput -Force | Out-Null

Write-Output "SIGN_CERT_THUMBPRINT=$($certificate.Thumbprint)"
Write-Output "SIGN_CERT_EXPIRES=$($certificate.NotAfter.ToString("o"))"
Write-Output "PUBLIC_CERT=$certificateOutput"
