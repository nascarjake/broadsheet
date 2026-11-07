#!/bin/zsh
cd "$(dirname "$0")" || exit 1
PORT=8767
if /usr/sbin/lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. If Broadsheet is running, open http://127.0.0.1:$PORT"
  echo "Otherwise close the process or run python3 server.py --port 8768."
  read "?Press Enter to close."
  exit 1
fi
(sleep 1; open "http://127.0.0.1:$PORT") &
echo "Keep this window open while reading. Press Control-C to stop Broadsheet."
python3 server.py --port "$PORT"
