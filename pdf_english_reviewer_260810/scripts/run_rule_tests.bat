@echo off
cd /d "%~dp0.."
.venv\Scripts\python.exe -m unittest tests.test_team_rules tests.test_issue_evidence tests.test_rule_feedback tests.test_vale_integration -v
