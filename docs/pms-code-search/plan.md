# PMS 코드 검색 브릿지 계획

## 목표

PMS 작업기록의 수정 프로그램 자동완성이 고객사에 속한 실제 소스 인덱스만 검색하도록
`POST /pms/code-search`를 제공한다.

## 구현

1. `companies.json`의 고객사명과 `repos.json`의 `companyId`를 연결한다.
2. 정규화된 고객사명이 정확히 일치하면 우선하고, PMS 명칭이 더 긴 경우 가장 긴 포함 일치를 사용한다.
3. 해당 고객사 소유이며 `knowledge/*_entity_index.json`이 존재하는 repo만 검색한다.
4. 명시적인 `repo` 요청도 등록된 repo와 실제 인덱스 존재 여부를 검증한다.
5. 검색 결과는 `entityId`, `kind`, `name`, `paths`, `score`만 반환한다.

## 검증

- 고객사명 정규화와 repo 격리 단위 테스트를 통과한다.
- 실제 광주은행 인덱스로 브릿지 응답에 소스 경로가 포함되는지 확인한다.
- PMS에서 브릿지를 활성화하고 자동완성 응답에 `DICTIONARY`가 나타나는지 확인한다.
