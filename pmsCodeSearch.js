'use strict';
// PMS 코드 자동완성을 위한 고객사별 저장소 연결과 엔티티 인덱스 검색을 제공한다.

const fs = require('fs');
const path = require('path');
const entityIndex = require('./entityIndexBuilder');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function normalizeCustomerName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

function normalizeCodeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

function findCompany(customerName, companies) {
  const target = normalizeCustomerName(customerName);
  if (!target) return null;

  const named = companies
    .map(company => ({ company, normalized: normalizeCustomerName(company.name) }))
    .filter(item => item.normalized);
  const exact = named.find(item => item.normalized === target);
  if (exact) return exact.company;

  const contained = named
    .filter(item => target.includes(item.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  return contained[0]?.company || null;
}

function loadRegistry(baseDir = __dirname) {
  return {
    companies: readJson(path.join(baseDir, 'companies.json'), []),
    repos: readJson(path.join(baseDir, 'repos.json'), {})
  };
}

function resolveRepoIds(
  { repo, customer },
  {
    companies,
    repos,
    indexExists = repoId => fs.existsSync(entityIndex.indexPath(repoId))
  }
) {
  const company = customer ? findCompany(customer, companies) : null;
  if (customer && !company) return [];

  const explicit = typeof repo === 'string' && repo.trim() ? [repo.trim()] : [];
  const candidates = explicit.length
    ? explicit
    : company
      ? Object.keys(repos).filter(repoId => repos[repoId]?.companyId === company.id)
      : [];

  return candidates.filter(repoId => {
    const info = repos[repoId];
    if (!info) return false;
    if (company && info.companyId !== company.id) return false;
    return indexExists(repoId);
  });
}

function safeTopK(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, Math.trunc(parsed))) : 8;
}

async function searchCode(body, options = {}) {
  const registry = options.registry || loadRegistry(options.baseDir);
  const repoIds = resolveRepoIds(body, {
    ...registry,
    indexExists: options.indexExists
  });
  const q = String(body.q || '').trim();
  const topK = safeTopK(body.topK);
  const kind = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : '';
  const queryIndex = options.queryIndex || entityIndex.queryIndex;
  const loadIndex = options.loadIndex || entityIndex.loadIndex;
  const apiKey = options.apiKey || '';
  const results = [];
  const normalizedQuery = normalizeCodeName(q);

  for (const repoId of repoIds) {
    const index = loadIndex(repoId);
    const entries = new Map((index?.entries || []).map(entry => [entry.id, entry]));
    const ranked = [];
    for (const entry of entries.values()) {
      const normalizedName = normalizeCodeName(entry.name);
      if (normalizedQuery && normalizedName.includes(normalizedQuery)) {
        ranked.push({
          id: entry.id,
          kind: entry.kind,
          name: entry.name,
          score: 2 + (normalizedName.startsWith(normalizedQuery) ? 0.1 : 0)
        });
      }
    }
    try {
      ranked.push(...await queryIndex(repoId, q, apiKey, Math.min(50, topK * 3)));
    } catch (_) {
      // 임베딩 검색 실패 시에도 이름 부분일치 결과는 사용할 수 있다.
    }
    const seen = new Set();
    ranked.sort((a, b) => b.score - a.score);
    for (const hit of ranked) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      if (kind && String(hit.kind || '').toLowerCase() !== kind) continue;
      const entry = entries.get(hit.id);
      results.push({
        entityId: hit.id,
        kind: hit.kind,
        name: hit.name,
        paths: Array.isArray(entry?.sourcePaths) ? entry.sourcePaths : [],
        score: hit.score
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

module.exports = {
  normalizeCustomerName,
  normalizeCodeName,
  findCompany,
  loadRegistry,
  resolveRepoIds,
  searchCode,
  safeTopK
};
