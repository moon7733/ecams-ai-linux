// 운영체제별 레거시 경로를 현재 실행 환경 경로로 해석하는 유틸리티
const fs = require('fs');
const path = require('path');

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function dataRoot(kind, appRoot) {
  if (kind === 'workspace') return process.env.WORKSPACE_DIR || path.join(appRoot, 'workspace');
  if (kind === 'wiki') return process.env.WIKI_DIR || path.join(appRoot, 'wiki');
  if (kind === 'indexes') return process.env.INDEXES_DIR || path.join(appRoot, 'indexes');
  return appRoot;
}

function splitKnownDataPath(inputPath) {
  const normalized = normalizeSlashes(inputPath);
  const parts = normalized.split('/').filter(Boolean);
  const rootIdx = parts.findIndex(p => ['workspace', 'wiki', 'indexes'].includes(p.toLowerCase()));
  if (rootIdx < 0 || rootIdx >= parts.length - 1) return null;
  return {
    kind: parts[rootIdx].toLowerCase(),
    rest: parts.slice(rootIdx + 1),
  };
}

function resolvePortablePath(inputPath, appRoot) {
  if (!inputPath) return '';
  const raw = String(inputPath);
  if (fs.existsSync(raw)) return path.resolve(raw);

  const slashPath = normalizeSlashes(raw);
  if (fs.existsSync(slashPath)) return path.resolve(slashPath);

  const known = splitKnownDataPath(raw);
  if (known) return path.resolve(dataRoot(known.kind, appRoot), ...known.rest);

  return path.resolve(raw);
}

function repoInfoPath(repoInfo, appRoot) {
  const rawPath = typeof repoInfo === 'string' ? repoInfo : repoInfo?.path;
  return rawPath ? resolvePortablePath(rawPath, appRoot) : '';
}

function isPathInside(basePath, targetPath) {
  const base = path.resolve(basePath);
  const target = path.resolve(targetPath);
  const rel = path.relative(base, target);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

module.exports = {
  dataRoot,
  isPathInside,
  normalizeSlashes,
  repoInfoPath,
  resolvePortablePath,
  splitKnownDataPath,
};
