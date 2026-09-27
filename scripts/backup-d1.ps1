$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path $PSScriptRoot "..\worker\backup-$stamp.sql"
npx wrangler d1 export ROOMIE_DB --remote --config worker/wrangler.jsonc --output $output
Write-Output "Backup saved to $output"
