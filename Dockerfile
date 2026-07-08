FROM node:20-slim

# OS 의존성 설치 (Puppeteer용 Chromium, Git, Tree-sitter 빌드용 g++/python)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
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

ARG AGY_CLI_INSTALL_URL="https://antigravity.google/cli/install.sh"

WORKDIR /app

# 패키지 설치
COPY --chown=node:node package*.json ./
RUN npm install

# 소스코드 복사
COPY --chown=node:node . .

# 디렉토리 권한 설정 및 사용자 변경 (추후 생성되는 파일들이 node 권한을 갖도록)
RUN chown -R node:node /app
USER node

# AGY(Antigravity) CLI 설치 (node 계정으로 설치)
RUN set -eux; \
    tmp="$(mktemp -d)"; \
    curl -fsSL "$AGY_CLI_INSTALL_URL" -o "$tmp/install.sh"; \
    bash "$tmp/install.sh"; \
    rm -rf "$tmp"; \
    /home/node/.local/bin/agy --version

# 환경변수 설정
ENV PATH="/home/node/.local/bin:${PATH}"
ENV PORT=3000
ENV WORKSPACE_DIR=/app/workspace
ENV BACKUP_DIR=/app/backup

EXPOSE 3000

CMD ["node", "server.js"]
