param([switch]$Check)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
try {
    $projectDirectory = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $projectDirectory
    $candidates = @()
    $installedNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($installedNode) { $candidates += $installedNode.Source }
    $candidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
    $candidates += (Join-Path (Split-Path -Parent $projectDirectory) 'deepseek-harness-runtime\node-v24.14.0-win-x64\node.exe')
    $nodePath = $null
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (!(Test-Path -LiteralPath $candidate)) { continue }
        $nodeVersion = & $candidate -p 'process.versions.node'
        if ($LASTEXITCODE -eq 0 -and [version]$nodeVersion -ge [version]'22.13.0') { $nodePath = $candidate; break }
    }
    if (!$nodePath) { throw '没有找到可用的 Node.js（需要 22.13 或更高版本）。请先安装 Node.js LTS，再双击本文件。' }
    $env:Path = (Split-Path -Parent $nodePath) + ';' + $env:Path
    if (!(Test-Path -LiteralPath (Join-Path $projectDirectory 'node_modules\expo\bin\cli'))) {
        if ($Check) { throw '项目依赖尚未安装。正常双击启动文件会自动安装。' }
        $npmPath = Join-Path (Split-Path -Parent $nodePath) 'npm.cmd'
        if (!(Test-Path -LiteralPath $npmPath)) { throw '未找到 npm.cmd，请重新安装 Node.js LTS。' }
        Write-Host '首次启动：正在安装项目依赖，请保持联网并等待……' -ForegroundColor Cyan
        & $npmPath ci
        if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重新双击启动文件。' }
    }
    $launcherArgs = @((Join-Path $PSScriptRoot 'start-app.cjs'))
    if ($Check) { $launcherArgs += '--check' }
    & $nodePath @launcherArgs
    exit $LASTEXITCODE
} catch {
    Write-Host ''
    Write-Host ('启动失败：' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
