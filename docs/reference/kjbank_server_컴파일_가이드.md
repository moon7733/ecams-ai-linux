# kjbank_server src/server 컴파일 가이드

## 📌 프로젝트 정보

- **프로젝트 경로**: `c:/ecams-ai/workspace/광주은행/kjbank_server/`
- **에이전트 소스 위치**: `src/server/`
- **언어**: **C** (소켓 서버, 암호화, FTP, TAR 등)
- **컴파일러**: **GCC**
- **빌드 시스템**: **Makefile**
- **플랫폼**: Unix/Linux (AIX, Solaris, Linux 지원)

---

## 🔧 컴파일 명령어

### 1️⃣ 전체 컴파일 (가장 간단한 방법)

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server\src\server
make all
```

**또는** (의미는 동일)

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server\src\server
make svr_bin
```

---

### 2️⃣ 단계별 컴파일 (자세한 방법)

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server\src\server

# 1. AES 암호화 라이브러리 컴파일
cd aessrc && make && cd ..

# 2. FTP 클라이언트 라이브러리 컴파일
cd ftpsrc && make && cd ..

# 3. MD5 해시 라이브러리 컴파일
cd md5src && make && cd ..

# 4. 소켓 서버 소스 컴파일
cd svrsrc && make && cd ..

# 5. TAR 압축 라이브러리 컴파일
cd tarsrc && make && cd ..

# 6. 모든 object 파일을 링크해서 ecams_svr 생성
gcc -o ecams_svr object/*.o -g -O2 -lresolv -lnsl

# 7. 결과물을 bin 디렉토리로 이동
mv ecams_svr ../bin/ecams_svr_new
```

---

### 3️⃣ 빠른 리빌드 (이미 컴파일된 경우)

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server\src\server

# 깨끗이 정리 (이전 빌드 제거)
make clean

# 새로 컴파일
make all
```

---

### 4️⃣ 특정 모듈만 컴파일 (예: svrsrc만)

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server\src\server\svrsrc
make
```

---

## 📂 컴파일 결과물

| 위치 | 파일명 | 설명 |
|------|--------|------|
| `object/` | `*.o` | 컴파일된 오브젝트 파일들 |
| `bin/` | `ecams_svr_new` | **최종 실행파일** (소켓 서버) |

**최종 결과물**: `src/server/bin/ecams_svr_new`

---

## 🛠️ Makefile 구조 분석

### src/server/Makefile (최상위)
```makefile
CC      = gcc
CFLAGS  = -g -O2              # 컴파일 플래그 (디버그 + 최적화)
SUBDIR  = aessrc ftpsrc md5src svrsrc tarsrc  # 컴파일할 모듈 순서
TARGET  = ecams_svr           # 최종 타겟명

all: svr_bin

svr_bin:
  cd aessrc && make    # AES 라이브러리 빌드
  cd ftpsrc && make    # FTP 라이브러리 빌드
  cd md5src && make    # MD5 라이브러리 빌드
  cd svrsrc && make    # 소켓 서버 소스 빌드
  cd tarsrc && make    # TAR 라이브러리 빌드
  $(CC) -o ecams_svr object/*.o $(CFLAGS) $(LIBS)  # 링크
  mv ecams_svr ../bin/ecams_svr_new  # 결과물 이동
```

### src/server/svrsrc/Makefile (세부 모듈)
```makefile
CC      = gcc
CFLAGS  = -g -O2
INCLUDE = -I. -I../inc    # 헤더 파일 경로 (현재 폴더 + ../inc)

all: lanapi strcvt util ecams_svr

ecams_svr: ecams_svr.c lanapi.o strcvt.o util.o
  gcc ecams_svr.c lanapi.o strcvt.o util.o $(CFLAGS) $(INCLUDE) ...
```

---

## ⚙️ 컴파일 플래그 설명

| 플래그 | 의미 |
|--------|------|
| `-g` | 디버그 정보 포함 (gdb로 디버깅 가능) |
| `-O2` | 최적화 레벨 2 |
| `-I.` | 현재 디렉토리를 헤더 경로로 추가 |
| `-I../inc` | 상위 폴더의 inc/ 디렉토리를 헤더 경로로 추가 |
| `-lresolv` | DNS 해석 라이브러리 (소켓 통신용) |
| `-lnsl` | 네트워크 서비스 라이브러리 (소켓 API용) |

---

## 🔍 각 모듈별 역할

| 모듈 | 파일명 | 용도 |
|------|--------|------|
| **aessrc** | AES.c | AES 256-bit 암호화 (파일 전송 보안) |
| **ftpsrc** | ftplib.c | FTP 클라이언트 (원격 서버 파일 전송) |
| **md5src** | md5.c | MD5 해시 (파일 무결성 검증) |
| **svrsrc** | ecams_svr.c | **메인 소켓 서버** (파일 송수신) |
| **svrsrc** | ecams_gwsvr.c | 게이트웨이 서버 (다중 서버 중계) |
| **svrsrc** | lanapi.c | 로컬 네트워크 통신 API |
| **svrsrc** | strcvt.c | 문자열/인코딩 변환 (EUC-KR ↔ UTF-8) |
| **svrsrc** | util.c | 공통 유틸리티 함수 |
| **tarsrc** | libtar.c | TAR 압축/해제 (배포 패키지용) |

---

## 🎯 PowerShell에서 컴파일하기

```powershell
# 1. 디렉토리 이동
cd "c:\ecams-ai\workspace\광주은행\kjbank_server\src\server"

# 2. make 실행 (make가 설치되어 있어야 함)
make all

# 3. 컴파일 완료 확인
ls bin\ecams_svr_new

# 4. 컴파일 결과 확인
Get-ChildItem -Path "bin" -Name "ecams_svr_new"
```

---

## ⚠️ 주의사항

### 필수 설치 항목

```bash
# Linux/Unix에서만 컴파일 가능 (Windows에서 직접 컴파일 불가)
# Windows WSL 또는 MinGW 필요

# 필수 패키지:
# - GCC 컴파일러
# - Make 유틸리티
# - C 표준 라이브러리
# - Oracle Pro*C/C++ (Pro*C 소스 컴파일 시)
```

### 인코딩 주의

```bash
# 파일 인코딩: EUC-KR (한글 주석 처리)
# Windows에서 편집 시 인코딩 확인 필수
file src/server/svrsrc/ecams_svr.c
# → charset=iso-8859-1 또는 utf-8이 아니어야 함
```

### 플랫폼별 컴파일

코드에 OS 분기가 포함되어 있으므로, 대상 플랫폼에 맞게 컴파일해야 합니다:

```c
// 코드 내 조건부 컴파일
#ifdef _AIX          // AIX
#elif __sun          // Solaris
#elif _OSF_SOURCE    // Tru64
#else                // Linux
```

---

## 🚀 컴파일 후 실행

### 서버 실행

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server\src

# 소켓 서버 실행
./server/bin/ecams_svr_new

# 또는 start.sh 스크립트로 실행
./server/bin/start.sh
```

### 메인 매니저 프로세스 실행 (별도)

```bash
cd c:\ecams-ai\workspace\광주은행\kjbank_server

# 배포 엔진 메인 매니저 (ecams_mgr) 실행
# (ecamssrc2 폴더에 있는 Pro*C 소스를 컴파일해야 함)
./bin/ecams_mgr
```

---

## 📊 전체 빌드 흐름도

```
┌─────────────────────────────────────────────────┐
│ $ make all (src/server 디렉토리에서 실행)        │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
    aessrc     ftpsrc     md5src     svrsrc     tarsrc
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
    *.o       *.o        *.o      *.c→*.o      *.o
       │          │          │          │          │
       └──────────┼──────────┴──────────┴──────────┘
                  │
                  ▼
           object/*.o 모음
                  │
                  ▼
          gcc -o ecams_svr (링크)
                  │
                  ▼
            src/server/ecams_svr
                  │
                  ▼
          mv → ../bin/ecams_svr_new
                  │
                  ▼
    ✅ 최종 실행파일: bin/ecams_svr_new
```

---

## 🔗 관련 문서

- **전체 빌드**: `src/` 디렉토리의 `makeall` 스크립트 참조
- **라이브러리만 빌드**: `src/` 디렉토리의 `makelib` 스크립트 참조
- **Pro*C 배포 엔진**: `src/ecamssrc2/` 폴더 (별도 컴파일 필요)
- **README.md**: `kjbank_server/README.md` 참조

