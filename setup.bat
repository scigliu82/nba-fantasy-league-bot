@echo off
echo ═══════════════════════════════════════════════════════
echo 🏀 NBA FANTASY LEAGUE BOT - SETUP AUTOMATICO
echo ═══════════════════════════════════════════════════════
echo.

REM Crea le cartelle
echo 📁 Creando struttura cartelle...
mkdir src\commands\info
mkdir src\commands\trade
mkdir src\commands\fa
mkdir src\commands\admin
mkdir src\commands\roster
mkdir src\events
mkdir src\database
mkdir src\services
mkdir src\algorithms
mkdir src\utils
mkdir scripts
mkdir config
mkdir data
mkdir docs

echo ✅ Cartelle create!
echo.

echo 📝 Per creare i file, copia-incolla il contenuto in ciascun file.
echo.
echo 📋 File da creare:
echo    1. README.md
echo    2. package.json
echo    3. .env.example
echo    4. .gitignore
echo    5. src\index.js
echo    6. src\database\firebase.js
echo    7. src\commands\info\roster.js
echo    8. src\events\ready.js
echo    9. src\events\interactionCreate.js
echo   10. scripts\deployCommands.js
echo   11. scripts\importRoster.js
echo   12. data\roster.example.csv
echo   13. data\.gitkeep
echo   14. config\.gitkeep
echo   15. docs\SETUP_GUIDE.md
echo.

pause