# GitHub Poll 배포 계획

## 목표

GitHub에서 내부망 서버 `192.168.0.11`로 웹훅이 직접 닿지 않는 상황에서 Jenkins가 2분마다 원격 저장소 변경을 polling하고, 새 커밋이 있으면 자동으로 Docker 빌드·기동을 수행한다.

## 구현

1. `Jenkinsfile` 추가.
   - `pollSCM('H/2 * * * *')`로 2분 간격 변경 감지.
   - `main` 브랜치만 배포.
   - SSH credentials로 `192.168.0.11`에 접속.
   - 서버의 배포 디렉터리에서 `git pull --ff-only` 후 `scripts/deploy.sh` 실행.
2. `scripts/deploy.sh` 추가.
   - 배포 서버에서 실행.
   - 이전 커밋과 현재 커밋이 같으면 종료.
   - 변경이 있으면 `docker compose build ecams-ai` 후 `docker compose up -d`.
   - `/api/companies`로 헬스체크.
3. `docker-compose.yml` 포트 매핑을 `ECAMS_HTTP_PORT` 환경변수로 오버라이드 가능하게 변경.

## 전제

- Jenkins job은 이 GitHub repo를 SCM으로 바라본다.
- Jenkins credential ID는 기본 `pms-deploy-ssh-key`를 재사용한다.
- 배포 서버 경로는 기본 `/SW2/ecams-ai-linux`다.
- 서버의 해당 디렉터리는 git clone 되어 있고, Docker Compose 사용 가능해야 한다.
