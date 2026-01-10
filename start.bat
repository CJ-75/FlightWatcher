@echo off
echo ========================================
echo   FlightWatcher - Démarrage
echo ========================================
echo.

echo [1/2] Démarrage du backend...
start cmd /k "cd backend && python run.py"

timeout /t 3 /nobreak >nul

echo [2/2] Démarrage du frontend...
start cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo   Services démarrés !
echo ========================================
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo   Appuyez sur une touche pour fermer cette fenêtre...
pause >nul

