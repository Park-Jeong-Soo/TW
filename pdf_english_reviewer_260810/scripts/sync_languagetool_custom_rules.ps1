$source = "config\languagetool\grammar_custom.xml"
$targetCandidates = @(
    "engines\languagetool\org\languagetool\rules\en",
    "engines\languagetool\LanguageTool-6.6\org\languagetool\rules\en"
)
$targetDir = $targetCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($targetDir) {
    Copy-Item $source (Join-Path $targetDir "grammar_custom.xml") -Force
    Write-Host "grammar_custom.xml synced to $targetDir."
} else {
    Write-Host "LanguageTool English rule directory not found. Please verify the installation path."
}
