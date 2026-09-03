# Checklist — 이미지 선판독·캐시·정밀분석 분리

## 설계

- [x] 현재 AzBrain 채팅 이미지 경로를 `runChatJob`·`buildPrompt`·`runAgyOnce` 기준으로 확인한다.
- [x] 현재 PMS WBS Vision 경로를 `pmsBridge`·`pmsGemini.extractWbs` 기준으로 확인한다.
- [x] OCR·텍스트 LLM·Vision 역할과 PMS/AzBrain 소유 경계를 문서화한다.
- [x] hash/version 캐시, 좌표, confidence, secret 경계를 정의한다.
- [x] Phase 0~5 단계와 수용 지표를 정의한다.

## 승인 전 게이트

- [ ] PP-OCRv5 라이선스와 한국어 모델 배포 방식을 확인한다.
- [ ] Python sidecar/ONNX/Node 호출 중 운영 Linux에 맞는 배포 방식을 결정한다.
- [ ] OCR 의존성·컨테이너 추가 승인을 받는다.
- [ ] AzBrain 채팅 이미지 파생물의 저장소·TTL·사용자 격리 정책을 확정한다.
- [ ] PMS `/pms/image-extract` 물리 API와 service token·크기 제한을 확정한다.
- [ ] 전체 이미지 외부 전송과 redacted crop 전송의 승인 경계를 확정한다.

## Phase 0 — 벤치마크

- [ ] 대표 이미지 100장 이상과 정답 텍스트·box fixture를 만든다.
- [ ] Windows OCR baseline을 같은 fixture로 다시 측정한다.
- [ ] PP-OCRv5 한국어 후보의 cold/warm, CPU/GPU 시간을 측정한다.
- [ ] 현재 Gemini/AGY Vision의 정확도·P50/P95·비용을 측정한다.
- [ ] 업무 토큰 exact match, box recall, CER, confidence calibration을 비교한다.
- [ ] engine·tile·전처리·fallback 기준을 확정한다.

## Phase 1 — shadow OCR

- [ ] `OcrAdapter`와 worker warm-up/readiness를 구현한다.
- [ ] EXIF·deskew·dark mode·tile 좌표 복원을 구현한다.
- [ ] 현재 채팅 응답은 유지하고 OCR 결과와 latency만 shadow 계측한다.
- [ ] 원문·base64·secret 로그가 남지 않는 회귀시험을 추가한다.

## Phase 2 — AzBrain 채팅

- [ ] 이미지 SHA-256과 `pipelineVersion` 캐시를 구현한다.
- [ ] `OCR_ONLY`, `TEXT_LLM`, `VISION_NEEDED`, `CACHE_HIT` 라우터를 구현한다.
- [ ] OCR 결과를 먼저 보여주고 정밀분석을 별도 상태로 표시한다.
- [ ] 동일 이미지 재질문에서 외부 Vision이 다시 호출되지 않는 시험을 추가한다.
- [ ] 정밀분석을 사용자가 명시적으로 선택할 수 있게 한다.

## Phase 3 — PMS bridge

- [ ] `/pms/image-extract` 요청·응답 검증과 인증을 구현한다.
- [ ] text/region/confidence/version을 반환한다.
- [ ] `/pms/wbs-vision` 기존 응답 호환을 유지한다.
- [ ] 요청 중단·timeout·재시도에도 중복 분석이 한 벌인지 검증한다.
- [ ] bridge health에 OCR worker readiness를 분리 표시한다.

## Phase 4 — PMS 연동

- [ ] PMS outbox와 판독 상태기계를 연결한다.
- [ ] L0d 원시/비밀 제거 파생물과 chunk projection을 분리한다.
- [ ] 이미지·PDF 원본의 검색 문자열 위치 강조를 구현한다.
- [ ] Gmail 본문·첨부의 개인 권한과 공유 행동을 검증한다.
- [ ] 삭제·권한 변경·재분류·extractor version 변경 재색인을 검증한다.

## 완료 게이트

- [ ] 업로드 응답이 OCR/Vision 완료를 기다리지 않는다.
- [ ] READY 검색은 provider 호출 0회다.
- [ ] 원본·OCR 실패가 서로의 저장/다운로드를 깨뜨리지 않는다.
- [ ] secret·무권한 snippet·box 노출 0건이다.
- [ ] 목표 latency와 정확도를 운영 서버에서 재측정한다.
- [ ] feature flag off 롤백과 파생물 재생성을 검증한다.
