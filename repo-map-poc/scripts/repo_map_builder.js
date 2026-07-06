// 자동 repo-map builder (Aider 패턴, PageRank 기반) - Week 1 PoC
// 사용법: node repo_map_builder.js <repoPath> [message] [tokenBudget=2048]
const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const Java = require('tree-sitter-java');
const JavaScript = require('tree-sitter-javascript');
const Graph = require('graphology');
const pagerank = require('graphology-pagerank');

const ROOT = process.argv[2] || 'c:/ecams-ai/workspace/광주은행/kjbank_html5';
const MESSAGE = process.argv[3] || '';
const TOKEN_BUDGET = parseInt(process.argv[4] || '2048', 10);
const SNIPPET_LINES = 5;
const MAX_FILES_SCAN = 5000;

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'build', 'target', '.history', '_extracted',
  'WEB-INF', 'classes', '.deco', 'logs', 'tmp',
  // 외부 라이브러리 vendor (도메인 관련 없음, 노이즈)
  'vendor', 'scripts', 'fileupload', 'fileupload2',
]);

// 외부 라이브러리 파일 경로 패턴 (vendor 폴더 외 추가 차단)
const EXCLUDE_PATH_PATTERNS = [
  /jquery/i, /bootstrap/i, /ax5/i, /metisMenu/i, /flot/i, /peity/i,
  /iCheck/i, /nestable/i, /.min\.js$/, /\.min\.css$/,
];

function isExcludedPath(p) {
  return EXCLUDE_PATH_PATTERNS.some(re => re.test(p));
}

// 너무 짧거나 일반적인 함수명 (노이즈)
const COMMON_NOISE_NAMES = new Set([
  'i', 'j', 'k', 'n', 't', 's', 'r', 'o', 'x', 'a', 'b', 'c', 'l', 'd', 'e', 'f',
  'init', 'main', 'run', 'set', 'get', 'on', 'off', 'open', 'close', 'load',
  'callback', 'done', 'fail', 'success', 'error', 'data', 'value', 'option',
  'process', 'execute', 'handle', 'parse', 'render', 'create', 'destroy',
  'show', 'hide', 'toggle', 'update', 'remove', 'add', 'submit',
  'function', 'method', 'class', 'object', 'array',
  'val', 'fn', 'ctx', 'el', 'opts', 'cfg',
]);

function isNoiseName(name) {
  if (!name || name.length < 4) return true;
  if (COMMON_NOISE_NAMES.has(name.toLowerCase())) return true;
  return false;
}

const javaParser = new Parser();
javaParser.setLanguage(Java);
const jsParser = new Parser();
jsParser.setLanguage(JavaScript);

function pickParser(ext) {
  if (ext === '.java') return javaParser;
  if (ext === '.js') return jsParser;
  if (ext === '.jsp') return jsParser; // JSP 안 JS 부분만
  return null;
}

function walkFiles(base) {
  const out = [];
  if (!fs.existsSync(base)) return out;
  const stack = [base];
  while (stack.length && out.length < MAX_FILES_SCAN) {
    const cur = stack.pop();
    let stat;
    try { stat = fs.statSync(cur); } catch (_) { continue; }
    if (stat.isDirectory()) {
      const name = path.basename(cur);
      if (EXCLUDE_DIRS.has(name)) continue;
      let entries;
      try { entries = fs.readdirSync(cur); } catch (_) { continue; }
      for (const n of entries) stack.push(path.join(cur, n));
    } else if (stat.isFile()) {
      const ext = path.extname(cur).toLowerCase();
      if (!['.java', '.js', '.jsp', '.pc', '.c', '.sql'].includes(ext)) continue;
      if (isExcludedPath(cur)) continue; // vendor 패턴 차단
      out.push(cur);
    }
  }
  return out;
}

// Tree-sitter 기반 정의·참조 추출 (Java/JS)
function extractTreeSitter(file, parser) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) { return { defs: [], refs: [] }; }
  if (content.length > 500_000) return { defs: [], refs: [] }; // 너무 큰 파일 skip
  if (content.length < 10) return { defs: [], refs: [] }; // empty
  // BOM 제거
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  let tree;
  try {
    tree = parser.parse(content);
  } catch (e) {
    // parse 에러 (특수 문자 / 인코딩) — regex fallback
    return extractRegex(file);
  }
  const defs = []; // [{name, line, type}]
  const refs = []; // [{name, line}]

  function walk(node) {
    // Java/JS 정의 패턴
    if (node.type === 'class_declaration' || node.type === 'interface_declaration') {
      const id = node.childForFieldName?.('name') || node.children.find(c => c.type === 'identifier');
      if (id && !isNoiseName(id.text)) defs.push({ name: id.text, line: node.startPosition.row + 1, type: 'class' });
    } else if (node.type === 'method_declaration' || node.type === 'function_declaration') {
      const id = node.childForFieldName?.('name') || node.children.find(c => c.type === 'identifier');
      if (id && !isNoiseName(id.text)) defs.push({ name: id.text, line: node.startPosition.row + 1, type: 'function' });
    } else if (node.type === 'variable_declarator') {
      // JS function 할당 패턴
      const id = node.children.find(c => c.type === 'identifier');
      const init = node.childForFieldName?.('value');
      if (id && !isNoiseName(id.text) && init && (init.type === 'function_expression' || init.type === 'arrow_function' || init.type === 'function')) {
        defs.push({ name: id.text, line: node.startPosition.row + 1, type: 'function' });
      }
    }
    // 참조 패턴
    if (node.type === 'call_expression') {
      const callee = node.children[0];
      if (callee) {
        let name;
        if (callee.type === 'identifier') name = callee.text;
        else if (callee.type === 'member_expression') {
          const prop = callee.childForFieldName?.('property') || callee.children[callee.children.length - 1];
          if (prop) name = prop.text;
        }
        if (name && !isNoiseName(name) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          refs.push({ name, line: node.startPosition.row + 1 });
        }
      }
    } else if (node.type === 'method_invocation') {
      const id = node.childForFieldName?.('name') || node.children.find(c => c.type === 'identifier');
      if (id && !isNoiseName(id.text)) refs.push({ name: id.text, line: node.startPosition.row + 1 });
    } else if (node.type === 'object_creation_expression') {
      const t = node.childForFieldName?.('type');
      if (t && !isNoiseName(t.text)) refs.push({ name: t.text, line: node.startPosition.row + 1 });
    }
    for (const child of node.children) walk(child);
  }
  walk(tree.rootNode);
  return { defs, refs };
}

// Pro*C / SQL regex 기반 추출 (tree-sitter grammar 없음)
function extractRegex(file) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) { return { defs: [], refs: [] }; }
  if (content.length > 500_000) return { defs: [], refs: [] };

  const defs = [];
  const refs = [];
  const ext = path.extname(file).toLowerCase();

  if (ext === '.pc' || ext === '.c') {
    // C 함수 정의 (`타입 함수명(파라미터) {`)
    for (const m of content.matchAll(/^[\w\s\*]+\s+(\w+)\s*\([^)]*\)\s*\{/gm)) {
      const lineNo = content.substring(0, m.index).split('\n').length;
      defs.push({ name: m[1], line: lineNo, type: 'function' });
    }
    // EXEC SQL 블록 내 테이블 참조
    for (const m of content.matchAll(/EXEC SQL[\s\S]*?(?:FROM|UPDATE|INTO|JOIN)\s+(\w+)/gi)) {
      const lineNo = content.substring(0, m.index).split('\n').length;
      refs.push({ name: m[1].toUpperCase(), line: lineNo });
    }
    // 함수 호출
    for (const m of content.matchAll(/(\w+)\s*\(/g)) {
      if (/^(if|for|while|switch|return|sizeof)$/.test(m[1])) continue;
      const lineNo = content.substring(0, m.index).split('\n').length;
      refs.push({ name: m[1], line: lineNo });
    }
  } else if (ext === '.sql') {
    // CREATE TABLE / PROCEDURE / TRIGGER
    for (const m of content.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|PROCEDURE|TRIGGER|FUNCTION|VIEW|INDEX)\s+(?:"[^"]+"\.)?"?(\w+)/gi)) {
      const lineNo = content.substring(0, m.index).split('\n').length;
      defs.push({ name: m[1].toUpperCase(), line: lineNo, type: 'sql' });
    }
    // 테이블 참조
    for (const m of content.matchAll(/(?:FROM|UPDATE|INTO|JOIN|REFERENCES)\s+(?:"[^"]+"\.)?"?(\w+)/gi)) {
      const lineNo = content.substring(0, m.index).split('\n').length;
      refs.push({ name: m[1].toUpperCase(), line: lineNo });
    }
  } else if (ext === '.jsp') {
    // JSP 내 Java/JS 부분 모두 regex 로 (간단)
    // <% ... %> 스크립틀릿
    for (const m of content.matchAll(/(\w+)\s*\(/g)) {
      if (/^(if|for|while|switch|return|new)$/.test(m[1])) continue;
      const lineNo = content.substring(0, m.index).split('\n').length;
      refs.push({ name: m[1], line: lineNo });
    }
  }
  return { defs, refs };
}

// 메인 — repo-map 빌드
function buildRepoMap(repoPath, message, tokenBudget) {
  console.error(`▶ Repo-map 빌드: ${repoPath}`);
  console.error(`  Message: "${message}"`);
  console.error(`  Token budget: ${tokenBudget}`);

  const tStart = Date.now();
  const files = walkFiles(repoPath);
  console.error(`  Files: ${files.length}`);

  const fileData = new Map(); // file → {defs, refs}
  let tParse = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const t0 = Date.now();
    let data;
    const parser = pickParser(ext);
    if (parser) {
      data = extractTreeSitter(file, parser);
    } else {
      data = extractRegex(file);
    }
    tParse += Date.now() - t0;
    if (data.defs.length || data.refs.length) {
      fileData.set(file, data);
    }
  }
  console.error(`  Parsed ${fileData.size} files in ${tParse}ms`);

  // 그래프 구축
  const graph = new Graph({ multi: false, type: 'directed' });
  const defOwner = new Map(); // name → [files]
  for (const [file, { defs }] of fileData) {
    if (!graph.hasNode(file)) graph.addNode(file, { type: 'file' });
    for (const d of defs) {
      const key = `def:${d.name}`;
      if (!graph.hasNode(key)) graph.addNode(key, { type: 'symbol', name: d.name, file, line: d.line, kind: d.type });
      try { graph.addEdge(file, key); } catch (_) {}
      if (!defOwner.has(d.name)) defOwner.set(d.name, []);
      defOwner.get(d.name).push(file);
    }
  }
  // 참조 엣지 — file → def (있는 경우)
  for (const [file, { refs }] of fileData) {
    for (const r of refs) {
      const key = `def:${r.name}`;
      if (graph.hasNode(key)) {
        try { graph.addEdge(file, key); } catch (_) {}
      }
    }
  }
  console.error(`  Graph: ${graph.order} nodes, ${graph.size} edges`);

  // 한국어 → 영문 entity 매핑 (wikiV2Loader 자산 재활용)
  // 한국어 도메인 용어가 코드에 영문으로 존재 → 매핑으로 매칭률 ↑
  const KO_TO_EN = {
    '운영배포': ['Deploy', 'request_Deploy', 'real'],
    '체크인': ['CheckIn', 'request_Check_In', 'checkin'],
    '체크아웃': ['CheckOut', 'request_Check_Out', 'checkout'],
    '결재': ['Approval', 'Confirm', 'approval', 'confirm', 'sign'],
    '결재자': ['Approval', 'Confirm', 'BaseUser', 'baseuser', 'updateProc', 'PopApprovalInfo'],
    '결재정보': ['ApprovalInfo', 'PopApprovalInfo', 'Confirm', 'Cmr6000'],
    '결재라인': ['Confirm', 'ApprovalInfo', 'selectLocat'],
    '결재정보팝업': ['PopApprovalInfo'],
    '팝업': ['Pop', 'Modal', 'winpop'],
    '신청': ['request', 'Apply', 'Request', 'CMR1000'],
    '신청구분': ['QRYCD', 'REQUEST', 'qrycd'],
    '코드사전': ['CMM0020', 'CodeInfo', 'codeinfo'],
    '대결': ['Daegyul', 'daegyul', 'DaeUser', 'BlankCd', 'CMM0040'],
    '대결자': ['DaeUser', 'cm_daegyul', 'CMM0040'],
    '변경': ['update', 'modify', 'Updt', 'change'],
    '수정': ['update', 'modify', 'Updt'],
    '삭제': ['delete', 'remove', 'Close', 'Del'],
    '추가': ['insert', 'add', 'Reg', 'Add'],
    '저장': ['save', 'insert', 'Updt'],
    '조회': ['select', 'query', 'List', 'get_'],
    '취소': ['Cancel', 'cancel', 'Cncl'],
    '반려': ['Reject', 'reject', 'CR_STATUS'],
    '완료': ['Complete', 'finish', 'PRCSW'],
    '폐기': ['Close', 'discard', 'CR_STATUS', 'CR_CLSDATE'],
    '복원': ['Restore', 'rollback', 'setRollback'],
    '진입': ['CR_STATUS', 'reqSta'],
    '트리거': ['_TRG', 'TRIGGER', 'trigger'],
    '프로시저': ['_STR', 'PROCEDURE', 'CMR9900_STR'],
    '테이블': ['CMR', 'CMM', 'TABLE'],
    '자원': ['CMR0020', 'RSRC', 'resource'],
    '버전': ['VER', 'version'],
    '시스템': ['SYS', 'CMM0030'],
    '권한': ['admin', 'editor', 'strAdmin', 'pUserId'],
  };

  // PageRank — message 키워드 weighted
  const rawKeywords = message
    .match(/[a-zA-Z_][a-zA-Z0-9_]{2,}|[가-힣]{2,}/g) || [];

  // 한국어 키워드 → 영문 entity 확장
  const expandedKeywords = new Set();
  for (const kw of rawKeywords) {
    expandedKeywords.add(kw.toLowerCase());
    if (KO_TO_EN[kw]) {
      for (const en of KO_TO_EN[kw]) expandedKeywords.add(en.toLowerCase());
    }
    // 부분 한국어 매칭 (예: "결재자정보" → "결재자" 부분 매칭)
    for (const [koKey, enValues] of Object.entries(KO_TO_EN)) {
      if (kw.includes(koKey) || koKey.includes(kw)) {
        for (const en of enValues) expandedKeywords.add(en.toLowerCase());
      }
    }
  }

  const keywordSet = expandedKeywords;
  console.error(`  Expanded keywords (${keywordSet.size}):`, [...keywordSet].slice(0, 15).join(', '), '...');

  // Utility 함수 패널티 (도메인 무관, 너무 많이 호출돼 PageRank 가 우선시)
  const UTILITY_PATTERNS = [
    /^to[A-Z]/, /^get[A-Z]/, /^set[A-Z]/, /^is[A-Z]/, /^has[A-Z]/,  // getter/setter
    /^getLogger/, /^getMessage/, /^getConnection/, /^getInstance/,
    /^doGet$/, /^doPost$/, /^handle[A-Z]/, /^process$/,
    /^parse[A-Z]/, /^json[A-Z]/, /Json/, /Parse/, /Connection/,
    /^new[A-Z]/, /^create[A-Z]/, /^release$/, /^close$/, /^open$/,
    /^clear[A-Z]?$/, /^reset$/, /^init$/, /^destroy$/,
  ];
  function isUtilityName(name) {
    if (!name) return false;
    return UTILITY_PATTERNS.some(re => re.test(name));
  }

  // 키워드 매칭 노드만 personalization 가중치 — utility 는 강하게 패널티
  const personalization = {};
  let hasKeywordMatch = false;
  graph.forEachNode((node, attrs) => {
    let weight = 0.001; // 기본 매우 낮음
    if (attrs.type === 'symbol') {
      const nameLower = attrs.name.toLowerCase();
      // 키워드 직접 매칭 → 강한 가중치
      if (keywordSet.has(nameLower)) {
        weight = 100.0;
        hasKeywordMatch = true;
      } else {
        for (const kw of keywordSet) {
          if (kw.length >= 4 && (nameLower.includes(kw) || kw.includes(nameLower))) {
            weight = Math.max(weight, 30.0);
            hasKeywordMatch = true;
          }
        }
      }
      // Utility 함수 패널티 (도메인 무관)
      if (isUtilityName(attrs.name)) weight *= 0.05;
    } else if (attrs.type === 'file') {
      const fileLower = node.toLowerCase();
      for (const kw of keywordSet) {
        if (kw.length >= 4 && fileLower.includes(kw)) {
          weight = Math.max(weight, 50.0);
          hasKeywordMatch = true;
        }
      }
    }
    personalization[node] = weight;
  });

  // Normalize
  const totalWeight = Object.values(personalization).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    for (const k of Object.keys(personalization)) personalization[k] /= totalWeight;
  }

  // PageRank with personalization vector (가능하면 적용)
  let ranks;
  try {
    // graphology-pagerank 가 personalization 지원하면 활용
    ranks = pagerank(graph, {
      alpha: 0.85,
      getEdgeWeight: () => 1,
    });
  } catch (e) {
    console.error('  PageRank 에러 (fallback):', e.message);
    ranks = {};
    graph.forEachNode((n) => { ranks[n] = 1.0; });
  }

  // 최종 score = PageRank × personalization × utility 패널티 직접 적용
  const scored = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.type !== 'symbol') return;
    const pr = ranks[node] || 0;
    const pWeight = personalization[node] * 1e6; // strong boost
    // utility 함수는 PageRank 도 패널티
    let utilityPenalty = isUtilityName(attrs.name) ? 0.02 : 1.0;
    const score = pr * utilityPenalty * (1 + pWeight);
    scored.push({ node, attrs, score });
  });
  scored.sort((a, b) => b.score - a.score);

  // Token budget 안에서 top N 선택
  const out = [];
  let estimatedTokens = 0;
  const seenFiles = new Set();
  for (const item of scored) {
    const rel = path.relative(repoPath, item.attrs.file);
    const symbol = `${rel}:${item.attrs.line}  ${item.attrs.kind} ${item.attrs.name}`;
    const symTokens = Math.ceil(symbol.length / 3.5);
    if (estimatedTokens + symTokens > tokenBudget) break;
    out.push({
      file: rel,
      line: item.attrs.line,
      name: item.attrs.name,
      kind: item.attrs.kind,
      score: item.score,
    });
    estimatedTokens += symTokens;
    seenFiles.add(rel);
  }

  const elapsed = Date.now() - tStart;
  return {
    repoPath,
    message,
    fileCount: files.length,
    parsedCount: fileData.size,
    graphNodes: graph.order,
    graphEdges: graph.size,
    elapsed,
    estimatedTokens,
    uniqueFiles: seenFiles.size,
    symbols: out,
  };
}

// 출력
if (require.main === module) {
  const result = buildRepoMap(ROOT, MESSAGE, TOKEN_BUDGET);

  console.error(`\n✓ Repo-map 완료 (${result.elapsed}ms, ${result.estimatedTokens} est tokens, ${result.uniqueFiles} unique files)`);
  console.error('');

  console.log(`# Repo-map: ${path.basename(result.repoPath)}`);
  console.log(`> Files scanned: ${result.fileCount}, parsed: ${result.parsedCount}`);
  console.log(`> Graph: ${result.graphNodes} nodes, ${result.graphEdges} edges`);
  console.log(`> Message keywords: ${result.message || '(none)'}`);
  console.log(`> Top ${result.symbols.length} symbols (${result.estimatedTokens} tokens, ${result.uniqueFiles} files)`);
  console.log('');
  console.log('| Rank | File | Line | Kind | Symbol | Score |');
  console.log('|---|---|---|---|---|---|');
  for (let i = 0; i < result.symbols.length; i++) {
    const s = result.symbols[i];
    console.log(`| ${i + 1} | \`${s.file}\` | ${s.line} | ${s.kind} | **${s.name}** | ${s.score.toExponential(2)} |`);
  }
}

module.exports = { buildRepoMap };
