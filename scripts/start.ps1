param([switch]$Demo, [switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Install uv, then run this script again.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer, then run this script again.' }
if (-not $SkipInstall) {
    & uv sync --project backend --locked
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency setup failed.' }
    & npm.cmd --prefix frontend ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency setup failed.' }
}
if ($Demo) {
    $env:VYUMI_GENERATION_MODE = 'fixture'
    $env:VYUMI_DATA_DIR = Join-Path $projectRoot 'data/demo'
    $env:VYUMI_MERCHANT_TOKEN = 'vyumi-local-demo'
    & uv run --project backend python scripts/seed_demo.py
    if ($LASTEXITCODE -ne 0) { throw 'Demo catalog setup failed.' }
    Write-Host 'DEMO MODE: labelled fixed samples; no personalized AI or paid API calls.'
    Write-Host 'Merchant token: vyumi-local-demo (local demonstration only)'
} else {
    $env:VYUMI_GENERATION_MODE = 'live'
    $env:VYUMI_DATA_DIR = Join-Path $projectRoot 'data/live'
    Write-Host 'LIVE MODE: configure backend/.env before generating. No key/allowance means no paid calls.'
}
$pythonPath = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
foreach ($port in @(8000,3000)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is in use. Stop the existing local server before starting another mode." }
}
$backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port','8000') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'backend.log') -RedirectStandardError (Join-Path $projectRoot 'backend-error.log')
try {
    $backendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($backendProcess.HasExited) { throw 'The backend exited. Read backend-error.log for details.' }
        try { $health = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 1; if ($health.status -eq 'ok') { $backendReady = $true; break } } catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $backendReady) { throw 'The backend did not become ready. Read backend-error.log for details.' }
    Write-Host 'Storefront: http://127.0.0.1:3000'
    Write-Host 'Merchant studio: http://127.0.0.1:3000/merchant'
    Write-Host 'Keep this terminal open. Press Ctrl+C to stop.'
    & npm.cmd --prefix frontend run dev
} finally {
    if (-not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue }
}
