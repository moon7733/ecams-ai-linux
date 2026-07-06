[ELAPSED] 165.3s  exit=0  netIssue=false

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)

이 워크스페이스에서는 `wiki/`, `graphify-out/`, `MEMO.md`를 찾지 못했습니다. 그래서 직접 소스 기준으로 확인했습니다.

사용한 파일은 아래 두 개입니다.

- [Cmr0200Servlet.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
- [Cmr0200.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)

---

## 1. 요약 (화면 목적 + 서버측 최종 처리 결과)

`Cmr0200Servlet`은 eCmr 화면에서 넘어오는 JSON 요청을 `requestType`으로 분기해 `Cmr0200`의 동일명 메서드로 위임하는 범용 서블릿입니다.

서버측 최종 처리는 다음 순서입니다.

- 요청 JSON에서 `requestType`을 읽습니다.
- JWT 토큰이 없으면 접근 불가로 처리합니다.
- `switch(requestType)`으로 private helper 메서드에 분기합니다.
- 각 helper는 `Cmr0200`의 대응 메서드를 호출합니다.
- 반환값은 `ParsingCommon.toJson(...)`로 감싸서 텍스트 응답으로 돌려줍니다.

`requestType`이 목록에 없으면 `Servlet Function Not Exists` 예외가 납니다.

---

## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)

화면 JS는 `requestType`과 필요한 파라미터를 JSON으로 만들어 `Cmr0200Servlet`로 POST합니다.  
이 요청은 아래처럼 흘러갑니다.

1. 화면 JS / AJAX 요청
2. `Cmr0200Servlet.doPost`
3. `requestType` 분기
4. 서블릿 private helper 메서드
5. `app.eCmr.Cmr0200`의 동일명 메서드
6. DB 처리 또는 비즈니스 로직 수행
7. 결과를 JSON 문자열로 반환

`doGet()`은 별도 로직 없이 `doPost()`로 넘깁니다.

---

## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)

이 요청에서 핵심은 `Cmr0200Servlet`의 디스패처 로직입니다.  
실제 비즈니스 로직은 `Cmr0200` 안에 있지만, 서블릿은 공통 패턴으로만 동작합니다.

공통 처리 패턴은 아래와 같습니다.

- `ParsingCommon.getJsonStr(request)`로 원문 JSON 문자열을 읽습니다.
- `JsonParser`로 JSON 파싱을 합니다.
- `ParsingCommon.jsonEtoStr(..., "requestType")`로 분기 키를 읽습니다.
- `TokenService.getToken(request)`로 토큰을 확인합니다.
- 토큰이 비어 있으면 `ERROR:Not Accessible.` 예외를 던집니다.
- 각 `case`마다 전용 helper 메서드를 호출합니다.
- helper는 다음 순서로 처리합니다.
  - `new Cmr0200()` 생성
  - JSON 필드를 파라미터로 추출
  - `cmr0200.<동일명 메서드>(...)` 호출
  - `ParsingCommon.toJson(...)`로 감싸 반환
- `IOException`, 일반 `Exception`은 `"ERROR"+e.getMessage()` 형태로 반환합니다.

즉, 이 서블릿의 핵심 로직은 “검증된 요청만 받아서 `Cmr0200` 메서드로 정확히 넘기는 라우터”입니다.  
예외 분기와 권한 분기만 있고, 여기서 추가 비즈니스 규칙은 거의 없습니다.

---

## 4. 주요 파일 및 DB 테이블

주요 파일은 아래입니다.

- [Cmr0200Servlet.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/html/app/eCmr/Cmr0200Servlet.java)
- [Cmr0200.java](C:/ecams-ai/workspace/광주은행/kjbank_html5/src/app/eCmr/Cmr0200.java)

이 요청에서 직접 확인된 DB 테이블은 서블릿이 아니라 `Cmr0200.java` 내부 SQL 기준입니다.

- `cmr0020`
- `cmr1010`
- `cmr1030`
- `cmr1060`
- `cmm0031`
- `cmm0036`
- `cmm0037`
- `cmm0038`

다만 `requestType` 매핑 자체는 DB 테이블과 직접 1:1 대응하지 않고, `Cmr0200` 내부 구현에 따라 달라집니다.

---

## 5. 요청타입 매핑 표

| `requestType` | `Cmr0200Servlet` private helper | `Cmr0200` 메서드 |
|---|---|---|
| `getFileList_excel` | `getFileList_excel(jsonElement)` | `getFileList_excel(fileList, UserId, SysCd, SinCd, TstSw, SysInfo)` |
| `getReqList` | `getReqList(jsonElement)` | `getReqList(etcData)` |
| `getDeployList` | `getDeployList(jsonElement)` | `getDeployList(etcData)` |
| `chk_Resouce` | `chk_Resouce(jsonElement)` | `chk_Resouce(syscd, Rsrccd)` |
| `confSelect` | `confSelect(jsonElement)` | `confSelect(SysCd, ReqCd, RsrcCd, UserId, QryCd)` |
| `dbioCheck` | `dbioCheck(jsonElement)` | `dbioCheck(fileList)` |
| `analCheck` | `analCheck(jsonElement)` | `analCheck(fileList)` |
| `getDownFileList_save` | `getDownFileList_save(jsonElement)` | `getDownFileList_save(fileList, etcData)` |
| `getDownFileList` | `getDownFileList(jsonElement)` | `getDownFileList(fileList, etcData)` |
| `getAnalFileList` | `getAnalFileList(jsonElement)` | `getAnalFileList(fileList, etcData)` |
| `getRelatFileList` | `getRelatFileList(jsonElement)` | `getRelatFileList(UserId, srID, fileList)` |
| `getDownFileList_Deploy` | `getDownFileList_Deploy(jsonElement)` | `getDownFileList_Deploy(fileList, etcData)` |
| `request_Check_Bef` | `request_Check_Bef(jsonElement)` | `request_Check_Bef(chkInList)` |
| `request_Check_In` | `request_Check_In(jsonElement)` | `request_Check_In(chkInList, etcData, ConfList, confFg, scriptList)` |
| `request_Deploy` | `request_Deploy(jsonElement)` | `request_Deploy(chkInList, etcData, befJob, ConfList, confFg, scriptList)` |
| `pgmCheck` | `pgmCheck(jsonElement)` | `pgmCheck(UserId, SysCd, DsnCd, RsrcName, RsrcCd, JobCd, LangCd, ProgTit, DirPath)` |
| `moduleChk` | `moduleChk(jsonElement)` | `moduleChk(UserId, SysCd, DsnCd, RsrcName, RsrcCd, JobCd, LangCd, ProgTit, DirPath, BaseItem)` |
| `moduleChk_new` | `moduleChk_new(jsonElement)` | `moduleChk_new(fileList)` |
| `cmr0020_Insert` | `cmr0020_Insert(jsonElement)` | `cmr0020_Insert(UserId, SysCd, DsnCd, RsrcName, RsrcCd, JobCd, LangCd, ProgTit, BaseItem)` |
| `cmr0020_Delete` | `cmr0020_Delete(jsonElement)` | `cmr0020_Delete(UserId, ItemId)` |
| `checkTestCase` | `checkTestCase(jsonElement)` | `checkTestCase(UserId, ItemId)` |
| `fileOpenChk` | `fileOpenChk(jsonElement)` | `fileOpenChk(UserId, fileList, baseFile)` |
| `chkRelease` | `chkRelease(jsonElement)` | `chkRelease(ReleaseType, ReleaseDay, ReleaseTime)` |
| `execShell` | `execShell(jsonElement)` | `execShell(shFile, parmName, viewSw)` |
| `execShell_was` | `execShell_was(jsonElement)` | `execShell_was(shFile, parmName, viewSw)` |
| `execShell_ap` | `execShell_ap(jsonElement)` | `execShell_ap(shFile, parmName, viewSw)` |
| `diffList` | `diffList(jsonElement)` | `diffList(UserId, sysCd, fileList)` |
| `mciCheck` | `mciCheck(jsonElement)` | `mciCheck(fileList)` |
| `chk_SrItem` | `chk_SrItem(jsonElement)` | `chk_SrItem(etcData, reqFiles)` |
| `chk_Realstopyn` | `chk_Realstopyn(jsonElement)` | `chk_Realstopyn()` |
| `chk_QAstopyn` | `chk_QAstopyn(jsonElement)` | `chk_QAstopyn()` |
| `request_Close` | `request_Close(jsonElement)` | `request_Close(chkInList, etcData, befJob, ConfList, confFg, scriptList)` |
| `chk_SrCheckOutCancel` | `chk_SrCheckOutCancel(jsonElement)` | `chk_SrCheckOutCancel(etcData)` |

`default` 분기는 `Servlet Function Not Exists` 예외로 끝납니다.

---

## 6. 추천 추가 질문

- `request_Deploy`, `request_Close`, `request_Check_In`이 실제로 어떤 DB 작업을 하는지까지 이어서 정리해드릴까요.
- 각 `requestType`이 화면의 어떤 버튼이나 JS 함수에서 호출되는지도 추적해드릴까요.
- `cmr0020_Insert`와 `cmr0020_Delete`의 검증 조건과 테이블 영향 범위까지 풀어드릴까요.
