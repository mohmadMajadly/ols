# OLS management helper (Windows):  .\ols.ps1 status|logs|start|stop|restart|update|uninstall
# ASCII-only on purpose (PowerShell 5.1 encoding).
param(
    [string]$Command = 'status',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
if (-not (Test-Path (Join-Path $dir '.env'))) { Write-Host 'No .env here - run install.ps1 first.' -ForegroundColor Red; return }
$null = & docker info 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host 'Docker daemon is not reachable. Start Docker Desktop.' -ForegroundColor Red; return }

function Dc { & docker compose -f docker-compose.prod.yml @args }

switch ($Command) {
    'status'  { Dc ps }
    'logs'    { Dc logs -f --tail=200 @Rest }
    'start'   { Dc up -d }
    'stop'    { Dc stop }
    'restart' { Dc restart @Rest }
    'update'  {
        if (Test-Path (Join-Path $dir '.git')) { & git pull --ff-only } else { Write-Host 'No git metadata - re-run install.ps1 to update.' -ForegroundColor Red; return }
        Dc up -d --build
    }
    'uninstall' {
        $a = Read-Host 'This stops and removes the OLS containers. Continue? [y/N]'
        if ($a -notmatch '^(y|yes)$') { Write-Host 'Cancelled.'; return }
        $a = Read-Host 'ALSO delete all data (database, recordings, certificates, speech model)? Cannot be undone. Type DELETE to confirm, anything else keeps data'
        if ($a -ceq 'DELETE') { Dc down -v --remove-orphans } else { Dc down --remove-orphans; Write-Host 'Data volumes kept.' }
        $a = Read-Host "Also delete the folder $dir ? [y/N]"
        if ($a -match '^(y|yes)$') { Set-Location $HOME; Remove-Item -Recurse -Force $dir; Write-Host "Removed $dir" }
    }
    default { Write-Host 'Usage: .\ols.ps1 status|logs [service]|start|stop|restart [service]|update|uninstall' }
}
