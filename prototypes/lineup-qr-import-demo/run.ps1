$ErrorActionPreference = "Stop"

$demoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $demoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv (Join-Path $demoRoot ".venv")
}

& $venvPython -m pip install --disable-pip-version-check --quiet -r (Join-Path $demoRoot "requirements.txt")
& $venvPython (Join-Path $demoRoot "app.py")
