# Plan — 이미지 선판독·캐시·정밀분석 분리

## 결정

AzBrain의 이미지 처리를 `이미지 1장 → 범용 시각 모델 1회`로 고정하지 않는다. 사진이 들어오면
로컬 OCR과 품질 판정을 먼저 수행하고, 검색·문자 질문은 그 결과로 처리한다. 표·도식·일반 장면 이해,
낮은 OCR 신뢰도, 사용자의 정밀분석 요청만 Gemini/AGY 멀티모달 경로로 올린다.

이 문서는 구현안이다. 현재 `PMS_BRIDGE_CONTRACT.md`와 운영 API를 아직 바꾸지 않으며, 실제 라이브러리·
sidecar·DB 스키마 도입은 오너의 의존성/마이그레이션 승인과 Phase 0 벤치마크 뒤에 확정한다.

## 현재 상태와 지연 원인

현재 AzBrain 채팅 이미지는 다음 경로를 탄다.

```text
/api/chat images[]
  → runChatJob이 os.tmpdir()에 원본 저장
  → buildPrompt가 전체 이미지 경로를 prompt에 추가
  → runAgyOnce(gemini-3.7-flash, effort=high)가 이미지와 질문을 한 번에 분석
  → 답변 뒤 임시파일 삭제
```

- `server.js`의 `runChatJob`은 이미지 해시·OCR·파생물 캐시 없이 매번 새 임시파일을 만든다.
- 이미지가 있으면 기존 답변 캐시 저장 대상에서도 제외된다.
- `runAgyOnce`는 이미지의 단순 문자 판독에도 전체 에이전트 탐색과 high effort를 함께 사용한다.
- PMS WBS는 `pmsGemini.extractWbs()`가 전체 base64 이미지를 Gemini에 직접 보내고 최대 8,192 출력 토큰을 연다.
- 따라서 같은 사진·같은 질문도 매번 업로드·시각 인코딩·추론·생성을 반복한다. 사용자가 관측한
  약 15초와 사고모델 약 30초는 검색 인덱스 조회가 아니라 매 요청 전체 추론을 수행한 결과다.

## 목표

1. 사진 속 한글·영문·숫자·오류코드를 빠르고 재현 가능하게 추출한다.
2. 같은 이미지·같은 파이프라인 버전은 한 번만 분석한다.
3. 문자 중심 질문은 시각 LLM 호출 없이 답할 수 있게 한다.
4. 시각적 의미·레이아웃이 필요한 요청은 기존 멀티모달 품질을 유지한다.
5. PMS가 사용할 때는 PMS가 원본·상태·권한·검색 색인을 소유하고 AzBrain은 판독 서비스만 제공한다.
6. 단계별 latency와 fallback 이유를 계측해 체감속도와 정확도를 함께 비교한다.

## 범위 밖

- 이번 문서 작업에서 OCR 패키지 설치, 컨테이너 변경, DB migration, 운영 재시작은 하지 않는다.
- OCR 결과를 사용자 확인 없이 PMS 지식 정본으로 승격하지 않는다.
- 사진 원본을 검색 DB나 로그에 base64로 저장하지 않는다.
- 일반 사진 장면검색과 사내 문서 OCR을 하나의 정확도 지표로 뭉치지 않는다.

## 제안 아키텍처

```text
이미지 수신
  → MIME/크기/EXIF 검증
  → SHA-256 + pipelineVersion 캐시 조회
      ├─ HIT  → 저장된 OCR/route 사용
      └─ MISS → 전처리 → 로컬 OCR → 품질·유형 판정 → 파생물 캐시
                            ├─ OCR_ONLY      → OCR 텍스트로 답변/검색
                            ├─ TEXT_LLM      → redacted OCR만 텍스트 모델에 전달
                            └─ VISION_NEEDED → 승인된 crop/원본을 시각 모델에 전달
```

### 구성요소

| 구성요소 | 책임 | 소유 |
|---|---|---|
| `ImageIngest` | MIME·크기·방향 검증, 해시 계산, 임시파일 수명 | AzBrain |
| `OcrAdapter` | 로컬 OCR 실행, text/box/confidence 반환 | AzBrain sidecar 또는 worker |
| `ImageQualityRouter` | 텍스트 중심/표/도식/일반사진, 신뢰도, fallback 이유 결정 | AzBrain |
| `ImageDerivativeCache` | hash+version별 OCR·좌표·품질 결과 재사용 | AzBrain. 저장소는 Phase 0 뒤 확정 |
| `VisionAnalyzer` | WBS·표·도식·일반 장면과 낮은 신뢰도 정밀분석 | 기존 Gemini/AGY 경로 |
| `PmsImageExtractionClient` | PMS bridge용 stateless 판독 API | AzBrain pmsBridge |
| 원본·검색 projection | 첨부/Gmail 원본, 권한, 상태, chunk 색인, 하이라이트 | PMS |

PMS 영구 검색의 source of truth는 PMS다. AzBrain 캐시는 성능 최적화일 뿐이며 지워져도 PMS 원본과
outbox로 재생성할 수 있어야 한다. AzBrain 채팅 이미지의 캐시 수명·사용자 격리는 별도 보존정책을
확정하기 전까지 짧은 TTL로 제한한다.

## 엔진 선택안

| 후보 | 용도 | 판단 |
|---|---|---|
| PP-OCRv5 한국어 계열 | Linux 서버의 한글·영문 OCR, box/confidence | **1차 후보. Phase 0 실자료 비교 후 확정** |
| 기존 Windows OCR | 현 품질 비교 baseline | 운영 Linux 경로와 맞지 않고 혼합문자 품질 문제로 기본 후보 아님 |
| Google ML Kit v2 | 향후 Android 네이티브 업로드 전 선판독 | PMS/AzBrain 서버 기본 엔진은 아님 |
| Gemini/AGY vision | 표·도식·일반 장면·낮은 신뢰도 fallback | 유지하되 기본 OCR 경로에서는 호출하지 않음 |

OCR 프로세스는 요청마다 모델을 로딩하지 않는다. worker 시작 시 한 번 warm-up하고, 원본 해상도를
보존한 detector와 한국어 recognizer를 사용한다. 큰 스크린샷은 겹침 tile로 나누고 결과 좌표를 원본
정규화 좌표로 합친다.

## 전처리와 업무 토큰 보정

- EXIF 방향 보정, perspective/deskew, 대비·노이즈 보정 후보를 fixture로 비교한다.
- 다크모드·모니터 촬영·모아레는 단일 전처리를 강제하지 않고 원본/보정본 중 confidence가 높은 결과를 쓴다.
- `ORA-`, `SQLSTATE`, IP, 포트, 파일경로, eCAMS, Tibero, JEUS, WebtoB 등 사내 토큰 사전을 둔다.
- `0/O`, `1/l/I`, `5/S`, `8/B`는 문맥 없는 일괄 치환을 금지하고 오류코드·IP·경로 패턴 안에서만 보정한다.
- 낮은 confidence는 틀린 값을 확정하지 않고 영역 좌표와 함께 `UNCERTAIN`으로 반환한다.

## 라우팅 계약 초안

| 입력/요청 | route | 처리 |
|---|---|---|
| 오류코드·문구 읽기/검색 | `OCR_ONLY` | 로컬 OCR 결과를 직접 반환 |
| 텍스트 중심 화면 요약 | `TEXT_LLM` | secret redaction 뒤 OCR 텍스트만 경량 텍스트 모델에 전달 |
| WBS·표 구조화 | `VISION_NEEDED` | OCR/좌표를 보조 입력으로 주고 정밀 모델이 행·계층을 복원 |
| 일반 사진의 의미 질문 | `VISION_NEEDED` | 시각 모델이 원본 또는 승인된 축소본 분석 |
| OCR confidence 미달 | `VISION_NEEDED` | 낮은 신뢰도 crop만 우선 재분석 |
| 동일 hash+version | `CACHE_HIT` | 외부 호출 없이 기존 파생물 재사용 |

기본 자동 경로에는 사고모델을 사용하지 않는다. 사고모델/high effort는 사용자가 `정밀 분석`을 선택하거나
라우터가 복잡한 구조를 확인한 경우에만 허용하고, 결과가 늦는 동안 OCR 결과를 먼저 보여준다.

## PMS bridge API 초안

기존 `/pms/wbs-vision`을 즉시 폐기하지 않는다. 먼저 아래 범용 판독 API를 feature flag 뒤에 추가하고,
PMS의 비동기 outbox worker가 호출하도록 한다.

```text
POST /pms/image-extract
{ imageBase64, mime, mode?: "AUTO"|"OCR"|"WBS", languages?: ["ko","en"] }

200
{
  contentHash,
  pipelineVersion,
  route,
  text,
  regions: [{ text, confidence, polygon: [[x,y], ...] }],
  confidence,
  elapsedMs,
  engine,
  warnings: []
}
```

- 좌표는 원본 기준 0~1 정규화 좌표다.
- 응답에는 원본 이미지나 secret 원문을 로그로 남길 정보가 없어야 한다.
- JSON base64는 기존 bridge와의 호환용 초안이다. 대용량 fixture에서 메모리 문제가 확인되면
  multipart 또는 artifact reference로 바꾸되, PMS 권한 검증을 우회하는 공유 경로는 만들지 않는다.
- `/pms/wbs-vision`은 `mode=WBS` 정밀 경로로 내부 위임하되 기존 응답 계약은 유지한다.

## 캐시 계약

캐시 키는 다음 조합이다.

```text
sha256(original bytes)
+ pipelineVersion
+ route/input profile
```

- OCR 파생물과 시각 분석 파생물은 다른 key/profile로 분리한다.
- 모델·프롬프트·전처리·사전이 바뀌면 version을 올린다.
- 실패 결과를 영구 캐시하지 않는다. 짧은 backoff와 attempts만 기록한다.
- 서로 다른 사용자의 동일 이미지 hash가 같아도 권한·보존 경계를 합치지 않는다. 계산 결과 재사용과
  결과 열람 권한은 별개다.
- 원본 삭제 시 PMS 검색 projection과 좌표는 삭제한다. AzBrain의 공유 계산 캐시는 원문을 포함하지
  않는 경우에만 TTL까지 유지할 수 있으며 정책 확정 전에는 함께 삭제한다.

## 보안 경계

1. 원본 base64, 토큰, OCR 원문을 애플리케이션 로그에 쓰지 않는다.
2. 로컬 OCR 뒤 secret detector가 만든 redacted text만 검색·텍스트 LLM에 사용한다.
3. 전체 원본을 외부 시각 모델에 보내는 경로는 목적·provider·사용자·원본 ID·결과 상태를 감사한다.
4. 낮은 신뢰도 crop에도 비밀이 있을 수 있으므로 masking 뒤 전송하거나 별도 승인 route를 사용한다.
5. PMS 개인 Gmail·첨부는 owner 범위를 유지하며 고객사 자동 연결만으로 공유하지 않는다.
6. OCR 값은 파생물이지 사실 정본이 아니므로 사용자 확인 없이 코드·날짜·담당자를 저장하지 않는다.

## 계측과 수용 기준

각 요청에서 `decodeMs`, `preprocessMs`, `ocrMs`, `cacheMs`, `visionMs`, `totalMs`, `route`,
`fallbackReason`, `engineVersion`을 기록하되 원문은 기록하지 않는다.

Phase 0에서 사내 대표 이미지 최소 100장을 다음 군으로 나누어 비교한다.

- 한글 문서 사진.
- 한글·영문 혼합 업무 화면.
- 다크모드 터미널·오류창.
- 모니터 촬영, 기울어짐, 반사·모아레.
- WBS·표·작은 글씨가 많은 스크린샷.
- 글자가 거의 없는 일반 사진.
- 비밀번호·토큰이 포함된 보안 fixture.

필수 지표는 전체 CER 하나가 아니다.

- 업무 토큰 exact match율.
- text box recall과 원본 highlight 좌표 정확도.
- confidence calibration과 잘못된 확정 건수.
- route별 P50/P95 latency.
- 캐시 적중 latency.
- 외부 Vision 호출 비율과 비용.
- 원본/비밀 로그 누출 0건.

초기 성능 목표는 캐시 hit 0.1초 이내, 단일 일반 이미지 로컬 OCR P50 2초 이내/P95 5초 이내다.
이는 운영 서버 실측 전 가설이며 Phase 0 결과로 조정한다. 시각 정밀분석의 15~30초는 별도 job으로
남을 수 있지만 업로드 완료와 OCR 검색 가능 시점을 막아서는 안 된다.

## 구현 단계

1. **Phase 0 — 벤치마크.** 고정 fixture와 정답셋을 만들고 Windows OCR, PP-OCRv5, 현재 Vision을 비교한다.
2. **Phase 1 — OCR adapter.** feature flag 뒤에서 shadow 실행하고 현재 답변은 바꾸지 않은 채 결과·시간만 기록한다.
3. **Phase 2 — AzBrain 채팅 라우팅.** hash cache와 `OCR_ONLY/TEXT_LLM/VISION_NEEDED` 분기를 적용한다.
4. **Phase 3 — PMS bridge.** `/pms/image-extract`와 health/readiness를 추가하고 WBS 호환 경로를 유지한다.
5. **Phase 4 — PMS 비동기 배선.** PMS가 outbox, L0d, 권한, chunk 색인, 하이라이트를 소유한다.
6. **Phase 5 — 운영 튜닝.** 사내 토큰 사전, tile 크기, confidence/fallback 기준을 실제 오탐으로 조정한다.

Phase 1~3은 각 단계가 독립적으로 롤백 가능해야 한다. Phase 0 결과가 현재 Vision보다 업무 토큰 정확도가
낮으면 OCR을 단독 확정값으로 사용하지 않고 `검색 후보 + Vision 보조 입력`까지만 적용한다.
