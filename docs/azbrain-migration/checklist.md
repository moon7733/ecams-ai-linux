# Azbrain 전환 체크리스트

## 설계 (완료)

- [x] 제품 방향을 Azbrain으로 재정의.
- [x] 노션형 UI 개편 방향 반영.
- [x] 유지보수 지식관리, 히스토리 관리, 소스분석 통합 목표 정리.
- [x] 민감 정보 저장 원칙 초안 작성.
- [x] strangler-fig 전환 전략 확정 (Node 금지 아님, 표준 정렬 목적).
- [x] 기존 데이터 이전 대상 목록 작성.
- [x] 인증 전환 방식 초안 작성 (bcrypt 호환, JWT).
- [x] 프론트엔드 전환 방향 확정 (272KB index.html → Vue 3 재구축).

## 1단계: 대화 히스토리 PostgreSQL 이전

- [x] PostgreSQL 대상 서버를 192.168.0.21 외부 DB로 정정.
- [x] chat_sessions / chat_messages 테이블 설계.
- [x] 앱 연결 시 chat history 스키마 자동 보장.
- [x] 기존 Node 대화 저장/조회 API를 PostgreSQL 우선 저장소로 연결.
- [x] DB 연결 실패 시 기존 파일 저장소 fallback 유지.
- [x] logs/chat_history/*.json → PostgreSQL 이전 스크립트 추가.
- [x] PostgreSQL DB 어댑터 쓰기/읽기 smoke 검증.
- [x] 앱 API 통합 검증.

## 2단계: Spring Boot 정문 + Vue 3 UI

- [x] Spring Boot 프로젝트 생성 방식 확정.
- [x] Spring Security + JWT 인증 구현.
- [x] users.json, companies.json, repos.json → PostgreSQL 이전 스크립트.
- [x] Vue 3 프로젝트 생성 방식 확정.
- [ ] 기존 핵심 화면(소스 업로드, 분석, 채팅, 결과 조회) Vue 3 재구축.
- [ ] Spring Boot ↔ Node worker 간 REST 연결.
- [x] 스트리밍 경로 결정. 1차는 분석 스트리밍만 Node 경유, 포트는 프록시로 숨김.
- [x] docker-compose에 Spring Boot 컨테이너 추가.

## 3단계: pgvector 자동분류 · 의미검색

- [ ] pgvector 확장 설치 및 embeddings 테이블 생성.
- [ ] 한국어 full-text 검색 확장 결정 (pgroonga vs. pg_bigm).
- [ ] 수집 파이프라인 구현 (업로드 → 분류 → 저장).
- [ ] 벡터 + full-text 하이브리드 검색 구현.
- [ ] 고객사 워크스페이스 화면 IA 확정.
- [ ] 고객사별 워크스페이스, 히스토리 페이지 구현.
- [ ] answer_cache.json, knowledge/ → knowledge_items 이전.
- [ ] AI 자동 분류 규칙과 저장 정책 설계.

## 4단계: 노션형 페이지 · 고도화

- [ ] 에디터 라이브러리 PoC (Tiptap 권장).
- [ ] 노션형 블록 에디터 도입.
- [ ] 회의록 자동 요약, 소스 변경 연결.
- [ ] 장애 이슈 타임라인.
- [ ] 민감 정보 암호화와 감사 로그 설계.
- [ ] 고객사별 운영 지식 자동 분류.
