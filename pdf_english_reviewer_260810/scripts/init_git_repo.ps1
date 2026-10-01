if (Test-Path ".git") {
    Write-Host ".git folder exists. Please verify whether it is a valid repository."
} else {
    git init
}

git add app config tests scripts README.md SETUP_GUIDE.md review_criteria.md requirements.txt run_local.bat run_tests.bat .gitignore
git commit -m "Initialize local PDF reviewer with rule-based review architecture"
