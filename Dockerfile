FROM node:20-slim

# OS dependencies for Puppeteer/Chromium, Git, and native npm packages.
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
ARG APP_UID=1008
ARG APP_GID=1015

WORKDIR /app

RUN groupmod -g "${APP_GID}" node \
    && usermod -u "${APP_UID}" -g "${APP_GID}" node \
    && chown -R node:node /app /home/node

USER node

# Install npm dependencies before copying source so app edits reuse this layer.
COPY --chown=node:node package*.json ./
RUN npm ci

# Install AGY before copying source so app edits reuse this layer.
RUN set -eux; \
    tmp="$(mktemp -d)"; \
    curl -fsSL "$AGY_CLI_INSTALL_URL" -o "$tmp/install.sh"; \
    bash "$tmp/install.sh"; \
    rm -rf "$tmp"; \
    /home/node/.local/bin/agy --version

ENV PATH="/home/node/.local/bin:${PATH}"
ENV PORT=3000
ENV WORKSPACE_DIR=/app/workspace
ENV BACKUP_DIR=/app/backup

COPY --chown=node:node . .

EXPOSE 3000

CMD ["node", "server.js"]
