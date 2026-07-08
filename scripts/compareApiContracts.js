// 기존 Node API와 신규 Spring API의 핵심 응답 계약을 비교하는 검증 스크립트.
const DEFAULT_NODE_BASE = 'http://localhost:3000';
const DEFAULT_SPRING_BASE = 'http://localhost:8081';

const nodeBase = (process.env.NODE_API_BASE || DEFAULT_NODE_BASE).replace(/\/$/, '');
const springBase = (process.env.SPRING_API_BASE || DEFAULT_SPRING_BASE).replace(/\/$/, '');
const loginId = process.env.API_COMPARE_USER || 'ymlee';
const loginPassword = process.env.API_COMPARE_PASSWORD || 'ecams123';

function normalizeCompanies(payload) {
  return [...(payload.companies || [])]
    .map(company => ({
      id: company.id,
      name: company.name,
      address: company.address || null,
      manager: company.manager || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeReposAll(payload) {
  return [...(payload.allRepos || [])].sort();
}

function normalizeRepos(payload) {
  return {
    repos: Object.fromEntries(Object.entries(payload.repos || {}).sort(([a], [b]) => a.localeCompare(b))),
    repoMeta: Object.fromEntries(Object.entries(payload.repoMeta || {}).sort(([a], [b]) => a.localeCompare(b))),
    isAdmin: !!payload.isAdmin,
  };
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

async function request(base, path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${base}${path} -> HTTP ${response.status}: ${data.error || response.statusText}`);
  }
  return data;
}

async function login(base) {
  return request(base, '/api/login', {
    method: 'POST',
    body: JSON.stringify({ id: loginId, password: loginPassword }),
  });
}

function compareCase(name, left, right) {
  const leftJson = stableJson(left);
  const rightJson = stableJson(right);
  if (leftJson === rightJson) {
    console.log(`[OK] ${name}`);
    return true;
  }

  console.error(`[FAIL] ${name}`);
  console.error('--- node');
  console.error(leftJson);
  console.error('--- spring');
  console.error(rightJson);
  return false;
}

async function main() {
  console.log(`[compareApi] node=${nodeBase}`);
  console.log(`[compareApi] spring=${springBase}`);
  console.log(`[compareApi] user=${loginId}`);

  const nodeLogin = await login(nodeBase);
  const springLogin = await login(springBase);

  const results = [];
  results.push(compareCase(
    'GET /api/companies',
    normalizeCompanies(await request(nodeBase, '/api/companies')),
    normalizeCompanies(await request(springBase, '/api/companies')),
  ));
  results.push(compareCase(
    'POST /api/login 기본 필드',
    { id: nodeLogin.id, isAdmin: !!nodeLogin.isAdmin, repos: nodeLogin.repos || {} },
    { id: springLogin.id, isAdmin: !!springLogin.isAdmin, repos: springLogin.repos || {} },
  ));
  results.push(compareCase(
    'GET /api/repos/all',
    normalizeReposAll(await request(nodeBase, '/api/repos/all', {
      headers: { Authorization: `Bearer ${nodeLogin.token}` },
    })),
    normalizeReposAll(await request(springBase, '/api/repos/all', {
      headers: { Authorization: `Bearer ${springLogin.token}` },
    })),
  ));
  results.push(compareCase(
    'GET /api/repos',
    normalizeRepos(await request(nodeBase, '/api/repos', {
      headers: { Authorization: `Bearer ${nodeLogin.token}` },
    })),
    normalizeRepos(await request(springBase, '/api/repos', {
      headers: { Authorization: `Bearer ${springLogin.token}` },
    })),
  ));

  if (results.every(Boolean)) {
    console.log('[compareApi] 완료: 핵심 API 계약 일치');
    return;
  }
  process.exitCode = 1;
}

main().catch(err => {
  console.error('[compareApi] 실패:', err.stack || err.message || String(err));
  process.exit(1);
});