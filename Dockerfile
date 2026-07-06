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

ARG AGY_CLI_DOWNLOAD_URL=""
ARG AGY_CLI_SHA256=""

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install

# AGY(Antigravity) CLI 설치 (리눅스용)
RUN set -eux; \
    if [ -z "$AGY_CLI_DOWNLOAD_URL" ]; then \
      echo "AGY_CLI_DOWNLOAD_URL build arg is required. Pass a Linux agy binary URL with docker compose build --build-arg AGY_CLI_DOWNLOAD_URL=..." >&2; \
      exit 1; \
    fi; \
    tmp="$(mktemp -d)"; \
    curl -fsSL "$AGY_CLI_DOWNLOAD_URL" -o "$tmp/agy-download"; \
    if [ -n "$AGY_CLI_SHA256" ]; then \
      echo "$AGY_CLI_SHA256  $tmp/agy-download" | sha256sum -c -; \
    fi; \
    case "$AGY_CLI_DOWNLOAD_URL" in \
      *.tar.gz|*.tgz) \
        tar -xzf "$tmp/agy-download" -C "$tmp"; \
        agy_bin="$(find "$tmp" -type f -name agy -perm /111 | head -n 1)"; \
        if [ -z "$agy_bin" ]; then \
          echo "Downloaded archive does not contain an executable named agy." >&2; \
          exit 1; \
        fi; \
        install -m 0755 "$agy_bin" /usr/local/bin/agy; \
        ;; \
      *) \
        install -m 0755 "$tmp/agy-download" /usr/local/bin/agy; \
        ;; \
    esac; \
    rm -rf "$tmp"; \
    /usr/local/bin/agy --version

# 소스코드 복사
COPY . .

# 환경변수 설정
ENV PORT=3000
ENV WORKSPACE_DIR=/app/workspace
ENV BACKUP_DIR=/app/backup

EXPOSE 3000

CMD ["node", "server.js"]
