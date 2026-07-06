# 토스뱅크 운영배포 오배포 버그 조사 (2026-06-04)

## 발생 상황

- **일시:** 2026-06-02 20:11
- **의도한 배포 SR:** PLATFORM-18101, IFR-567, EXTERNAL-2287
- **실제 배포된 SR:** PLATFORM-18101, IFR-567, EXTERNAL-2287, **PL-4396**, **EXTERNAL-2271** (2개 추가)
- **추가 이슈:** EXTERNAL-2271에 연결된 신청건 3개 중 1개(2026-04-001302, 계정계시스템)가 "Deploy 처리중"으로 멈춤

---

## 관련 소스 위치

| 파일 | 경로 | 역할 |
|---|---|---|
| RealDeploy.js | `workspace/토스/toss_html5/WebContent/js/ecams/apply/RealDeploy.js` | 운영배포 대시보드 프론트엔드 |
| RequestStatusController.java | `workspace/토스/toss_html5/src/.../requeststatus/controller/` | 신청목록 조회 API |
| RequestStatusService.java | `workspace/토스/toss_html5/src/.../requeststatus/service/` | 신청목록 비즈니스 로직 |
| RequestStatus.xml | `workspace/토스/toss_html5/src/.../requeststatus/mapper/` | 신청목록 SQL 쿼리 |
| DeployController.java | `workspace/토스/toss_html5/src/.../deploy/controller/` | 배포 처리 API |
| DeployService.java | `workspace/토스/toss_html5/src/.../deploy/service/` | 배포 비즈니스 로직 |
| Deploy.xml | `workspace/토스/toss_html5/src/.../deploy/mapper/` | 배포 SQL 쿼리 |
| ecams_depsrc.pc | `workspace/토스/toss_server/ecamssrc2/` | 소스배포 메인 C 프로그램 |
| ecams_depsrc_sub.pc | `workspace/토스/toss_server/ecamssrc2/` | 소스배포 서브 C 프로그램 (신청건 단위) |

---

## 원인 1 — PL-4396, EXTERNAL-2271 오배포

### 핵심 구조 문제

`RealDeploy.js:992-996` — 신청목록 조회 시 `srIdList`를 항상 빈 배열로 전송:
```javascript
data = {
    requestType : 'getRquestList_SR_RC',
    srIdList : [],   // 화면에서 선택한 SR이 여기에 전달되지 않음
    prjData: prjData
}
```

`RequestStatus.xml:217-288` — `getSelectList_SR_RC` 쿼리가 SR ID 조건 없이 시간 조건으로 전체 조회:
```sql
AND a.cr_passok = #{prjData.reqpass}            -- 일반(0) 또는 긴급(2)
AND a.cr_status = '0'                           -- 미완료
AND f.cr_team IN ('SYSED','SYSCED','SYSCCB','SYSCGB','SYSDEP')
AND SUBSTR(b.cm_sysinfo, 20,1) = '1'            -- 운영배포 대상 시스템
-- 배포 시작 후 추가 조건:
AND (cr_lastdate <= cm_depstartdt OR f.cr_team = 'SYSDEP')
```

**→ 배포 시작 시간(`cm_depstartdt`) 이전에 결재 완료된 건은 SR 선택 여부와 무관하게 전부 포함됨**

### 서버 C 프로그램도 동일 구조

`ecams_depsrc.pc:215-247` — 일반배포 시 `cr_passok='0'`이고 `cr_lastdate < 배포시작시간`인 건 전체 처리:
```c
AND TO_CHAR(A.CR_LASTDATE, 'YYYYMMDDHH24MISS') < :szDepDate
AND ((:szPassOK = '0' AND A.CR_PASSOK = '0')   -- 일반: cr_depreqdt 조건 없음
  OR (:szPassOK = '2' AND A.CR_PASSOK = '2'
      AND A.CR_DEPREQDT = :szDepDate))           -- 긴급: cr_depreqdt 마킹된 건만
```

### cr_depreqdt 역할 정리

| 구분 | cr_depreqdt 사용 여부 | 배포 범위 |
|---|---|---|
| **일반배포 (cr_passok=0)** | 사용 안 함 (배포 후 사후 기록) | 시간 조건 만족하는 전체 |
| **긴급배포 (cr_passok=2)** | 소스배포 버튼 클릭 시 선택한 건에 SET → 스크립트가 이 값으로 필터 | 선택한 건만 |

- `cr_depreqdt` SET 위치: `DeployService.java:197-208` (긴급 소스배포 버튼 클릭 시, 그리드 선택 건에 `cm_depstartdt` 값 저장)
- `cr_depreqdt` NULL 초기화: 초기화 버튼 클릭 시 `Deploy.xml:412-430 refreshCr_depreqdt`

---

## 원인 2 — EXTERNAL-2271 계정계시스템(1302) Deploy 처리중 멈춤

### 배포 실행 구조

```
ecams_depsrc (메인)
  ├── 조건 맞는 신청건 커서로 전체 fetch
  ├── 1303(MCI) → ecams_depsrc_sub 백그라운드 실행 → 정상 완료
  ├── 1302(계정계시스템) → ecams_depsrc_sub 백그라운드 실행 → 중간에 멈춤 ← 문제
  └── 1301(통합단말) → ecams_depsrc_sub 백그라운드 실행 → 정상 완료

  [메인은 모든 서브 프로세스 완료될 때까지 대기 → 1302가 멈추면 메인도 대기 상태]
```

`ecams_depsrc_sub.pc:229-285` 서브 프로세스 흐름:
```
1. cr_depreqdt = 배포시작시간 SET
2. Process_SYSED() → 실제 파일 복사
3. CMR1010.CR_SRCCMP = 'Y' UPDATE
4. UPDT_RscMaint_List() → 결재 단계 완료 처리
```

"Deploy 처리중" = SYSDEP 결재 단계에서 `teamcd='1'`(진행중) 상태. 2번 `Process_SYSED()` 이후 4번 `UPDT_RscMaint_List()` 까지 도달하지 못한 것.

동시 실행 제한: `ecams_depsrc.pc:268-274` — `procck ecams_depsrc_sub` 결과가 10 미만일 때만 다음 서브 프로세스 실행.

---

## 시작 버튼 동작 정리

시작 버튼(gbn=0)은 실제 배포를 시작하지 않음. 하는 일:
1. `CMM0010.cm_depstatus = 'Y'`, `cm_depstartdt = SYSDATE`
2. `CMM0031.cm_srcsta = 'S0'`, `cm_dbsta = 'D0'` (서버 상태 초기화)

실제 배포는 이후 각 단계 버튼(L4 OFF, WAS DOWN, 소스배포 등) 클릭 시 발생.

**일반배포 화면 SR 선택의 실제 의미:**
- 시각적으로 어떤 건이 배포될지 보여주는 용도
- 롤백(gbn=16) 시에만 선택 건 기준으로 처리
- 소스배포 긴급(gbn=4, req=2) 시에만 선택 건에 `cr_depreqdt` 마킹 → 실제 배포 필터로 작동
- 그 외 모든 단계에서는 선택 여부 무관

---

## 태원님께 확인 요청한 사항

### [요청 1] 오배포 원인 파악

```sql
-- 배포 시작 시간 확인
SELECT cm_depstartdt, cm_depstatus, cm_deppasscd
  FROM cmm0010 WHERE cm_stno = 'ECAMS';

-- PL-4396, EXTERNAL-2271 cr_lastdate vs cm_depstartdt 비교
SELECT a.cr_acptno, a.cr_itsmid, a.cr_passok, a.cr_status,
       TO_CHAR(a.cr_lastdate, 'YYYY-MM-DD HH24:MI:SS') AS cr_lastdate,
       b.cr_team, b.cr_locat
  FROM cmr1000 a, cmr9900 b
 WHERE a.cr_itsmid IN ('PL-4396', 'EXTERNAL-2271')
   AND a.cr_acptno = b.cr_acptno
   AND b.cr_locat = '00'
 ORDER BY a.cr_itsmid, a.cr_acptno;
```

### [요청 2] 1302 멈춤 건 서버 확인

```bash
# 프로세스 생존 여부
ps -ef | grep ecams_depsrc_sub
ps -ef | grep ecams_depsrc

# 1302 관련 로그
grep "001302" $LOGDIR/20260602*.log
```

### [요청 3] 1302 DB 상태 확인

```sql
-- 결재 단계 상태
SELECT cr_acptno, cr_team, cr_teamcd, cr_locat, cr_status
  FROM cmr9900
 WHERE cr_acptno = '2026600001302'
 ORDER BY cr_locat;

-- 파일 배포 기록
SELECT cr_acptno, cr_serno, cr_rsrcname, cr_putcode, cr_srccmp, cr_prcdate
  FROM cmr1010
 WHERE cr_acptno = '2026600001302'
 ORDER BY cr_serno;
```

### 조치 방향 (태원님 판단 필요)

| 케이스 | 조치 |
|---|---|
| 서브 프로세스 아직 살아있음 | 프로세스 강제 종료 후 CMM0010 초기화 또는 수동 완료 처리 |
| 파일은 배포됐으나 결재 단계만 미완료 | SYSDEP 단계 수동 완료 처리 |
| 파일 배포 안 됨 | 원인 파악 후 재배포 또는 롤백 |

---

## 구조적 개선 필요 사항

일반배포에서 화면 SR 선택이 실제 배포 범위에 반영되지 않는 것이 설계 의도인지, 버그인지 확인 필요.
- 의도라면: 화면에서 SR 선택 UI의 역할과 의미를 사용자에게 명확히 안내 필요
- 버그라면: `getDeployList()` → `getSelectList_SR_RC` 경로에서 선택한 SR ID를 조건으로 반영하는 수정 필요
