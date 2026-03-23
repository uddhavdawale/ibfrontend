@echo off
echo Cleaning React app (95MB -> 15MB)...

REM Delete bloat
rmdir /s /q node_modules
rmdir /s /q dist
rmdir /s /q build
del package-lock.json

REM Create clean folder
mkdir react-prod-clean
cd react-prod-clean

REM Copy essentials
xcopy ..\public public /E /I /Y
xcopy ..\src src /E /I /Y
copy ..\package.json .
copy ..\vite.config.js .
copy ..\index.html .

echo ✅ Clean React folder created! Size:
dir /s

pause
