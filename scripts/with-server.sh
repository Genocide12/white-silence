#!/bin/bash
# with-server.sh — поднимает статический сервер, ждёт готовности, выполняет команду, глушит сервер.
# Все в одном вызове: фоновые процессы песочницы не переживают конец команды.
# Использование: with-server.sh <корень_проекта> <порт> <команда...>
ROOT_DIR="$1"; PORT="$2"; shift 2
cd "$ROOT_DIR" || { echo "no root: $ROOT_DIR"; exit 1; }
node scripts/serve.mjs "$PORT" > "/tmp/serve-$PORT.log" 2>&1 &
SRV=$!
READY=0
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then READY=1; break; fi
  sleep 0.25
done
if [ "$READY" != "1" ]; then echo "server on :$PORT not ready"; kill $SRV 2>/dev/null; exit 2; fi
"$@"
RC=$?
kill $SRV 2>/dev/null
wait $SRV 2>/dev/null
exit $RC
