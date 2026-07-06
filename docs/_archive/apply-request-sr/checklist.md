# Checklist - 운영배포 SR 신청 제한 완화

- [ ] [ApplyRequest.js](file:///C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js) 내 `cmdReqClick()` 함수 분석
- [ ] 첫 번째 검증 블록 (`substr(19,1) == "1"`) 수정: `chk_SrItem` 결과 누락 시 `confirmDialog` 추가
- [ ] 두 번째 검증 블록 (`substr(26,1) == "1"`) 구조 개선: `chk_SrCheckOutCancel` 처리를 비동기 콜백에서 이어받도록 수정
- [ ] 수정한 소스 코드 검토 및 변경사항 테스트 (빌드 및 문법 오류 확인)
