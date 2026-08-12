# PMS 코드 검색 브릿지 결정 기록

## 2026-08-12

- 고객사 연결 정본은 별도 하드코딩 표가 아니라 기존 `companies.json`과 `repos.json`이다.
- 이름 비교는 유니코드 NFKC 정규화 후 공백·기호를 제거한다.
- 정확 일치가 없으면 PMS 이름 안에 포함된 회사명 중 가장 긴 이름만 선택한다.
  예를 들어 `토스뱅크`는 `토스`로 연결되고 `하나은행중국법인`은 더 긴 동일 회사에 연결된다.
- 고객사 격리를 위해 선택된 회사의 `companyId`가 붙은 repo 외에는 검색하지 않는다.
- 인덱스가 없는 repo는 후보에서 제외한다. 현재 실제 E2E 대상은
  `kjbank_html5_entity_index.json`이 있는 광주은행이다.
- PMS는 azbrain의 문자열 `entityId`를 저장하지 않고 파일명과 경로만 사용한다.
- 컨테이너 `pms-bridge`를 PMS 백엔드와 같은 토큰으로 기동했다.
- PMS 백엔드 컨테이너에서 `http://host.docker.internal:8790/pms/code-search`를 호출해 광주은행 `Cmr02`가 실제 `workspace\광주은행\kjbank_html5\src\app\eCmr\Cmr0200.java`로 검색되는 것을 확인했다.
- PMS `.env`의 브릿지 URL은 위 Docker 호스트 주소로 바꿨다. 다만 실행 중 `pms-backend`가 다른 워크트리 Compose 소속이라 안전상 교체하지 못해 인증된 `/api/v1/knowledge/entities/autocomplete` 화면 E2E는 남았다.