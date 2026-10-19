@echo off
rem Verifie la capture du son du PC et du micro pendant 10 secondes. Rien n est enregistre.
echo Parlez dans le micro et faites jouer un son (video, appel test) pendant 10 secondes...
start "" /wait "%~dp0PhoneCallDesktop.exe" --diag 10 --report "%TEMP%\phonecall-diagnostic.txt"
notepad "%TEMP%\phonecall-diagnostic.txt"
