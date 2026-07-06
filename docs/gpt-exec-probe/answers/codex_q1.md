[ELAPSED] 337.7s  exit=0  netIssue=false

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)

- 워크스페이스에서 `wiki/` 경로는 확인되지 않아, 직접 읽을 수 있는 소스와 진행 문서로 추적했습니다.
- 사용한 근거 파일은 다음입니다.
  - [docs/allow-partial-deploy/context-notes.md](C:/ecams-ai/workspace/광주은행/kjbank_html5/docs/allow-partial-deploy/context-notes.md)
  - [WebContent/js/ecams/apply/ApplyRequest.js](C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)
  - [src/html/app/eCmr/Cmr0200Servlet.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
  - [src/app/eCmr/Cmr0200.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)

## 1. 요약 (화면 목적 + 서버측 최종 처리 결과)

- `ApplyRequest.js`는 운영배포 신청 화면에서 선택된 파일 목록을 모으고, SR 선택 여부와 배포 구분에 따라 추가 검증과 관련 파일 확장을 수행한 뒤 신청을 보냅니다.
- 지금 구조는 SR이 걸린 경우 파일을 “개별 1개”로 보내는 것이 아니라, 관련 파일을 함께 묶어 `secondGridData` 전체를 신청 대상으로 만드는 쪽에 가깝습니다.
- 서버는 `Cmr0200Servlet.java`에서 `request_Deploy`를 받아 `Cmr0200.request_Deploy()`로 넘기고, 그 메서드가 `cmr1000`와 `cmr1010`에 신청 헤더와 상세를 저장합니다.
- 즉, 파일 단위 신청으로 바꾸려면 화면에서 묶는 로직과, 서버에서 관련 파일을 다시 확장하는 로직을 같이 손봐야 합니다.

## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)

- 화면에서 `cmdReqClick()`가 실행됩니다.
- `ApplyRequest.js`에서 시스템, SR, 대상 파일 개수를 검증합니다.
- 운영배포인 경우 `chk_SrItem`, `chk_SrCheckOutCancel`, `getRelatFileList` 같은 requestType으로 SR 묶음 검증과 관련 파일 확인을 수행합니다.
- 최종적으로 `reqQuestConf()`가 `request_Deploy`를 담아 `/webPage/ecmr/Cmr0200Servlet`로 전송합니다.
- `Cmr0200Servlet.java`는 `requestType = request_Deploy`를 `Cmr0200.request_Deploy()`에 연결합니다.
- `Cmr0200.request_Deploy()`는 전달받은 `chkInList`를 기준으로 `cmr1000` 신청 헤더를 만들고, 각 파일을 `cmr1010` 상세로 넣습니다.
- 이후 `request_Confirm()`와 후속 상태 갱신이 이어집니다.

## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)

- 화면 쪽 핵심은 [ApplyRequest.js](C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)입니다.
- `cmdReqClick()`에서 먼저 시스템 선택, SR 선택, 신청 대상 파일 존재 여부를 검사합니다.
- 운영배포(`reqCd == "04"`)에서는 추가로 `cm_sysinfo` 비트값을 보고 SR 전체가 한 번에 움직여야 하는 정책이 있으면 `chk_SrItem`으로 서버 검증을 수행합니다.
- `reqQuestConf()`에서는 현재 선택된 `secondGridData` 전체를 `chkInList`로 넘깁니다.
- 이 단계에서 SR 선택 시 `getRelatFileList`를 호출해 관련 파일 목록을 다시 받아오고, `RealFileModal`을 띄워 추가 포함 여부를 처리합니다.
- 서버 쪽 `request_Deploy()`는 신청 데이터를 받으면 다음을 수행합니다.
  - 시스템 중지 여부를 검사합니다.
  - `chkInList` 각 항목마다 `bldcdChk()`로 사전 조건을 검사합니다.
  - 건수 기준으로 `cmr1000` 헤더를 생성합니다.
  - 각 파일을 `cmr1010` 상세로 저장합니다.
  - `request_Confirm()`를 호출해 승인 라인을 구성합니다.
  - `cmr1010.cr_confno`와 `cmr0020.cr_status`를 갱신합니다.
- 여기서 중요한 점은 서버가 “SR 단위”를 강제한다기보다, 이미 클라이언트가 SR 관련 파일을 한꺼번에 넣어 보내는 구조를 그대로 받아 저장한다는 점입니다.
- 반대로 `getDownFileList_Deploy()`는 실제로 관련 파일을 묶어 확장하는 강한 후보입니다.
  - `cmr1010`를 `cr_acptno`와 `cr_baseitem` 기준으로 조회합니다.
  - 조회된 관련 파일을 `rtList`에 계속 추가합니다.
  - 즉, 선택한 1개 파일을 같은 baseitem 계열 전체로 넓혀버리는 역할을 합니다.
- 그래서 파일 단위 신청으로 바꾸려면, 이 확장 지점이 핵심입니다.

## 4. 주요 파일 및 DB 테이블

- 주요 화면 파일.
  - [WebContent/js/ecams/apply/ApplyRequest.js](C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)
  - 운영배포 신청의 진입점과 관련 파일 확장, 최종 전송이 들어 있습니다.
- 주요 서블릿 파일.
  - [src/html/app/eCmr/Cmr0200Servlet.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
  - `requestType` 분기만 담당합니다.
- 주요 클래스 파일.
  - [src/app/eCmr/Cmr0200.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)
  - `getDownFileList_Deploy()`, `getRelatFileList()`, `chk_SrItem()`, `chk_SrCheckOutCancel()`, `request_Deploy()`가 핵심입니다.
- 주요 DB 테이블.
  - `cmr1000`
  - `cmr1010`
  - `cmr0020`
  - `cmm0036`
  - `cmm0037`

## 5. 유지보수 참고사항

**5-1. 수정 범위 판정 (반드시 한 줄로 먼저 명시)**

판정. 넓음 — 사유. JS/서버 로직 3개 이상 파일 수정 필요 + 파일 확장 로직과 신청 저장 로직이 분리되어 있어 한 파일만 고치면 동작이 남습니다.

**5-2. 변경 대상 리스트**

- `ApplyRequest.js`
  - `cmdReqClick()`
  - `reqQuestConf()`
  - `checkDuplication()`
  - `addDataRow_sub()`
- `Cmr0200Servlet.java`
  - `request_Deploy`, `getDownFileList_Deploy`, `getRelatFileList`, `chk_SrItem`, `chk_SrCheckOutCancel` 분기 유지 여부 점검
- `Cmr0200.java`
  - `getDownFileList_Deploy()`
  - `getRelatFileList()`
  - `chk_SrItem()`
  - `chk_SrCheckOutCancel()`
  - `request_Deploy()`

**5-3. 핵심 변경 지점 before/after 스니펫**

1. `ApplyRequest.js`의 SR 관련 파일 확장 제거 또는 옵션화

```js
// before
if (getSelectedIndex('cboSrId')>0) {
    for (var i=0;secondGridData.length>i;i++) {
        if (secondGridData[i].baseitem != secondGridData[i].cr_itemid && secondGridData[i].cm_info.substr(8,1) == '1') {
            lstModuleData.push(copyData);
        }
    }
    ajaxCallWithJson('/webPage/ecmr/Cmr0200Servlet', {
        UserId : userId,
        srID : getSelectedVal('cboSrId').value,
        fileList : lstModuleData,
        requestType : 'getRelatFileList'
    }, 'json');
}
```

```js
// after
if (getSelectedIndex('cboSrId')>0) {
    // 파일 단위 신청이면 SR 관련 파일을 자동 확장하지 않음
    // 필요 시 사용자 옵션으로만 확장
}
```

2. `ApplyRequest.js`의 최종 신청 전송을 현재 선택 파일만 보내도록 변경

```js
// before
var tmpData = {
    etcData : requestData,
    chkInList : secondGridData,
    ConfList : confirmData,
    befJob : befJobData,
    scriptList : scriptData,
    requestType : 'request_Deploy'
}
```

```js
// after
var tmpData = {
    etcData : requestData,
    chkInList : selectedFileOnlyList,
    ConfList : confirmData,
    befJob : befJobData,
    scriptList : scriptData,
    requestType : 'request_Deploy'
}
```

3. `Cmr0200.java`의 `getDownFileList_Deploy()`에서 관련 파일 일괄 확장 제거

```java
// before
strQuery.append(" where c.cr_acptno=? and c.cr_baseitem=? \n");
...
while (rs.next()) {
    // 같은 baseitem의 관련 파일을 전부 rtList에 추가
}
```

```java
// after
// 파일 단위 신청이면 현재 선택한 cr_itemid만 반환
strQuery.append(" where c.cr_acptno=? and c.cr_itemid=? \n");
...
// 관련 파일 추가 루프를 조건부로 비활성화
```

4. `request_Deploy()`는 원칙적으로 유지하되 입력 의미만 바꾸기

```java
// before
public String request_Deploy(ArrayList<HashMap<String,String>> chkInList, ...)
```

```java
// after
// chkInList가 SR 묶음이 아니라 파일 1건 또는 사용자가 선택한 파일들만 담도록 보장
public String request_Deploy(ArrayList<HashMap<String,String>> chkInList, ...)
```

**5-4. 추가 결정이 필요한 항목**

- 파일 단위 신청을 “기본 동작”으로 바꿀지, 아니면 “SR 묶음 / 파일 단위” 토글로 둘지 결정해야 합니다.
- `chk_SrItem`와 `chk_SrCheckOutCancel`를 파일 단위에서도 계속 적용할지, SR 선택 시에만 적용할지 정해야 합니다.
- `RealFileModal`을 계속 쓸지, 아니면 아예 제거할지 결정해야 합니다.
- 기존 운영 정책상 `cm_sysinfo` 비트로 SR 강제가 걸린 시스템이 있는지 확인해야 합니다.
- 배포 이력 화면이나 신청 상세 화면이 `cmr1010` 묶음 기준을 전제로 렌더링하는지 같이 점검해야 합니다.

## 6. 추천 추가 질문

- SR 묶음과 파일 단위를 화면에서 토글로 둘지, 파일 단위를 기본값으로 바꿀지 정해드릴까요.
- `chk_SrItem`와 `getRelatFileList` 중 어디까지 완화해야 하는지 기준도 같이 정리해드릴까요.
- 운영배포 외에 QA, 체크인도 같은 방식으로 분리할지 같이 봐드릴까요.
