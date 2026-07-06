# Context Notes

- **플러그인 클라이언트 분리 근거**: 고객사별 플랫폼(Eclipse, Doma, RSA, iStudio, VSCode, IntelliJ)에 따라 클라이언트 플러그인이 6종으로 다름. 이를 레파지토리 통합 관리에서 정확하게 구분해 달라는 요청. 서버 플러그인은 1종(`plugin_server`)으로 유지.
- **백엔드 빌더 로직 변경 사항**: `wikiBuilder.js` 및 `graphifyBuilder.js`에서 기존 `repoType === 'plugin_client'` 하드코딩 대신 `repoType.startsWith('plugin_')` 조건식을 사용. 이를 통해 신규 등록되는 어떠한 "plugin_" 계열의 레포지토리라도(서버 플러그인 포함) 안전하게 `buildPluginWiki()` 및 `buildPluginGraph()` 체인으로 타게 되어 질문/답변 시 위키 참조와 인덱싱에 문제가 없도록 보장.
- **테스트 결과 검증 완료**: `test_script`를 통하여 `eCAMS_Plugin`을 Eclipse 타입으로 변경 후 위키가 온전히 생성되는 것을 검증함. `triggerIndexBuild` 함수 내에서 이 타입 문자열이 그대로 Builder 함수들에 전달되어 처리됨을 확인.
