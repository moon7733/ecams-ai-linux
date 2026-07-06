# Plan - 운영배포 SR 신청 제한 완화 (일부 누락 허용)

운영배포 시 특정 시스템속성(`substr(19, 1) == "1"` 혹은 `substr(26, 1) == "1"`) 설정에 따라, SR에 연결된 모든 프로그램이 신청 대상에 포함되지 않으면 `chk_SrItem` 체크 과정에서 경고 창을 띄우고 신청을 강제로 중단시켰습니다.
사용자 요청에 따라, 일부 프로그램이 누락되었더라도 경고 대화상자를 확인(Confirm)하고 계속 진행할 수 있도록 유연하게 개선합니다.

## 수정 대상 파일
- [ApplyRequest.js](file:///C:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/apply/ApplyRequest.js)

## 상세 계획
1. `cboSys.cm_sysinfo.substr(19,1) == "1"` 인 경우:
   - `chk_SrItem` 결과가 `"OK"`가 아닐 때, 기존 `dialog.alert` 대신 `confirmDialog.confirm`을 통해 계속 진행 여부를 묻습니다.
   - 사용자가 승인하면 `realApply()`를 호출합니다.
2. `cboSys.cm_sysinfo.substr(26,1) == "1"` 인 경우:
   - `chk_SrItem` 결과가 `"OK"`가 아닐 때, 기존 `dialog.alert` 대신 `confirmDialog.confirm`을 통해 계속 진행 여부를 묻습니다.
   - 사용자가 승인하면 2단계 검증인 `chk_SrCheckOutCancel` 검증 단계로 이어지도록 내부 헬퍼 함수를 호출하거나 로직을 연계합니다.
