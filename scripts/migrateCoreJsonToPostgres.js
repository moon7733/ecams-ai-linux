// 사용자, 고객사, 저장소 JSON 데이터를 PostgreSQL로 이전하는 스크립트
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readJson(name, fallback) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function omitSensitiveRequestFields(request) {
  const { password, ...safe } = request || {};
  if (password) safe.passwordMigrated = true;
  return safe;
}

function normalizeLevel(level) {
  return level === 'edit' ? 'edit' : 'read';
}

function buildRows() {
  const usersJson = readJson('users.json', {});
  const companiesJson = readJson('companies.json', []);
  const reposJson = readJson('repos.json', {});
  const requestsJson = readJson('requests.json', []);

  const users = Object.entries(usersJson).map(([id, user]) => ({
    id,
    passwordHash: user.password,
    name: user.name || null,
    phone: user.phone || null,
    affiliation: user.affiliation || null,
    userType: user.userType || 'azsoft',
    role: id === 'admin' ? 'admin' : 'user',
  }));

  const companies = companiesJson.map(company => ({
    id: String(company.id),
    name: String(company.name || company.id),
    address: company.address || null,
    manager: company.manager || null,
  }));

  const knownCompanyIds = new Set(companies.map(company => company.id));
  const repositories = Object.entries(reposJson).map(([id, repo]) => ({
    id,
    name: id,
    path: String(repo.path || ''),
    companyId: knownCompanyIds.has(repo.companyId) ? repo.companyId : null,
    type: repo.type || null,
  }));

  const repoPermissions = [];
  const companyPermissions = [];
  for (const [userId, user] of Object.entries(usersJson)) {
    for (const [repoId, level] of Object.entries(user.repos || {})) {
      if (reposJson[repoId]) {
        repoPermissions.push({ userId, repoId, level: normalizeLevel(level) });
      }
    }
    for (const [companyId, level] of Object.entries(user.companies || {})) {
      if (knownCompanyIds.has(companyId)) {
        companyPermissions.push({ userId, companyId, level: normalizeLevel(level) });
      }
    }
  }

  const requests = requestsJson.map(request => ({
    id: String(request.id),
    type: String(request.type || 'unknown'),
    userId: request.userId || null,
    repoId: request.repo || null,
    companyId: request.companyId || null,
    level: request.level || null,
    status: request.status || 'pending',
    payload: omitSensitiveRequestFields(request),
    createdAtMs: Number(request.timestamp) || null,
    decidedAt: request.status && request.status !== 'pending' ? new Date().toISOString() : null,
  }));

  return { users, companies, repositories, repoPermissions, companyPermissions, requests };
}

async function applySchema(client) {
  const schema = fs.readFileSync(path.join(ROOT, 'db', 'init', '002_core_identity.sql'), 'utf8');
  await client.query(schema);
}

async function migrate(rows) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 1,
  });

  const client = await pool.connect();
  try {
    await client.query('begin');
    await applySchema(client);

    for (const user of rows.users) {
      await client.query(
        `
        insert into users (id, password_hash, name, phone, affiliation, user_type, role, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (id) do update set
          password_hash = excluded.password_hash,
          name = excluded.name,
          phone = excluded.phone,
          affiliation = excluded.affiliation,
          user_type = excluded.user_type,
          role = excluded.role,
          updated_at = now()
        `,
        [user.id, user.passwordHash, user.name, user.phone, user.affiliation, user.userType, user.role],
      );
    }

    for (const company of rows.companies) {
      await client.query(
        `
        insert into companies (id, name, address, manager, updated_at)
        values ($1, $2, $3, $4, now())
        on conflict (id) do update set
          name = excluded.name,
          address = excluded.address,
          manager = excluded.manager,
          updated_at = now()
        `,
        [company.id, company.name, company.address, company.manager],
      );
    }

    for (const repo of rows.repositories) {
      await client.query(
        `
        insert into repositories (id, name, path, company_id, type, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (id) do update set
          name = excluded.name,
          path = excluded.path,
          company_id = excluded.company_id,
          type = excluded.type,
          updated_at = now()
        `,
        [repo.id, repo.name, repo.path, repo.companyId, repo.type],
      );
    }

    for (const permission of rows.repoPermissions) {
      await client.query(
        `
        insert into user_repo_permissions (user_id, repo_id, level, updated_at)
        values ($1, $2, $3, now())
        on conflict (user_id, repo_id) do update set
          level = excluded.level,
          updated_at = now()
        `,
        [permission.userId, permission.repoId, permission.level],
      );
    }

    for (const permission of rows.companyPermissions) {
      await client.query(
        `
        insert into user_company_permissions (user_id, company_id, level, updated_at)
        values ($1, $2, $3, now())
        on conflict (user_id, company_id) do update set
          level = excluded.level,
          updated_at = now()
        `,
        [permission.userId, permission.companyId, permission.level],
      );
    }

    for (const request of rows.requests) {
      await client.query(
        `
        insert into access_requests (
          id, type, user_id, repo_id, company_id, level, status, payload_json, created_at_ms, decided_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        on conflict (id) do update set
          type = excluded.type,
          user_id = excluded.user_id,
          repo_id = excluded.repo_id,
          company_id = excluded.company_id,
          level = excluded.level,
          status = excluded.status,
          payload_json = excluded.payload_json,
          created_at_ms = excluded.created_at_ms,
          decided_at = excluded.decided_at
        `,
        [
          request.id,
          request.type,
          request.userId,
          request.repoId,
          request.companyId,
          request.level,
          request.status,
          request.payload,
          request.createdAtMs,
          request.decidedAt,
        ],
      );
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  loadEnvFile();

  const rows = buildRows();
  console.log('[migrateCoreJson] users:', rows.users.length);
  console.log('[migrateCoreJson] companies:', rows.companies.length);
  console.log('[migrateCoreJson] repositories:', rows.repositories.length);
  console.log('[migrateCoreJson] repo permissions:', rows.repoPermissions.length);
  console.log('[migrateCoreJson] company permissions:', rows.companyPermissions.length);
  console.log('[migrateCoreJson] access requests:', rows.requests.length);

  if (dryRun) {
    console.log('[migrateCoreJson] dry-run 완료. DB에는 쓰지 않았습니다.');
    return;
  }

  await migrate(rows);
  console.log('[migrateCoreJson] 완료');
}

main().catch(err => {
  const message = err?.stack || err?.message || String(err);
  console.error('[migrateCoreJson] 실패:', message);
  process.exit(1);
});
