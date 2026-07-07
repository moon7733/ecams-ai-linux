# Azbrain 전환 결정 메모

## 2026-07-07

- 사용자는 단순 Vue 3, Spring Boot, PostgreSQL 전환이 아니라 프로젝트 자체를 Azbrain이라는 이름의 제품으로 바꾸고 싶다고 했다.
- Azbrain의 목표는 고객사 유지보수 지식, 히스토리, 회의록, 이슈, 수정 내용, 소스 분석, 특이사항, 접속 정보까지 한 시스템에서 관리하는 것이다.
- UI는 기존 화면 유지가 아니라 노션처럼 편하고 문서 중심적인 UI로 개편하는 방향을 선택했다.
- 현재 eCAMS AI의 강점은 고객사 소스 분석, 답변, 오류 원인 확인이므로 이 기능은 Azbrain의 분석 엔진으로 흡수한다.
- 고객사별로 오래 쌓인 맥락과 담당자 교체로 사라지는 지식을 보존하는 것이 핵심 가치다.
- AI는 대화와 문서를 자동으로 분류하고, 나중에 자연어 질문으로 다시 찾아주는 역할을 맡는다.
- 로컬 PC 비밀번호 같은 민감 정보도 저장 대상에 포함될 수 있으므로 일반 지식과 분리하고 암호화, 권한, 감사 로그를 필수로 둔다.
- 1차 제품은 완전한 노션 복제가 아니라 고객사 워크스페이스, 히스토리 페이지, AI 검색, 기존 소스 분석 연결에 집중한다.

## 2026-07-07 (오후 — plan.md 보강)

- 사용자 확인. Node.js를 금지한 것이 아니라, 회사 신규 제품들이 Vue 3 + Spring Boot 스택이라 코드 일관성을 위해 정렬하는 것이 목적이다.
- 따라서 strangler-fig 패턴으로 점진 전환. Node 엔진(graphify, tree-sitter 등)은 Java 포팅 없이 내부 분석 서비스로 유지.
- plan.md에 다음 항목을 추가 보강했다.
  - 전환 전략 섹션 (Node 금지 아님 명시, strangler-fig 패턴, 스트리밍 홉 문제).
  - 아키텍처 다이어그램에 역할 주석, 스트리밍 직결 경로 추가.
  - 기존 데이터 이전 대상 목록 (9개 데이터 소스별 이전 방식).
  - 인증 전환 계획 (bcryptjs → jBCrypt 호환, JWT 채택).
  - 프론트엔드 전환 계획 (272KB index.html → Vue 3 재구축).
  - 단계별 전환을 현실적 4단계로 재구성. 1단계 = 대화 Postgres 저장(가장 높은 가성비).
  - 예상 기간에 전제 조건(1인 개발, 유지보수 병행) 명시.
  - 미해결 결정 5건 목록화 (스트리밍 경로, 한국어 검색, 에디터, 통신 방식, 세션 관리).
  - Deployment 전환 계획 (docker-compose 단계별 서비스 추가).
  - 한국어 full-text 검색 시 pgroonga/pg_bigm 확장 필요 주의점 추가.

### Google OAuth 결정 (확정)

- PMS와 동일한 Google OAuth client를 사용한다.
- 허용 도메인은 @azsoft.kr만. PMS도 동일하게 제한되어 있다.
- 고객사 사용자(userType: "customer", 예: 선동준/광주은행)는 @azsoft.kr이 아니므로 Google OAuth 대상 외. 고객사 접근이 필요하면 별도 방식(초대 링크 등)을 나중에 검토.

## 2026-07-07 (오후 — Codex 검토 반영)

- 실제 코드를 확인한 결과 대화 히스토리는 이미 `/api/chat/history` 서버 API와 `logs/chat_history/*.json` 파일 저장소를 사용하고 있었다. localStorage는 캐시다.
- 1단계 목표를 "대화 히스토리 서버 저장 신규 구축"에서 "기존 대화 히스토리 API를 유지한 PostgreSQL 저장소 이전"으로 수정했다.
- PostgreSQL 연결이 가능하면 DB를 우선 사용하고, 실패하면 기존 파일 저장소로 fallback하는 방식을 채택했다.
- 1차 스트리밍 경로는 분석 스트리밍만 Node를 경유하는 방식으로 확정했다. 브라우저 직접 포트 노출은 nginx 또는 Spring 프록시로 숨기는 방향이다.
- Google OAuth 확정 사항을 인증 전환 계획에 반영했다. 사내 사용자는 `@azsoft.kr` Google OAuth, 고객사 사용자는 기존 계정 또는 별도 초대 방식을 검토한다.
- 1단계 구현으로 `chatHistoryDb.js`, `db/init/001_chat_history.sql`, `scripts/migrateChatHistoryToPostgres.js`를 추가했다.
- `docker compose up -d postgres`로 PostgreSQL 컨테이너를 띄워 `chat_sessions`, `chat_messages` 쓰기/읽기 smoke 검증을 완료했다. 검증 후 테스트 행은 삭제하고 컨테이너는 stop 상태로 돌렸다.

## 2026-07-07 (오후 — PostgreSQL 서버 정정)

- 사용자가 지정한 실제 PostgreSQL 대상은 Docker 내부 DB가 아니라 192.168.0.21 서버다.
- 실제 접속 기본값은 `PGHOST=192.168.0.21`, `PGDATABASE=postgres`, `PGUSER=azbrain`이다.
- 로컬 Docker Postgres는 smoke 검증용으로만 사용한 것으로 정정했다.
- docker-compose에서 로컬 postgres 서비스를 제거하고, `ecams-ai` 컨테이너가 `PGHOST=192.168.0.21` 외부 DB에 접속하도록 수정했다.
- 외부 DB는 docker-entrypoint init SQL이 실행되지 않으므로, 앱 연결 시 `db/init/001_chat_history.sql`을 실행해 chat history 스키마를 보장하도록 했다.
- 테이블 생성이 `/api/chat/history` 첫 호출 전까지 지연되지 않도록, 서버 기동 시 `chatHistoryDb.init()`으로 스키마 생성 여부를 바로 확인하도록 보강했다.
