## 0. 분석 근거
- `docs/allow-partial-deploy/context-notes.md`
- `WebContent/webPage/apply/ApplyRequest.jsp`
- `WebContent/js/ecams/apply/ApplyRequest.js`
- `src/html/app/eCmr/Cmr0200Servlet.java`
- `src/app/eCmr/Cmr0200.java`

현재 레포에는 `MEMO.md`가 없어서, 위 문서와 소스 기준으로 추적했습니다.

## 1. 요약
이 화면에서 말하는 `운영반영제외 항목`과 `운영반영체크 항목`은 실제로는 배포 요청 전에 걸리는 서버 검증 흐름에 가깝습니다.

체크를 해제하면 바뀌는 핵심은 DB가 아니라 검증 범위입니다.

- SR에 묶인 항목을 전부 포함해야 한다는 강제 조건이 약해지거나 사라집니다.
- 체크아웃 취소 항목이 있더라도 경고 또는 확인 절차가 줄어듭니다.
- 결과적으로 배포 요청이 차단되거나 재확인되는 조건이 달라집니다.

즉, 화면 값 자체보다 `배포 가능 여부 판단`과 `사전 차단/확인 로직`이 바뀝니다.

## 2. 실행 흐름
- 버튼 클릭은 `ApplyRequest.js`의 `cmdReqClick()`에서 시작합니다.
- `reqCd == "04"`인 배포 요청일 때 SR 관련 검증을 먼저 탑니다.
- 1차로 `requestType = 'chk_SrItem'`를 `Cmr0200Servlet`에 보냅니다.
- 서블릿은 `Cmr0200.chk_SrItem()`로 분기합니다.
- 2차로 `requestType = 'chk_SrCheckOutCancel'`를 보내 체크아웃 취소 항목 여부를 검사합니다.
- 서블릿은 `Cmr0200.chk_SrCheckOutCancel()`로 분기합니다.
- `PASS`면 바로 `realApply()`로 진행합니다.
- `PASS`가 아니면 확인 창을 띄우고 사용자 승인 후 진행합니다.
- 최종적으로 `realApply()` 이후 `baepoNext()`로 실제 처리 단계로 넘어갑니다.

## 3. 로직 상세
- `ApplyRequest.js`의 `cmdReqClick()`는 배포 요청 전에 먼저 선택 항목이 있는지 확인합니다.
- 그 다음 `cboSys.cm_sysinfo`의 특정 비트값을 보고 SR 연계 강제 검증을 켭니다.
- `cm_sysinfo.substr(19,1) == "1"`이면 선택한 상세 목록에서 `baseitem` 기준 개수를 세고, 상단 목록 개수와 맞는지 비교합니다.
- 이 수량이 안 맞으면 `SR에 연결된 모든 프로그램을 반영해야 한다`는 메시지로 차단합니다.
- 이어서 `chk_SrItem`을 호출해 SR 요청 목록에 현재 선택된 프로그램이 모두 포함되는지 검사합니다.
- 결과가 `OK`가 아니면 그 문자열을 그대로 띄우고 중단합니다.
- 다음으로 `chk_SrCheckOutCancel`을 호출해 체크아웃 취소 대상이 있는지 확인합니다.
- 결과가 `PASS`면 바로 진행합니다.
- `PASS`가 아니면 경고 문구와 함께 확인 창을 띄우고, 사용자가 승인해야 계속합니다.
- 이후 `realApply()`는 요청 사유 입력 여부를 다시 확인합니다.
- `chk_Realstopyn`으로 운영반영이 현재 막혀 있는지 검사합니다.
- MCI 자원이 있으면 `mciCheck`도 추가로 검사합니다.
- 마지막 확인을 거쳐 실제 반영 함수 `baepoNext()`로 넘어갑니다.

정리하면, 체크 해제의 효과는 `배포 대상 포함 조건`과 `사전 차단 조건`을 완화하거나 제거하는 쪽입니다.  
DB의 저장 구조가 바뀌는 게 아니라, 어떤 항목을 반영 대상으로 인정할지와 그 전에 막을지 말지가 바뀝니다.

## 4. 주요 파일 및 DB 테이블
- `[ApplyRequest.jsp](/C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/webPage/apply/ApplyRequest.jsp)`
- `[ApplyRequest.js](/C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)`
- `[Cmr0200Servlet.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)`
- `[Cmr0200.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)`

관련 DB 테이블은 아래가 핵심입니다.

- `cmr1000` 요청 헤더 저장
- `cmr1010` 요청 상세 저장
- `cmr0020` 프로그램 마스터 조회
- `cmm0036` 시스템별 속성, `cm_info` 비트 검증
- `cmm0070` 디렉터리 매핑
- `cmr1060` 체크아웃 취소/연계 검증에 사용
- `cmm0020` 코드명 조회

## 6. 추천 추가 질문
- 지금 말한 `운영반영제외 항목`이 `ApplyRequest.jsp`의 배포 요청 화면 기준이 맞나요.
- 원하시는 게 검증 완화인지, 아니면 실제로 운영반영 대상 리스트에서 제외하는 기능 수정인지 확인할까요.
- 화면 캡처나 정확한 라벨을 주시면, 해당 체크박스가 연결된 메서드까지 더 정확히 짚어드릴 수 있습니다.
