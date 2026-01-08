@echo off
echo Nettoyage du cache Vite...
if exist "dist" rmdir /s /q "dist"
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"
echo Cache nettoye!
echo.
echo Pour forcer le rechargement dans le navigateur:
echo - Appuyez sur Ctrl+Shift+R (Windows/Linux) ou Cmd+Shift+R (Mac)
echo - Ou ouvrez les outils developpeur (F12) et cliquez droit sur le bouton actualiser avec "Vider le cache et actualiser forcee"
pause

