# Wiki v2 PoC — LLM-curated 지식 레이어

## 배경

현재 `c:\ecams-ai\wiki/`는 카파시 식 LLM wiki가 아니라 `wikiBuilder.js`가 정규식으로 뽑아낸 **mechanical extractor 출력물**이다. 1:1 파일 매핑, 주석 dump, SQL raw 텍스트 — 즉 카파시 스키마로 보면 `raw/` 레이어에 더 가깝다.

진짜 `wiki/` (개념·엔티티·플로우 단위의 LLM 합성 지식 레이어)를 신설할 수 있는지, 그리고 그게 ecams-ai RAG의 입력으로 더 가치 있는지 검증한다.

## 목표

`CMR1000.cr_status` (신청원장의 상태) 의 **상태머신**을 한 페이지로 합성한다. html5 + server + DB 3 repo에 흩어져 있는 상태값 정의/전이/비즈니스 규칙을 LLM이 읽고 단일 페이지로 정리한다.

**주제 한정**: 다른 테이블(CMR0020, CMR1010, CMR9900, ...)의 cr_status는 이 PoC 범위 밖. eCAMS의 `cr_*` 컬럼은 테이블마다 의미가 다르므로 단일 합성 페이지에 섞으면 거짓이 됨.

## 범위

**In:**
- 입력 소스 (3 repo 통합):
  - `wiki/moon7733_kjbank_html5/` (UI — 표시/필터)
  - `wiki/moon7733_kjbank_server/` (Server — ecams_mgr/Acct로 실제 전이 처리)
  - `wiki/sample_db/` (DB — 트리거, CMR9900_STR 프로시저 등. kjbank 자체 DB wiki 없어서 sample_db 대용)
- 입력 추출 전략 (옵션 3 + 도메인 좁히기):
  - 키워드: `CMR1000` + `cr_status` + `cr_acptno` (CMR1000 PK) 매칭 페이지
  - 빈도 상위 페이지는 풀 컨텍스트, 나머지는 snippet (grep -C 5)
  - 항상 포함: 각 repo의 Main.md, ScreenMap.md, Pages/*/Index.md
- 산출물 구조: `wiki-poc/out/moon7733_kjbank/Concepts/CMR1000_cr_status_상태머신.md`
  - **사이트 단위 통합 wiki** (한 고객사 = 한 시스템 = 한 wiki — 카파시 패턴 부합)
  - 3 layer 합성 결과가 한 페이지에 들어감 (UI 표시 + Server 전이 + DB 처리)
- 추가 입력: 원본 소스 (wiki만으로는 server/db 함량 부족)
  - web: `C:/ecams-ai/workspace/광주은행/kjbank_html5`
  - server: `C:/ecams-ai/workspace/광주은행/kjbank_server`
  - db: 자체 없음, sample_db 대용
- 모델 (2단계 비교):
  - **베이스라인**: Claude Opus 4.7 — 카파시 패턴이 이 도메인에 가치 있는지 천장 확인용
  - **다운사이즈 시험**: Claude Haiku 4.5, Gemini Flash, DeepSeek V3 — 같은 입력·프롬프트로 합성 후 베이스라인과 diff
- 검증: 사람(도메인 전문가 = 사용자)이 읽어서 (a) 상태값 정확 (b) 전이 정확 (c) 어느 layer에서 어떤 전이가 일어나는지 추적 가능

**Out:**
- 자동 업데이트 루프 (raw 바뀔 때 wiki 갱신)
- 린터 (모순/orphan/stale 검출)
- 다른 repo로 확장
- 현재 `wiki/` → `index/` 리네임 (PoC 검증 후 별도 단계)

## 산출물 검증 기준

1. **사실 정확성**: 페이지에 나오는 `cr_status` 값이 실제 `wiki/moon7733_kjbank_html5/Pages/`에 존재하는 값과 일치 (환각 없음).
2. **합성 가치**: index에 분산돼 있던 정보를 한 페이지에서 보면 이해가 빨라진다. "여러 서블릿을 일일이 열어볼 필요가 줄어든다"는 정성 평가.
3. **링크 무결성**: `[[...]]` 링크가 실제 index 페이지를 가리킴.
4. **토큰 비용**: 합성 1회에 든 토큰/시간 기록. 175개 서블릿 × 19개 repo 로 확장 시 비용 추정 가능해야 함.

## 비범위 (이번에 안 함)

- 산출물을 RAG에 연결하기
- `wikiBuilder.js` 수정
- 다른 개념 페이지 (결재 플로우 등) — PoC 1개 페이지로 한정
- system.md / wiki 작성 스키마 정형화 — PoC 결과 보고 다음에

## 산출물 흐름

```
wiki-poc/out/moon7733_kjbank/Concepts/...    ← PoC 산출물 (이번 단계)
                                              ↓ (검증 통과 시에만)
wiki/  →  index/                              ← 기존 wiki 리네임 (mechanical extract = raw 역할)
                                                 (layer별 폴더 유지: html5, server, db, ...)
wiki/                                          ← 신설, 사이트 단위 통합 wiki
  └ moon7733_kjbank/Concepts/...               (LLM 합성 페이지만)
  └ moon7733_toss/Concepts/...                 (다른 사이트도 동일 패턴)
  └ ...
```

**중요**: 이번 PoC에서는 기존 `wiki/` 절대 건드리지 않음. 검증 실패 시 `wiki-poc/` 폴더만 정리하면 끝, 시스템 영향 0.

## 최종 목표 (PoC 범위는 아니지만 방향성)

저렴+빠른 모델 (Haiku / Gemini Flash / DeepSeek V3) 에서도 합성 품질이 충분히 나오는 게 최종 목표. 175 서블릿 × 19 repo 규모 운영 시 비용 차이가 결정적.
