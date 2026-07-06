#!/usr/bin/env node
/**
 * Dead Code Detector for eCAMS repositories
 * ──────────────────────────────────────────
 * 결정 69: 코드 레벨 참조 그래프 기반 미사용 파일 탐지
 *
 * 참조 체인:
 *   JSP ──<script src>──→ JS
 *   JS  ──ajaxCall/ajaxAsync──→ Servlet URL → @WebServlet Java
 *   JS  ──cURL="/webPage/..."──→ JSP (winpop/modal)
 *   Java ──import──→ Java class
 *   Java ──new Xxx() / Xxx.method()──→ Java class
 *
 * 사용법: node scripts/deadCodeDetector.js <repoPath> [--json] [--repoignore]
 */
const fs = require('fs');
const path = require('path');
const { resolvePortablePath } = require('../pathUtils');

const ROOT = path.join(__dirname, '..');
const REPO_PATH = resolvePortablePath(process.argv[2] || path.join(ROOT, 'workspace', '광주은행', 'kjbank_html5'), ROOT);
const FLAG_JSON = process.argv.includes('--json');
const FLAG_REPOIGNORE = process.argv.includes('--repoignore');

// ─── 설정 ───
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'build', 'target', '.history', '_extracted',
  'classes', '.deco', 'logs', 'tmp', 'vendor', '.settings',
  'META-INF', 'fonts', 'img', 'css', 'styles', 'ecamsplugin',
  'ecams_win_flex', 'initech', 'scripts',
]);

const SCAN_EXTENSIONS = new Set(['.js', '.jsp', '.java', '.pc', '.sql']);

// ─── 파일 수집 ───
function walkFiles(base) {
  const out = [];
  const stack = [base];
  while (stack.length) {
    const cur = stack.pop();
    let stat;
    try { stat = fs.statSync(cur); } catch (_) { continue; }
    if (stat.isDirectory()) {
      const name = path.basename(cur);
      if (EXCLUDE_DIRS.has(name)) continue;
      try {
        for (const n of fs.readdirSync(cur)) stack.push(path.join(cur, n));
      } catch (_) {}
    } else if (stat.isFile()) {
      const ext = path.extname(cur).toLowerCase();
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      // 백업/복사본 파일 제외
      if (/_(back|copy|old|test|20\d{6})/i.test(path.basename(cur, ext))) continue;
      if (/\.min\.js$/.test(cur)) continue;
      out.push(cur);
    }
  }
  return out;
}

// ─── 참조 추출기 ───

/**
 * JSP → JS 참조 추출
 * <script ... src=".../{Name}.js..."> 패턴
 */
function extractJspRefs(filePath, content) {
  const refs = [];
  // <script src="/js/X.js"> or src="<c:url value='/js/X.js' />"
  const scriptPattern = /src\s*=\s*["'](?:[^"'>]*<c:url\s+value\s*=\s*['"])?[^"'>]*\/([^/"'>]+\.js)(?:\?[^"'>]*)?["']/gi;
  let m;
  while ((m = scriptPattern.exec(content)) !== null) {
    refs.push({ type: 'js', target: m[1] });
  }
  // <c:import url="/webPage/common/common.jsp" /> — JSP include
  const importPattern = /url=["']([^"']+\.jsp)["']/gi;
  while ((m = importPattern.exec(content)) !== null) {
    const jspName = path.basename(m[1]);
    refs.push({ type: 'jsp', target: jspName });
  }
  return refs;
}

/**
 * JS → Servlet URL 참조 추출
 * ajaxCall/ajaxAsync/ajaxCallWithJson('/webPage/.../XxxServlet', ...)
 */
function extractJsRefs(filePath, content) {
  const refs = [];
  // Servlet URL 호출
  const servletPattern = /(?:ajaxCall|ajaxAsync|ajaxCallWithJson|ajaxFileAsync)\s*\(\s*['"]([^'"]+Servlet[^'"]*)['"]/gi;
  let m;
  while ((m = servletPattern.exec(content)) !== null) {
    const url = m[1];
    refs.push({ type: 'servlet_url', target: url });
  }
  // JSP URL 참조 (절대경로, 상대경로 모두 포함)
  const jspPattern = /['"](?:[^'"]*\/)?([A-Za-z0-9_]+\.jsp)(?:\?[^'"]*)?['"]/gi;
  while ((m = jspPattern.exec(content)) !== null) {
    refs.push({ type: 'jsp', target: m[1] });
  }
  // 다른 JS 파일 참조 (동적 로드 등)
  const jsLoadPattern = /['"]\/js\/[^'"]*?([A-Za-z0-9_]+\.js)(?:\?[^'"]*)?['"]/gi;
  while ((m = jsLoadPattern.exec(content)) !== null) {
    refs.push({ type: 'js', target: m[1] });
  }
  return refs;
}

/**
 * Java → 참조 추출
 * @WebServlet URL, import, new Xxx(), Xxx.method()
 */
function extractJavaRefs(filePath, content) {
  const refs = [];
  const info = {};

  // @WebServlet URL 추출 (자기 자신의 URL 등록)
  const wsMatch = content.match(/@WebServlet\s*\(\s*["']([^"']+)['"]\s*\)/);
  if (wsMatch) {
    info.servletUrl = wsMatch[1];
  }

  // import 문
  const importPattern = /import\s+(?:static\s+)?(?:[\w.]+\.)?(\w+)\s*;/g;
  let m;
  while ((m = importPattern.exec(content)) !== null) {
    const className = m[1];
    if (!/^[A-Z]/.test(className)) continue; // 클래스명만
    if (/^(String|Integer|Long|Boolean|List|Map|Set|HashMap|ArrayList|Array|Object|Exception|SQLException|Date|Calendar|Connection|PreparedStatement|ResultSet|PrintWriter|HttpServlet|HttpServletRequest|HttpServletResponse|JsonElement|JsonObject|JsonArray|JsonParser|IOException|Override|Gson|BufferedReader|InputStreamReader|StringBuffer|StringBuilder|Properties|InputStream|OutputStream|File|Math|System|Thread|Runtime|Class|Pattern|Matcher|Collections|Arrays|Iterator|Enumeration|Vector|Hashtable|TreeMap|LinkedList|LinkedHashMap|TreeSet|HashSet|UUID|Base64|BigDecimal|BigInteger|SimpleDateFormat|DateFormat|Locale|TimeZone|Timer|TimerTask|Logger|Level|Handler|Formatter|Filter|Reader|Writer|Closeable|AutoCloseable|Comparable|Serializable|Cloneable|Iterable|Runnable|Callable|Future|Optional|Stream|Collectors|WebServlet|ServletException|annotation|RequestDispatcher|ServletContext|HttpSession|Cookie|Part|MultipartConfig)$/.test(className)) continue;
    refs.push({ type: 'java_class', target: className });
  }

  // new Xxx() 패턴
  const newPattern = /new\s+([A-Z]\w+)\s*\(/g;
  while ((m = newPattern.exec(content)) !== null) {
    const className = m[1];
    if (/^(String|Integer|Long|Boolean|HashMap|ArrayList|StringBuilder|StringBuffer|Date|File|Thread|Exception|Gson|JsonParser|Properties|SimpleDateFormat|BigDecimal|Timer|UUID|Object|Array|Vector|Hashtable|TreeMap|LinkedList)$/.test(className)) continue;
    refs.push({ type: 'java_class', target: className });
  }

  return { refs, info };
}

// ─── 메인 분석 ───
function analyze(repoPath) {
  console.error(`▶ Dead Code Detector: ${repoPath}`);
  const t0 = Date.now();

  const files = walkFiles(repoPath);
  console.error(`  스캔 파일: ${files.length}`);

  // 파일 인벤토리 (basename → fullPath)
  const filesByName = new Map();    // basename → [fullPaths]
  const filesByExt = new Map();     // ext → [fullPaths]
  const javaByClass = new Map();    // className → fullPath
  const servletUrlMap = new Map();  // servlet URL → fullPath

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f);
    const nameNoExt = path.basename(f, ext);

    if (!filesByName.has(base)) filesByName.set(base, []);
    filesByName.get(base).push(f);

    if (!filesByExt.has(ext)) filesByExt.set(ext, []);
    filesByExt.get(ext).push(f);

    if (ext === '.java') {
      javaByClass.set(nameNoExt, f);
    }
  }

  // 참조 그래프 빌드
  const referencedFiles = new Set();   // fullPath가 누군가에게 참조됨
  const referenceDetails = [];          // {from, to, type} 디버깅용
  const orphans = [];
  const fileRefs = new Map();           // fullPath → [{type, target}]

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    if (content.length > 500000) continue;

    if (ext === '.jsp') {
      const refs = extractJspRefs(f, content);
      fileRefs.set(f, refs);
      for (const r of refs) {
        const targets = filesByName.get(r.target) || [];
        for (const t of targets) {
          referencedFiles.add(t);
          referenceDetails.push({ from: f, to: t, type: r.type });
        }
      }
    }

    if (ext === '.js') {
      const refs = extractJsRefs(f, content);
      fileRefs.set(f, refs);
      for (const r of refs) {
        if (r.type === 'servlet_url') {
          // servlet URL → Java 파일 매핑 (나중에 resolve)
          // 일단 URL을 저장해두고 pass 2에서 resolve
        } else {
          const targets = filesByName.get(r.target) || [];
          for (const t of targets) {
            referencedFiles.add(t);
            referenceDetails.push({ from: f, to: t, type: r.type });
          }
        }
      }
    }

    if (ext === '.java') {
      const { refs, info } = extractJavaRefs(f, content);
      fileRefs.set(f, refs);
      if (info.servletUrl) {
        servletUrlMap.set(info.servletUrl, f);
      }
      for (const r of refs) {
        if (r.type === 'java_class') {
          const target = javaByClass.get(r.target);
          if (target && target !== f) {
            referencedFiles.add(target);
            referenceDetails.push({ from: f, to: target, type: 'java_import' });
          }
        }
      }
    }
  }

  // Pass 2: JS의 Servlet URL → Java 매핑
  for (const [f, refs] of fileRefs) {
    if (!refs) continue;
    for (const r of refs) {
      if (r.type === 'servlet_url') {
        const javaFile = servletUrlMap.get(r.target);
        if (javaFile) {
          referencedFiles.add(javaFile);
          referenceDetails.push({ from: f, to: javaFile, type: 'servlet_call' });
        }
      }
    }
  }

  // Pass 3: JSP와 JS 이름 매칭 (1:1 컨벤션)
  // eCAMS 패턴: approval/RequestStatus.jsp ↔ approval/RequestStatus.js
  // JSP가 참조되면 같은 이름의 JS도 참조된 것으로 간주 (script src로 이미 잡히지만 안전장치)
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (ext !== '.jsp') continue;
    const base = path.basename(f, '.jsp');
    const matchingJs = filesByName.get(base + '.js');
    if (matchingJs && referencedFiles.has(f)) {
      for (const jsFile of matchingJs) {
        referencedFiles.add(jsFile);
      }
    }
  }

  // Pass 4: Servlet이 참조되면, 해당 Servlet이 import하는 DAO/Class도 참조된 것으로 전파 (2-depth)
  let changed = true;
  let depth = 0;
  while (changed && depth < 5) {
    changed = false;
    depth++;
    for (const detail of referenceDetails) {
      if (referencedFiles.has(detail.from) && !referencedFiles.has(detail.to)) {
        // 이미 참조된 파일이 참조하는 파일도 참조 전파 (단, to가 from의 참조 대상인 경우)
      }
    }
    // Java import 전파
    for (const [f, refs] of fileRefs) {
      if (!referencedFiles.has(f)) continue;
      if (!refs) continue;
      for (const r of refs) {
        if (r.type === 'java_class') {
          const target = javaByClass.get(r.target);
          if (target && !referencedFiles.has(target)) {
            referencedFiles.add(target);
            changed = true;
          }
        }
      }
    }
  }

  // ─── 결과 분류 ───
  const results = {
    total: files.length,
    referenced: referencedFiles.size,
    orphanCount: 0,
    byType: {},
    orphans: [],
    referencedList: [],
  };

  // 특수 파일(자체가 진입점) 제외 — common, login, main 등
  const ENTRYPOINT_PATTERNS = [
    /common\.jsp$/i, /commonscript\.jsp$/i, /common\.js$/i,
    /login/i, /main/i, /eCAMSBase/i, /index\./i,
    /sso_login/i, /error_\d+\.jsp$/i,
    /MenuList/i, /ParsingCommon/i, /ConnectionResource/i, /ConnectionContext/i,
    /ecamsLogger/i, /SimpleCORSFilter/i,
  ];

  function isEntrypoint(filePath) {
    const base = path.basename(filePath);
    if (ENTRYPOINT_PATTERNS.some(p => p.test(base))) return true;

    // eCAMS 특성: 일반 JSP 화면은 DB(CMM0080) 메뉴를 통해 접근되므로 코드 상의 참조가 없습니다.
    // 따라서 winpop, modal, 탭 등을 제외한 일반 JSP는 모두 진입점으로 간주합니다.
    if (filePath.endsWith('.jsp')) {
      const lowerPath = filePath.toLowerCase();
      if (!lowerPath.includes('/winpop/') && 
          !lowerPath.includes('/modal/') && 
          !lowerPath.includes('/tab/') &&
          !lowerPath.includes('modal.jsp') &&
          !lowerPath.includes('tab.jsp')) {
        return true;
      }
    }
    return false;
  }

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const rel = path.relative(repoPath, f).replace(/\\/g, '/');

    if (!results.byType[ext]) results.byType[ext] = { total: 0, orphan: 0, files: [] };
    results.byType[ext].total++;

    if (!referencedFiles.has(f) && !isEntrypoint(f)) {
      results.byType[ext].orphan++;
      results.byType[ext].files.push(rel);
      results.orphans.push(rel);
    } else {
      results.referencedList.push(rel);
    }
  }
  results.orphanCount = results.orphans.length;
  results.elapsed = Date.now() - t0;

  return results;
}

// ─── 출력 ───
const results = analyze(REPO_PATH);

if (FLAG_JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Dead Code Detector — 결과 리포트');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  대상 경로: ${REPO_PATH}`);
  console.log(`  분석 시간: ${results.elapsed}ms`);
  console.log('');
  console.log(`  전체 파일:   ${results.total}`);
  console.log(`  참조됨:      ${results.total - results.orphanCount} (${((results.total - results.orphanCount) / results.total * 100).toFixed(1)}%)`);
  console.log(`  ⚠ 미참조:    ${results.orphanCount} (${(results.orphanCount / results.total * 100).toFixed(1)}%)`);
  console.log('');
  console.log('── 타입별 요약 ──');
  for (const [ext, data] of Object.entries(results.byType).sort((a, b) => b[1].orphan - a[1].orphan)) {
    const pct = data.total > 0 ? (data.orphan / data.total * 100).toFixed(0) : 0;
    const bar = '█'.repeat(Math.round(data.orphan / Math.max(1, results.orphanCount) * 20));
    console.log(`  ${ext.padEnd(6)} ${String(data.orphan).padStart(4)} / ${String(data.total).padStart(4)} 미참조 (${String(pct).padStart(3)}%) ${bar}`);
  }
  console.log('');
  console.log('── 미참조 파일 목록 ──');
  for (const [ext, data] of Object.entries(results.byType).sort((a, b) => b[1].orphan - a[1].orphan)) {
    if (data.orphan === 0) continue;
    console.log(`\n  [${ext}] — ${data.orphan}건`);
    for (const f of data.files.sort()) {
      console.log(`    ${f}`);
    }
  }
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
}

// .repoignore 생성
if (FLAG_REPOIGNORE) {
  const ignorePath = path.join(REPO_PATH, '.repoignore');
  const lines = [
    '# Auto-generated by deadCodeDetector.js',
    `# Generated: ${new Date().toISOString()}`,
    `# Orphan files: ${results.orphanCount} / ${results.total}`,
    '',
    ...results.orphans.sort(),
    '',
  ];
  fs.writeFileSync(ignorePath, lines.join('\n'), 'utf8');
  console.error(`\n✓ .repoignore 생성: ${ignorePath} (${results.orphanCount} entries)`);
}
