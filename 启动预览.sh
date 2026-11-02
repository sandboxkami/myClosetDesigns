#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-8000}"
URL="http://127.0.0.1:${PORT}/"
HEALTH="${URL}__preview_health"
LOG="/tmp/cabinet-preview-server.log"
SERVER="预览服务器.py"

if ! curl -fsS "$HEALTH" >/dev/null 2>&1; then
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "端口 ${PORT} 已被其他预览服务占用；请先关闭旧服务，再重新运行本脚本。" >&2
    exit 1
  fi

  echo "启动本地预览服务：${URL}"
  nohup python3 "$SERVER" "$PORT" >"$LOG" 2>&1 &
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$HEALTH" >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done
fi

if ! curl -fsS "$HEALTH" >/dev/null 2>&1; then
  echo "服务启动失败，请查看日志：${LOG}" >&2
  exit 1
fi

if command -v firefox >/dev/null 2>&1; then
  firefox "$URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  echo "请在浏览器中打开：${URL}"
fi
