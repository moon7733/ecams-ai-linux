# PMS ↔ azbrain 브릿지 계약 (pmsBridge.js)

PMS의 AI 기능(텍스트 분류 · WBS 사진추출)을 azbrain 환경(Gemini 키 보유)에서 노출하는
**독립 HTTP 브릿지**. azbrain server.js(RAG·auth)와 완전 분리. Node 내장 http만 사용, 의존성 0.

## 기동 / 인증 / 배포
```
PMS_BRIDGE_TOKEN=<서비스토큰> PMS_BRIDGE_PORT=8790 node pmsBridge.js
```
- 모든 요청 헤더 `X-PMS-Token: <토큰>` 필요(미설정 시 무인증=개발용).
- 프로덕션: azbrain와 같은 리눅스 호스트(192.168.0.21)에서 상시 기동(systemd/pm2/&). PMS 컨테이너가 `호스트:8790`으로 호출.
- Gemini 키는 azbrain `.env`의 `GEMINI_API_KEY` 재사용(브릿지가 자동 로드).

## 엔드포인트

### GET /pms/health
→ `{ "ok": true, "keyLoaded": true }`  (인증 불필요, 헬스체크용)

### POST /pms/classify   — 텍스트 인수인계 덤프 분류
요청: `{ "text": "..." }`
응답: `{ "items": [ ClassifiedItem ], "elapsedMs": 1500, "model": "gemini-2.5-flash" }`
```
ClassifiedItem = {
  target:   "info" | "knowledge" | "credential",
  key:      "DB"|"WAS"|"SCM"|"SERVER_IP"|"LOGIN_STEPS" | null,   // target=info 일 때만
  category: "ACCESS"|"OPERATION"|"PROCESS"|"CONTACT"|"ISSUE"|"ETC",  // 우리 지식 카테고리(의미 기반). PMS knowledge_item.category 로 직결
  title:    string,
  body:     string,     // target=info 면 필드 값만, knowledge 는 원문 그대로(각색 금지)
  tag:      string | null   // category 보다 구체적인 소분류 라벨
}
```
- **category = 의미 기반 6분류**(값이 아니라 뜻으로). 예: "형상관리 정기점검 방문 문자(날짜·담당·연락처)"는 형상 단어가 있어도 ACCESS가 아니라 **CONTACT**. PMS는 이 값을 그대로 저장(pms 키워드 재분류 안 함).
- knownTags(선택): `{text, knownTags:[...]}` 로 tag 어휘 일관성 힌트 전달 가능.
- 모델 **gemini-2.5-flash** (flash-lite는 환각 확인되어 교체). 실측 ~1.5s.
- ⚠️ **호출 전 PMS가 비번·경로 등 민감정보를 마스킹**해서 `text`에 안 넣어야 함(브릿지는 받은 걸 그대로 Gemini로 보냄).

### POST /pms/wbs-vision  — WBS 사진 → 구조화 행
요청: `{ "imageBase64": "<base64>", "mime": "image/jpeg" }`
응답: `{ "rows": [ WbsRow ], "notes": [ string ], "elapsedMs": 7000, "model": "gemini-3.1-flash-lite" }`
```
WbsRow = { level: number,   // 들여쓰기 깊이(최상위 0) → PMS tasks 계층 매핑
           name:  string,
           start: "YYYY-MM-DD" | null,
           end:   "YYYY-MM-DD" | null }
notes = 우측 협조요청/비고 등 특정 행에 안 묶이는 프로젝트 전체 메모 → PMS 지식(knowledge)로.
```
- 실측: 4000×3000 모니터 사진 → **29행 정확 추출 + 협조사항 7건 분리, ~7s**(flash-lite).
- 정확도 부족한 사진은 `PMS_VISION_MODEL=gemini-2.5-flash`로 올림(느려짐).

### 에러
`{ "error": "..." }` + 상태코드: 400(요청불량) / 401(토큰) / 502(Gemini 실패) / 500(내부).

## 전체 데이터 흐름 (누가 무엇을 호출하나)
```
[프론트=Codex]  →  [PMS(Java)]              →  [pmsBridge]  →  Gemini
 전역 AI버튼        마스킹·게이트·저장            분류/비전         (무료키)
```
- **프론트(Codex)는 PMS만 호출**한다(브릿지 직접호출 X — 마스킹·인증을 PMS가 책임져야 하므로).
- **PMS가 브릿지를 호출**: (1) 텍스트면 비번·경로 로컬 마스킹 후 /pms/classify, (2) 사진이면 /pms/wbs-vision.
- 브릿지 응답을 PMS가 **미리보기**로 프론트에 반환 → 사용자가 확인·수정 → 기존 저장 API(knowledge/info/tasks)로 저장.
- 실패·타임아웃 시 PMS는 규칙기반 분류로 폴백(텍스트) 또는 에러 안내(비전).

## 남은 것 (미구현)
1. PMS(Java) `AiKnowledgeClassifier` / WBS추출 엔드포인트 — 브릿지 호출 + 마스킹 + 폴백 (config: 브릿지 URL·토큰).
2. WbsRow → PMS `tasks` 매핑(level→parentTaskId 계층 복원).
3. PMS 도커 컨테이너 → 호스트:8790 reachability 확인 + 브릿지 상시기동(systemd 등).
4. 프론트(Codex)가 호출할 **PMS쪽 API 스펙**은 전역 어시스턴트 UX 확정 후 별도 정의.
