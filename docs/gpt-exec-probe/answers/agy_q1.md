[ELAPSED] 92.3s  exit=0
[INCLUDE_DIRS] 4

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)- [ApplyRequest.js.md](file:///C:/ecams-ai/scratch/agy-probe/wiki/광주은행/kjbank_html5/Pages/JS/ApplyRequest.js.md)
- [Cmr0200.md](file:///C:/ecams-ai/scratch/agy-probe/wiki/광주은행/kjbank_html5/Pages/Classes/Cmr0200.md)
- [Cmr0200Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
- [Cmr0200.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)## 1. 요약 (화면 목적 + 서버측 최종 처리 결과)운영배포 신청 시 SR에 연결된 모든 프로그램이 누락 없이 일괄 신청되도록 제어하는 제약을 해제합니다. 이를 통해 사용자가 배포 대상 파일 목록 중에서 원하는 파일만 선택하여 파일 단위로 개별 배포 신청을 수행할 수 있도록 클라이언트 및 서버 검증 로직을 수정합니다.## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)1. **JS 진입점**
   - 사용자가 화면에서 운영적용요청 버튼을 클릭하면 [ApplyRequest.js](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)의 [cmdReqClick](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js#L1584) 함수가 실행됩니다.
2. **클라이언트단 일괄 검증**
   - [cmdReqClick](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js#L1584) 내부에서 시스템 속성값(`cm_sysinfo` 문자열)을 확인하여 일괄 배포 제약 조건이 켜져 있는지 체크합니다. 조건에 맞지 않으면 경고 메세지를 출력하고 실행을 종료합니다.
3. **서블릿 호출**
   - 클라이언트단 검증을 무사히 마치면 [Cmr0200Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)에 `chk_SrItem` 요청 타입으로 Ajax 전송이 수행됩니다.
4. **Java Class 비즈니스 로직 및 DB 연동**
   - [Cmr0200.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)의 [chk_SrItem](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java#L9436) 메서드가 실행되어 DB(`CMR0020` 프로그램 마스터 테이블)에 쿼리를 실행하여 실제 배포되어야 하는 전체 목록을 조회한 후, 클라이언트가 보낸 신청 목록(`reqFiles`)과 교집합을 이루고 있는지 최종 검사합니다.## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)1. **클라이언트 측 일괄 신청 제약 검사**
   - `cm_sysinfo` 필드의 19번째 글자 또는 26번째 글자가 `"1"`로 세팅된 시스템의 경우, `firstGrid.list.length`(해당 SR의 배포 대상 프로그램 전체 목록 수)와 `secondGridData` 중 수정 대상으로 지정된 파일 수가 다르면 "운영배포시 SR에 연결된 모든 프로그램을 한번에 반영 하셔야 합니다."라는 메세지와 함께 배포 신청 진행이 제한됩니다.
2. **서버 측 일괄 신청 검증 로직**
   - [Cmr0200.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)의 [chk_SrItem](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java#L9436) 메서드는 파라미터로 넘어온 시스템코드(`cm_syscd`), SR ID(`cc_srid`), 사용자ID(`UserID`)를 받아 `CMR0020` 및 `CMM0020` 테이블을 조인 조회하여 현재 정상적인 반영 대기 상태에 놓인 파일들의 목록을 읽어옵니다.
   - 가져온 DB 목록 전체 중 클라이언트가 보낸 `reqFiles` 리스트에 미포함된 파일(`findFile == false`)이 1개라도 존재하는 경우, 배포 신청이 누락되었다는 오류 메세지를 문자열로 반환하여 결재 신청 과정을 중단시킵니다. 대상이 모두 매칭되어 누락이 없는 경우에만 `"OK"` 문자열을 리턴합니다.## 4. 주요 파일 및 DB 테이블- **주요 파일**
  - 클라이언트 스크립트: [ApplyRequest.js](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)
  - 서블릿 클래스: [Cmr0200Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
  - 비즈니스 로직 클래스: [Cmr0200.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)
- **DB 테이블**
  - 프로그램 정보 테이블: `CMR0020`
  - 프로그램 상태 공통코드 테이블: `CMM0020` (코드군: `CMR0020`)
  - 동일 리소스유형 통제 제외 테이블: `CMM0037`

## 5. 유지보수 참고사항

**5-1. 수정 범위 판정**

판정. 좁음 — 사유. DB 스키마 수정이나 공통 라이브러리 수정 사항이 없고, 기존 클라이언트 JS 소스 1개와 서버측 Java 소스 1개만 직접 수정함으로써 해결할 수 있습니다.

**5-2. 판정별 출력 형식**

클라이언트 그리드 개수 검증 부분에서 alert 후 탈출(return)하는 코드를 주석 처리하여 통과시키고, 서버단 [Cmr0200.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)의 검증 결과를 항상 `"OK"`로 리턴하게 수정하여 일괄 신청 제한을 우회합니다.

```diff
--- a/WebContent/js/ecams/apply/ApplyRequest.js
+++ b/WebContent/js/ecams/apply/ApplyRequest.js
@@ -1629,8 +1629,9 @@
                        upGridCnt = firstGrid.list.length;
-                       if(upGridCnt != downGridCnt) {
-                               dialog.alert("운영배포시 SR에 연결된 모든 프로그램을 한번에 반영 하셔야 합니다.[운영반영제외]");
-                               ingSw = false;
-                               return;
-                       }
+                       // 파일 단위 신청을 허용하기 위해 전체 일괄 반영 검증 주석 처리
+                       // if(upGridCnt != downGridCnt) {
+                       //      dialog.alert("운영배포시 SR에 연결된 모든 프로그램을 한번에 반영 하셔야 합니다.[운영반영제외]");
+                       //      ingSw = false;
+                       //      return;
+                       // }

                        etcObj = {};
@@ -1681,8 +1682,9 @@
                        upGridCnt = firstGrid.list.length;
-                       if(upGridCnt != downGridCnt) {
-                               dialog.alert("운영배포시 SR에 연결된 모든 프로그램을 한번에 반영 하셔야 합니다.[운영반영체크]");
-                               ingSw = false;
-                               return;
-                       }
+                       // 파일 단위 신청을 허용하기 위해 전체 일괄 반영 검증 주석 처리
+                       // if(upGridCnt != downGridCnt) {
+                       //      dialog.alert("운영배포시 SR에 연결된 모든 프로그램을 한번에 반영 하셔야 합니다.[운영반영체크]");
+                       //      ingSw = false;
+                       //      return;
+                       // }

                        //1.SR에 묶인 모든 프로그램이 신청 리스트에 포함되였는지 확인.
```

```diff
--- a/src/app/eCmr/Cmr0200.java
+++ b/src/app/eCmr/Cmr0200.java
@@ -9445,4 +9445,7 @@
                boolean findFile = false;
                String rtStr    = "";
+
+               // 파일 단위 개별 신청을 허용하기 위해 검증 로직을 생략하고 항상 통과 처리함
+               if (true) return "OK";

                try {
```

## 6. 추천 추가 질문

- [일괄 신청 통제 여부를 결정하는 시스템 속성(cm_sysinfo)의 19번째와 26번째 자리수 속성이 구체적으로 어떤 DB 테이블 설정값과 연동되어 관리되는가?]
- [일괄 배포 강제 제한을 제거했을 때 빌드 배포 단계 또는 SR 종료 처리 단계에서 영향을 받을 수 있는 부작용은 없는가?]
- [일괄 신청 조건 검사 로직을 유지하면서 특정 시스템 환경(예: 특정 업무나 시스템코드)만 파일 단위 배포를 허용하게끔 분기하려면 소스를 어떻게 수정해야 하는가?]
