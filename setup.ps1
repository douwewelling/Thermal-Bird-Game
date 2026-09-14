# setup.ps1 - Zet dit project in een nieuwe map/machine in een keer klaar.
# Gebruik: open PowerShell in deze map en run:  .\setup.ps1

$ErrorActionPreference = "Stop"

function Find-Python {
    foreach ($cmd in @("python", "py")) {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue
        if ($found -and $found.Source -notlike "*WindowsApps*") {
            return $found.Source
        }
    }
    $fallback = "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python312\python.exe"
    if (Test-Path $fallback) { return $fallback }
    return $null
}

Write-Host "1. Python zoeken..." -ForegroundColor Cyan
$python = Find-Python
if (-not $python) {
    Write-Host "Geen echte Python-installatie gevonden. Installeer met:" -ForegroundColor Red
    Write-Host "  winget install -e --id Python.Python.3.12" -ForegroundColor Yellow
    Write-Host "Sluit daarna dit venster VOLLEDIG en open een nieuw PowerShell-venster." -ForegroundColor Yellow
    exit 1
}
Write-Host "   Gevonden: $python" -ForegroundColor Green

Write-Host "2. Virtuele omgeving aanmaken (.venv)..." -ForegroundColor Cyan
if (-not (Test-Path ".venv")) {
    & $python -m venv .venv
}
$venvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"

Write-Host "3. Dependencies installeren..." -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r requirements.txt --quiet

Write-Host "4. Model-bestand controleren..." -ForegroundColor Cyan
$modelPath = "models\pose_landmarker_lite.task"
if (-not (Test-Path $modelPath)) {
    New-Item -ItemType Directory -Force -Path "models" | Out-Null
    Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" -OutFile $modelPath
}
Write-Host "   Model aanwezig: $modelPath" -ForegroundColor Green

Write-Host "5. Camera + model smoke-test..." -ForegroundColor Cyan
& $venvPython -c "from body_tracker import BodyTracker; t=BodyTracker(); t.start(); f,j=t.read(); print('Camera: OK' if f is not None else 'Camera: MISLUKT'); t.stop()"

Write-Host ""
Write-Host "Klaar. Start de demo met:" -ForegroundColor Green
Write-Host "  .\.venv\Scripts\python.exe demo.py" -ForegroundColor Yellow
