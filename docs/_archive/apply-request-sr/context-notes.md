# Context Notes - 운영배포 SR 신청 제한 완화

## 결정 사항 및 근거
- 기존 운영배포 시 SR 묶임 누락 프로그램 체크가 엄격하여 사용자가 진행할 수 없는 문제를 해결하기 위해, `dialog.alert`로 강제 중단시키던 로직을 `confirmDialog.confirm`으로 변경하여 사용자 선택에 따라 예외적 진행(Partial Deployment)이 가능하도록 설계함.
- `substr(26,1) == "1"` 분기의 경우, 1차 `chk_SrItem` 체크 후 2차 `chk_SrCheckOutCancel` 체크로 이어져야 하므로, 2차 체크 과정을 콜백으로 감싸서 비동기 흐름을 유지함.

## 특이 사항
- 한글 인코딩 깨짐 이슈가 있을 수 있으므로 UTF-8 유지를 확인.
- `confirmDialog` 호출 시 `this.key === 'ok'` 판정을 따름.
