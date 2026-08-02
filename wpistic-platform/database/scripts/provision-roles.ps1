$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:DATABASE_ADMIN_URL)) {
  throw 'DATABASE_ADMIN_URL must be set to a migration-owner connection string.'
}
if ([string]::IsNullOrWhiteSpace($env:WPISTIC_APP_PASSWORD)) {
  throw 'WPISTIC_APP_PASSWORD must be set outside source control.'
}

# Send the password through stdin so it is not embedded in the command line or repository.
$escapedPassword = $env:WPISTIC_APP_PASSWORD.Replace("'", "''")
$sql = "ALTER ROLE wpistic_app LOGIN PASSWORD '$escapedPassword';"
$sql | & psql $env:DATABASE_ADMIN_URL -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL role provisioning failed with exit code $LASTEXITCODE."
}

Write-Output 'wpistic_app is provisioned for the API connection. Keep migration-owner credentials separate.'
