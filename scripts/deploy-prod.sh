#!/usr/bin/env bash
# 로컬 Mac (mac04) 에서 Next.js 대시보드를 빌드하고 launchd 서비스를 재기동한다.
# 외부 노출은 cloudflared tunnel 이 https://meritz-dash.madup-dct.site 로 처리한다.
# (이전 Vercel 배포 흐름은 2026-04-27 이관으로 폐기됨.)
set -euo pipefail

cd "$(dirname "$0")/.."

LABEL="com.madup.meritz-dash"
PORT="8770"

echo "[deploy] 1/3 npm run build"
npm run build

echo "[deploy] 2/3 launchctl kickstart $LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

# 부팅이 끝날 시간을 짧게 줌
sleep 3

echo "[deploy] 3/3 헬스체크 (127.0.0.1:$PORT)"
for i in 1 2 3 4 5; do
  if curl -sf --max-time 5 -o /dev/null "http://127.0.0.1:$PORT/login"; then
    echo "[deploy] OK — http://127.0.0.1:$PORT 응답 정상"
    echo "[deploy] 외부: https://meritz-dash.madup-dct.site"
    exit 0
  fi
  echo "[deploy] 헬스체크 재시도 $i/5"
  sleep 2
done

echo "[deploy] FAIL — 헬스체크 5회 실패. 로그: .logs/next.err.log" >&2
tail -30 .logs/next.err.log >&2 || true
exit 1
