'use strict';
// PMS 코드 자동완성을 위해 고객사 repo를 연결하고 azbrain 소스뷰어 검색을 호출한다.

const fs = require('fs');
const path = require('path');
const FALLBACK_CUSTOMER_NAME = '광주은행';

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

function findCompany(customerName, companies) {
  const target = normalizeCustomerName(customerName);
  if (!target) return null;
  const named = companies
    .map(company => ({ company, normalized: normalizeCustomerName(company.name) }))
    .filter(item => item.normalized);
  const exact = named.find(item => item.normalized === target);
  if (exact) return exact.company;
  return named
    .filter(item => target.includes(item.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length)[0]?.company || null;
}

function loadRegistry(baseDir = __dirname) {
  return {
    companies: readJson(path.join(baseDir, 'companies.json'), []),
    repos: readJson(path.join(baseDir, 'repos.json'), {})
  };
}

function resolveRepoIds({ repo, customer }, { companies, repos }) {
  const company = customer ? findCompany(customer, companies) : null;
  const explicit = typeof repo === 'string' && repo.trim() ? [repo.trim()] : [];
  if (explicit.length) {
    if (customer && !company) return [];
    return explicit.filter(repoId => {
      const info = repos[repoId];
      return Boolean(info && (!company || info.companyId === company.id));
    });
  }
  if (!customer) return [];

  const owned = company
    ? Object.keys(repos).filter(repoId => repos[repoId]?.companyId === company.id)
    : [];
  if (owned.length) return owned;

  const fallback = findCompany(FALLBACK_CUSTOMER_NAME, companies);
  return fallback
    ? Object.keys(repos).filter(repoId => repos[repoId]?.companyId === fallback.id)
    : [];
}

function safeTopK(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, Math.trunc(parsed))) : 8;
}

async function searchSourceViewer(repo, q, options = {}) {
  const baseUrl = options.baseUrl || process.env.AZBRAIN_INTERNAL_URL || 'http://ecams-ai:3000';
  const token = options.token ?? process.env.PMS_BRIDGE_TOKEN ?? '';
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/internal/pms/repo-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PMS-Token': token
    },
    body: JSON.stringify({ repo, q, limit: options.limit || 50 })
  });
  if (!response.ok) throw new Error(`source viewer search status ${response.status}`);
  return response.json();
}

async function searchCode(body, options = {}) {
  const registry = options.registry || loadRegistry(options.baseDir);
  const repoIds = resolveRepoIds(body, registry);
  const q = String(body.q || '').trim();
  const topK = safeTopK(body.topK);
  const kind = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : '';
  const repoSearch = options.repoSearch || ((repoId, query) => searchSourceViewer(repoId, query, {
    ...options,
    limit: Math.min(100, Math.max(20, topK * 2))
  }));
  const results = [];
  const seen = new Set();

  for (const repoId of repoIds) {
    let response;
    try {
      response = await repoSearch(repoId, q);
    } catch (_) {
      continue;
    }
    for (const match of response?.nameMatches || []) {
      if (match.isDirectory || !match.name) continue;
      const extension = path.extname(match.name).toLowerCase();
      const itemKind = extension ? extension.slice(1) : 'file';
      if (kind && itemKind !== kind) continue;
      const key = String(match.name).normalize('NFKC').toLowerCase();
      if (!seen.add(key)) continue;
      results.push({
        entityId: `file:${repoId}:${match.path}`,
        kind: itemKind,
        name: match.name,
        paths: [match.path],
        score: 2.1
      });
      if (results.length >= topK) return results;
    }
  }
  return results;
}

module.exports = {
  findCompany,
  loadRegistry,
  normalizeCustomerName,
  resolveRepoIds,
  safeTopK,
  searchCode,
  searchSourceViewer
};
