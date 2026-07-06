# GitHub Poll 배포 컨텍스트 노트

## 2026-07-06

- 사용자는 GitHub push 후 `192.168.0.11` 서버에서 Docker를 직접 내리고 올리는 작업이 번거롭다고 했다.
- GitHub에서 내부망 서버로 웹훅이 직접 닿지 않을 가능성이 높아, 2분 polling 방식 요청.
- `C:\pms\pms` 확인 결과 `Jenkinsfile`이 SSH로 `192.168.0.11`에 접속해 `/SW2/pms`에서 `git pull --ff-only` 후 `scripts/deploy.sh`를 실행하는 구조다.
- 같은 구조를 eCAMS repo에 적용하되, webhook 대신 `pollSCM('H/2 * * * *')`를 둔다.
- 배포 기본값은 `DEPLOY_HOST=192.168.0.11`, `DEPLOY_USER=pms`, `DEPLOY_DIR=/SW2/ecams-ai-linux`, `DEPLOY_PORT=3000`, `DEPLOY_CREDENTIALS_ID=pms-deploy-ssh-key`로 둔다.

## 검증

- `C:\Program Files\Git\bin\bash.exe -n scripts/deploy.sh` 통과.
- `node --check server.js` 통과.
- `git diff --check` 통과. 줄끝 CRLF 경고만 있음.
- Jenkinsfile은 로컬에 `groovy`가 없어 실제 Jenkins 파서 검증은 못 했다. PMS Jenkinsfile과 같은 Declarative Pipeline 구조를 사용했다.
