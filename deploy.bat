@echo off
echo.
echo  Riss — deploy til GitHub/Vercel
echo  ================================
cd /d "C:\Users\gemli\Jottacloud\Lied Lab\Web\riss"

git add -A

set /p msg="Beskriv oppdateringa (Enter for 'Oppdatering'): "
if "%msg%"=="" set msg=Oppdatering

git commit -m "%msg%"
git push

echo.
echo  Ferdig! Vercel deployer automatisk om 30 sekund.
echo  Sjekk: https://riss.liedarkitektur.no
echo.
pause
