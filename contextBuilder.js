'use strict';
const fs = require('fs');
const path = require('path');
const dbDictionary = require('./dbDictionary');
const wikiV2Loader = require('./wikiV2Loader');
const repoMapBuilder = require('./repoMapBuilder');
const entityIndex = require('./entityIndexBuilder');
const { smartRead } = require('./encoding');
const { repoInfoPath } = require('./pathUtils');

let companies = [];
try { companies = JSON.parse(fs.readFileSync(path.join(__dirname, 'companies.json'), 'utf8')); } catch (e) {}

function getCompanyFolder(companyId) {
  const comp = companies.find(c => c.id === companyId);
  return comp ? comp.name : '고객사없음';
}

// Feature flag — env USE_REPO_MAP=true 시 repo-map 패턴 사용
const USE_REPO_MAP = process.env.USE_REPO_MAP === 'true';

// repo-map 캐시 (mtime 기반 invalidation 은 단순화 — 10분 TTL)
const REPO_MAP_CACHE = new Map();
const REPO_MAP_TTL_MS = 10 * 60 * 1000;

const WIKI_BASE = path.join(__dirname, 'wiki');
const SCREEN_MAPS_DIR = path.join(__dirname, 'screen_maps');

const MAX_JS_FILES = 3;
const MAX_CLASS_FILES = 4;
const MAX_SERVLETS_PER_JS = 3; // 도메인 servlet이 1·2번째 자리 못 잡고 잘리는 문제 해결
const MAX_READ_BYTES = 7000;
const MAX_DB_TABLES = 3;

// ===== JS wiki "호출 서버 API" 섹션에서 직접 호출 servlet 추출 =====
// JS가 직접 부르는 servlet은 도메인 prefix·common 무관하게 1순위
function extractDirectServlets(jsWikiContent) {
  const set = new Set();
  if (!jsWikiContent) return set;
  // [[Servlets/_webPage_xxx_yyy|...]] 또는 [[Servlets/_webPage_xxx_yyy\|...]] 패턴
  for (const m of jsWikiContent.matchAll(/\[\[Servlets\/([^\|\\\]]+)/g)) {
    set.add(m[1].trim());
  }
  return set;
}

// ===== Servlet 우선순위 정렬 =====
// 1순위: JS가 직접 호출하는 servlet (directServlets)
// 2순위: 도메인 prefix
// 3순위: common/util
function rankServlets(servletFiles, directServlets = new Set()) {
  return [...servletFiles].sort((a, b) => {
    const aDirect = directServlets.has(a) ? 0 : 1;
    const bDirect = directServlets.has(b) ? 0 : 1;
    if (aDirect !== bDirect) return aDirect - bDirect;
    const aCommon = /_common_|_util/i.test(a) ? 1 : 0;
    const bCommon = /_common_|_util/i.test(b) ? 1 : 0;
    return aCommon - bCommon;
  });
}

// ===== 파일 읽기 (에러 무시) =====
function safeRead(filePath, maxBytes = MAX_READ_BYTES) {
  // 인코딩 자동 감지(UTF-8/EUC-KR) 후 UTF-8 문자열 반환
  const content = smartRead(filePath);
  if (!content) return '';
  return content.length > maxBytes ? content.substring(0, maxBytes) + '\n...(이하 생략)' : content;
}

// ===== MenuMap 로드: [{menus[], jsFile}] =====
function loadMenuEntries(repoId) {
  const safeId = repoId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const specific = path.join(SCREEN_MAPS_DIR, safeId + '.txt');
  const defaultFile = path.join(SCREEN_MAPS_DIR, 'default.txt');
  const filePath = fs.existsSync(specific) ? specific : (fs.existsSync(defaultFile) ? defaultFile : null);
  if (!filePath) return [];

  const jspToMenus = new Map();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const parts = line.trim().split('\t');
    if (parts.length < 2) continue;
    const menuName = parts[0].trim();
    const jspPath = parts[1].trim();
    if (!menuName || !jspPath) continue;
    if (!jspToMenus.has(jspPath)) jspToMenus.set(jspPath, []);
    jspToMenus.get(jspPath).push(menuName);
  }

  const entries = [];
  for (const [jspPath, menus] of jspToMenus) {
    const jsFile = jspPath.endsWith('.jsp') ? path.basename(jspPath, '.jsp') + '.js' : '';
    if (jsFile) entries.push({ menus, jsFile });
  }
  return entries;
}

// ===== ScreenMap.md 파싱: [{screenName, jsFile}] =====
// 포맷: | 화면명 | [[Pages/JS/File.js\|File.js]] | ...
function parseScreenMap(wikiRoot) {
  const smPath = path.join(wikiRoot, 'ScreenMap.md');
  if (!fs.existsSync(smPath)) return [];

  const results = [];
  for (const line of fs.readFileSync(smPath, 'utf8').split('\n')) {
    if (!line.startsWith('|') || line.includes('---|')) continue;
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const screenName = parts[1].trim();
    if (!screenName || screenName === '화면명') continue;
    // [[Pages/JS/FileName.js\|...]] → FileName.js
    const m = parts[2].match(/\[\[Pages\/JS\/([^\|\\]+)/);
    if (m) results.push({ screenName, jsFile: m[1].trim() });
  }
  return results;
}

// ===== 질문에서 매칭되는 JS 파일 찾기 =====
// Map: jsFile → 매칭 근거 문자열
function findMatchingJsFiles(message, menuEntries, screenMapEntries) {
  const matched = new Map();

  // 1. MenuMap: 메뉴명 부분 포함 여부
  for (const { menus, jsFile } of menuEntries) {
    for (const menu of menus) {
      if (message.includes(menu)) {
        if (!matched.has(jsFile)) matched.set(jsFile, `메뉴명 "${menu}"`);
        break;
      }
    }
  }

  // 2. ScreenMap: 화면명의 주요 단어 포함 여부 (2글자 이상)
  for (const { screenName, jsFile } of screenMapEntries) {
    if (matched.has(jsFile)) continue;
    // 3글자 미만(화면·기능·공통 등 일반 단어) 제외, 의미있는 단어만 매칭
    const words = screenName.replace(/[\[\]>]/g, '').split(/\s+/).filter(w => w.length >= 3);
    for (const word of words) {
      if (message.includes(word)) {
        matched.set(jsFile, `화면명 "${screenName}"`);
        break;
      }
    }
  }

  // 3. 질문에 JS/JSP 파일명 직접 언급
  const directMatches = message.match(/([A-Za-z][A-Za-z0-9]+)\.(js|jsp)/gi) || [];
  for (const f of directMatches) {
    const jsFile = f.toLowerCase().endsWith('.jsp') ? path.basename(f, '.jsp') + '.js' : f;
    if (!matched.has(jsFile)) matched.set(jsFile, `파일명 직접 언급 "${f}"`);
  }

  return matched;
}

// ===== Graph/Files 내 Servlet 파일명 추출 =====
// 패턴: [[../Pages/Servlets/FILENAME| or [[Pages/Servlets/FILENAME|
function extractServletFilenames(content) {
  const refs = [];
  const re = /\[\[(?:\.\.\/)*Pages\/Servlets\/([^\|\\→\]]+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name && !refs.includes(name)) refs.push(name);
  }
  return refs;
}

// ===== Servlet Wiki 내 Class 파일명 추출 =====
// 패턴: [[Pages/Classes/ClassName| 또는 [[../Classes/ClassName|
function extractClassFilenames(content) {
  const refs = [];
  const re = /\[\[(?:\.\.\/)*(?:Pages\/)?Classes\/([^\|\\→\]]+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name && !refs.includes(name)) refs.push(name);
  }
  return refs;
}

// ===== 이전 답변에서 언급된 JS 파일 추출 (이어가기 fallback용) =====
function extractJsFilesFromHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  // 마지막 AI 답변 (role이 'ai' 또는 'assistant')
  const lastAi = [...history].reverse().find(m => m && (m.role === 'ai' || m.role === 'assistant') && typeof m.content === 'string');
  if (!lastAi) return [];
  const refs = [...lastAi.content.matchAll(/\b([A-Z][A-Za-z0-9_]+\.js)\b/g)].map(m => m[1]);
  return [...new Set(refs)];
}

// ===== Servlet/Class wiki 본문에서 등장한 테이블명 추출 =====
function extractTableNames(content, knownTables) {
  const found = new Set();
  // FROM/JOIN/INTO/UPDATE 뒤 식별자
  const re1 = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE:)\s+([A-Z][A-Z0-9_]{3,})\b/gi;
  let m;
  while ((m = re1.exec(content)) !== null) {
    const tb = m[1].toUpperCase();
    if (knownTables[tb]) found.add(tb);
  }
  // ECAMS 명명규칙: CMM/CMR/CMC/CMP/CMD + 4자리
  const re2 = /\b(CM[A-Z]\d{4})\b/g;
  while ((m = re2.exec(content)) !== null) {
    const tb = m[1].toUpperCase();
    if (knownTables[tb]) found.add(tb);
  }
  return [...found];
}

// ===== 같은 고객사의 DB repo 찾기 (없으면 sample_db fallback) =====
function findDbRepoForWebRepo(webRepoId, LOCAL_REPOS) {
  const webInfo = LOCAL_REPOS[webRepoId];
  if (webInfo && typeof webInfo === 'object' && webInfo.companyId) {
    for (const [id, info] of Object.entries(LOCAL_REPOS)) {
      if (typeof info !== 'object') continue;
      if (info.companyId === webInfo.companyId && info.type === 'db') return id;
    }
  }
  return LOCAL_REPOS['sample_db'] ? 'sample_db' : null;
}

// ===== DB 섹션 합성 (테이블 스키마 + 코드값) =====
function synthesizeDbSection(dbRepoId, tableNames, schemas, codeMap, columnCodeMap) {
  if (tableNames.length === 0 || Object.keys(schemas).length === 0) return '';

  const out = [];
  const usedGroups = new Map(); // CM_MACODE → [컬럼명들]
  const tablesToShow = tableNames.slice(0, MAX_DB_TABLES);
  let validTables = 0;

  const tableSections = [];
  for (const tb of tablesToShow) {
    const cols = schemas[tb];
    if (!cols || cols.length === 0) continue;
    validTables++;
    const lines = [`\n### 📋 ${tb}\n`, '| 컬럼 | 타입 | 코드그룹 |\n|---|---|---|\n'];
    for (const c of cols) {
      const cg = columnCodeMap[c.name];
      const cgDisplay = cg ? `**${cg}**` : '—';
      lines.push(`| ${c.name} | ${c.type} | ${cgDisplay} |\n`);
      if (cg && codeMap[cg]) {
        if (!usedGroups.has(cg)) usedGroups.set(cg, []);
        usedGroups.get(cg).push(`${tb}.${c.name}`);
      }
    }
    tableSections.push(lines.join(''));
  }
  if (validTables === 0) return '';

  out.push('\n---\n');
  out.push(`\n## 🗄️ DB 스키마 + 코드값 (${dbRepoId} 기반)\n`);
  out.push('> 아래 코드값은 CMM0020 (코드표) 실제 데이터입니다. 이 외 값으로 답하지 마십시오.\n');
  out.push(...tableSections);

  if (usedGroups.size > 0) {
    out.push('\n### 📖 CMM0020 코드값 (컬럼 의미 해석용 — SQL 조건으로 직접 사용 금지)\n');
    out.push('> 아래 표는 컬럼이 가질 수 있는 코드값 목록입니다. 실제 검증 SQL은 위 Servlet/Class wiki에 있는 것을 그대로 인용하십시오. 이 표의 값을 임의로 SQL `WHERE` 조건에 넣지 마십시오.\n');
    for (const [macode, cols] of usedGroups) {
      const codes = codeMap[macode];
      if (!codes) continue;
      out.push(`\n**${macode}** (사용: ${cols.join(', ')})\n`);
      out.push('| 값 | 의미 |\n|---|---|\n');
      for (const [mi, name] of Object.entries(codes)) {
        out.push(`| ${mi} | ${name} |\n`);
      }
    }
  }
  return out.join('');
}

// ===== Repo-map 기반 context 빌드 (USE_REPO_MAP=true) =====
async function buildContextWithRepoMap(message, allowedRepos, LOCAL_REPOS) {
  const startTime = Date.now();
  const sections = [];
  const usedRepos = [];

  console.log(`[RepoMap] 진입 — allowedRepos=[${allowedRepos.join(', ')}]`);

  for (const repoId of allowedRepos) {
    const workspacePath = repoInfoPath(LOCAL_REPOS[repoId], __dirname);
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      console.log(`[RepoMap] skip ${repoId} — workspace 미매핑 또는 없음 (path=${workspacePath})`);
      continue;
    }

    // 캐시 lookup
    const cacheKey = `${repoId}::${message.slice(0, 200)}`;
    const cached = REPO_MAP_CACHE.get(cacheKey);
    let result;
    if (cached && (Date.now() - cached.ts) < REPO_MAP_TTL_MS) {
      result = cached.result;
      console.log(`[RepoMap] cache hit ${repoId} — symbols=${result?.symbols?.length || 0}`);
    } else {
      const buildStart = Date.now();
      result = repoMapBuilder.buildRepoMap(workspacePath, message, 2048);
      REPO_MAP_CACHE.set(cacheKey, { result, ts: Date.now() });
      console.log(`[RepoMap] build ${repoId} — symbols=${result?.symbols?.length || 0}, ${Date.now() - buildStart}ms`);
    }

    if (!result || !result.symbols?.length) continue;
    usedRepos.push(repoId);

    sections.push(`\n# 🗺 Repo-map [${repoId}]\n`);
    sections.push(`> Files: ${result.fileCount}/${result.parsedCount}, Graph: ${result.graphNodes}n/${result.graphEdges}e, Build: ${result.elapsed}ms\n`);
    sections.push(`> Top ${result.symbols.length} 심볼 (도메인 핵심, PageRank + 키워드 매칭)\n`);
    sections.push(`> ⛔ **이 심볼들을 우선 grep/read 하세요. 답변에 file:line 인용 필수.**\n\n`);
    sections.push('| Rank | File | Line | Kind | Symbol |\n|---|---|---|---|---|\n');
    for (let i = 0; i < Math.min(50, result.symbols.length); i++) {
      const s = result.symbols[i];
      sections.push(`| ${i + 1} | \`${s.file}\` | ${s.line} | ${s.kind} | **${s.name}** |\n`);
    }
    sections.push('\n');
  }

  const elapsed = Date.now() - startTime;
  return {
    contextBlock: sections.join(''),
    hits: usedRepos,
    matchedFiles: { js: [], servlets: [], classes: [] },
    isEmpty: usedRepos.length === 0,
    elapsed,
  };
}

// ===== 첫 hop: 임베딩 인덱스로 JS 선택 (키워드 매칭보다 정확) =====
// 인덱스/apiKey 없거나 실패 시 null → 호출부에서 키워드 fallback.
async function selectJsViaIndex(repoId, message, apiKey, jsWikiDir) {
  if (!apiKey) return null;
  if (!fs.existsSync(entityIndex.indexPath(repoId))) return null;
  let ranked;
  try { ranked = await entityIndex.queryIndex(repoId, message, apiKey, 10); } catch (e) { return null; }
  if (!ranked || !ranked.length) return null;

  const seen = new Set();
  const matches = new Map();
  for (const e of ranked) {
    if (e.kind !== 'js') continue; // 체인은 JS 기점 (Class 직접주입은 후속)
    const base = e.name.replace(/_\d{6,8}$/, '').toLowerCase(); // 버전중복 collapse
    if (seen.has(base)) continue;
    const jsFile = e.name + '.js';
    if (!fs.existsSync(path.join(jsWikiDir, jsFile + '.md'))) continue; // wiki 있는 것만
    seen.add(base);
    matches.set(jsFile, `인덱스 매칭 (${Math.round(e.score * 100)})`);
    if (matches.size >= MAX_JS_FILES) break;
  }
  return matches.size ? matches : null;
}

// ===== 메인: 컨텍스트 선조립 =====
async function buildContext(message, allowedRepos, LOCAL_REPOS, history = [], apiKey = null, triageTarget = null) {
  // Feature flag — repo-map 모드
  if (USE_REPO_MAP) {
    const searchMessage = triageTarget ? `[타깃 파일: ${triageTarget}] ${message}` : message;
    return await buildContextWithRepoMap(searchMessage, allowedRepos, LOCAL_REPOS);
  }

  const startTime = Date.now();
  const sections = [];
  const matchedFiles = { js: [], servlets: [], classes: [] };
  let classCount = 0;
  let usedFallback = false;

  for (const repoId of allowedRepos) {
    const repoInfo = LOCAL_REPOS[repoId];
    if (!repoInfo) continue;

    // web 타입 레포에만 적용 (server/db는 JS→Servlet 체인 없음)
    // web-type-split 이후 type 이 web_html5·web_general 로 세분화됨 → web* 전부 허용 (기존 'web' 가드는 회귀였음)
    const repoType = typeof repoInfo === 'string' ? 'web' : (repoInfo.type || 'web');
    if (!repoType.startsWith('web')) continue;

    const safeRepo = repoId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const companyFolder = repoInfo.companyId ? getCompanyFolder(repoInfo.companyId) : '고객사없음';
    const wikiRoot = path.join(WIKI_BASE, companyFolder, safeRepo);
    if (!fs.existsSync(wikiRoot)) continue;

    const graphFilesDir = path.join(wikiRoot, 'Graph', 'Files');
    const servletsDir   = path.join(wikiRoot, 'Pages', 'Servlets');
    const classesDir    = path.join(wikiRoot, 'Pages', 'Classes');
    const jsWikiDir     = path.join(wikiRoot, 'Pages', 'JS');

    // 화면 매핑 로드
    const menuEntries = loadMenuEntries(repoId);
    const screenMapEntries = parseScreenMap(wikiRoot);

    // 매칭 JS 파일 검색 — 1순위: Triage 타깃, 2순위: 임베딩 인덱스, 3순위: 키워드 fallback
    let jsMatches = new Map();
    const targetJsFile = triageTarget ? (triageTarget.endsWith('.js') ? triageTarget : triageTarget + '.js') : null;
    if (targetJsFile && fs.existsSync(path.join(jsWikiDir, targetJsFile + '.md'))) {
      jsMatches.set(targetJsFile, 'Triage 확정 타깃');
    } else {
      jsMatches = await selectJsViaIndex(repoId, message, apiKey, jsWikiDir);
      if (!jsMatches || jsMatches.size === 0) {
        jsMatches = findMatchingJsFiles(message, menuEntries, screenMapEntries);
      }
    }

    // Fallback: 매칭 실패 시 이전 AI 답변에서 언급된 JS 파일 재사용 (이어가기)
    if (jsMatches.size === 0) {
      const prevJsFiles = extractJsFilesFromHistory(history);
      const validPrev = prevJsFiles.filter(jsFile => {
        return fs.existsSync(path.join(jsWikiDir, jsFile + '.md'));
      });
      if (validPrev.length > 0) {
        jsMatches = new Map(validPrev.slice(0, MAX_JS_FILES).map(f => [f, '이전 답변 이어가기']));
        usedFallback = true;
      }
    }

    if (jsMatches.size === 0) continue;

    const headerLabel = usedFallback ? '🔄 이전 컨텍스트 이어가기' : '📦 선조립 컨텍스트';
    sections.push(`\n# ${headerLabel} [${repoId}]\n`);
    sections.push(`> 매칭된 화면: ${[...jsMatches.values()].join(', ')}\n`);
    sections.push(`> ⛔ **인용 강제 규칙**\n`);
    sections.push(`> 1. SQL·메서드명·테이블명·컬럼명은 아래 Class/Servlet wiki에 적힌 그대로 인용하십시오. **자체 합성 금지.**\n`);
    sections.push(`> 2. 한국어 키워드(예: "체크아웃취소", "신청")만 듣고 CodeMap의 코드값을 가져와 SQL 조건으로 끼워 넣지 마십시오. CodeMap은 **컬럼 의미 해석용**이며 실제 검증 로직과 다를 수 있습니다.\n`);
    sections.push(`> 3. 답변에 인용하는 SQL이 아래 wiki에 없다면 "wiki에 명시되지 않았습니다"라고 답하고 추측하지 마십시오.\n`);
    sections.push(`> 4. (빠른 모드 한정) .java·.js·.jsp 소스 파일을 Read하지 마십시오.\n\n`);

    // ===== LLM 합성 wiki v2/v3 도메인 사전 주입 (kjbank 한정, core 7 + 메시지 매칭 top 5) =====
    const v2Section = wikiV2Loader.buildV2Section(repoId, message);
    if (v2Section) sections.push(v2Section);

    // DB 섹션 합성용: 이 repo가 참조하는 db 사전 로드
    const dbRepoId = findDbRepoForWebRepo(repoId, LOCAL_REPOS);
    let dbWikiRoot = null;
    if (dbRepoId) {
      const dbInfo = LOCAL_REPOS[dbRepoId] || {};
      const dbComp = dbInfo.companyId ? getCompanyFolder(dbInfo.companyId) : '고객사없음';
      dbWikiRoot = path.join(WIKI_BASE, dbComp, dbRepoId.replace(/[^a-zA-Z0-9_\-]/g, '_'));
    }
    const tableSchemas = dbWikiRoot ? dbDictionary.loadTableSchemas(dbWikiRoot) : {};
    const codeMap = dbWikiRoot ? dbDictionary.loadCodeMap(dbWikiRoot) : {};
    const columnCodeMap = dbDictionary.loadColumnCodeMap(wikiRoot);
    const referencedTables = new Set();
    const seenServlets = new Set();  // 여러 JS 간 중복 첨부 방지

    let jsProcessed = 0;
    for (const [jsFile, reason] of jsMatches) {
      if (jsProcessed >= MAX_JS_FILES) break;
      jsProcessed++;
      matchedFiles.js.push(jsFile);

      sections.push(`---\n## 📄 ${jsFile} (${reason})\n`);

      // 1) JS Wiki
      const jsWiki = safeRead(path.join(jsWikiDir, jsFile + '.md'));
      if (jsWiki) sections.push(`### JS 함수 → API 호출 목록\n${jsWiki}\n`);

      // JS가 직접 호출하는 servlet 추출 (우선순위 1순위)
      const directServlets = extractDirectServlets(jsWiki);

      // 2) Graph/Files → 의존성 체인 + Servlet 참조
      const graphContent = safeRead(path.join(graphFilesDir, jsFile + '.md'));
      if (!graphContent) {
        sections.push(`> ⚠️ Graph/Files 없음 — Wiki에서 직접 탐색 필요\n`);
        continue;
      }
      sections.push(`### 의존성 체인 (JS → Servlet)\n${graphContent}\n`);

      // 3) Servlet Wiki들 (직접 호출 우선 → 도메인 prefix → common 후순위 + 중복 제거)
      const servletFiles = rankServlets(extractServletFilenames(graphContent), directServlets);
      let servletsAdded = 0;
      for (const servletFile of servletFiles) {
        if (servletsAdded >= MAX_SERVLETS_PER_JS) break;
        if (seenServlets.has(servletFile)) continue;  // 다른 JS에서 이미 첨부됨
        seenServlets.add(servletFile);

        const servletContent = safeRead(path.join(servletsDir, servletFile + '.md'));
        if (!servletContent) continue;

        matchedFiles.servlets.push(servletFile);
        sections.push(`### Servlet: ${servletFile}\n${servletContent}\n`);
        for (const t of extractTableNames(servletContent, tableSchemas)) referencedTables.add(t);
        servletsAdded++;

        // 4) Class Wiki들 (전체 총량 제한)
        if (classCount < MAX_CLASS_FILES) {
          const classFiles = extractClassFilenames(servletContent);
          for (const classFile of classFiles.slice(0, 2)) {
            if (classCount >= MAX_CLASS_FILES) break;
            const classContent = safeRead(path.join(classesDir, classFile + '.md'));
            if (!classContent) continue;
            matchedFiles.classes.push(classFile);
            sections.push(`### Class: ${classFile}\n${classContent}\n`);
            for (const t of extractTableNames(classContent, tableSchemas)) referencedTables.add(t);
            classCount++;
          }
        }
      }
    }

    // ===== DB 섹션 주입 (참조된 테이블만) =====
    if (referencedTables.size > 0 && dbRepoId) {
      const dbSection = synthesizeDbSection(dbRepoId, [...referencedTables], tableSchemas, codeMap, columnCodeMap);
      if (dbSection) {
        sections.push(dbSection);
        matchedFiles.tables = [...referencedTables].slice(0, MAX_DB_TABLES);
      }
    }
  }

  const elapsed = Date.now() - startTime;
  const isEmpty = matchedFiles.js.length === 0;

  const tableCount = (matchedFiles.tables || []).length;
  const contextBlock = isEmpty ? '' :
    sections.join('') +
    `\n---\n> 선조립 완료: JS ${matchedFiles.js.length}개, Servlet ${matchedFiles.servlets.length}개, Class ${matchedFiles.classes.length}개, Table ${tableCount}개 (${elapsed}ms)\n`;

  return { contextBlock, hits: matchedFiles.js, matchedFiles, isEmpty, elapsed };
}

module.exports = { buildContext };
