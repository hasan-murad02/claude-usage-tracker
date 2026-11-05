# Installs the usage-tracker plugin for the current user (all projects) and saves the ingest token.
# Usage: .\install.ps1 -Token <INGEST_TOKEN> [-Name "Display Name"]
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Name
)

claude plugin marketplace add hasan-murad02/claude-usage-tracker --scope user
claude plugin install usage-tracker@claude-usage-tracker --scope user

$dir = Join-Path $HOME '.claude\usage-tracker'
New-Item -ItemType Directory -Force $dir | Out-Null
$config = @{ token = $Token }
if ($Name) { $config.name = $Name }
$config | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $dir 'config.json')

Write-Host 'Done. Restart Claude Code (or run /reload-plugins in open sessions).'
