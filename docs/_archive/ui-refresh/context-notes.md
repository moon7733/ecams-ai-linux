# UI 리프레시 컨텍스트 노트

## 결정 / 발견 (계속 append)

### 2026-06-09 착수
- **방향 확정**: 사용자가 "모던 미니멀(Linear/Vercel 풍) + 다크모드 토글" 선택. 색 베이스는 유지, 라이트 1순위.
- **검증 루프**: 헤드리스 브라우저 없었음 → puppeteer 설치. 서버는 이미 포트 5000 기동 중(사용자가 띄움). 로그인 게이팅은 캡처 시 `loginOverlay` 숨김으로 우회. `docs/ui-refresh/shot.js`.
- **색 인벤토리 발견**: 하드코딩 색이 grep 첫 추정(흑/백/bg)보다 훨씬 많음. `#ef4444`(빨강) 다수, 상태색(`#bbf7d0`,`#dcfce7`,`#16a34a`), 그리고 **다크 배경색이 이미 섞여 있음**(`#0d2137`,`#1e2a3a`,`#64b5f6`,`#b0c4de`,`#2a3f5f`,`#6fcf97`,`#eb5757`,`#ce93d8` 등 — 두 번씩 반복). → 코드뷰어/위키/메시지 블록이 항상 다크일 가능성. 토큰화 시 "항상 다크 vs 테마 추종" 구분 필요.
- **advisor 핵심 지적**: blind 리스타일 금지 — 검증 루프부터. 토큰화 먼저(시각 무변화)로 라이트 보호 후 다크 추가. 단일 파일이라 단계별 커밋.

### CSS 정독 완료 — 색 분류 확정
- **"항상 다크" 영역 (테마 무관, 유지)**: `.bubble pre`(#2d2d2d 코드블록), diff 토큰(#2ea043 등 GitHub 풍), `.sv-content`(#1e1e1e 소스뷰어). 라이트에서도 어두운 게 정상 → 다크 테마에서도 그대로. **미해결 질문 해소.**
- **시맨틱 토큰 추가**: `--green-border`, `--danger`, `--danger-light`. CSS 내 #ef4444/#fee2e2/#bbf7d0 5곳을 동일 값 var()로 치환 (시각 무변화).
- **인라인 하드코딩 ↔ 다크 오버라이드 불가**: 인라인 style 은 specificity 가 높아 `[data-theme=dark]` CSS 룰로 못 덮음. 다크에서 바뀌어야 하면 var() 토큰화가 유일한 길.
- **이미-다크 톤 인라인 요소 발견**: 채팅 버블 내 피드백 버튼(👍👎), "더 알아보기" 칩, 에러/재연결 버블, correction textarea 가 라이트 UI 안에서 다크 톤(#0d2137,#2a1f3d,#1a472a,#4a1a1a,#3a1f1f,#1e1e1e). 현재도 부조화. → 4단계 폴리시에서 "라이트엔 라이트칩 / 다크엔 다크칩" 으로 정리. 1단계 보류.
- **1단계 토큰화 범위**: 흰 배경 컨테이너(signup 전화 입력) `#fff`→`var(--surface)`, danger 버튼 `#ef4444`→`var(--danger)`. accent 버튼 위 `color:#fff` 는 다크에서도 유효해 유지.

### 2단계 다크 팔레트 완료
- **다크 팔레트 설계**: bg #1a1917 / surface #232220 / surface2 #2c2a27 / border #36332e / text #ededec. accent는 #4f8cf7(밝은 파랑, pure #2563eb 칙칙함 회피), green #4ade80, danger #f87171. **`*-light` 토큰은 다크에서 반투명 틴트**(rgba)로 — 어두운 배경에 자연스럽게 얹힘.
- **FOUC 가드**: `<head>` 인라인 스크립트가 body 렌더 전 localStorage('theme') ?? prefers-color-scheme 로 `data-theme` 설정.
- **토글**: 사이드바 footer 우측 버튼, `toggleTheme()` → data-theme 전환 + localStorage 저장 + 아이콘(🌙/☀️) 동기화.
- **검증**: 라이트(색 무변), 다크(전체 전환), 모달 다크 모두 양호. 코드블록/소스뷰어는 항상 다크 유지 — 다크 테마에서 자연스러움.
- **shot.js 한계**: setAttribute 직접 조작이라 캡처 시 토글 버튼 아이콘이 실제 클릭과 어긋나 보일 수 있음. 실제 toggleTheme() 클릭 경로는 applyThemeIcon() 호출로 정상 동기화.

### 4단계 폴리시 완료
- **고스트 사이드바**: action-btn 평소 투명/보더 없음, hover 시만 surface2. 역할은 색으로 — 일반 text2, admin accent, wiki green, 새 대화만 accent 채움. 사이드바가 확연히 가벼워짐.
- **advisor 결정적 지적**: 그간 전부 empty-state 만 검증함. populated chat(메시지/코드블록/피드백/에러) 을 라이트·다크 어느 쪽도 본 적 없었음. → shot-chat.js 로 채운 채팅 캡처.
- **실측 확인**: 이미-다크 채팅 요소(피드백 버튼·에러 버블·재연결·correction)가 라이트에서 부조화임을 스크린샷으로 확인(추측 아님). 다크 유저 버블(#4f8cf7)은 우려와 달리 양호.
- **해법**: 신규 토큰 없이 기존 시맨틱 토큰 재사용 — 👍/재연결=green, 👎/에러=danger, 더 알아보기=accent, correction=surface/border. 라이트=파스텔, 다크=틴트로 양쪽 자동 대응. 라이트/다크 재캡처로 검증 완료.
- **로그인 화면**: 라이트/다크 모두 정상(var 기반).

### 마무리 검증 (advisor 2차 지적 반영)
- **토글 실제 클릭 검증**: 그간 캡처가 setAttribute 우회라 toggleTheme()/applyThemeIcon()/localStorage 가 관찰 하에 실행된 적 없었음(핵심 기능인데). → shot-toggle.js 로 실제 #themeToggle 클릭. 결과: 클릭 시 data-theme light→dark, 아이콘 moon→sun(실 경로), localStorage 'dark' 저장, reload 후 dark 복원(FOUC 가드). **실증 완료.**
- **남은 하드코딩 칩 정리**: 추천질문 코드칩(#0d2137/#64b5f6)→accent, 소속 배지(#dbeafe/#dcfce7)→accent/green. 피드백 버튼과 동일 부조화 패턴이었음. 추천질문 칩은 다크 캡처로 확인. 소속 배지는 모달 직접 캡처는 생략(동일 토큰 패턴이라 신뢰).

### 5단계 모달 전수 정리 (사용자 "모달 안도 전부" + 소스뷰어 풀스크린 요청)
- **모달 제목 이모지 → SVG**: ⚙️→settings, 🔑→key, 🛡️→shield, 📑→database, 📄→file, 🏢→building, 👥→users, 📚→book, 💻→code, 🔍(audit)→search. `.modal-card h2` 를 flex 로 정렬. ICONS 에 settings/download/arrowLeft/play 추가.
- **소스뷰어 버튼**: 💾→download, ⬅️→arrowLeft. `.sv-modal` 데스크탑 100vw/100dvh 풀스크린(border-radius 0). 모바일은 기존 풀스크린 유지.
- **repoMainBtn 버그 수정**: isAdmin 분기에서 textContent 로 갱신해 SVG 아이콘이 날아가던 것 → innerHTML+svgIco(settings/folderPlus).
- **동적 하드코딩 색 토큰화**: 추천질문 버튼(#1e2a3a/#b0c4de/#2a3f5f + hover)→surface2/text/border(중립칩, hover 색도 var 로), audit 진행바·링크 #7c6cfc→accent, 구분선 #333/#444→border, 라벨 #888→text3, #666→text2, 모델배지 #aaa→text3, 피드백 메시지 #eb5757→danger/#6fcf97→green, wiki blockquote #ddd/#666→border/text2, 에러 텍스트 #ef4444→danger(5곳), audit 코드칩 #222→surface2+text.
- **검증**: 모달 라이트+다크 전수 캡처(advisor 지적 — 하드코딩-다크는 라이트에서 깨지므로 양 테마 필수). audit 은 populated(가짜 리포트/진행바) 라이트로 #7c6cfc→accent 확인. 소스뷰어 풀스크린 확인.

### 유지/미검증 (advisor 가이드: chrome 완료, content 는 선택)
- **유지**: select option 이모지(🌌🚀⚡, SVG 불가), ✕ 닫기(관례 심볼), color:#fff(채운 버튼 위 흰글자), #000/#0f0 디버그 오버레이, var(--danger,#d32f2f) fallback.
- **미검증(코드만 토큰화)**: 결재/사용자/회사 리스트 행 내부 색·동적 이모지(🏢👤📁📄🤖 등 content). 데이터 없어 시각 검증 못 함 — 토큰화는 했으나 라이트/다크 실제 렌더는 미확인. 별도 선택 패스.
- 전송중 정지 버튼 🛑 — 잠깐 노출되는 부차 UI라 유지.

### 추천질문 버튼 검증 (advisor 4차 지적 — 바꿨지만 렌더 안 본 프레임)
- CHAT_HTML 에 추천질문 버튼 블록이 빠져 있어 #1e2a3a→surface2 변경을 코드로만 했었음. shot-chat.js 에 추가 후 라이트/다크 재캡처.
- **결과**: 중립 surface2 버튼이 AI 버블 안에서 border+풀폭으로 클릭 가능하게 읽힘(라이트/다크 모두). 네이비보다 강조 약하나 "선택적 제안" 성격에 적절. affordance OK.

### Non-blocking 노트 (미수정)
- 채운 버튼 중 `background:var(--green);color:#fff`(저장 등)이 다크에서 --green(#4ade80 밝은 녹색)+흰글자라 대비 낮을 수 있음. 데이터 있을 때만 나오는 작은 모달 버튼이라 보류. 필요시 green 위 글자색 토큰(--on-green) 도입 검토.
