# Vue 3, Spring Boot, PostgreSQL 전환 결정 메모

## 2026-07-07

- 현재 구조는 Node/Express 단일 서버, 단일 HTML 프론트, JSON 파일 저장 방식으로 확인했다.
- 전환은 단순 프레임워크 교체가 아니라 프론트엔드, 백엔드, 영속 저장소를 함께 나누는 재구성 작업으로 판단했다.
- 기존 `/api` 경로와 응답 형태는 1차 전환에서 최대한 유지하는 방향이 안전하다.
- PostgreSQL에는 운영 메타데이터와 사용자 생성 데이터를 우선 저장한다.
- 인덱스, 위키, graphify, workspace 원본처럼 큰 산출물은 1차에서 파일시스템에 유지한다.
- Node 기반 분석 빌더는 즉시 Java로 재작성하지 않고 Spring Boot에서 외부 프로세스 또는 별도 worker로 호출하는 방식을 우선 검토한다.
- 예상 기간은 최소 2주, 기능 보존과 운영 마이그레이션을 포함하면 2주에서 4주 이상으로 잡는다.

## 2026-07-07

- 1차 마이그레이션 PoC는 신규 Spring Boot 코드보다 먼저 Node 스크립트로 작성했다. 현재 런타임에 이미 `pg` 의존성이 있고, 실제 원본 JSON 구조를 그대로 읽어 검증하기 쉽기 때문이다.
- 사용자, 고객사, 저장소, 레포 권한, 고객사 권한, 접근 요청은 `db/init/002_core_identity.sql` 기준으로 매핑한다.
- `repos.json`의 `companyId: "none"`은 외래키를 깨지 않도록 `repositories.company_id = null`로 저장한다.
- 가입 요청 payload에는 평문 비밀번호 원문을 남기지 않는다.

## 2026-07-07

- Spring Boot 전환 구조는 `backend/` 독립 Maven 모듈로 확정했다. 기존 Node 앱은 당분간 그대로 실행하고, Spring API는 8080 포트의 새 서비스로 병행 검증한다.
- 첫 컨트롤러는 기존 UI 계약과 맞추기 위해 `/api/login`, `/api/companies`, `/api/repos/all`, `/api/repos`만 구현한다.
- JPA 엔티티보다 `JdbcTemplate`을 먼저 사용한다. 기존 JSON에서 이전한 테이블 형태가 단순하고, 응답 계약 보존이 우선이기 때문이다.
