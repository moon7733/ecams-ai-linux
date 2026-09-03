# Context Notes — 이미지 선판독·캐시·정밀분석 분리

## 2026-09-04

### 확인한 현재 구현

- `server.js`의 `runChatJob`은 채팅 이미지를 `os.tmpdir()`에 저장하고 답변 뒤 삭제한다.
- `buildPrompt`는 이미지 경로를 전체 prompt에 붙이고 `runAgyOnce`는 `gemini-3.7-flash`, `effort=high`로
  이미지와 코드 질문을 한 번에 처리한다.
- 이미지가 포함된 답변은 answer cache 저장에서 제외되며 별도 OCR/이미지 파생물 캐시는 없다.
- `pmsGemini.extractWbs`는 전체 base64 이미지를 `PMS_VISION_MODEL`에 보내 구조화 JSON을 받는다.
- `pmsBridge`의 현재 이미지 API는 `/pms/wbs-vision` 하나이고 범용 OCR endpoint는 없다.
- `package-lock.json`에는 `tesseract.js`가 보이지만 제품 코드의 OCR 실행 경로는 확인되지 않았다.

### 확정한 방향

1. 검색·문자 추출과 이미지 의미 분석은 다른 작업이다.
2. 로컬 OCR은 등록/수신 때 한 번 실행하고 검색 때는 색인만 조회한다.
3. OCR 파생물은 원본과 분리하고 hash+pipelineVersion으로 재생성·재사용한다.
4. Gemini/AGY Vision은 제거하지 않고 표·도식·일반 장면·낮은 신뢰도·정밀분석에 제한한다.
5. 기본 자동 경로에서 사고모델/high effort를 사용하지 않는다.
6. PMS 자료는 PMS가 원본·권한·상태·검색 projection을 소유하고 AzBrain은 판독 서비스만 제공한다.
7. 고객사·프로젝트 연결은 Gmail 개인 원문의 공유 근거가 아니다.
8. 현재 `PMS_BRIDGE_CONTRACT.md`는 구현 승인 전까지 유효하며 이 문서는 후속 변경안이다.

### Graphify 적용 결과

두 저장소에 기존 `graphify-out/graph.json`이 없어 저장된 graph query는 사용할 수 없었다. 관련 설계와
실제 진입점만 직접 대조했다. PMS의 L0/L0d·검색 outbox 원칙과 AzBrain의 현재 멀티모달 경로를 연결해,
원본 소유와 판독 서비스 소유가 뒤섞이지 않도록 계획을 나눴다.

### 아직 확정하지 않은 것

- PP-OCRv5를 Python sidecar로 둘지 ONNX/다른 런타임으로 감쌀지.
- 운영 서버 CPU/GPU/NPU에서 얻을 수 있는 실제 P50/P95.
- AzBrain 채팅 이미지 OCR 캐시의 PostgreSQL/파일 저장 방식과 TTL.
- WBS에서 OCR+레이아웃 모델이 기존 Gemini Vision 정확도를 대체할 수 있는지.
- 전체 이미지 외부 전송을 계속 허용할 유형과 redacted crop만 허용할 유형.
- 모바일 앱이 생길 경우 ML Kit 선판독 결과를 서버가 신뢰할지 재검증할지.

위 항목은 사내 fixture 벤치마크와 보안/의존성 승인 전에는 코드 상수나 운영 계약으로 확정하지 않는다.
