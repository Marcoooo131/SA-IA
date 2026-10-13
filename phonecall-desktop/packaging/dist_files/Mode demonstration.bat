@echo off
rem Lance Phone Call avec une conversation fictive (aucun son capte, aucune IA).
set PCD_ENVIRONMENT=test
set PCD_AUDIO_BACKEND=test-files
set PCD_RECOGNIZER=scripted
set PCD_NOTES_CLIENT=simulated
start "" "%~dp0PhoneCallDesktop.exe"
