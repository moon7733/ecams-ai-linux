# Context Notes

- **변경 사유**: 기존 웹 프로젝트(`type: web`)는 등록명/폴더명이 `_html5`로 끝나야지만 `wikiBuilder.js`에서 전용 필터(`makeHtml5Filter`)가 작동했다. 이는 "이름 무관 구분값(type)"을 사용하는 시스템 철학에 어긋나므로, `web`을 `web_html5`와 `web_general`로 분리해 완벽히 이름의존성을 탈피하기 위함.
- **수동 데이터 유지 보장**: 이미 시스템에 존재하는 웹 레포지토리들은 기존처럼 `_html5`로 끝날 경우 `web_html5`로, 아니면 `web_general`로 판단하도록 `server.js`의 시작 루틴에 동적 마이그레이션 코드를 추가.
