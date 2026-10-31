#!/bin/bash
# playthrough_run.sh — прогон ЧЕСТНОГО прохождения фазами до победы или смерти.
# Сервер + цикл фаз playthrough.mjs (бюджет 480с/фаза), лог в download/playthrough/run.log
cd /home/z/my-project
PORT=3140
BASE="http://localhost:${PORT}"
DIR=/home/z/my-project/download/playthrough
LOG="${DIR}/run.log"

mkdir -p "${DIR}"
: > "${LOG}"

# сервер (убьём старый на этом порту, если висит)
pkill -f "serve.mjs ${PORT}" 2>/dev/null
sleep 1
node scripts/serve.mjs ${PORT} >>"${LOG}" 2>&1 &
SRV=$!
sleep 2

# свежая партия: убрать прошлое состояние фаз
rm -f "${DIR}/phase.json" "${DIR}/localStorage.json"

PHASE=0
MAX_PHASES=14
RC=99
while [ "${PHASE}" -lt "${MAX_PHASES}" ]; do
  PHASE=$((PHASE+1))
  echo "=== ФАЗА ${PHASE}/${MAX_PHASES} — старт $(date +%H:%M:%S) ===" >> "${LOG}"
  timeout 560 node scripts/playthrough.mjs "${BASE}" "${DIR}" 480 >> "${LOG}" 2>&1
  RC=$?
  echo "=== ФАЗА ${PHASE} — exit ${RC} ===" >> "${LOG}"
  # 0 — победа; 1 — смерть; 2 — бюджет исчерпан (продолжаем); 3 — ошибка
  if [ "${RC}" -ne 2 ]; then break; fi
done

echo "=== ИТОГ ПРОГОНА: exit ${RC} (0=победа, 1=смерть, 2=фазы кончились, 3=ошибка), фаз: ${PHASE} ===" >> "${LOG}"
kill ${SRV} 2>/dev/null
exit ${RC}
