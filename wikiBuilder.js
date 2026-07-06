const fs = require('fs');
const path = require('path');
const dbDictionary = require('./dbDictionary');
const { decodeBuffer } = require('./encoding');

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.settings', 'build', 'out', '.deco', '__pycache__', 'etcdoc', 'bin']);
const EXCLUDE_EXT  = new Set(['.class', '.jar', '.war', '.zip', '.png', '.jpg', '.gif', '.ico', '.svg', '.woff', '.ttf', '.eot', '.map']);

function walkFiles(dir, exts, pathFilter = null) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch(e) { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') || EXCLUDE_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (pathFilter && !pathFilter(full, true)) continue;
        stack.push(full);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (EXCLUDE_EXT.has(ext)) continue;
        if (pathFilter && !pathFilter(full, false)) continue;
        if (!exts || exts.has(ext)) results.push(full);
      }
    }
  }
  return results;
}

// html5 프로젝트용 파일 필터
// WebContent 하위는 js(util 제외), webPage, loading.html만 포함
// WebContent 외부(src/ 등 Java 소스)는 전부 허용
function makeHtml5Filter(repoPath) {
  const sep = path.sep;
  const wc     = path.join(repoPath, 'WebContent');
  const wcJs   = path.join(wc, 'js');
  const wcUtil = path.join(wc, 'js', 'util');
  const wcWP   = path.join(wc, 'webPage');
  const wcLoad = path.join(wc, 'loading.html');

  return (filePath, isDir) => {
    const underWC = filePath === wc || filePath.startsWith(wc + sep);
    if (!underWC) return true; // src/ 등 WebContent 외부는 모두 허용

    if (isDir) {
      if (filePath === wc) return true;
      if (filePath === wcUtil || filePath.startsWith(wcUtil + sep)) return false;
      if (filePath === wcJs   || filePath.startsWith(wcJs   + sep)) return true;
      if (filePath === wcWP   || filePath.startsWith(wcWP   + sep)) return true;
      return false;
    } else {
      if (filePath === wcLoad) return true;
      if (filePath.startsWith(wcUtil + sep)) return false;
      if (filePath.startsWith(wcJs   + sep)) return true;
      if (filePath.startsWith(wcWP   + sep)) return true;
      return false;
    }
  };
}

function readSafe(p) {
  // 인코딩 감지는 공용 encoding.js 로 위임 (UTF-8/EUC-KR 자동, BOM 제거)
  try { return decodeBuffer(fs.readFileSync(p)); }
  catch(e) { return ''; }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeIndexMd(pagesDir, category, label) {
  const catDir = path.join(pagesDir, category);
  if (!fs.existsSync(catDir)) return;
  const files = fs.readdirSync(catDir).filter(f => f !== 'Index.md');
  let md = `# ${label || category} Index\n\n`;
  files.forEach(f => {
    const name = f.replace('.md', '');
    md += `- [[${category}/${name}|${name}]]\n`;
  });
  fs.writeFileSync(path.join(catDir, 'Index.md'), md, 'utf8');
}

function extractComments(raw) {
  const comments = [];
  const blockComments = raw.match(/\/\*[\s\S]*?\*\//g) || [];
  const lineComments = raw.match(/\/\/.*$/gm) || [];
  
  [...blockComments, ...lineComments].forEach(c => {
      const lines = c.split('\n');
      lines.forEach(l => {
          const txt = l.replace(/\/\*|\*\/|\/\//g, '').trim();
          if (/[가-힣]/.test(txt) && !/\.append|executeQuery|pstmt|\.setString|String\s|if\s*\(/.test(txt)) {
              if (!comments.includes(txt)) comments.push(txt);
          }
      });
  });
  return comments;
}

// ===== 모든 wiki/<repo>/CodeMap.json을 머지 (sample_db + 자체 _db) =====
function loadAllCodeMaps() {
  const merged = {};
  const wikiBase = path.join(__dirname, 'wiki');
  if (!fs.existsSync(wikiBase)) return merged;
  let entries;
  try { entries = fs.readdirSync(wikiBase, { withFileTypes: true }); } catch (e) { return merged; }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const cmPath = path.join(wikiBase, ent.name, 'CodeMap.json');
    if (!fs.existsSync(cmPath)) continue;
    try {
      const cm = JSON.parse(fs.readFileSync(cmPath, 'utf8'));
      for (const [macode, codes] of Object.entries(cm)) {
        if (!merged[macode]) merged[macode] = {};
        Object.assign(merged[macode], codes);
      }
    } catch (e) {}
  }
  return merged;
}

function extractDictHints(sql, colCodeMap, codeMap) {
  if (!colCodeMap || !codeMap) return [];
  const hints = [];
  const conditionRe = /([a-z0-9_]+)\s*(?:=|<>|!=|<|>|<=|>=)\s*['"]?([a-zA-Z0-9_]+)['"]?/gi;
  let cm;
  while ((cm = conditionRe.exec(sql)) !== null) {
      const col = cm[1].toUpperCase();
      const val = cm[2];
      const macode = colCodeMap[col];
      if (macode && codeMap[macode] && codeMap[macode][val]) {
          hints.push(`${col.toLowerCase()}='${val}' (${codeMap[macode][val]})`);
      }
  }
  return [...new Set(hints)];
}

// ===== SQL 파서 (web/db 공통) =====
function parseSql(content, tables, procedures) {
  const lines = content.split('\n');
  let currentTable = null;
  let currentProc = null;
  let procBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const upper = line.toUpperCase();

    const createMatch = line.match(/CREATE\s+TABLE\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)/i);
    if (createMatch) {
      currentTable = createMatch[1].toUpperCase();
      if (!tables[currentTable]) tables[currentTable] = { columns: {}, comment: '' };
    }

    const tbCommMatch = line.match(/COMMENT\s+ON\s+TABLE\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)\s+IS\s+'(.*?)'/i);
    if (tbCommMatch) {
      const name = tbCommMatch[1].toUpperCase();
      if (!tables[name]) tables[name] = { columns: {}, comment: '' };
      tables[name].comment = tbCommMatch[2];
    }

    const colCommMatch = line.match(/COMMENT\s+ON\s+COLUMN\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)\.([A-Z0-9_]+)\s+IS\s+'(.*?)'/i);
    if (colCommMatch) {
      const tb = colCommMatch[1].toUpperCase();
      const col = colCommMatch[2].toUpperCase();
      if (!tables[tb]) tables[tb] = { columns: {}, comment: '' };
      tables[tb].columns[col] = colCommMatch[3];
    }

    if (upper.startsWith('CREATE') && (upper.includes('PROCEDURE') || upper.includes('FUNCTION'))) {
      const nameMatch = line.match(/(?:PROCEDURE|FUNCTION)\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)/i);
      if (nameMatch) {
        currentProc = nameMatch[1].toUpperCase();
        procBuffer = [line];
      }
    } else if (currentProc) {
      procBuffer.push(line);
      if (line === '/' || upper.includes('END;')) {
        procedures[currentProc] = procBuffer.join('\n');
        currentProc = null;
        procBuffer = [];
      }
    }
  }
}

// ===== Pro*C 파서 (server 타입) =====
function parsePcFile(filePath, content, repoPath) {
  const fileName = path.basename(filePath);
  const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');

  // 파일 헤더: 프로그램명, 기능 추출
  let programName = '';
  let description = '';
  const progMatch = content.match(/[│|]\s*프로그램명\s*[│|]\s*(.+?)(?:\s*[│|]|\s*$)/m);
  if (progMatch) programName = progMatch[1].trim();
  const descMatch = content.match(/[│|]\s*기\s*능\s*[│|]\s*(.+?)(?:\s*[│|]|\s*$)/m);
  if (descMatch) description = descMatch[1].trim();
  // 파일명에서 프로그램명 fallback
  if (!programName) programName = fileName;

  // include 의존성
  const includes = new Set();
  for (const m of content.matchAll(/#include\s+[<"]([\w./\\]+)[>"]/g)) includes.add(path.basename(m[1]));
  for (const m of content.matchAll(/EXEC\s+SQL\s+INCLUDE\s+"([^"]+)"/gi)) includes.add(m[1]);

  // 함수 + EXEC SQL 파싱
  const functions = [];
  const lines = content.split('\n');
  let curFunc = null;
  let curAction = '';
  let curSqlOps = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 함수 주석 블록: /* Function : NAME */ 또는 /* 함수명 : NAME */
    const fnCommentMatch = trimmed.match(/\/\*\s*(?:Function|함수명?)\s*:\s*(\w+)/i);
    if (fnCommentMatch) {
      if (curFunc) functions.push({ name: curFunc, action: curAction, sqlOps: curSqlOps });
      curFunc = fnCommentMatch[1];
      curAction = '';
      curSqlOps = [];
      // Action/기능 라인 탐색
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const am = lines[j].match(/\/\*\s*(?:Action|기능|처리)\s*:\s*(.+)/i);
        if (am) { curAction = am[1].replace(/\s*\*\/$/, '').trim(); break; }
      }
      continue;
    }

    // EXEC SQL 추출
    if (curFunc) {
      const execMatch = trimmed.match(/EXEC\s+SQL\s+(SELECT|INSERT|UPDATE|DELETE|CALL|EXECUTE)/i);
      if (execMatch) {
        const opType = execMatch[1].toUpperCase();
        let tableName = '';
        // 현재 + 다음 5줄에서 테이블명 탐색
        const searchBlock = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');
        let tbMatch = null;
        if (opType === 'SELECT' || opType === 'DELETE') {
          tbMatch = searchBlock.match(/\bFROM\s+([A-Z][A-Z0-9_]{2,})/i);
        } else if (opType === 'INSERT') {
          tbMatch = searchBlock.match(/\bINTO\s+([A-Z][A-Z0-9_]{2,})/i);
        } else if (opType === 'UPDATE') {
          tbMatch = searchBlock.match(/UPDATE\s+([A-Z][A-Z0-9_]{2,})/i);
        } else {
          tbMatch = searchBlock.match(/EXEC\s+SQL\s+(?:CALL|EXECUTE)\s+([A-Z][A-Z0-9_]{2,})/i);
        }
        if (tbMatch) {
          tableName = tbMatch[1].toUpperCase();
          const skipWords = new Set(['SELECT', 'INTO', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'THE', 'FOR']);
          if (!skipWords.has(tableName) && !curSqlOps.some(o => o.type === opType && o.table === tableName)) {
            curSqlOps.push({ type: opType, table: tableName });
          }
        }
      }
    }
  }
  if (curFunc) functions.push({ name: curFunc, action: curAction, sqlOps: curSqlOps });

  const tables = [];
  for (const fn of functions) {
    for (const op of fn.sqlOps) tables.push({ func: fn.name, op: op.type, name: op.table });
  }

  return { fileName, relPath, programName, description, includes: [...includes], functions, tables };
}

// ===== JS 파싱 헬퍼 =====

// JS 파일 상단 JSDoc에서 화면명 추출
function extractScreenName(content) {
  const m = content.match(/^\/\*\*[\s\S]*?\*\//);
  if (!m) return '';
  const firstLine = m[0].split('\n').slice(1).find(l => /\*\s+[^\s*@<]/.test(l));
  if (!firstLine) return '';
  return firstLine
    .replace(/^\s*\*\s*/, '')
    .replace(/화면의?\s*(기능\s*)?(정의|설명).*$/, '')
    .replace(/\s*(기능\s*정의|화면\s*정의).*$/, '')
    .replace(/\s*기능정의.*$/, '')
    .replace(/화면$/, '')
    .trim();
}

// 중괄호 카운팅으로 함수 본문 끝 위치 찾기
function findBodyEnd(content, openBraceIdx) {
  let depth = 1, i = openBraceIdx + 1;
  while (i < content.length && depth > 0) {
    const c = content[i];
    if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) return i + 1; }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < content.length) {
        if (content[i] === '\\') { i += 2; continue; }
        if (content[i] === q) break;
        i++;
      }
    } else if (content[i] === '/' && content[i+1] === '/') {
      // 한 줄 주석 건너뜀
      while (i < content.length && content[i] !== '\n') i++;
    }
    i++;
  }
  return i;
}

// UI 텍스트 추출: .text('등록'), $('#btnReg').html('해제') 등
// 동적 라벨/버튼명을 찾아 Wiki에 명시해 키워드 검색이 닿게 함
// 반환: { bySelector: Map<selector, Set<text>>, noSelector: Set<text> }
function extractUITexts(content) {
  const bySelector = new Map();
  const noSelector = new Set();
  const lines = content.split('\n');
  let recentSelector = '';

  for (const line of lines) {
    // 가장 최근 본 선택자 추적 (5줄 윈도우 대신 lastSeen 단순화)
    const selMatch = line.match(/\$\(\s*['"]([#.][\w\-]+)['"]\s*\)/);
    if (selMatch) recentSelector = selMatch[1];

    // .text('...') / .html('...') / .val('...') 리터럴
    const tm = line.match(/\.(?:text|html|val)\s*\(\s*['"]([^'"]{2,60})['"]\s*\)/);
    if (!tm) continue;
    const text = tm[1].trim();
    // 한글이 들어있거나 영어 라벨 (소문자만은 제외 — i18n key 같은 노이즈)
    if (!/[가-힯]/.test(text) && !/^[A-Z]/.test(text)) continue;
    if (text.length < 2) continue;

    const sameLineSel = line.match(/\$\(\s*['"]([#.][\w\-]+)['"]\s*\)[^;]*?\.(?:text|html|val)\s*\(/);
    const sel = sameLineSel ? sameLineSel[1] : recentSelector;

    if (sel) {
      if (!bySelector.has(sel)) bySelector.set(sel, new Set());
      bySelector.get(sel).add(text);
    } else {
      noSelector.add(text);
    }
  }

  return { bySelector, noSelector };
}

// 함수별 ajax 호출 추출 (중괄호 범위 기반)
// 반환: [{name, apis: [{url, reqTypes}]}]
function extractFunctionAjax(content) {
  const funcDefs = [...content.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g)];
  if (!funcDefs.length) return [];

  const result = [];
  for (const def of funcDefs) {
    const braceIdx = def.index + def[0].length - 1;
    const bodyEnd = findBodyEnd(content, braceIdx);
    const body = content.slice(braceIdx, bodyEnd);

    const apiMap = new Map();
    for (const am of body.matchAll(/(?:ajaxAsync|ajaxCallWithJson|ajaxCall)\s*\(\s*["']([^"']+)["']/g)) {
      const url = am[1];
      if (!url.startsWith('/')) continue;
      const ctx = body.slice(Math.max(0, am.index - 50), Math.min(am.index + 400, body.length));
      const rts = [...ctx.matchAll(/requestType\s*[=:,]\s*["']([^"']+)["']/g)].map(x => x[1]);
      if (!apiMap.has(url)) apiMap.set(url, new Set());
      rts.forEach(rt => apiMap.get(url).add(rt));
    }

    if (apiMap.size > 0) {
      result.push({
        name: def[1],
        apis: [...apiMap.entries()].map(([url, rts]) => ({ url, reqTypes: [...rts] }))
      });
    }
  }
  return result;
}

// ===== L1+L4: 모든 JS 함수 전수 추출 (ajax 없는 것도 포함) =====
// 반환: [{ name, comment, apis:[{url,reqTypes}], doms:[id], calls:[funcName] }]
const _JS_RESERVED = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'break',
  'continue', 'var', 'let', 'const', 'function', 'new', 'typeof', 'instanceof',
  'try', 'catch', 'finally', 'throw', 'in', 'of', 'this', 'true', 'false', 'null',
  'undefined', 'void', 'delete', 'yield', 'async', 'await', 'class', 'extends', 'super',
  'each', 'when', 'then'
]);

function extractAllJsFunctions(content) {
  // 패턴 1: function name() {}
  // 패턴 2: name = function() {} / name: function() {}  (메서드/속성)
  // 패턴 3: const name = (...) => {}  (간략 지원)
  const defs = [];
  for (const m of content.matchAll(/(?:^|[\s;,(){}])function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
    const idx = m.index + m[0].lastIndexOf('function');
    defs.push({ name: m[1], idx, braceIdx: m.index + m[0].length - 1 });
  }
  for (const m of content.matchAll(/(\w+)\s*[:=]\s*function\s*\([^)]*\)\s*\{/g)) {
    if (_JS_RESERVED.has(m[1])) continue;
    defs.push({ name: m[1], idx: m.index, braceIdx: m.index + m[0].length - 1 });
  }
  if (!defs.length) return [];
  // 중복 제거: 같은 이름+위치 근접 (앞 패턴이 우선)
  const seen = new Set();
  const uniq = [];
  for (const d of defs.sort((a, b) => a.idx - b.idx)) {
    const key = `${d.name}@${d.idx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(d);
  }

  const result = [];
  for (const def of uniq) {
    const bodyEnd = findBodyEnd(content, def.braceIdx);
    const body = content.slice(def.braceIdx, bodyEnd);

    // 함수 앞 한 줄 코멘트 (//, /* */) — 가장 가까운 라인
    let comment = '';
    const before = content.slice(Math.max(0, def.idx - 300), def.idx);
    const lc = before.match(/\/\/\s*([^\n]+)\s*$/);
    const bc = before.match(/\/\*+\s*([\s\S]*?)\s*\*\/\s*$/);
    if (lc) comment = lc[1].trim();
    else if (bc) comment = bc[1].replace(/\n\s*\*?\s*/g, ' ').trim();
    if (comment.length > 80) comment = comment.slice(0, 80) + '...';

    // L4: 함수 body 전체에서 ajax + requestType 추출 (윈도우 폐기)
    const apiMap = new Map();
    for (const am of body.matchAll(/(?:ajaxAsync|ajaxCallWithJson|ajaxCall)\s*\(\s*["']([^"']+)["']/g)) {
      const url = am[1];
      if (!url.startsWith('/')) continue;
      // 함수 body 전체에서 requestType 찾되, 같은 ajax 호출 블록 내(±800자 윈도우)
      const w0 = Math.max(0, am.index - 100);
      const w1 = Math.min(am.index + 800, body.length);
      const ctx = body.slice(w0, w1);
      const rts = [...ctx.matchAll(/requestType\s*[=:,]\s*["']([^"']+)["']/g)].map(x => x[1]);
      if (!apiMap.has(url)) apiMap.set(url, new Set());
      rts.forEach(rt => apiMap.get(url).add(rt));
    }

    // DOM id 사용 ($('#xxx'), $("#xxx"), document.getElementById('xxx'))
    const doms = new Set();
    for (const dm of body.matchAll(/\$\(\s*["']#([\w\-]+)["']/g)) doms.add(dm[1]);
    for (const dm of body.matchAll(/getElementById\(\s*["']([\w\-]+)["']/g)) doms.add(dm[1]);
    // ax5select 셀렉터: data-ax5select="cboXxx"
    for (const dm of body.matchAll(/data-ax5select=["']([\w\-]+)["']/g)) doms.add(dm[1]);

    // 다른 함수 호출 (식별자 다음 괄호) — 함수 정의 자기 제외
    const calls = new Set();
    for (const cm of body.matchAll(/\b([a-z_][a-zA-Z0-9_]+)\s*\(/g)) {
      const n = cm[1];
      if (_JS_RESERVED.has(n) || n === def.name) continue;
      // jQuery·DOM 메서드는 .method() 형태라 word boundary로 걸러짐
      calls.add(n);
    }

    result.push({
      name: def.name,
      comment,
      apis: [...apiMap.entries()].map(([url, rts]) => ({ url, reqTypes: [...rts] })),
      doms: [...doms].slice(0, 12),
      calls: [...calls].slice(0, 10),
    });
  }
  return result;
}

// ===== L2: JSP element id 추출 (분류 + onclick 매핑) =====
// 반환: { combos:[{id,label}], inputs:[{id,type,label}], buttons:[{id,label,onclick}], grids:[id], others:[id] }
function extractJspElements(content) {
  const result = { combos: [], inputs: [], buttons: [], grids: [], radios: [], checks: [], others: [] };

  // <button ... id="xxx" ... onclick="fn(...)">label</button>
  const btnRe = /<button\b([^>]*)\bid=["']([\w\-]+)["']([^>]*)>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = btnRe.exec(content)) !== null) {
    const attrs = (m[1] + m[3]);
    const onclick = (attrs.match(/onclick=["']([^"']+)["']/i) || [])[1] || '';
    const label = m[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    result.buttons.push({ id: m[2], label, onclick });
  }

  // <input ... id="xxx" type="..." ...>
  const inputRe = /<input\b([^>]*)\bid=["']([\w\-]+)["']([^>]*)>/gi;
  while ((m = inputRe.exec(content)) !== null) {
    const attrs = (m[1] + m[3]);
    const type = ((attrs.match(/type=["']([^"']+)["']/i) || [])[1] || 'text').toLowerCase();
    const placeholder = (attrs.match(/placeholder=["']([^"']+)["']/i) || [])[1] || '';
    const dataLabel = (attrs.match(/data-label=["']([^"']+)["']/i) || [])[1] || '';
    const className = (attrs.match(/class=["']([^"']+)["']/i) || [])[1] || '';
    const label = placeholder || dataLabel;
    if (type === 'radio') result.radios.push({ id: m[2], label });
    else if (type === 'checkbox') result.checks.push({ id: m[2], label });
    else if (/f-cal/.test(className)) result.inputs.push({ id: m[2], type: 'date', label });
    else result.inputs.push({ id: m[2], type, label });
  }

  // <div ... id="xxx" data-ax5select="..."> 또는 <select id="xxx">
  const comboDivRe = /<div\b([^>]*)\bid=["']([\w\-]+)["']([^>]*)\bdata-ax5select=["']([^"']+)["']/gi;
  while ((m = comboDivRe.exec(content)) !== null) {
    // data-ax5select 값이 ID와 동일하면 라벨 없음 처리
    const label = m[4] === m[2] ? '' : m[4];
    result.combos.push({ id: m[2], label });
  }
  const selectRe = /<select\b([^>]*)\bid=["']([\w\-]+)["']/gi;
  while ((m = selectRe.exec(content)) !== null) {
    result.combos.push({ id: m[2], label: '' });
  }

  // ID 기준 중복 제거 (라디오/체크박스/콤보)
  const dedupById = (arr) => {
    const seen = new Set();
    return arr.filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });
  };
  result.radios = dedupById(result.radios);
  result.checks = dedupById(result.checks);
  result.combos = dedupById(result.combos);
  result.inputs = dedupById(result.inputs);
  result.buttons = dedupById(result.buttons);

  // 그리드/테이블 (id="firstGrid" 등 흔한 패턴)
  const gridRe = /\bid=["'](\w*[Gg]rid\w*)["']/g;
  while ((m = gridRe.exec(content)) !== null) {
    if (!result.grids.includes(m[1])) result.grids.push(m[1]);
  }

  return result;
}

// ===== JSP onclick → 함수 매핑 추출 =====
// JS에서 $('#btnQry').on('click', getRequestList) 또는 $('#btnQry').click(...) 등 추출
function extractDomEventBindings(jsContent) {
  const bindings = []; // {id, event, handler}
  // $('#xxx').on('click', fnName) 또는 $('#xxx').on('click', function() { ... })
  const re1 = /\$\(\s*["']#([\w\-]+)["']\s*\)\s*\.on\s*\(\s*["'](\w+)["']\s*,\s*([\w$]+)?/g;
  let m;
  while ((m = re1.exec(jsContent)) !== null) {
    if (m[3]) bindings.push({ id: m[1], event: m[2], handler: m[3] });
  }
  // $('#xxx').click(fnName)
  const re2 = /\$\(\s*["']#([\w\-]+)["']\s*\)\s*\.(click|change|blur|focus|keyup|keydown)\s*\(\s*([\w$]+)\s*\)/g;
  while ((m = re2.exec(jsContent)) !== null) {
    bindings.push({ id: m[1], event: m[2], handler: m[3] });
  }
  return bindings;
}

// ===== Web 타입 Wiki (JSP/JS/Servlet) =====
async function buildWebWiki(repoPath, repoId, wikiRoot, pagesDir, pathFilter = null) {
  ['Tables', 'Procedures', 'Servlets', 'Classes', 'JSP', 'JS'].forEach(c => ensureDir(path.join(pagesDir, c)));

  // extractDictHints용 사전 로드: 컬럼↔코드그룹 매핑(Java 소스 즉시 스캔) + CMM0020 코드값(전체 wiki 머지)
  const colCodeMap = dbDictionary.scanColumnCodeMap(repoPath);
  const codeMap = loadAllCodeMaps();

  const allFiles = walkFiles(repoPath, null, pathFilter);
  const javaFiles = allFiles.filter(f => f.endsWith('.java'));
  const jspFiles  = allFiles.filter(f => f.endsWith('.jsp'));
  const jsFiles   = allFiles.filter(f => f.endsWith('.js'));
  const sqlFiles  = allFiles.filter(f => f.endsWith('.sql'));

  // SQL 파싱
  const tables = {}, procedures = {};
  for (const f of sqlFiles) parseSql(readSafe(f), tables, procedures);

  // 테이블 페이지
  for (const tbName in tables) {
    const tb = tables[tbName];
    let md = `# Table: ${tbName}\n\n`;
    if (tb.comment) md += `**설명**: ${tb.comment}\n\n`;
    md += `## 컬럼\n\n| 컬럼명 | 설명 |\n|---|---|\n`;
    for (const col in tb.columns) md += `| ${col} | ${tb.columns[col] || ''} |\n`;
    fs.writeFileSync(path.join(pagesDir, 'Tables', `${tbName}.md`), md, 'utf8');
  }

  // 프로시저 페이지
  for (const procName in procedures) {
    let md = `# Procedure: ${procName}\n\n\`\`\`sql\n${procedures[procName]}\n\`\`\`\n`;
    fs.writeFileSync(path.join(pagesDir, 'Procedures', `${procName}.md`), md, 'utf8');
  }

  // ===== Java Class 데이터 선행 파싱 (Servlet wiki 크로스링킹용) =====
  const classDataMap = new Map(); // className → { methods: Map<name, {opType, table, sql}> }
  const daoJavaFiles = javaFiles.filter(f => {
    const c = readSafe(f);
    return !c.includes('@WebServlet') && (c.includes('PreparedStatement') || c.includes('executeQuery') || c.includes('executeUpdate'));
  });

  for (const f of daoJavaFiles) {
    const content = readSafe(f);
    const className = path.basename(f, '.java');
    const methodPositions = [];
    const withCommentRe = /\/\*\s*Parameter\s*([\s\S]*?)\*\/[\s\S]{0,300}?(?:public|private|protected)\s+[\w<>\[\],\s]+?\s+(\w+)\s*\(([^)]*)\)/g;
    let wm;
    while ((wm = withCommentRe.exec(content)) !== null) {
      methodPositions.push({ name: wm[2], start: wm.index });
    }
    if (methodPositions.length === 0) {
      const noCommentRe = /(?:public|private|protected)\s+[\w<>\[\],\s]+?\s+(\w+)\s*\(([^)]*)\)\s*throws/g;
      let nm;
      while ((nm = noCommentRe.exec(content)) !== null) {
        if (!['class','if','for','while','try','catch'].includes(nm[1]))
          methodPositions.push({ name: nm[1], start: nm.index });
      }
    }
    const methods = new Map();
    for (let i = 0; i < methodPositions.length; i++) {
      const { name, start } = methodPositions[i];
      const end = i + 1 < methodPositions.length ? methodPositions[i+1].start : Math.min(start + 50000, content.length);
      const rawBlock = content.slice(start, end);
      const block = rawBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const appendFrags = [...block.matchAll(/\.append\s*\(\s*"([^"]{3,50000})"\s*\)/g)]
        .map(m => m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => /[A-Za-z]/.test(s));
      const stringSqls = [...block.matchAll(/"((?:select|insert|update|delete|merge)\s[^"]{5,50000})"/gi)]
        .map(m => m[1].replace(/\s+/g, ' ').trim());
      const rawSql = (appendFrags.join(' ') || stringSqls[0] || '').substring(0, 50000);
      const opType = block.includes('.executeUpdate()') ? 'UPDATE/INSERT/DELETE'
        : block.includes('.executeQuery()') ? 'SELECT' : '';
      const tableMatches = [...rawSql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-zA-Z0-9_,\s]+?)(?=\b(?:WHERE|SET|VALUES|ON|LEFT|RIGHT|INNER|OUTER|ORDER|GROUP|HAVING|SELECT|\)|$))/gi)];
      const tablesSet = new Set();
      tableMatches.forEach(m => {
        m[1].split(',').forEach(t => {
          const tb = t.trim().split(/\s+/)[0].toUpperCase();
          if (tb && tb !== 'SELECT' && tb !== 'DUAL') tablesSet.add(tb);
        });
      });
      const tableStr = [...tablesSet].join(', ');
      
      const comments = extractComments(rawBlock);
      const dictHints = extractDictHints(rawSql, colCodeMap, codeMap);

      if (opType || rawSql) methods.set(name, { opType, table: tableStr, sql: rawSql, comments, dictHints });
    }
    if (methods.size > 0) classDataMap.set(className, { methods });
  }

  // Servlet 페이지
  const servlets = [];
  for (const f of javaFiles) {
    const content = readSafe(f);
    if (!content.includes('@WebServlet')) continue;
    const urlMatch = content.match(/@WebServlet\s*\(\s*["']([^"']+)["']/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    const rel = path.relative(repoPath, f).replace(/\\/g, '/');

    const reqTypesSwitch = [...content.matchAll(/case\s*["']([^"']+)["']\s*:/g)].map(m => m[1]);
    const reqTypesEquals = [...content.matchAll(/requestType\.equals\s*\(\s*["']([^"']+)["']/g)].map(m => m[1]);
    const reqTypes = reqTypesSwitch.length > 0 ? reqTypesSwitch : reqTypesEquals;
    servlets.push({ url, file: rel, reqTypes });

    const paramMap = new Map();
    const paramBlockRe = /\/\*\s*Parameter\s*([\s\S]*?)\*\/[\s\S]{0,200}?(?:private\s+)?(?:String|void|int|Object|boolean|JSONArray|JSONObject|Map)\s+(\w+)\s*\(/g;
    let pm;
    while ((pm = paramBlockRe.exec(content)) !== null) {
      const desc = pm[1].replace(/\n\s*\*\s*/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (desc) paramMap.set(pm[2], desc);
    }

    const caseMethodMap = new Map();
    const caseMethodRe = /case\s*["']([^"']+)["']\s*:[\s\S]{0,300}?(\w+)\s*\((?:jsonElement|request|req)\)/g;
    let cm;
    while ((cm = caseMethodRe.exec(content)) !== null) {
      if (!caseMethodMap.has(cm[1])) caseMethodMap.set(cm[1], cm[2]);
    }

    const importedClasses = [...content.matchAll(/import\s+[\w.]+\.(\w+);/g)].map(m => m[1]);
    const newedClasses    = [...content.matchAll(/new\s+(\w+)\s*\(\s*\)/g)].map(m => m[1]);
    const delegateClass   = [...importedClasses, ...newedClasses].find(cls => classDataMap.has(cls)) || '';
    const classData       = delegateClass ? classDataMap.get(delegateClass) : null;

    const jsonFields = [...new Set([
      ...[...content.matchAll(/jsonEtoStr\s*\([^,]+,\s*["']([^"']+)["']/g)].map(m => m[1]),
      ...[...content.matchAll(/request\.getParameter\s*\(\s*["']([^"']+)["']/g)].map(m => m[1]),
      ...[...content.matchAll(/dataObj\.get\s*\(\s*["']([^"']+)["']/g)].map(m => m[1]),
    ])];

    let md = `# Servlet: ${url}\n\n- **구현 클래스**: \`${rel}\`\n`;
    if (delegateClass) md += `- **위임 클래스**: [[Pages/Classes/${delegateClass}|${delegateClass}.java]]\n`;
    md += '\n';

    if (reqTypes.length) {
      md += `## requestType 목록\n\n`;
      reqTypes.forEach(rt => {
        const method = caseMethodMap.get(rt) || rt;
        const paramComment = paramMap.get(method);
        const classMethod = classData?.methods.get(rt) || classData?.methods.get(method);

        md += `### \`${rt}\`\n`;
        if (paramComment) md += `- 파라미터: \`${paramComment}\`\n`;
        if (classMethod) {
          const opStr   = classMethod.opType ? ` **${classMethod.opType}**` : '';
          const tblStr  = classMethod.table  ? ` \`${classMethod.table}\`` : '';
          const clsLink = `[[../Classes/${delegateClass}|${delegateClass}.${rt}()]]`;
          md += `- 처리: ${clsLink} →${opStr}${tblStr}\n`;
          if (classMethod.comments && classMethod.comments.length > 0) md += `- 비즈니스 로직(주석): \n  - ${classMethod.comments.join('\n  - ')}\n`;
          if (classMethod.dictHints && classMethod.dictHints.length > 0) md += `- 코드 사전: ${classMethod.dictHints.join(', ')}\n`;
          if (classMethod.sql) md += `- SQL: \`${classMethod.sql}\`\n`;
        } else if (delegateClass) {
          md += `- 처리: [[../Classes/${delegateClass}|${delegateClass}.${rt}()]]\n`;
        }
        md += '\n';
      });
    }

    if (jsonFields.length) {
      md += `## 파라미터 (JSON 필드)\n\n${jsonFields.map(p => `- \`${p}\``).join('\n')}\n\n`;
    }

    const fileName = url.replace(/\//g, '_');
    fs.writeFileSync(path.join(pagesDir, 'Servlets', `${fileName}.md`), md, 'utf8');
  }

  // JS 페이지
  const jsBaseMap = new Map();
  jsFiles.forEach(f => {
    const base = path.basename(f, '.js').toLowerCase();
    if (!jsBaseMap.has(base)) jsBaseMap.set(base, []);
    jsBaseMap.get(base).push(path.relative(repoPath, f).replace(/\\/g, '/'));
  });

  const jspBaseMap = new Map();
  jspFiles.forEach(f => {
    jspBaseMap.set(path.basename(f, '.jsp').toLowerCase(), path.basename(f));
  });

  for (const f of jspFiles) {
    const rel = path.relative(repoPath, f).replace(/\\/g, '/');
    const base = path.basename(f, '.jsp');
    const pairedJs = jsBaseMap.get(base.toLowerCase()) || [];
    const jspContent = readSafe(f);
    const els = extractJspElements(jspContent);

    let md = `# JSP: ${path.basename(f)}\n\n- **경로**: \`${rel}\`\n`;
    if (pairedJs.length) md += `- **연결 JS**: ${pairedJs.map(j => `[[JS/${path.basename(j)}|${path.basename(j)}]]`).join(', ')}\n`;

    if (els.buttons.length > 0) {
      md += `\n## 버튼\n\n| ID | 라벨 | onclick |\n|---|---|---|\n`;
      for (const b of els.buttons) md += `| \`${b.id}\` | ${b.label || '-'} | ${b.onclick ? `\`${b.onclick}\`` : '-'} |\n`;
    }
    if (els.combos.length > 0) {
      md += `\n## 콤보박스\n\n| ID | 라벨 |\n|---|---|\n`;
      for (const c of els.combos) md += `| \`${c.id}\` | ${c.label || '-'} |\n`;
    }
    if (els.inputs.length > 0) {
      md += `\n## 입력 필드\n\n| ID | 타입 | 라벨/placeholder |\n|---|---|---|\n`;
      for (const i of els.inputs) md += `| \`${i.id}\` | ${i.type} | ${i.label || '-'} |\n`;
    }
    if (els.radios.length > 0) {
      md += `\n## 라디오\n\n${els.radios.map(r => `- \`${r.id}\`${r.label ? ` — ${r.label}` : ''}`).join('\n')}\n`;
    }
    if (els.checks.length > 0) {
      md += `\n## 체크박스\n\n${els.checks.map(c => `- \`${c.id}\`${c.label ? ` — ${c.label}` : ''}`).join('\n')}\n`;
    }
    if (els.grids.length > 0) {
      md += `\n## 그리드\n\n${els.grids.map(g => `- \`${g}\``).join('\n')}\n`;
    }

    fs.writeFileSync(path.join(pagesDir, 'JSP', `${path.basename(f)}.md`), md, 'utf8');
  }

  const screenMapEntries = [];
  for (const f of jsFiles) {
    const rel = path.relative(repoPath, f).replace(/\\/g, '/');
    const content = readSafe(f);
    const baseName = path.basename(f, '.js');
    const screenName = extractScreenName(content);
    const allFuncs = extractAllJsFunctions(content);
    const urlMap = new Map();
    for (const fn of allFuncs) {
      for (const api of fn.apis) {
        if (!urlMap.has(api.url)) urlMap.set(api.url, new Set());
        api.reqTypes.forEach(rt => urlMap.get(api.url).add(rt));
      }
    }
    const bindings = extractDomEventBindings(content);

    let md = `# JS: ${path.basename(f)}\n\n- **경로**: \`${rel}\`\n`;
    if (screenName) md += `- **화면명**: ${screenName}\n`;
    if (allFuncs.length) md += `- **함수 수**: ${allFuncs.length}개\n`;

    if (allFuncs.length > 0) {
      md += `\n## 함수\n\n`;
      for (const fn of allFuncs) {
        md += `### \`${fn.name}()\``;
        if (fn.comment) md += ` — ${fn.comment}`;
        md += '\n';
        if (fn.apis.length > 0) {
          for (const api of fn.apis) {
            const rtInfo = api.reqTypes.length ? ` (requestType: ${api.reqTypes.map(r => `\`${r}\``).join(', ')})` : '';
            md += `- API: \`${api.url}\`${rtInfo}\n`;
          }
        }
        if (fn.doms.length > 0) md += `- DOM: ${fn.doms.map(d => `\`#${d}\``).join(', ')}\n`;
        if (fn.calls.length > 0) md += `- 호출: ${fn.calls.map(c => `\`${c}()\``).join(', ')}\n`;
        md += '\n';
      }
    }

    if (bindings.length > 0) {
      md += `\n## 이벤트 핸들러\n\n| 요소 | 이벤트 | 핸들러 |\n|---|---|---|\n`;
      for (const b of bindings) md += `| \`#${b.id}\` | ${b.event} | \`${b.handler}()\` |\n`;
    }

    if (urlMap.size) {
      md += `\n## 호출 서버 API\n\n`;
      urlMap.forEach((rts, url) => {
        const servMatch = servlets.find(s => s.url === url);
        const servLink = servMatch ? ` → [[Servlets/${url.replace(/\//g, '_')}|Servlet]]` : '';
        const rtInfo = rts.size ? ` (requestType: ${[...rts].map(r => `\`${r}\``).join(', ')})` : '';
        md += `- \`${url}\`${rtInfo}${servLink}\n`;
      });
    }

    const uiTexts = extractUITexts(content);
    if (uiTexts.bySelector.size > 0 || uiTexts.noSelector.size > 0) {
      md += `\n## UI 텍스트 (동적 라벨/버튼명)\n\n`;
      for (const [sel, texts] of uiTexts.bySelector) {
        md += `- \`${sel}\`: ${[...texts].map(t => `"${t}"`).join(', ')}\n`;
      }
      if (uiTexts.noSelector.size > 0) {
        const samples = [...uiTexts.noSelector].slice(0, 30);
        md += `- (선택자 미확정): ${samples.map(t => `"${t}"`).join(', ')}\n`;
      }
    }

    fs.writeFileSync(path.join(pagesDir, 'JS', `${path.basename(f)}.md`), md, 'utf8');
    if (screenName) {
      const jspFile = jspBaseMap.get(baseName.toLowerCase());
      screenMapEntries.push({ screenName, jsFile: path.basename(f), jspFile: jspFile || '' });
    }
  }

  if (screenMapEntries.length > 0) {
    screenMapEntries.sort((a, b) => a.screenName.localeCompare(b.screenName, 'ko'));
    let smMd = `# ${repoId} 화면명 → 파일 매핑\n\n`;
    smMd += `| 화면명 | JS 파일 | JSP 파일 |\n|---|---|---|\n`;
    screenMapEntries.forEach(({ screenName, jsFile, jspFile }) => {
      smMd += `| ${screenName} | [[Pages/JS/${jsFile}\\|${jsFile}]] | ${jspFile ? `[[Pages/JSP/${jspFile}\\|${jspFile}]]` : '-'} |\n`;
    });
    fs.writeFileSync(path.join(wikiRoot, 'ScreenMap.md'), smMd, 'utf8');
  }

  const daoFiles = javaFiles.filter(f => {
    const c = readSafe(f);
    return !c.includes('@WebServlet') && (c.includes('PreparedStatement') || c.includes('executeQuery') || c.includes('executeUpdate'));
  });

  for (const f of daoFiles) {
    const content = readSafe(f);
    const className = path.basename(f, '.java');
    const rel = path.relative(repoPath, f).replace(/\\/g, '/');
    const methodPositions = [];
    const withCommentRe = /\/\*\s*Parameter\s*([\s\S]*?)\*\/[\s\S]{0,300}?(?:public|private|protected)\s+[\w<>\[\],\s]+?\s+(\w+)\s*\(([^)]*)\)/g;
    let wm;
    while ((wm = withCommentRe.exec(content)) !== null) {
      methodPositions.push({ name: wm[2], params: wm[1].replace(/\n\s*\*\s*/g, ' ').trim(), start: wm.index });
    }
    if (methodPositions.length === 0) {
      const noCommentRe = /(?:public|private|protected)\s+[\w<>\[\],\s]+?\s+(\w+)\s*\(([^)]*)\)\s*throws/g;
      let nm;
      while ((nm = noCommentRe.exec(content)) !== null) {
        if (!['class','if','for','while','try','catch'].includes(nm[1]))
          methodPositions.push({ name: nm[1], params: nm[2].replace(/\s+/g, ' ').trim(), start: nm.index });
      }
    }
    let md = `# Class: ${className}\n\n- **경로**: \`${rel}\`\n\n## 메서드\n\n`;
    for (let i = 0; i < methodPositions.length; i++) {
      const { name, params, start } = methodPositions[i];
      const end = i + 1 < methodPositions.length ? methodPositions[i+1].start : Math.min(start + 50000, content.length);
      const rawBlock = content.slice(start, end);
      const block = rawBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const appendFrags = [...block.matchAll(/\.append\s*\(\s*"([^"]{3,50000})"\s*\)/g)].map(m => m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => /[A-Za-z]/.test(s));
      const stringSqls = [...block.matchAll(/"((?:select|insert|update|delete|merge)\s[^"]{5,50000})"/gi)].map(m => m[1].replace(/\s+/g, ' ').trim());
      const sql = (appendFrags.join(' ') || stringSqls[0] || '').substring(0, 50000);
      const opType = block.includes('.executeUpdate()') ? 'UPDATE/INSERT/DELETE' : block.includes('.executeQuery()') ? 'SELECT' : '';
      const tableMatches = [...sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-zA-Z0-9_,\s]+?)(?=\b(?:WHERE|SET|VALUES|ON|LEFT|RIGHT|INNER|OUTER|ORDER|GROUP|HAVING|SELECT|\)|$))/gi)];
      const tableStr = [...new Set(tableMatches.map(m => m[1].split(',')[0].trim().toUpperCase()))].join(', ');
      
      const comments = extractComments(rawBlock);
      const dictHints = extractDictHints(sql, colCodeMap, codeMap);

      md += `### \`${name}()\`\n`;
      if (params) md += `- 파라미터: \`${params}\`\n`;
      if (opType) md += `- 작업: **${opType}**${tableStr ? ` (테이블: \`${tableStr}\`)` : ''}\n`;
      if (comments.length > 0) md += `- 비즈니스 로직(주석): \n  - ${comments.join('\n  - ')}\n`;
      if (dictHints.length > 0) md += `- 코드 사전: ${dictHints.join(', ')}\n`;
      if (sql) md += `- SQL: \`${sql}\`\n\n`;
    }
    fs.writeFileSync(path.join(pagesDir, 'Classes', `${className}.md`), md, 'utf8');
  }

  let mainMd = `# ${repoId} LLM Wiki\n\n> 생성: ${new Date().toLocaleString('ko-KR')}\n\n## 📂 구성 요소\n\n`;
  mainMd += `- [[Pages/Tables/Index|DB 테이블]] (${Object.keys(tables).length}개)\n`;
  mainMd += `- [[Pages/Procedures/Index|프로시저]] (${Object.keys(procedures).length}개)\n`;
  mainMd += `- [[Pages/Servlets/Index|서블릿 API]] (${servlets.length}개)\n`;
  mainMd += `- [[Pages/Classes/Index|DAO/서비스 클래스]] (${daoFiles.length}개)\n`;
  mainMd += `- [[Pages/JSP/Index|JSP 화면]] (${jspFiles.length}개)\n`;
  mainMd += `- [[Pages/JS/Index|JS 클라이언트]] (${jsFiles.length}개)\n`;
  if (screenMapEntries.length > 0) mainMd += `- [[ScreenMap|화면명 매핑]] (${screenMapEntries.length}개)\n`;
  fs.writeFileSync(path.join(wikiRoot, 'Main.md'), mainMd, 'utf8');
  ['Tables', 'Procedures', 'Servlets', 'Classes', 'JSP', 'JS'].forEach(c => writeIndexMd(pagesDir, c, c));
}

// ===== DB 타입 Wiki (SQL 전용) =====
async function buildDbWiki(repoPath, repoId, wikiRoot, pagesDir) {
  ['Tables', 'Procedures'].forEach(c => ensureDir(path.join(pagesDir, c)));

  const sqlFiles = walkFiles(repoPath).filter(f => f.endsWith('.sql'));
  const tables = {}, procedures = {};
  for (const f of sqlFiles) parseSql(readSafe(f), tables, procedures);

  for (const tbName in tables) {
    const tb = tables[tbName];
    let md = `# Table: ${tbName}\n\n`;
    if (tb.comment) md += `**설명**: ${tb.comment}\n\n`;
    md += `## 컬럼\n\n| 컬럼명 | 설명 |\n|---|---|\n`;
    for (const col in tb.columns) md += `| ${col} | ${tb.columns[col] || ''} |\n`;
    fs.writeFileSync(path.join(pagesDir, 'Tables', `${tbName}.md`), md, 'utf8');
  }
  for (const procName in procedures) {
    let md = `# Procedure: ${procName}\n\n\`\`\`sql\n${procedures[procName]}\n\`\`\`\n`;
    fs.writeFileSync(path.join(pagesDir, 'Procedures', `${procName}.md`), md, 'utf8');
  }

  let mainMd = `# ${repoId} LLM Wiki (DB)\n\n> 생성: ${new Date().toLocaleString('ko-KR')}\n\n## 📂 구성 요소\n\n`;
  mainMd += `- [[Pages/Tables/Index|DB 테이블]] (${Object.keys(tables).length}개)\n`;
  mainMd += `- [[Pages/Procedures/Index|프로시저]] (${Object.keys(procedures).length}개)\n`;
  mainMd += `- **SQL 파일**: ${sqlFiles.length}개\n`;
  fs.writeFileSync(path.join(wikiRoot, 'Main.md'), mainMd, 'utf8');

  ['Tables', 'Procedures'].forEach(c => writeIndexMd(pagesDir, c, c));
  dbDictionary.cacheForDbRepo(repoPath, wikiRoot);
}

// ===== Server 타입 Wiki (Pro*C / .c / .h) =====
async function buildServerWiki(repoPath, repoId, wikiRoot, pagesDir) {
  ['ProC', 'Headers', 'Tables'].forEach(c => ensureDir(path.join(pagesDir, c)));

  // extractDictHints용 사전 로드 (Pro*C SQL의 코드값 해석)
  const colCodeMap = dbDictionary.scanColumnCodeMap(repoPath);
  const codeMap = loadAllCodeMaps();

  const allFiles = walkFiles(repoPath);
  const pcFiles  = allFiles.filter(f => /\.(pc|c)$/i.test(f));
  const hFiles   = allFiles.filter(f => /\.h$/i.test(f));

  const allTables = {};

  for (const f of pcFiles) {
    const content = readSafe(f);
    const info = parsePcFile(f, content, repoPath);
    info.tables.forEach(t => {
      if (!allTables[t.name]) allTables[t.name] = [];
      allTables[t.name].push({ file: info.relPath, func: t.func, op: t.op });
    });

    let md = `# Pro*C: ${info.fileName}\n\n`;
    if (info.programName && info.programName !== info.fileName) md += `**프로그램명**: ${info.programName}\n\n`;
    if (info.description) md += `**기능**: ${info.description}\n\n`;
    if (info.includes.length) {
      md += `## 의존성 (include)\n${info.includes.map(i => `- \`${i}\``).join('\n')}\n\n`;
    }
    if (info.functions.length) {
      md += `## 함수 목록\n\n`;
      info.functions.forEach(fn => {
        md += `### ${fn.name}\n`;
        if (fn.action) md += `> ${fn.action}\n\n`;
        if (fn.sqlOps.length) {
          md += `**SQL 연산**:\n`;
          fn.sqlOps.forEach(op => md += `- \`${op.type}\` → [[Tables/${op.table}|${op.table}]]\n`);
          md += '\n';
        }
      });
    }
    const outName = info.fileName.replace(/\./g, '_') + '.md';
    fs.writeFileSync(path.join(pagesDir, 'ProC', outName), md, 'utf8');
  }

  for (const tbName in allTables) {
    const refs = allTables[tbName];
    let md = `# Table (Pro*C 참조): ${tbName}\n\n## 참조 함수\n\n| 파일 | 함수 | SQL 연산 |\n|---|---|---|\n`;
    refs.forEach(r => md += `| \`${r.file}\` | \`${r.func || '-'}\` | \`${r.op}\` |\n`);
    fs.writeFileSync(path.join(pagesDir, 'Tables', `${tbName}.md`), md, 'utf8');
  }

  for (const f of hFiles) {
    const content = readSafe(f);
    const rel = path.relative(repoPath, f).replace(/\\/g, '/');
    const structs = [...content.matchAll(/typedef\s+struct[\s\S]*?\}\s*(\w+)\s*;/g)].map(m => m[1]);
    const defines = [...content.matchAll(/#define\s+(\w+)\s+(.+)/g)].slice(0, 30).map(m => ({ name: m[1], val: m[2].trim() }));
    let md = `# Header: ${path.basename(f)}\n\n- **경로**: \`${rel}\`\n\n`;
    if (structs.length) md += `## 구조체 (typedef struct)\n${structs.map(s => `- \`${s}\``).join('\n')}\n\n`;
    if (defines.length) md += `## 상수 (#define)\n${defines.map(d => `- \`${d.name}\` = \`${d.val}\``).join('\n')}\n\n`;
    fs.writeFileSync(path.join(pagesDir, 'Headers', `${path.basename(f)}.md`), md, 'utf8');
  }

  let mainMd = `# ${repoId} LLM Wiki (Server/Pro*C)\n\n> 생성: ${new Date().toLocaleString('ko-KR')}\n\n## 📂 구성 요소\n\n`;
  mainMd += `- [[Pages/ProC/Index|Pro*C 프로그램]] (${pcFiles.length}개)\n`;
  mainMd += `- [[Pages/Headers/Index|헤더 파일]] (${hFiles.length}개)\n`;
  mainMd += `- [[Pages/Tables/Index|참조 테이블]] (${Object.keys(allTables).length}개)\n`;
  fs.writeFileSync(path.join(wikiRoot, 'Main.md'), mainMd, 'utf8');
  ['ProC', 'Headers', 'Tables'].forEach(c => writeIndexMd(pagesDir, c, c));
}

// ===== Plugin 타입 Wiki (Eclipse RCP) =====
async function buildPluginWiki(repoPath, repoId, wikiRoot, pagesDir) {
  ['Extensions', 'Classes', 'Packages'].forEach(c => ensureDir(path.join(pagesDir, c)));

  const allFiles = walkFiles(repoPath);
  const javaFiles = allFiles.filter(f => f.endsWith('.java'));
  const xmlFiles  = allFiles.filter(f => f.endsWith('.xml'));

  const pluginXml = xmlFiles.find(f => path.basename(f) === 'plugin.xml');
  const extensions = [];

  if (pluginXml) {
    const content = readSafe(pluginXml);
    for (const m of content.matchAll(/<extension\s+point="([^"]+)"[^>]*?>([\s\S]*?)<\/extension>/g)) {
      const point = m[1];
      const inner = m[2];
      const shortPoint = point.split('.').pop();
      const items = [];
      for (const item of inner.matchAll(/<(\w+)\s+([^>]*?)(?:\/>|>)/g)) {
        const tag = item[1];
        const attrs = item[2];
        const idMatch = attrs.match(/\bid="([^"]+)"/);
        const nameMatch = attrs.match(/\bname="([^"]+)"/);
        const classMatch = attrs.match(/\bclass="([^"]+)"/);
        if (idMatch || classMatch) {
          items.push({ tag, id: idMatch ? idMatch[1] : '', name: nameMatch ? nameMatch[1] : '', cls: classMatch ? classMatch[1].split('.').pop() : '' });
        }
      }
      extensions.push({ point, shortPoint, items });
      if (items.length > 0) {
        let md = `# Extension: ${shortPoint}\n\n**확장점**: \`${point}\`\n\n| 태그 | ID | 이름 | 클래스 |\n|---|---|---|---|\n`;
        items.forEach(it => md += `| \`${it.tag}\` | \`${it.id}\` | ${it.name} | \`${it.cls}\` |\n`);
        fs.writeFileSync(path.join(pagesDir, 'Extensions', `${shortPoint}.md`), md, 'utf8');
      }
    }
  }

  const packageMap = {};
  for (const f of javaFiles) {
    const content = readSafe(f);
    const pkgMatch = content.match(/^package\s+([\w.]+)/m);
    const classMatch = content.match(/(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w.,\s]+))?/);
    if (!classMatch) continue;
    const pkg = pkgMatch ? pkgMatch[1] : '(default)';
    const className = classMatch[1];
    const methods = [...content.matchAll(/(?:public|protected|private)\s+(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)/g)].map(m => m[1]).filter(n => !['if', 'for', 'while', 'switch', 'catch', 'class'].includes(n)).slice(0, 20);
    let md = `# Class: ${className}\n\n- **패키지**: \`${pkg}\`\n\n## 메서드\n${methods.map(m => `- \`${m}()\``).join('\n')}\n`;
    fs.writeFileSync(path.join(pagesDir, 'Classes', `${className}.md`), md, 'utf8');
    if (!packageMap[pkg]) packageMap[pkg] = [];
    packageMap[pkg].push(className);
  }

  for (const pkg in packageMap) {
    let md = `# Package: ${pkg}\n\n`;
    packageMap[pkg].forEach(c => md += `- [[Classes/${c}|${c}]]\n`);
    fs.writeFileSync(path.join(pagesDir, 'Packages', `${pkg.replace(/\./g, '_')}.md`), md, 'utf8');
  }

  let mainMd = `# ${repoId} LLM Wiki (Eclipse Plugin)\n\n> 생성: ${new Date().toLocaleString('ko-KR')}\n\n## 📂 구성 요소\n\n`;
  mainMd += `- [[Pages/Extensions/Index|Plugin 확장점]] (${extensions.length}개)\n`;
  mainMd += `- [[Pages/Classes/Index|Java 클래스]] (${javaFiles.length}개)\n`;
  mainMd += `- [[Pages/Packages/Index|패키지]] (${Object.keys(packageMap).length}개)\n`;
  fs.writeFileSync(path.join(wikiRoot, 'Main.md'), mainMd, 'utf8');
  ['Extensions', 'Classes', 'Packages'].forEach(c => writeIndexMd(pagesDir, c, c));
}

// ===== 메인 진입점 =====
async function buildWiki(repoPath, repoId, repoType = 'web_general', companyFolder = '고객사없음') {
  const safeId  = repoId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const wikiRoot = path.join(__dirname, 'wiki', companyFolder, safeId);
  const pagesDir = path.join(wikiRoot, 'Pages');

  if (fs.existsSync(wikiRoot)) fs.rmSync(wikiRoot, { recursive: true, force: true });
  fs.mkdirSync(pagesDir, { recursive: true });

  try {
    if (repoType === 'server') {
      await buildServerWiki(repoPath, repoId, wikiRoot, pagesDir);
    } else if (repoType.startsWith('plugin_')) {
      await buildPluginWiki(repoPath, repoId, wikiRoot, pagesDir);
    } else if (repoType === 'db') {
      await buildDbWiki(repoPath, repoId, wikiRoot, pagesDir);
    } else {
      const isHtml5 = repoType === 'web_html5';
      const pathFilter = isHtml5 ? makeHtml5Filter(repoPath) : null;
      await buildWebWiki(repoPath, repoId, wikiRoot, pagesDir, pathFilter);
    }
  } catch (e) {
    console.error(`[Wiki] Error building ${repoId}:`, e.message);
  }
}

module.exports = { buildWiki };
