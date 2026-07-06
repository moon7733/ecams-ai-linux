[ELAPSED] 67.9s  exit=0
[INCLUDE_DIRS] 4

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)- [Cmd0101.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmd/Cmd0101.java)
- [Cmd0101Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmd/Cmd0101Servlet.java)
- `wiki/광주은행/kjbank_html5/Pages/Classes/Cmd0101.md`
- `wiki/광주은행/kjbank_html5/Pages/Servlets/Cmd0101Servlet.md`## 1. 요약 (화면 목적 및 서버측 최종 처리 결과)- **화면 목적**은 형상관리 시스템에서 개발자가 프레임워크 목록을 조회하거나 관련 정보를 등록하고 변경하는 처리를 담당하는 것입니다.
- **서버측 최종 처리 결과**는 서블릿이 전달받은 JSON 파라미터를 기반으로 Java Class에서 DB Connection을 얻어 비즈니스 로직을 수행하고 최종 결과를 JSON 문자열 형태로 클라이언트에 응답하는 형식입니다.## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)1. **클라이언트 이벤트**는 UI 화면에서 목록 조회나 등록 버튼을 클릭했을 때 클라이언트 스크립트가 실행되는 단계입니다.
2. **서블릿 수신**은 클라이언트 요청이 [Cmd0101Servlet](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmd/Cmd0101Servlet.java)으로 전송되는 단계입니다. 이 서블릿에서 `get_frameworkList` 또는 `insCmr0020` 요청 유형에 따라 분기가 수행됩니다.
3. **자바 클래스 위임**은 서블릿이 전송된 JSON 형태의 데이터를 파싱한 후 [Cmd0101](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmd/Cmd0101.java) 인스턴스의 `get_frameworkList` 또는 `insCmr0020` 메서드를 실행하는 단계입니다.
4. **DB 쿼리 수행**은 `ConnectionResource`를 사용해 DB Connection을 생성한 뒤 `PreparedStatement`를 통해 쿼리를 수행하고 결과를 가져오는 과정입니다.## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)- **`get_frameworkList` 메서드의 상세 로직**은 다음과 같습니다.
  `gubun` 파라미터 값에 따라 분기하여 적절한 DB 데이터소스에 대한 추가 커넥션을 획득합니다. 획득한 커넥션과 쿼리를 사용하여 프레임워크 목록을 조회한 뒤 반환 목록에 담아 반환합니다. 이 과정에서 `gubun` 문자열의 첫 글자를 비교하기 위해 `substring(0, 1)`을 호출하나 `gubun`이 `null`인지에 대한 사전 검증이 없어 오류가 발생할 수 있습니다.
- **`insCmr0020` 메서드의 상세 로직**은 다음과 같습니다.
  전달받은 파일 리스트를 순회하면서 물리 파일 정보를 데이터베이스에 삽입하거나 데이터베이스로부터 정보를 가져옵니다. 중복이나 연쇄 처리를 검증하기 위해 디렉토리 경로 등의 값을 비교합니다. 이때 파일 리스트 내 개별 파일 정보 맵에서 특정 키를 가져와 바로 비교하는데 해당 키의 값이 존재하지 않아 `null`이 반환되는 경우 예외가 발생합니다.## 4. 주요 파일 및 DB 테이블- **주요 소스 파일**
  - [Cmd0101.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/app/eCmd/Cmd0101.java)
  - [Cmd0101Servlet.java](file:///C:/ecams-ai/scratch/agy-probe/workspace/광주은행/kjbank_html5/src/html/app/eCmd/Cmd0101Servlet.java)
- **주요 DB 테이블**
  - `cmm0020` (공통 코드 테이블)
  - `cmm0038` (볼륨/자원 상세 매핑 테이블)
  - `cmm0031` (서버 마스터 테이블)
  - `cmm0036` (자원 설정 상세 테이블)
  - `cmm0070` (디렉토리/데이터셋 테이블)
  - `cmr0020` (신청 상세 테이블)


## 5. 유지보수 참고사항

**5-1. 수정 범위 판정**

판정. 좁음 — 사유. 로직 내 안전한 null 비교 코드 적용으로 해결 가능하며 타 영향도 없음.

**5-2. 판정별 출력 형식**

```diff
--- a/src/app/eCmd/Cmd0101.java
+++ b/src/app/eCmd/Cmd0101.java
@@ -676,14 +676,14 @@
                                connCHN = connectionContextCHN.getConnection();
                                connCHNEPM = connectionContextCHNEPM.getConnection();
                        }
-                       if ("S".equals(gubun.substring(0,1))) {
+                       if (gubun != null && gubun.length() > 0 && "S".equals(gubun.substring(0,1))) {
                                connectionContextFMW = new ConnectionResource(false,"FMW");
                                connFMW = connectionContextFMW.getConnection();
                        }
-                       if ("M".equals(gubun.substring(0,1)) || "E".equals(gubun.substring(0,1)) || "I".equals(gubun.substring(0,1))) {
+                       if (gubun != null && gubun.length() > 0 && ("M".equals(gubun.substring(0,1)) || "E".equals(gubun.substring(0,1)) || "I".equals(gubun.substring(0,1)))) {
                                connectionContextCHN = new ConnectionResource(false,"CHN");
                                connectionContextCHNEPM = new ConnectionResource(false,"CHNEPM");
                                connCHN = connectionContextCHN.getConnection();
@@ -691,7 +691,7 @@
                                connBI = connectionContextBI.getConnection();
                        }

-                       if(gubun.equals("S1") || gubun.equals("0")){
+                       if("S1".equals(gubun) || "0".equals(gubun)){
                                strCd = "S1";
                                strQuery.setLength(0);
                                strQuery.append("select b.cm_volpath,b.cm_rsrccd,c.cm_codename,d.cm_info \n");
@@ -3731,7 +3731,8 @@
                                if ((i + 2) < fileList.size()) {
                                        for (j=i+1;fileList.size()>j;j++) {
                                                if (fileList.get(j).get("cm_dsncd") == null || "".equals(fileList.get(j).get("cm_dsncd"))) {
-                                                       if (fileList.get(i).get("cm_dirpath").equals(fileList.get(j).get("cm_dirpath"))) {
+                                                       String pathI = fileList.get(i).get("cm_dirpath");
+                                                       if (pathI != null && pathI.equals(fileList.get(j).get("cm_dirpath"))) {
                                                                rst = new HashMap<String, String>();
                                                                rst = fileList.get(j);
                                                                rst.put("cm_dsncd", strDsnCd);
@@ -3749,7 +3750,7 @@
                        for (int i=0;i<rtList.size();i++){
                                retMsg = svropen.statusCheck(etcData.get("cr_syscd"),rtList.get(i).get("cm_dsncd"),rtList.get(i).get("cr_rsrcname"),etcData.get("userid"),conn);
-                       if (retMsg.equals("0")) {
+                       if ("0".equals(retMsg)) {
                                //cmr0020_Insert(UserId,SysCd,DsnCd,RsrcName,RsrcCd,JobCd,LangCd,ProgTit,Service,"",conn);
                                //retMsg = cmd0100.cmr0020_Insert(etcData.get("userid"),etcData.get("cr_syscd"),rtList.get(i).get("cm_dsncd"),rtList.get(i).get("cr_rsrcname"),fileList.get(i).get("cr_rsrccd"),etcData.get("cr_jobcd"),rtList.get(i).get("cr_story"),"","",conn);
```


## 6. 추천 추가 질문

- [프레임워크 목록 조회 시 데이터 정합성을 위한 추가 DB 인덱스 설계 방법]
- [Java NullPointerException 예방을 위한 팀 내 공통 코딩 표준 가이드]
- [Servlet 계층에서 사전에 JSON 파라미터 널 검증을 자동화하는 필터 구축 방안]
