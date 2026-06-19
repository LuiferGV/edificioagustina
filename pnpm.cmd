@echo off
set "RUNTIME_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
set "NODE_EXE=%RUNTIME_ROOT%\bin\node.exe"
set "PNPM_CJS=%RUNTIME_ROOT%\node_modules\pnpm\bin\pnpm.cjs"

if not exist "%NODE_EXE%" (
  echo No se encontro node.exe en el runtime esperado: "%NODE_EXE%"
  exit /b 1
)

if not exist "%PNPM_CJS%" (
  echo No se encontro pnpm.cjs en el runtime esperado: "%PNPM_CJS%"
  exit /b 1
)

set "PATH=%~dp0;%RUNTIME_ROOT%\bin;%PATH%"
"%NODE_EXE%" "%PNPM_CJS%" %*
