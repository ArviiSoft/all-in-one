@echo off

title ALL In ONE by arviis.

:loop
  node arvis.js
  echo [%date% %time%] Bot kapandi. Hata kodu: %errorlevel%.
  echo 5 saniye sonra yeniden baslatilacak...
  timeout /t 5 /nobreak > nul
goto loop
