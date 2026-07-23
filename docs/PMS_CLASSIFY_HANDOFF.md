# PMS 인수인계 분류기 — 테스트·오류 확인 가이드

PMS 인수인계 덤프를 분류해 JSON 배열을 stdout으로 낸다. azbrain의 소스분석 RAG 파이프라인과
**무관한 독립 스크립트**. 엔진 2종(교체 가능):

| 스크립트 | 엔진 | 실측 지연 | 비고 |
|---|---|---|---|
| **`pmsClassifyGemini.js`** (권장) | Gemini flash-lite API | **~1.5초** | azbrain 기존 Gemini 키·패턴 재사용, https 직접호출 |
| `pmsClassify.js` (대안) | `claude -p` CLI | ~11~15초 | 구독(학습제외 약관). 느림 |

- 프로덕션(리눅스): `ecams-ai-linux/pmsClassify*.js`
- 로컬 테스트(윈도우): `ecams-ai/pmsClassify*.js`  (내용 동일)
- 의존성 없음(내장 https/child_process만). npm install 불필요.

## 권장 엔진: Gemini flash-lite (`pmsClassifyGemini.js`)
`.env`의 `GEMINI_API_KEY`(azbrain가 이미 쓰는 무료 키) 사용. thinking off + JSON 강제.
```
node C:\ecams-ai\pmsClassifyGemini.js blob.txt          # 파일
type blob.txt | node C:\ecams-ai\pmsClassifyGemini.js   # 표준입력
PMS_CLASSIFY_MODEL=gemini-3.1-flash node ... blob.txt   # 모델 교체
```
소요시간은 stderr에 `[pmsClassify] model=... elapsed=NNNms` 로 찍힌다(실측용).
⚠️ **무료 티어 키는 전송 데이터가 학습에 쓰일 수 있음.** 비번·경로 등 민감정보는 호출측(PMS)이
**먼저 마스킹**해서 안 보내야 한다(이 스크립트는 받은 텍스트를 그대로 Google로 보냄).

## 대안 엔진: claude -p (`pmsClassify.js`)

## 선결 조건 (스크립트가 도는 그 머신에서)
`claude` CLI가 설치·로그인돼 있어야 한다. 확인:
```
claude --version        # 버전 나오면 설치 OK
printf 'Reply: OK' | claude -p --max-turns 1   # 'OK' 나오면 인증·헤드리스 OK
```
프로덕션 리눅스 서버(192.168.0.11)에도 동일하게 claude가 설치·인증돼 있어야 한다(azbrain가 이미 사용 중).

## 테스트 방법 (윈도우 로컬)
```
# 1) 덤프를 파일로 저장 후
node C:\ecams-ai\pmsClassify.js blob.txt

# 2) 또는 표준입력으로
type blob.txt | node C:\ecams-ai\pmsClassify.js
```
Git Bash라면:
```
node /c/ecams-ai/pmsClassify.js /tmp/blob.txt
cat /tmp/blob.txt | node /c/ecams-ai/pmsClassify.js
```
모델 교체(기본 haiku=빠름·저렴, 정확도 원하면 sonnet):
```
PMS_CLASSIFY_MODEL=claude-sonnet-4-6 node /c/ecams-ai/pmsClassify.js blob.txt
```

### PASS 모습 (stdout, 한 줄 JSON)
```json
[{"target":"knowledge","key":null,"title":"운영반영제외 프로세스","body":"...","tag":"운영절차"},
 {"target":"info","key":"WAS","title":"WAS","body":"WebLogic","tag":null}]
```
- exit 코드 0
- target: `info`(정형필드, key=DB/WAS/SCM/SERVER_IP/LOGIN_STEPS) / `knowledge`(자유지식) / `credential`(민감)
- haiku 기준 소요 ~10~15초 (nginx 60초 안쪽 → 동기 호출 가능)

## 오류 확인 방법
성공은 stdout에 JSON, 실패는 **stderr에 `PMSCLASSIFY_ERROR: ...` + exit 1**. stderr만 보면 원인이 갈린다:

| 증상 (stderr / 행동) | 의미 | 조치 |
|---|---|---|
| `spawn failed (claude 설치·인증 확인)` | claude 실행파일 못 찾음 | 그 머신에 claude 설치/PATH 확인 |
| 실행 후 로그인 URL·프롬프트가 뜨거나 무한 대기 | **인증 안 됨** | 그 머신에서 `claude` 로그인(구독 세션) |
| `timeout after 55000ms` | 응답이 55초 초과 | 모델을 haiku로, 덤프를 짧게. 지속되면 서버 부하/네트워크 확인 |
| `no JSON array in output. raw head: ...` | 모델이 JSON 아닌 잡담 반환 | raw head 보고 프롬프트 조정(대개 덤프가 너무 모호) |
| `claude exit N: ...` | claude 비정상 종료 | 뒤 300자 메시지로 원인 판단(레이트리밋 등) |

빠른 자가진단:
```
echo "WAS는 WebLogic 사용" | node /c/ecams-ai/pmsClassify.js
# → [{"target":"info","key":"WAS",...}] 나오면 엔진 정상
```

## 남은 배선 (PMS 연결) — 다음 단계
지금은 스크립트 단독까지 검증됨. PMS(프로젝트)에서 이걸 부르는 부분이 남았다.
- **제약**: PMS 백엔드는 도커 컨테이너라 내부에 node·claude·인증이 없다 → 컨테이너에서 직접 스크립트 실행 불가.
- **경로**: azbrain(호스트에서 claude 인증 보유)이 얇은 HTTP 엔드포인트로 노출 → PMS가 `호스트IP:포트`로 호출(도커→호스트 reachability 필요). strangler-fig(자체 azbrain-migration 문서와 동일 구도).
- **마스킹**: 비번·경로 등 민감정보는 PMS 규칙기반이 **먼저 걸러** 로컬 처리하고, 나머지 프로즈만 이 스크립트로 넘긴다(값이 클라우드로 안 샘).
- **폴백**: 호출 실패·타임아웃이면 PMS가 기존 규칙기반 분류로 자동 폴백. 기본은 config 플래그 off(검증 전까지).

### 결정 필요 (배선 착수 전)
1. azbrain가 이 스크립트를 감쌀 HTTP 엔드포인트를 노출할 수 있나? 포트/인증(서비스 토큰)은?
2. PMS 도커 컨테이너에서 azbrain 호스트:포트가 닿나? (localhost 아님)
