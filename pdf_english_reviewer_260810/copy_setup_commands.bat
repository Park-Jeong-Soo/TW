@echo off
setlocal
(
  echo set OLLAMA_NO_CLOUD=1
  echo set OLLAMA_HOST=127.0.0.1:11434
  echo set REVIEWER_OLLAMA_WEB_SEARCH=0
  echo set REVIEWER_OLLAMA_TOOL_CALLING=0
  echo set REVIEWER_HOST=127.0.0.1
  echo set LANGUAGETOOL_URL=http://127.0.0.1:8081/v2/check
  echo set OLLAMA_URL=http://127.0.0.1:11434/api/chat
  echo set OLLAMA_MODEL=qwen2.5:7b
) | clip
echo Approved local-only configuration commands were copied to the clipboard.
