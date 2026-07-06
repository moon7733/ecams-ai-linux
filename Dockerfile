FROM node:20-slim

# OS 의존성 설치 (Puppeteer용 Chromium, Git, Tree-sitter 빌드용 g++/python)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install

# AGY(Antigravity) CLI 설치 (리눅스용)
# 환경에 따라 설치 명령어가 다를 경우(바이너리 다운로드 등) 이 줄을 수정해 주세요.
RUN npm install -g @google/antigravity-cli

# 소스코드 복사
COPY . .

# 환경변수 설정
ENV PORT=3000
ENV WORKSPACE_DIR=/app/workspace
ENV BACKUP_DIR=/app/backup

EXPOSE 3000

CMD ["node", "server.js"]
