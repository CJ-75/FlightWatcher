# Script PowerShell pour créer les fichiers .env à partir des exemples
# Exécutez ce script depuis la racine du projet : .\CREER_ENV.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Création des fichiers .env pour FlightWatcher" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Créer le fichier .env pour le backend
$backendEnvExample = "backend\.env.example"
$backendEnv = "backend\.env"

if (Test-Path $backendEnvExample) {
    if (-not (Test-Path $backendEnv)) {
        Copy-Item $backendEnvExample $backendEnv
        Write-Host "✓ Fichier backend\.env créé" -ForegroundColor Green
        Write-Host "  → Éditez ce fichier et ajoutez vos clés Supabase" -ForegroundColor Yellow
    } else {
        Write-Host "⚠ Le fichier backend\.env existe déjà" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ Fichier backend\.env.example introuvable" -ForegroundColor Red
    Write-Host "  → Création d'un fichier .env.example..." -ForegroundColor Yellow
    
    $content = @"
# Configuration Supabase pour FlightWatcher
# 
# Pour obtenir ces valeurs :
# 1. Allez sur https://app.supabase.com
# 2. Créez un projet ou sélectionnez un projet existant
# 3. Allez dans Settings → API
# 4. Copiez les valeurs ci-dessous

# URL de votre projet Supabase
# Format : https://xxxxxxxxxxxxx.supabase.co
SUPABASE_URL=https://votre-projet.supabase.co

# Clé publique anonyme (anon key) de Supabase
# C'est une longue chaîne de caractères aléatoires commençant par eyJ...
SUPABASE_ANON_KEY=votre-clé-anon-ici
"@
    
    Set-Content -Path $backendEnvExample -Value $content -Encoding UTF8
    Copy-Item $backendEnvExample $backendEnv
    Write-Host "✓ Fichiers créés" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Instructions suivantes :" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ouvrez le fichier backend\.env dans un éditeur de texte" -ForegroundColor White
Write-Host ""
Write-Host "2. Remplacez les valeurs suivantes :" -ForegroundColor White
Write-Host "   - SUPABASE_URL : Votre URL de projet Supabase" -ForegroundColor Yellow
Write-Host "     Exemple : https://abcdefghijklmnop.supabase.co" -ForegroundColor Gray
Write-Host ""
Write-Host "   - SUPABASE_ANON_KEY : Votre clé anon public" -ForegroundColor Yellow
Write-Host "     Exemple : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." -ForegroundColor Gray
Write-Host ""
Write-Host "3. Pour obtenir ces valeurs :" -ForegroundColor White
Write-Host "   → https://app.supabase.com" -ForegroundColor Cyan
Write-Host "   → Votre projet → Settings → API" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Testez la configuration :" -ForegroundColor White
Write-Host "   → Démarrez le backend : uvicorn main:app --reload" -ForegroundColor Cyan
Write-Host "   → Visitez : http://localhost:8000/api/supabase/status" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note : Supabase est optionnel. L'application fonctionne aussi sans." -ForegroundColor Gray
Write-Host ""

