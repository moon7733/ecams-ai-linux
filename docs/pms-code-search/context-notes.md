# PMS 코드 검색 브릿지 결정 기록

## 2026-08-12

- 고객사 연결 정본은 별도 하드코딩 표가 아니라 기존 `companies.json`과 `repos.json`이다.
- 이름 비교는 유니코드 NFKC 정규화 후 공백·기호를 제거한다.
- 정확 일치가 없으면 PMS 이름 안에 포함된 회사명 중 가장 긴 이름만 선택한다.
  예를 들어 `토스뱅크`는 `토스`로 연결되고 `하나은행중국법인`은 더 긴 동일 회사에 연결된다.
- 고객사 격리를 위해 선택된 회사의 `companyId`가 붙은 repo 외에는 검색하지 않는다.
- ignored 인덱스 파일은 배포 정본이 아니므로 사용하지 않는다. 고객사 repo 연결 뒤 azbrain 소스뷰어의
  기존 파일명 검색을 재사용하며, pms-bridge는 ecams-ai 내부 API만 호출한다.
- PMS는 azbrain의 문자열 `entityId`를 저장하지 않고 파일명과 경로만 사용한다.
- 컨테이너 `pms-bridge`를 PMS 백엔드와 같은 토큰으로 기동했다.
- 최초 검증은 로컬 ignored 인덱스를 사용해 배포 환경을 재현하지 못했다. 이 방식은 폐기했다.
- 변경 후 pms-bridge가 ecams-ai 소스뷰어 내부 검색을 호출해 광주은행 `cmr`에서
  `Cmr0100Servlet.java` 등 실제 repo 파일명을 168ms에 반환하는 것을 컨테이너 E2E로 확인했다.
- PMS `.env`의 브릿지 URL은 위 Docker 호스트 주소로 바꿨다. 다만 실행 중 `pms-backend`가 다른 워크트리 Compose 소속이라 안전상 교체하지 못해 인증된 `/api/v1/knowledge/entities/autocomplete` 화면 E2E는 남았다.
