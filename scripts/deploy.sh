#!/usr/bin/env bash
# eCAMS AI Linux 배포 서버에서 Docker Compose 빌드와 기동을 수행하는 스크립트
set -euo pipefail

PORT="${ECAMS_HTTP_PORT:-3000}"
PREV_HEAD="${1:-}"
CURR_HEAD="$(git rev-parse HEAD)"

if [ -n "${PREV_HEAD}" ] && [ "${PREV_HEAD}" = "${CURR_HEAD}" ]; then
  echo "[deploy] no new commit. skip."
  exit 0
fi

echo "[deploy] previous=${PREV_HEAD:-none} current=${CURR_HEAD}"
if [ -n "${PREV_HEAD}" ]; then
  echo "[deploy] changed files:"
  git diff --name-only "${PREV_HEAD}" "${CURR_HEAD}" || true
fi

echo "[deploy] build images (ecams-ai + pms-bridge)..."
# pms-bridge 는 소스가 이미지에 COPY-baked 라 build 대상에 넣어야 pmsGemini.js/pmsBridge.js 변경이 반영된다.
ECAMS_HTTP_PORT="${PORT}" docker compose build ecams-ai pms-bridge

echo "[deploy] start containers on :${PORT}..."
ECAMS_HTTP_PORT="${PORT}" docker compose up -d

echo "[deploy] waiting for app health..."
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:${PORT}/api/companies" >/dev/null 2>&1; then
    echo "[deploy] healthcheck OK (attempt ${i})"
    # pms-bridge 헬스(비치명적) — 실패해도 배포는 성공 처리. 8790 은 compose 에서 호스트 공개.
    if curl -fsS "http://localhost:${PMS_BRIDGE_PORT:-8790}/pms/health" >/dev/null 2>&1; then
      echo "[deploy] pms-bridge health OK"
    else
      echo "[deploy] WARN: pms-bridge health check failed (배포는 계속)" >&2
    fi
    echo "[deploy] prune dangling docker images..."
    docker image prune -f
    exit 0
  fi
  sleep 2
done

echo "[deploy] healthcheck FAILED after 30 attempts (~60s)" >&2
docker compose logs --tail=120 ecams-ai >&2 || true
exit 1
