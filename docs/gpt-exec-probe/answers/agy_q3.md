[ELAPSED] 44.5s  exit=0
[INCLUDE_DIRS] 4

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)- 위키 문서: [_webPage_ecmr_Cmr0200Servlet.md](file:///C:/ecams-ai/scratch/agy-probe/wiki/광주은행/kjbank_html5/Pages/Servlets/_webPage_ecmr_Cmr0200Servlet.md)
- 소스 코드: [Cmr0200Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)## 1. 요약 (화면 목적 + 서버측 최종 처리 결과)`Cmr0200Servlet`은 eCAMS 시스템에서 프로그램 체크인, 테스트적용(배포) 및 롤백, 폐기 등 형상 관리 핵심 요청을 처리하는 서블릿 모듈입니다. 클라이언트가 전달한 `requestType`에 따라 위임 클래스인 `Cmr0200`의 메서드를 호출하여 파일 목록 조회, 배포 정합성 검증, 결재 정보 지정 및 형상 관리 상태 처리를 수행하고 그 결과를 JSON 형태로 최종 반환합니다.## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)1. 클라이언트(JS)에서 체크인 또는 배포 관련 이벤트 발생 시, `requestType` 및 필요한 데이터를 담아 POST 방식의 HTTP 요청을 전달합니다.
2. `Cmr0200Servlet`의 [doPost](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L39-L166) 메서드가 JSON 패킷을 받아 파싱한 뒤 `requestType` 문자열을 추출합니다.
3. switch-case 분기를 통해 매핑된 내부 private 메서드를 실행합니다.
4. 각 private 메서드는 [Cmr0200](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L24) 위임 객체를 인스턴스화하고 관련 인수를 전달하며 비즈니스 로직 메서드를 호출합니다.
5. `Cmr0200` 클래스의 상세 비즈니스 메서드가 관련된 데이터베이스 테이블(`CMR0020`, `CMR1000`, `CMR1010` 등)을 조회하거나 트랜잭션을 적용합니다.
6. 모든 처리가 종료되면 서블릿이 그 결과를 JSON 형식의 텍스트로 가공해 클라이언트로 회신합니다.## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)`Cmr0200Servlet`의 각 `requestType` 분기 조건과 위임 대상인 `Cmr0200` 메서드의 정적 매핑 관계 및 상세 역할은 다음과 같습니다.- **getFileList_excel**
  - 매핑 메서드: [Cmr0200.getFileList_excel](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L170-L187)
  - 설명: 체크인 화면에서 체크인 대상 파일 목록을 엑셀로 내보내기 위해 일괄 조회합니다.
- **getReqList**
  - 매핑 메서드: [Cmr0200.getReqList](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L191-L203)
  - 설명: Git 등 연동 형상관리 커밋 정보와 폐기/무수정/신규/수정 등 개발자의 체크인 요청 대상 목록을 획득합니다.
- **getDeployList**
  - 매핑 메서드: [Cmr0200.getDeployList](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L205-L217)
  - 설명: 테스트 배포 혹은 운영 배포가 가능한 파일 목록을 상태 조건에 따라 필터링하여 조회합니다.
- **chk_Resouce**
  - 매핑 메서드: [Cmr0200.chk_Resouce](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L223-L236)
  - 설명: 대상 시스템 내 특정 리소스 속성의 등록 개수를 점검합니다.
- **confSelect**
  - 매핑 메서드: [Cmr0200.confSelect](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L240-L256)
  - 설명: 체크인 과정에서 테스트 서버 구성에 따른 스킵 여부를 파악하고 승인권자 결재선 지정을 처리합니다.
- **dbioCheck**
  - 매핑 메서드: [Cmr0200.dbioCheck](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L260-L272)
  - 설명: 동일 테이블을 바라보는 DBIO 체크인 여부 및 물리적 테이블 레이아웃 불일치를 방지하기 위한 정합성을 검증합니다.
- **analCheck**
  - 매핑 메서드: [Cmr0200.analCheck](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L276-L288)
  - 설명: 특정 SR에 대한 영향분석 수행 결과가 유효한지 또는 미조치 건이 없는지 검사합니다.
- **getDownFileList_save**
  - 매핑 메서드: [Cmr0200.getDownFileList_save](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L292-L305)
  - 설명: 소스 파일의 로컬 다운로드 저장 내역을 처리하기 위해 호출합니다.
- **getDownFileList**
  - 매핑 메서드: [Cmr0200.getDownFileList](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L309-L322)
  - 설명: 사용자 로컬 홈 디렉토리를 기준으로 체크인 대상 다운로드 파일 경로 및 목록을 도출합니다.
- **getAnalFileList**
  - 매핑 메서드: [Cmr0200.getAnalFileList](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L326-L339)
  - 설명: 영향도 재컴파일이 권장되는 자식/부모 연관 파일 목록을 조회합니다.
- **getRelatFileList**
  - 매핑 메서드: [Cmr0200.getRelatFileList](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L343-L357)
  - 설명: 지정된 SRID에 종속된 타 모듈 파일 목록과 처리 상태를 반환합니다.
- **getDownFileList_Deploy**
  - 매핑 메서드: [Cmr0200.getDownFileList_Deploy](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L361-L374)
  - 설명: 개발체크인 또는 운영반영 배포 시 다운로드받을 전체 바이너리 및 텍스트 파일 리스트를 생성합니다.
- **request_Check_Bef**
  - 매핑 메서드: [Cmr0200.request_Check_Bef](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L378-L390)
  - 설명: 실제 체크인을 수행하기 전 원본 소스의 상태값과 최종 버전을 사전 확인합니다.
- **request_Check_In**
  - 매핑 메서드: [Cmr0200.request_Check_In](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L394-L410)
  - 설명:통제 시간 검사 후에 체크인/롤백 요청 정보를 등록하고 결재 및 형상관리 기본 테이블들을 업데이트합니다.
- **request_Deploy**
  - 매핑 메서드: [Cmr0200.request_Deploy](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L414-L431)
  - 설명: 배포 통제 조건을 평가한뒤 테스트 또는 운영 배포 적용 요청을 기록하고 상태 코드를 전이합니다.
- **pgmCheck**
  - 매핑 메서드: [Cmr0200.pgmCheck](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L435-L455)
  - 설명: 프로그램의 최종 수정 권한과 형상 서버 내 파일 상태 정합성을 개별 검사합니다.
- **moduleChk**
  - 매핑 메서드: [Cmr0200.moduleChk](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L459-L480)
  - 설명: 등록 대상 소스와 연관을 맺는 리소스 및 디렉토리 경로 정보의 정합성을 검증합니다.
- **moduleChk_new**
  - 매핑 메서드: [Cmr0200.moduleChk_new](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L484-L496)
  - 설명: 하위 모듈 중 미반영되거나 제외 대상이 있는지 최종 필터링합니다.
- **cmr0020_Insert**
  - 매핑 메서드: [Cmr0200.cmr0020_Insert](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L500-L520)
  - 설명: 프로그램 신규 등록 또는 속성 변경 사항을 `CMR0020` 마스터 테이블에 기록하고 연계 매핑 정보를 생성합니다.
- **cmr0020_Delete**
  - 매핑 메서드: [Cmr0200.cmr0020_Delete](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L524-L537)
  - 설명: 개발 단계에 있는 불필요한 프로그램 정보를 마스터 테이블 및 관련 연계 맵 테이블에서 삭제합니다.
- **checkTestCase**
  - 매핑 메서드: [Cmr0200.checkTestCase](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L541-L554)
  - 설명: 단위 테스트용 연계 프로그램 관계 정보를 체크하고 필요시 정리합니다.
- **fileOpenChk**
  - 매핑 메서드: [Cmr0200.fileOpenChk](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L558-L572)
  - 설명: 긴급 적용 여부나 적용 예약 일시의 타당성(영업일 외 불가 여부 등)을 정합 검증합니다.
- **chkRelease**
  - 매핑 메서드: [Cmr0200.chkRelease](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L576-L590)
  - 설명: 수시/일반 적용 시점의 타당성을 평가하기 위해 영업 마감 기준 시간 등 정책 조건을 대조합니다.
- **execShell**
  - 매핑 메서드: [Cmr0200.execShell](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L594-L608)
  - 설명: 지정된 외부 쉘 명령어를 실행하여 파일 복사 또는 컴파일 빌드를 호출합니다.
- **execShell_was**
  - 매핑 메서드: [Cmr0200.execShell_was](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L612-L626)
  - 설명: WAS와 관계된 연계 기동 스크립트를 백그라운드로 처리합니다.
- **execShell_ap**
  - 매핑 메서드: [Cmr0200.execShell_ap](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L630-L644)
  - 설명: AP(애플리케이션) 컴파일과 관계된 스크립트를 기동합니다.
- **diffList**
  - 매핑 메서드: [Cmr0200.diffList](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L648-L662)
  - 설명: 텍스트 기반 소스 파일 버전 간의 차이점을 추출하여 라인 단위로 비교합니다.
- **mciCheck**
  - 매핑 메서드: [Cmr0200.mciCheck](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L666-L678)
  - 설명: 채널 인터페이스용 XML 레이아웃과 데이터 검증 로직의 적합성을 체크합니다.
- **chk_SrItem**
  - 매핑 메서드: [Cmr0200.chk_SrItem](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L682-L695)
  - 설명: 운영 배포 신청에 묶인 SR 관련 건 중 임의의 체크아웃 취소나 누락 정보가 있는지 검사합니다.
- **chk_SrCheckOutCancel**
  - 매핑 메서드: [Cmr0200.chk_SrCheckOutCancel](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L699-L711)
  - 설명: 결재 진행 중 체크아웃 취소 처리가 등록된 상세 정보가 존재하는지 조회합니다.
- **chk_Realstopyn**
  - 매핑 메서드: [Cmr0200.chk_Realstopyn](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L715-L726)
  - 설명: 현 시점 기준 운영 배포 중지 락이 활성화되어 있는지 여부를 판별합니다.
- **chk_QAstopyn**
  - 매핑 메서드: [Cmr0200.chk_QAstopyn](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L730-L741)
  - 설명: 현 시점 기준 QA 테스트 반영 중지 락이 걸려 있는지 여부를 확인합니다.
- **request_Close**
  - 매핑 메서드: [Cmr0200.request_Close](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L745-L762)
  - 설명: 프로그램의 영구 폐기 승인 요청을 기록하고 연관 정보의 상태 코드를 변경합니다.

## 4. 주요 파일 및 DB 테이블

- 주요 파일
  - 서블릿 클래스: [Cmr0200Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
  - 비즈니스 클래스: `Cmr0200.java` (패키지명 `app.eCmr.Cmr0200` 하위에 위치)
- 주요 DB 테이블
  - `CMR0020` (프로그램 마스터 테이블)
  - `CMR0022` (프로그램 다중 연계 관계 정보)
  - `CMR1000` (요청 기본 마스터 정보)
  - `CMR1010` (요청 상세 파일 리스트 및 결재선 맵)
  - `CMM0036` (리소스 기본 정보 및 플래그 맵)
  - `CMM0037` (관련 동시 적용 리소스 스펙 정의)
  - `CMM0070` (디렉토리 및 소스 드라이브 맵 정보)

## 5. 유지보수 참고사항

사용자로부터 직접적인 결함 수정이나 개선 로직 요구사항이 포함되어 있지 않아, 유지보수 대상을 판별하지 않고 세부 수정을 위한 코드는 제공하지 않습니다.

## 6. 추천 추가 질문

- [Cmr0200.java에 구현된 request_Check_In 트랜잭션 도중 DBIO 체크가 실패하면 롤백은 어떻게 동작하나요?](file:///C:/ecams-ai/scratch/agy-probe/wiki/광주은행/kjbank_html5/Pages/Servlets/_webPage_ecmr_Cmr0200Servlet.md#L133-L141)
- [TokenService에서 읽어오는 JWT의 사용자 권한 정보는 Cmr0200Servlet의 switch-case 분기 전에 어떻게 유효성 검사를 거치게 되나요?](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java#L51-L54)
- [Cmr0200의 chkRelease 메서드는 CMM0014 테이블로부터 영업일 일정을 어떠한 구조의 쿼리로 판별합니까?](file:///C:/ecams-ai/scratch/agy-probe/wiki/광주은행/kjbank_html5/Pages/Servlets/_webPage_ecmr_Cmr0200Servlet.md#L202-L218)

---

### 작업 요약
`Cmr0200Servlet.java` 소스 코드 및 `_webPage_ecmr_Cmr0200Servlet.md` 위키 파일 분석을 수행하였습니다. `Cmr0200Servlet` 내에서 처리하는 총 33개의 `requestType` 식별 및 위임 클래스인 `Cmr0200`으로의 메서드 매핑 구조와 핵심 비즈니스 로직을 정리하고 형식 A 규격에 맞추어 상세 기술 문서를 작성하였습니다.
