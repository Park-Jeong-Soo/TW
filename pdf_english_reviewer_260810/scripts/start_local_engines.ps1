$ErrorActionPreference = "SilentlyContinue"

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        return $result.AsyncWaitHandle.WaitOne(500) -and $client.Connected
    }
    finally {
        $client.Dispose()
    }
}

if (-not (Test-LocalPort 11434)) {
    $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path -LiteralPath $ollama) {
        Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
    }
}

if ($env:LANGUAGETOOL_ENABLED -in @("1", "true", "TRUE", "yes", "YES", "on", "ON") -and -not (Test-LocalPort 8081)) {
    $java = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory |
        Where-Object Name -Like "jre-17*" |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\java.exe" } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1

    $engineRoot = Join-Path $PSScriptRoot "..\engines\languagetool"
    $languageTool = Get-ChildItem $engineRoot -Directory |
        Where-Object Name -Like "LanguageTool-*" |
        Sort-Object Name -Descending |
        Where-Object { Test-Path (Join-Path $_.FullName "languagetool-server.jar") } |
        Select-Object -First 1

    if ($java -and $languageTool) {
        $customRules = Join-Path $PSScriptRoot "..\config\grammar_custom.xml"
        $customRulesTarget = Join-Path $languageTool.FullName "org\languagetool\rules\en\grammar_custom.xml"
        if (Test-Path -LiteralPath $customRules) {
            Copy-Item -LiteralPath $customRules -Destination $customRulesTarget -Force
        }
        $config = Join-Path $engineRoot "server.properties"
        Start-Process -FilePath $java `
            -WorkingDirectory $languageTool.FullName `
            -ArgumentList @(
                "-cp",
                ".;languagetool-server.jar",
                "org.languagetool.server.HTTPServer",
                "--config",
                "`"$config`"",
                "--port",
                "8081"
            ) `
            -WindowStyle Hidden
    }
}
