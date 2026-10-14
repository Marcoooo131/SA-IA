@echo off
rem Lance Phone Call avec une conversation fictive (aucun son capte, note sans IA).
set PCD_ENVIRONMENT=test
set PCD_AUDIO_BACKEND=test-files
set PCD_RECOGNIZER=scripted
set PCD_NOTES_CLIENT=local
start "" "%~dp0PhoneCallDesktop.exe"
