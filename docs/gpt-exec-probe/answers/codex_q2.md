[ELAPSED] 232.5s  exit=0  netIssue=false

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)

이 워크스페이스에서는 `MEMO.md`와 `wiki/graph` 인덱스를 확인할 수 없어서, 직접 Java 소스를 읽어 NPE 위험 지점을 추렸습니다.

직접 확인한 파일은 아래입니다.

- [ConnectionInitialize.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/dbconn/ConnectionInitialize.java)
- [ConnectionResource.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/dbconn/ConnectionResource.java)
- [LoginManager.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/service/list/LoginManager.java)
- [UserList.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/service/list/UserList.java)

## 1. 요약 (화면 목적 + 서버측 최종 처리 결과)

이번 코드는 화면보다는 서버 공통 처리 계층에서 `NullPointerException` 위험이 큽니다.

가장 위험한 구간은 다음 3곳입니다.

- DB 연결 초기화 시 설정값이 `null`이면 바로 NPE가 날 수 있습니다.
- 로그인 검증 로직은 입력값과 DB 컬럼값을 그대로 `.equals()`로 비교해서, `null` 데이터가 섞이면 NPE가 날 수 있습니다.
- 세션 사용자 관리 유틸은 호출 인자가 `null`이면 즉시 NPE가 납니다.

즉, 최종 처리 결과는 로그인 실패가 아니라 서버 오류로 떨어질 가능성이 있습니다.

## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)

이건 화면 버튼 기반 흐름이라기보다 서버측 호출 흐름으로 보는 게 정확합니다.

- 서버 기동 또는 DB 접속 시도.
- `ConnectionInitialize.init()` 또는 `ConnectionResource.init()` 호출.
- `ConfigFactory`에서 설정값을 읽고 JDBC 접속 또는 DataSource 접속 수행.
- 로그인 요청 시 `LoginManager.isValid(UserId, usr_passwd)` 호출.
- `CMM0010`에서 정책값 조회.
- `CMM0040`에서 사용자 정보 조회 및 비밀번호 검증.
- 세션 사용자 관리 시 `UserList`의 `addUser`, `removeUser`, `getid`, `setid`, `logck` 호출.

## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)

### 3-1. `ConnectionInitialize.init()`

- 시작 시 DB 접속에 필요한 설정을 `ConfigFactory.getProperties(...)`로 읽습니다.
- `O_defaultAutoCommit`, `O_defaultReadOnly`를 문자열로 받은 뒤 `"true"`인지 비교합니다.
- 여기서 `defaultAutoCommit_s` 또는 `defaultReadOnly_s`가 `null`이면 바로 NPE가 납니다.
- 이 클래스는 서버 시작 시 실행되는 형태라, 설정 누락이 곧 기동 실패로 이어질 수 있습니다.

위험 코드 위치.

- [ConnectionInitialize.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/dbconn/ConnectionInitialize.java) `55행`, `57행`.

### 3-2. `ConnectionResource.init()`

- `O_jdbcUse` 값이 `"true"`이면 `DriverManager` 경로를 사용합니다.
- 아니면 JNDI `DataSource` 경로를 사용합니다.
- 분기 조건 자체가 `ConfigFactory.getProperties(...).equals("true")` 형태라서, 설정 키가 없거나 `null`이면 바로 NPE가 납니다.
- 같은 패턴이 `O_secu`, `connstr+"_jdbcUse"`, `connstr+"_secu"`에도 반복됩니다.

위험 코드 위치.

- [ConnectionResource.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/dbconn/ConnectionResource.java) `60행`, `64행`, 그리고 오버로드 메서드의 동일 패턴.

### 3-3. `LoginManager.isValid(...)`

- 로그인 정책은 먼저 `CMM0010`에서 읽습니다.
- 이후 `CMM0040`에서 사용자 계정을 조회합니다.
- 입력 비밀번호와 DB 값들을 여러 갈래로 비교합니다.
- 문제는 비교 방식이 대부분 `A.equals(B)` 형태라는 점입니다.
- `usr_passwd`가 `null`이면 `usr_passwd.equals(...)`에서 NPE가 납니다.
- `rs.getString(...)`는 DB 컬럼이 `null`이면 `null`을 돌려주므로, `rs.getString("CM_ADMIN").equals("1")` 같은 코드도 NPE 후보입니다.
- `CM_ACTIVE`, `CM_CPASSWD`, `CM_JUMINNUM`, `CM_CPASSWD2`, `MASTERPWD` 쪽도 같은 패턴입니다.
- 로그인 실패 횟수와 제한 시간에 따라 `UPDATE CMM0040`를 수행하므로, null 예외가 나면 단순 실패가 아니라 상태 갱신도 중간에 끊길 수 있습니다.

대표 위험 코드 위치.

- [LoginManager.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/service/list/LoginManager.java) `102행`, `106행`, `107행`.
- 같은 파일 `138행`, `143행`, `177행`, `199행`, `229행`.
- 같은 파일 `320행`, `322행`, `324행`, `331행`.
- 세션 매핑 관련 `424행`, `438행`, `461행`, `511행`, `525행`.

### 3-4. `UserList`

- 정적 `Vector`에 사용자 ID와 세션 ID를 저장합니다.
- 모든 메서드가 인자를 바로 `.equals()`로 비교합니다.
- `userName`, `user`, `name`이 `null`이면 바로 NPE입니다.
- 특히 `addUser`, `removeUser`, `getid`, `setid`, `logck`는 방어 코드가 없습니다.

위험 코드 위치.

- [UserList.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/service/list/UserList.java) `16행`, `29행`, `48행`, `62행`, `75행`.

## 4. 주요 파일 및 DB 테이블

### 주요 파일

- [ConnectionInitialize.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/dbconn/ConnectionInitialize.java)
- [ConnectionResource.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/dbconn/ConnectionResource.java)
- [LoginManager.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/service/list/LoginManager.java)
- [UserList.java](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/service/list/UserList.java)
- [ConfigFactory 관련 공통 설정 클래스들](/C:/ecams-ai/workspace/광주은행/kjbank_html5/src/com/ecams/common/base/)

### 관련 DB 테이블

- `CMM0010`  
  로그인 정책값 조회용.
- `CMM0040`  
  사용자 계정, 비밀번호, 활성화 상태, 오류 카운트 조회 및 갱신용.
- `CMM0044`  
  테스트 비밀번호/권한 확인 분기에서 사용.
- `CMM0030`  
  테스트 로그인 허용 조건 확인에 사용.

## 6. 추천 추가 질문

- 이 중에서 실제로 NPE가 나는 지점을 기준으로 우선 수정 대상 1순위를 정해드릴까요.
- `LoginManager`만 따로 잡아서 `null-safe` 패치안을 만들어드릴까요.
- 프로젝트 전체에서 `A.equals(B)` 패턴 중 위험한 것만 추가로 더 찾아드릴까요.
