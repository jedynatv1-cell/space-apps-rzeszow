# Join this laptop to the team Tailscale network (one time per laptop).
# Run from the repo folder:  powershell -ExecutionPolicy Bypass -File .claude\scripts\tailscale-join.ps1
# It installs Tailscale if needed, names the device laptop-l<N> from .claude/role.local.json,
# opens the browser to sign in (use "Sign in with GitHub" -> the team account), then tests L1.
$ErrorActionPreference = 'Stop'

$root = git rev-parse --show-toplevel
$roleFile = Join-Path $root '.claude/role.local.json'
if (-not (Test-Path $roleFile)) { throw "No .claude/role.local.json: run /setup-laptop first." }
$laptop = (Get-Content $roleFile -Raw | ConvertFrom-Json).laptop
$name = "laptop-$($laptop.ToLower())"

$ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if (-not (Test-Path $ts)) {
    Write-Host "Installing Tailscale (approve the Windows prompt)..."
    winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
    Start-Sleep -Seconds 5
}
if (-not (Test-Path $ts)) { throw "Tailscale did not install. Get it from https://tailscale.com/download/windows and re-run." }

Write-Host "Joining as $name. A browser window opens: choose 'Sign in with GitHub' and use the TEAM account."
& $ts up --hostname=$name --reset
& $ts status
Write-Host "This laptop's Tailscale IP: $(& $ts ip -4)"

if ($laptop -ne 'L1') {
    Write-Host "Testing the shared server on L1..."
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 'http://laptop-l1:3000/api/health'
        Write-Host "OK: $($r.Content)"
        Write-Host "Use http://laptop-l1:3000 from now on."
    } catch {
        Write-Host "L1 not reachable yet: is L1 joined, running cargo run, and are its firewall Block rules removed?"
    }
}
