'use strict';
const fs = require('fs');
const path = require('path');

// ===== CMM0020 INSERT 파싱 → {CM_MACODE: {CM_MICODE: 코드명}} =====
function buildCodeMap(dbRepoPath) {
  const dataDir = path.join(dbRepoPath, 'data');
  if (!fs.existsSync(dataDir)) return {};

  const files = fs.readdirSync(dataDir).filter(f => /^CMM0020/i.test(f) && f.endsWith('.sql'));
  const codeMap = {};
  const re = /INSERT\s+INTO\s+\S*CMM0020\s*\([^)]+\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/gi;

  for (const f of files) {
    let content;
    try { content = fs.readFileSync(path.join(dataDir, f), 'utf8'); } catch (e) { continue; }
    let m;
    while ((m = re.exec(content)) !== null) {
      const ma = m[1].trim().toUpperCase();
      const mi = m[2].trim();
      const name = m[3].trim();
      if (!ma || mi === '****') continue;
      if (!codeMap[ma]) codeMap[ma] = {};
      codeMap[ma][mi] = name;
    }
  }
  return codeMap;
}

// ===== tables/*.sql CREATE TABLE DDL → {TABLE: [{name, type}]} =====
function parseTableColumns(content) {
  const tables = {};
  // CREATE TABLE "OWNER"."NAME" ( ... ) SEGMENT|PCTFREE|TABLESPACE|;
  const tableRe = /CREATE\s+TABLE\s+(?:"?\w+"?\s*\.\s*)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*(?:SEGMENT\s+CREATION|PCTFREE|TABLESPACE|NOCOMPRESS|LOGGING|;)/gi;
  let tm;
  while ((tm = tableRe.exec(content)) !== null) {
    const name = tm[1].toUpperCase();
    const body = tm[2];
    const cols = [];
    // 라인별: "COL_NAME" TYPE(...)  또는  COL_NAME TYPE(...)
    for (const line of body.split('\n')) {
      const lm = line.trim().match(/^"?([A-Z_][A-Z0-9_]*)"?\s+(VARCHAR2?|CHAR|NUMBER|DATE|TIMESTAMP|CLOB|BLOB|RAW|FLOAT|INT(?:EGER)?|LONG|NCHAR|NVARCHAR2)(\s*\([^)]+\))?/i);
      if (!lm) continue;
      const colName = lm[1].toUpperCase();
      if (['CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'KEY', 'USING'].includes(colName)) continue;
      const typeFull = lm[2].toUpperCase() + (lm[3] || '').replace(/\s+/g, '');
      cols.push({ name: colName, type: typeFull });
    }
    if (cols.length > 0) tables[name] = cols;
  }
  return tables;
}

function buildTableSchemas(dbRepoPath) {
  const tablesDir = path.join(dbRepoPath, 'tables');
  if (!fs.existsSync(tablesDir)) return {};
  const result = {};
  for (const f of fs.readdirSync(tablesDir).filter(f => f.endsWith('.sql'))) {
    let content;
    try { content = fs.readFileSync(path.join(tablesDir, f), 'utf8'); } catch (e) { continue; }
    Object.assign(result, parseTableColumns(content));
  }
  return result;
}

// ===== Java 소스 walk =====
function _walkJavaFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  const SKIP_DIR = new Set(['node_modules', '.git', 'target', 'build', 'dist', 'graphify-out']);
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (SKIP_DIR.has(ent.name)) continue;
        stack.push(path.join(cur, ent.name));
      } else if (ent.isFile() && ent.name.endsWith('.java')) {
        out.push(path.join(cur, ent.name));
      }
    }
  }
  return out;
}

// ===== JOIN 패턴 스캔 → {COL_NAME: CM_MACODE} =====
// 패턴1: `<alias>.<COL> = <alias>.CM_MICODE ... <alias>.CM_MACODE = 'XXX'`
// 패턴2: `<alias>.CM_MACODE = 'XXX' ... <alias>.CM_MICODE = <alias>.<COL>` (양쪽 순서)
// 패턴3: `<alias>.CM_MACODE = 'XXX' ... <alias>.<COL> = <alias>.CM_MICODE`
function scanColumnCodeMap(webRepoPath) {
  const freq = {}; // {COL: {CM_MACODE: count}}
  const re1 = /(?:\b\w+\.)?([A-Z_][A-Z0-9_]+)\s*=\s*\w+\.CM_MICODE\b[\s\S]{0,400}?\b\w+\.CM_MACODE\s*=\s*'([^']+)'/gi;
  const re2 = /\b\w+\.CM_MACODE\s*=\s*'([^']+)'[\s\S]{0,400}?\b\w+\.CM_MICODE\s*=\s*(?:\b\w+\.)?([A-Z_][A-Z0-9_]+)/gi;
  const re3 = /\b\w+\.CM_MACODE\s*=\s*'([^']+)'[\s\S]{0,400}?(?:\b\w+\.)?([A-Z_][A-Z0-9_]+)\s*=\s*\w+\.CM_MICODE\b/gi;
  const SKIP = new Set([
    'CM_MICODE', 'CM_MACODE', 'CM_CODENAME',
    // SQL 함수/키워드 (정규식 오탐 방지)
    'NVL', 'DECODE', 'COALESCE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'SUBSTR', 'SUBSTRING', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER',
    'COUNT', 'SUM', 'MAX', 'MIN', 'AVG', 'ROUND', 'TRUNC', 'MOD',
    'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'NULL', 'NULLIF', 'CAST',
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'EXISTS', 'IS',
    'ROWNUM', 'SYSDATE', 'USER', 'DUAL', 'LISTAGG', 'CONCAT', 'LENGTH'
  ]);

  const files = _walkJavaFiles(webRepoPath);
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }

    let m;
    while ((m = re1.exec(content)) !== null) {
      const col = m[1].toUpperCase();
      const ma = m[2].toUpperCase();
      if (SKIP.has(col) || col.length < 3) continue;
      freq[col] = freq[col] || {};
      freq[col][ma] = (freq[col][ma] || 0) + 1;
    }
    while ((m = re2.exec(content)) !== null) {
      const col = m[2].toUpperCase();
      const ma = m[1].toUpperCase();
      if (SKIP.has(col) || col.length < 3) continue;
      freq[col] = freq[col] || {};
      freq[col][ma] = (freq[col][ma] || 0) + 1;
    }
    while ((m = re3.exec(content)) !== null) {
      const col = m[2].toUpperCase();
      const ma = m[1].toUpperCase();
      if (SKIP.has(col) || col.length < 3) continue;
      freq[col] = freq[col] || {};
      freq[col][ma] = (freq[col][ma] || 0) + 1;
    }
  }

  // 빈도 1위 채택
  const map = {};
  for (const [col, macodes] of Object.entries(freq)) {
    const sorted = Object.entries(macodes).sort((a, b) => b[1] - a[1]);
    map[col] = sorted[0][0];
  }
  return map;
}

// ===== DB repo wiki 캐시 빌드 =====
function cacheForDbRepo(dbRepoPath, dbWikiRoot) {
  try {
    if (!fs.existsSync(dbWikiRoot)) fs.mkdirSync(dbWikiRoot, { recursive: true });
    const codeMap = buildCodeMap(dbRepoPath);
    const tableSchemas = buildTableSchemas(dbRepoPath);
    fs.writeFileSync(path.join(dbWikiRoot, 'CodeMap.json'), JSON.stringify(codeMap, null, 2), 'utf8');
    fs.writeFileSync(path.join(dbWikiRoot, 'TableSchemas.json'), JSON.stringify(tableSchemas, null, 2), 'utf8');
    console.log(`[dbDictionary] ${path.basename(dbWikiRoot)}: codes=${Object.keys(codeMap).length}, tables=${Object.keys(tableSchemas).length}`);
    return { codeMap, tableSchemas };
  } catch (e) {
    console.error('[dbDictionary] cacheForDbRepo failed:', e.message);
    return { codeMap: {}, tableSchemas: {} };
  }
}

// ===== Web repo wiki 캐시 빌드 =====
// webRepoPath: Java 소스가 있는 실제 레포 경로 (JOIN 패턴 스캔용)
// webWikiRoot: ColumnCodeMap.json 저장 위치
function cacheForWebRepo(webRepoPath, webWikiRoot) {
  try {
    if (!fs.existsSync(webWikiRoot)) fs.mkdirSync(webWikiRoot, { recursive: true });
    const map = scanColumnCodeMap(webRepoPath);
    fs.writeFileSync(path.join(webWikiRoot, 'ColumnCodeMap.json'), JSON.stringify(map, null, 2), 'utf8');
    console.log(`[dbDictionary] ${path.basename(webWikiRoot)}: column-code mappings=${Object.keys(map).length}`);
    return map;
  } catch (e) {
    console.error('[dbDictionary] cacheForWebRepo failed:', e.message);
    return {};
  }
}

// ===== 로드 헬퍼 (캐시) =====
const _cache = new Map();
function _loadJson(p) {
  if (_cache.has(p)) return _cache.get(p);
  let v = {};
  try { if (fs.existsSync(p)) v = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { v = {}; }
  _cache.set(p, v);
  return v;
}
function clearCache() { _cache.clear(); }

function loadCodeMap(dbWikiRoot) { return _loadJson(path.join(dbWikiRoot, 'CodeMap.json')); }
function loadTableSchemas(dbWikiRoot) { return _loadJson(path.join(dbWikiRoot, 'TableSchemas.json')); }
function loadColumnCodeMap(webWikiRoot) { return _loadJson(path.join(webWikiRoot, 'ColumnCodeMap.json')); }

module.exports = {
  buildCodeMap, buildTableSchemas, scanColumnCodeMap, parseTableColumns,
  cacheForDbRepo, cacheForWebRepo,
  loadCodeMap, loadTableSchemas, loadColumnCodeMap, clearCache,
};
