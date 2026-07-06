# UI 리프레시 체크리스트

## 0. 준비
- [x] 현재 UI 구조 파악 (사이드바 + 채팅 메인 + 모달)
- [x] 색 인벤토리 (하드코딩 ~50 고유색, 인라인 style 266개)
- [x] 검증 루프 확보 (puppeteer + shot.js, 포트 5000)
- [x] 베이스라인 스크린샷 (`shots/main-light.png`)
- [x] plan / checklist / context-notes 작성

## 1. 토큰화 (시각 무변화)
- [x] CSS 전체(1~1586) 정독, 색 사용 분류
- [x] "항상 다크" 영역 색 식별 (코드뷰어/위키/메시지)
- [x] `:root` 에 누락 시맨틱 토큰 추가 (--green-border/--danger/--danger-light)
- [x] 하드코딩 색 → `var()` 치환 (CSS 5곳 + 인라인 danger/흰배경)
- [x] 검증: 라이트 픽셀 동일 (바이트 일치) → 커밋

## 2. 다크 팔레트 + 토글
- [x] `[data-theme="dark"]` 팔레트 정의 (accent/green/danger 밝은 변형, *-light 는 반투명 틴트)
- [x] 토글 버튼 (사이드바 footer), localStorage 저장
- [x] 초기 테마 = localStorage ?? prefers-color-scheme, FOUC 가드 (head 인라인 스크립트)
- [x] 코드블록/소스뷰어 = 항상 다크 유지, 모달/위키 = var() 자동 대응 확인
- [x] 검증: 라이트/다크 + 모달 다크 스크린샷 → 커밋

## 3. 이모지 → SVG 아이콘
- [x] 아이콘 세트 정의 (ICONS 맵 + svgIco/injectIcons, data-ico 주입)
- [x] 사이드바 14개 + 로고/로그아웃/empty/첨부/알림/테마 교체
- [x] 동적 생성부(newChat empty, 알림 상태) svgIco 직접 삽입
- [x] 라이트/다크 검증 → 커밋

## 4. 간격/타이포 폴리시
- [x] 사이드바 버튼 고스트화 (평소 투명, hover만 배경, 새 대화만 채움)
- [x] 역할은 색으로만 구분 (일반=중립, admin=accent, wiki=green)
- [x] 이미-다크 채팅 요소(피드백/에러/재연결/correction) → 기존 토큰 재사용 (라이트=파스텔, 다크=틴트)
- [x] populated chat 라이트/다크 + 로그인 라이트/다크 검증 → 커밋

## 5. 모달 전수 정리 + 소스뷰어 풀스크린 (사용자 추가 요청)
- [x] 모달 제목 이모지 10종 → SVG (settings/key/shield/database/file/building/users/book/code/search)
- [x] 소스뷰어 풀스크린(100vw/100dvh) + 💾→download / ⬅️→arrowLeft
- [x] repoMainBtn textContent→innerHTML 버그 수정(SVG 보존)
- [x] 동적 하드코딩 색 토큰화(추천질문/audit/구분선/라벨/피드백/blockquote/에러/코드칩)
- [x] 모달 라이트+다크 전수 캡처 + audit populated 라이트 검증

## 검증 자료 (docs/ui-refresh/, shots*/ 는 gitignore)
- shot.js (메인 empty), shot-chat.js (채운 채팅), shot-modals.js (전체 모달 라이트+다크+audit), shot-login.js, shot-toggle.js (토글 실동작)
