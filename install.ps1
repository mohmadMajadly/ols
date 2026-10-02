# OLS installer (Windows PowerShell 5.1+)
#   irm https://raw.githubusercontent.com/mohmadMajadly/ols/main/install.ps1 | iex
#
# Environment overrides (all optional; set OLS_NONINTERACTIVE=1 to skip every prompt):
#   OLS_DIR, OLS_REPO, OLS_BRANCH, OLS_MODE=domain|local|lan, OLS_DOMAIN, OLS_EMAIL,
#   OLS_PORT, OLS_LAN_IP, OLS_ADMIN_USER, OLS_ADMIN_PASSWORD, OLS_ACTION=update|reconfigure|abort
#
# NOTE: this file is intentionally ASCII-only (PowerShell 5.1 misreads UTF-8 without BOM).
# It is a single function so it is safe under "| iex" (no 'exit', which would close the user's shell).

function Install-OLS {
    $ErrorActionPreference = 'Stop'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

    $Repo = if ($env:OLS_REPO) { $env:OLS_REPO } else { 'https://github.com/mohmadMajadly/ols.git' }
    $Branch = if ($env:OLS_BRANCH) { $env:OLS_BRANCH } else { 'main' }
    $ComposeFile = 'docker-compose.prod.yml'
    $HealthTimeout = if ($env:OLS_HEALTH_TIMEOUT) { [int]$env:OLS_HEALTH_TIMEOUT } else { 420 }
    $NonInteractive = ($env:OLS_NONINTERACTIVE -eq '1')
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    function Say($m) { Write-Host $m }
    function Step($m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
    function Ok($m) { Write-Host "[ok] $m" -ForegroundColor Green }
    function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
    function Fail($m) { throw "OLS install failed: $m" }

    function Ask($prompt, $default) {
        if ($NonInteractive) { return $default }
        $suffix = ''
        if ($default) { $suffix = " [$default]" }
        $a = Read-Host "$prompt$suffix"
        if ([string]::IsNullOrWhiteSpace($a)) { return $default }
        return $a.Trim()
    }

    function AskSecret($prompt) {
        $s = Read-Host $prompt -AsSecureString
        $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
        try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    }

    function YesNo($q, $defaultYes) {
        if ($NonInteractive) { return $defaultYes }
        $hint = 'y/N'
        if ($defaultYes) { $hint = 'Y/n' }
        $a = Read-Host "$q [$hint]"
        if ([string]::IsNullOrWhiteSpace($a)) { return $defaultYes }
        return ($a -match '^(y|yes)$')
    }

    function RandHex($bytes) {
        $buf = New-Object byte[] $bytes
        $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
        $rng.GetBytes($buf)
        $rng.Dispose()
        return (($buf | ForEach-Object { $_.ToString('x2') }) -join '')
    }

    function EnvGet($key, $file) {
        if (-not (Test-Path $file)) { return '' }
        $line = Get-Content -LiteralPath $file | Where-Object { $_ -like "$key=*" } | Select-Object -Last 1
        if (-not $line) { return '' }
        $v = $line.Substring($key.Length + 1)
        if ($v.Length -ge 2 -and $v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
        return $v
    }

    function WriteLf($path, $text) {
        # LF line endings, UTF-8 without BOM (a BOM would corrupt the first .env key)
        [IO.File]::WriteAllText($path, ($text -replace "`r`n", "`n"), $Utf8NoBom)
    }

    function PortInUse($port) {
        $c = New-Object Net.Sockets.TcpClient
        try {
            $iar = $c.BeginConnect('127.0.0.1', $port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(500) -and $c.Connected) { return $true }
            return $false
        } catch { return $false } finally { $c.Close() }
    }

    function DetectLanIp {
        try {
            $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
            if ($cfg -and $cfg.IPv4Address) { return [string]$cfg.IPv4Address[0].IPAddress }
        } catch { }
        try {
            $ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
            if ($ip) { return [string]$ip.IPAddress }
        } catch { }
        return ''
    }

    function ValidIPv4($s) {
        if ($s -notmatch '^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$') { return $false }
        foreach ($i in 1..4) { if ([int]$Matches[$i] -gt 255) { return $false } }
        return $true
    }

    $script:OlsDir = ''
    function Dc {
        Push-Location $script:OlsDir
        try {
            & docker compose -f $ComposeFile @args
            if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed (exit $LASTEXITCODE)" }
        } finally { Pop-Location }
    }
    function DcQuiet {
        # returns $true on success; used for polling, never throws
        $ErrorActionPreference = 'Continue'
        Push-Location $script:OlsDir
        try {
            $null = & docker compose -f $ComposeFile @args 2>$null
            return ($LASTEXITCODE -eq 0)
        } catch { return $false } finally { Pop-Location }
    }

    Write-Host 'OLS - Quran memorization center :: installer' -ForegroundColor White

    # ------------------------------------------------------------ requirements
    Step 'Checking requirements'
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail 'Docker is not installed. Install Docker Desktop from https://docs.docker.com/desktop/setup/install/windows-install/ then run this installer again.'
    }
    $ErrorActionPreference = 'Continue'
    $null = & docker info 2>$null
    $infoExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($infoExit -ne 0) {
        Fail 'The Docker daemon is not running. Start Docker Desktop, wait until it says "running", then run this installer again.'
    }
    $ErrorActionPreference = 'Continue'
    $dv = & docker version --format '{{.Server.Version}}' 2>$null
    $null = & docker compose version 2>$null
    $composeExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Ok "Docker $dv"
    if ($composeExit -ne 0) { Fail "Docker Compose v2 ('docker compose') is missing. Update Docker Desktop." }
    Ok 'Docker Compose available'
    $HaveGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
    if (-not $HaveGit) {
        Warn 'git is not installed - the repository will be downloaded as a zip instead (install git from https://git-scm.com/downloads for easy updates).'
    }

    # ------------------------------------------------------------ install dir
    $dir = $env:OLS_DIR
    if (-not $dir) { $dir = Ask 'Install directory' (Join-Path $HOME 'ols') }
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $script:OlsDir = (Resolve-Path $dir).Path
    $OlsDir = $script:OlsDir

    $action = 'fresh'
    if (Test-Path (Join-Path $OlsDir '.env')) {
        Step "Existing installation found in $OlsDir"
        $action = $env:OLS_ACTION
        if (-not $action) {
            if ($NonInteractive) { $action = 'update' }
            else {
                Say '  U) Update      - pull the latest version, rebuild, keep settings and data'
                Say '  R) Reconfigure - change access mode / ports, keep data and secrets'
                Say '  A) Abort'
                $a = (Ask 'Choose U, R or A' 'U').ToLower()
                if ($a.StartsWith('r')) { $action = 'reconfigure' } elseif ($a.StartsWith('a')) { $action = 'abort' } else { $action = 'update' }
            }
        }
        if ($action -eq 'abort') { Say 'Aborted.'; return }
        if ($action -ne 'update' -and $action -ne 'reconfigure') { Fail 'OLS_ACTION must be update, reconfigure or abort.' }
    }

    # ------------------------------------------------------------ source code
    function Get-Archive {
        $base = $Repo -replace '\.git$', ''
        if ($base -notlike 'https://github.com/*') { Fail "Without git, OLS_REPO must be a github.com URL (got: $Repo)." }
        $url = "$base/archive/refs/heads/$Branch.zip"
        $tmpZip = Join-Path ([IO.Path]::GetTempPath()) ('ols-' + [guid]::NewGuid().ToString('N') + '.zip')
        $tmpDir = Join-Path ([IO.Path]::GetTempPath()) ('ols-' + [guid]::NewGuid().ToString('N'))
        Say "Downloading $url"
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmpZip
        Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force
        $inner = Get-ChildItem -LiteralPath $tmpDir | Select-Object -First 1
        Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $OlsDir -Recurse -Force
        Remove-Item -Recurse -Force $tmpZip, $tmpDir
    }

    Step 'Getting OLS source'
    $hasGitDir = Test-Path (Join-Path $OlsDir '.git')
    if ($hasGitDir -and $HaveGit) {
        Push-Location $OlsDir
        try { & git pull --ff-only origin $Branch; if ($LASTEXITCODE -ne 0) { Fail "git pull failed (local changes?). Resolve in $OlsDir and retry." } }
        finally { Pop-Location }
    } elseif ($hasGitDir -or (Test-Path (Join-Path $OlsDir $ComposeFile))) {
        Get-Archive
    } else {
        if (@(Get-ChildItem -Force -LiteralPath $OlsDir).Count -gt 0) { Fail "$OlsDir exists and is not empty. Choose another directory (OLS_DIR=...)." }
        if ($HaveGit) {
            & git clone --depth 1 --branch $Branch $Repo $OlsDir
            if ($LASTEXITCODE -ne 0) { Fail 'git clone failed.' }
        } else { Get-Archive }
    }
    if (-not (Test-Path (Join-Path $OlsDir $ComposeFile))) { Fail "$ComposeFile not found in $OlsDir - wrong repository or branch?" }
    Ok "Source ready in $OlsDir"

    $envFile = Join-Path $OlsDir '.env'

    # ------------------------------------------------------------ health
    function Wait-Healthy($mode, $port) {
        Step 'Waiting for OLS to come up (first build can take several minutes)'
        $ErrorActionPreference = 'Continue'
        $elapsed = 0
        while ($elapsed -lt $HealthTimeout) {
            $good = $false
            if ($mode -eq 'local') {
                & curl.exe -fsS -m 5 "http://127.0.0.1:$port/api/health" 2>$null | Out-Null
                $good = ($LASTEXITCODE -eq 0)
            } elseif ($mode -eq 'lan') {
                & curl.exe -fsSk -m 5 "https://localhost:$port/api/health" 2>$null | Out-Null
                $good = ($LASTEXITCODE -eq 0)
            } else {
                $good = DcQuiet exec -T caddy wget -qO- http://backend:8000/api/health
            }
            if ($good) { return $true }
            Start-Sleep -Seconds 3
            $elapsed += 3
        }
        return $false
    }

    function Show-Summary($mode, $port, $domain, $lanIp) {
        $admin = EnvGet 'ADMIN_USERNAME' $envFile
        Write-Host ''
        Write-Host '=================  OLS is installed  =================' -ForegroundColor Green
        if ($mode -eq 'domain') { Say "Open:   https://$domain   (the certificate is issued on first visit; allow a minute)" }
        elseif ($mode -eq 'local') { Say "Open:   http://localhost:$port" }
        else {
            foreach ($i in ($lanIp -split ',')) { if ($i) { Say "Open:   https://${i}:$port" } }
            Say "         https://localhost:$port (on this machine)"
            Say 'Note:   the certificate is self-signed - each browser shows a warning once; accept it to continue.'
            Say "         Other devices may need a Windows Firewall rule (run as Administrator):"
            Say "         New-NetFirewallRule -DisplayName 'OLS' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow"
        }
        Say "Admin:  $admin   (password: the one you entered)"
        Say "Folder: $OlsDir"
        Say ''
        Say 'Live recitation tracking needs the speech model, which is converted on the very first start'
        Say '(can take 10+ minutes). OLS is usable meanwhile; tracking turns on by itself afterwards.'
        Say ''
        Say "Manage (from $OlsDir):"
        Say '  .\ols.ps1 status | logs [service] | stop | start | restart | update | uninstall'
        Say '  or: docker compose logs -f   /   docker compose down   /   docker compose up -d'
    }

    # ------------------------------------------------------------ update path
    if ($action -eq 'update') {
        Step 'Rebuilding and restarting'
        Dc up -d --build
        $m = EnvGet 'OLS_MODE' $envFile
        $p = EnvGet 'OLS_PORT' $envFile
        if (-not (Wait-Healthy $m $p)) { Fail "Timed out waiting for the app. Check: cd $OlsDir ; docker compose logs backend caddy" }
        Show-Summary $m $p (EnvGet 'OLS_DOMAIN' $envFile) (EnvGet 'OLS_LAN_IP' $envFile)
        return
    }

    # ------------------------------------------------------------ configuration
    Step 'Configuration'
    $mode = $env:OLS_MODE
    if (-not $mode) {
        if ($NonInteractive) { $mode = 'local' }
        else {
            Say 'How will OLS be accessed?'
            Say "  1) Server with a domain name   (public HTTPS via Let's Encrypt)"
            Say '  2) This computer only          (http://localhost)'
            Say '  3) Local network / LAN         (HTTPS with a self-signed certificate)'
            $c = Ask 'Choose 1, 2 or 3' '2'
            if ($c -eq '1') { $mode = 'domain' } elseif ($c -eq '3') { $mode = 'lan' } else { $mode = 'local' }
        }
    }
    $mode = $mode.ToLower()
    if ($mode -notin @('domain', 'local', 'lan')) { Fail "OLS_MODE must be domain, local or lan (got: $mode)." }

    $domain = ''; $email = ''; $lanIp = ''; $port = 0
    if ($mode -eq 'domain') {
        Say ''
        Say "Reminder: the DNS A record of your domain must point to this server's public IP,"
        Say 'and ports 80 and 443 must be open in the firewall.'
        $domain = $env:OLS_DOMAIN
        if (-not $domain) { $domain = Ask 'Domain name (e.g. quran.example.com)' '' }
        $domain = $domain.ToLower()
        if ($domain -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') { Fail "Invalid or missing domain: '$domain'." }
        $email = $env:OLS_EMAIL
        if (-not $email) { $email = Ask "Email for Let's Encrypt notices" '' }
        if ($email -notmatch '^[^@ ]+@[^@ ]+\.[^@ ]+$') { Fail "Invalid or missing email: '$email'." }
        $port = 443
    } else {
        $defPort = '8080'
        if ($mode -eq 'lan') { $defPort = '8443' }
        $ps = $env:OLS_PORT
        if (-not $ps) { $ps = Ask 'Port' $defPort }
        if ($ps -notmatch '^\d+$' -or [int]$ps -lt 1 -or [int]$ps -gt 65535) { Fail "Invalid port: '$ps'." }
        $port = [int]$ps
        if (PortInUse $port) {
            Warn "Port $port already seems to be in use on this machine."
            if (-not $NonInteractive -and -not (YesNo 'Continue anyway?' $false)) { Fail 'Aborted.' }
        }
        if ($mode -eq 'lan') {
            $lanIp = $env:OLS_LAN_IP
            if (-not $lanIp) { $lanIp = Ask "This machine's LAN IP address (comma-separated for several)" (DetectLanIp) }
            $lanIp = ($lanIp -replace '\s', '')
            if (-not $lanIp) { Fail 'Could not detect the LAN IP; set OLS_LAN_IP.' }
            foreach ($i in ($lanIp -split ',')) { if (-not (ValidIPv4 $i)) { Fail "Invalid IPv4 address: '$i'." } }
        }
    }

    $adminUser = ''
    $adminPass = ''
    if ($action -eq 'fresh') {
        $adminUser = $env:OLS_ADMIN_USER
        if (-not $adminUser) { $adminUser = Ask 'Admin username' 'admin' }
        $adminUser = $adminUser.ToLower()
        if ($adminUser -notmatch '^[a-z0-9._-]{3,50}$') { Fail 'Admin username must be 3-50 characters: letters, digits, dot, dash, underscore.' }
        $adminPass = $env:OLS_ADMIN_PASSWORD
        if (-not $adminPass) {
            if ($NonInteractive) { Fail 'Non-interactive run requires OLS_ADMIN_PASSWORD.' }
            while ($true) {
                $p1 = AskSecret 'Admin password (min 8 characters, input hidden)'
                $p2 = AskSecret 'Repeat the password'
                if ($p1 -ne $p2) { Warn 'Passwords do not match.'; continue }
                if ($p1.Length -lt 8) { Warn 'Password must be at least 8 characters.'; continue }
                if ($p1.Contains("'")) { Warn "Password must not contain a single quote (')."; continue }
                $adminPass = $p1
                break
            }
        }
        if ($adminPass.Length -lt 8) { Fail 'Admin password must be at least 8 characters.' }
        if ($adminPass.Contains("'")) { Fail "Admin password must not contain a single quote (')." }
        if ($adminPass -match "[\r\n]") { Fail 'Admin password must not contain line breaks.' }
    } else {
        $adminUser = EnvGet 'ADMIN_USERNAME' $envFile
        Say 'Reconfigure keeps the existing admin account and database; change passwords inside the app.'
    }

    # ------------------------------------------------------------ write config
    Step 'Writing configuration'
    if ($mode -eq 'domain') { $bind = '0.0.0.0'; $internal = 443; $httpSpec = '0.0.0.0:80'; $cookie = 'true' }
    elseif ($mode -eq 'local') { $bind = '127.0.0.1'; $internal = 8080; $httpSpec = '127.0.0.1:'; $cookie = 'false' }
    else { $bind = '0.0.0.0'; $internal = 8443; $httpSpec = '127.0.0.1:'; $cookie = 'true' }

    $pgPass = EnvGet 'POSTGRES_PASSWORD' $envFile
    $secret = EnvGet 'SECRET_KEY' $envFile
    if (-not $pgPass) { $pgPass = RandHex 24 }
    if (-not $secret) { $secret = RandHex 48 }

    $envText = @"
# generated by install.ps1 - keep this file private
COMPOSE_FILE=$ComposeFile

# ---- PostgreSQL ----
POSTGRES_USER=ols
POSTGRES_PASSWORD=$pgPass
POSTGRES_DB=ols
DATABASE_URL=postgresql+psycopg://ols:$pgPass@db:5432/ols

# ---- Backend ----
SECRET_KEY=$secret
ACCESS_TOKEN_EXPIRE_MINUTES=60
COOKIE_SECURE=$cookie
MEDIA_ROOT=/data/media

# ---- Seed admin (applied only while no admin exists; the password is blanked after first boot) ----
ADMIN_USERNAME=$adminUser
ADMIN_PASSWORD='$adminPass'

# ---- Access mode (used by docker-compose.prod.yml and the helper scripts) ----
OLS_MODE=$mode
OLS_DOMAIN=$domain
OLS_LAN_IP=$lanIp
OLS_PORT=$port
OLS_BIND=$bind
OLS_INTERNAL_PORT=$internal
OLS_HTTP_SPEC=$httpSpec
"@
    WriteLf $envFile $envText
    # restrict .env to the current user
    try { & icacls.exe $envFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null } catch { Warn 'Could not restrict .env permissions.' }

    $deployDir = Join-Path $OlsDir 'deploy'
    if (-not (Test-Path $deployDir)) { New-Item -ItemType Directory -Force -Path $deployDir | Out-Null }
    $t = "`t"
    if ($mode -eq 'domain') {
        $cf = "# generated by install.ps1 (mode: domain)`n{`n${t}email $email`n}`n`n$domain {`n${t}import /etc/caddy/ols-site.caddy`n}`n"
    } elseif ($mode -eq 'local') {
        $cf = "# generated by install.ps1 (mode: local)`n{`n${t}auto_https off`n}`n`nhttp://:$internal {`n${t}import /etc/caddy/ols-site.caddy`n}`n"
    } else {
        $addrs = @()
        foreach ($i in ($lanIp -split ',')) { $addrs += "https://${i}:$internal" }
        $addrs += "https://localhost:$internal"
        $addrs += "https://127.0.0.1:$internal"
        $cf = "# generated by install.ps1 (mode: lan) - self-signed certificate from Caddy's internal CA`n{`n${t}auto_https disable_redirects`n${t}local_certs`n${t}default_sni $(($lanIp -split ',')[0])`n}`n`n$($addrs -join ', ') {`n${t}tls internal`n${t}import /etc/caddy/ols-site.caddy`n}`n"
    }
    WriteLf (Join-Path $deployDir 'Caddyfile') $cf
    Ok '.env and deploy/Caddyfile written'

    # ------------------------------------------------------------ start
    Step 'Building and starting containers'
    Dc up -d --build
    if (-not (Wait-Healthy $mode $port)) {
        Warn "The app did not become healthy within $HealthTimeout seconds."
        Fail "Inspect: cd $OlsDir ; docker compose logs backend caddy"
    }
    Ok 'OLS is responding'

    # The seed only runs while no admin exists, so the plaintext password is no longer needed.
    $lines = Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -like 'ADMIN_PASSWORD=*') { 'ADMIN_PASSWORD=' } else { $_ } }
    WriteLf $envFile (($lines -join "`n") + "`n")
    Ok 'Admin password applied and removed from .env'

    if ($mode -eq 'domain') {
        $ErrorActionPreference = 'Continue'
        & curl.exe -fsS -m 15 "https://$domain/api/health" 2>$null | Out-Null
        $domExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($domExit -ne 0) {
            Warn "https://$domain is not reachable yet - check the DNS A record and ports 80/443; Caddy retries certificate issuance automatically (docker compose logs caddy)."
        }
    }
    Show-Summary $mode $port $domain $lanIp
}

Install-OLS
