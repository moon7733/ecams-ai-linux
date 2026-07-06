/**
 * graphifyBuilder.js
 * 소스코드에서 파일 간 '의존성 관계'를 추출하여 LLM이 읽기 쉬운
 * Graph 마크다운 파일을 생성한다.
 *
 * 출력: wiki/{repoId}/Graph/
 *          _Index.md         ← 전체 관계도 목록
 *          Files/            ← 파일별 Inbound/Outbound 관계
 *              {FileName}.md
 */

const fs   = require('fs');
const path = require('path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// wiki Pages 파일을 읽어 내용을 반환
function readWikiPage(pagesDir, category, fileName) {
  const p = path.join(pagesDir, category, fileName.endsWith('.md') ? fileName : `${fileName}.md`);
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; } catch { return ''; }
}

function listWikiFiles(pagesDir, category) {
  const dir = path.join(pagesDir, category);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'Index.md');
}

// ===== Web 타입 그래프 =====
// JS → Servlet URL → requestType 체인을 파일별 관계도로 생성
function buildWebGraph(wikiRoot, repoId) {
  const pagesDir = path.join(wikiRoot, 'Pages');
  const graphDir = path.join(wikiRoot, 'Graph');
  const filesDir = path.join(graphDir, 'Files');
  ensureDir(filesDir);

  // Servlet 페이지에서 URL → {file, reqTypes} 맵 구성
  const servletMap = {}; // url → { mdFile, reqTypes[] }
  for (const mdFile of listWikiFiles(pagesDir, 'Servlets')) {
    const content = readWikiPage(pagesDir, 'Servlets', mdFile);
    // '# Servlet: /webPage/...' 에서 URL 추출
    const urlMatch = content.match(/^# Servlet:\s*(.+)/m);
    if (!urlMatch) continue;
    const url = urlMatch[1].trim();
    // requestType 목록 섹션에서만 이름 추출 (파라미터 섹션 제외)
    // 신형식: ### `name` / 구형식: - `name`:
    const rtSection = content.match(/## requestType 목록\n([\s\S]*?)(?=\n##|$)/);
    const reqTypes = rtSection ? [
      ...[...rtSection[1].matchAll(/^### `([^`]+)`/mg)].map(m => m[1].trim()),
      ...[...rtSection[1].matchAll(/^- `([^`]+)`/mg)].map(m => m[1].split(':')[0].trim()),
    ].filter(Boolean) : [];
    const clsMatch = content.match(/\*\*구현 클래스\*\*:\s*`([^`]+)`/);
    servletMap[url] = { mdFile, reqTypes, cls: clsMatch ? path.basename(clsMatch[1]) : '' };
  }

  // JS 페이지에서 각 JS 파일의 ajax 호출 정보 읽기
  const jsFiles = listWikiFiles(pagesDir, 'JS');
  const indexEntries = []; // _Index.md 용

  for (const mdFile of jsFiles) {
    const content = readWikiPage(pagesDir, 'JS', mdFile);
    const jsName = mdFile.replace('.md', '');

    // 경로
    const pathMatch = content.match(/\*\*경로\*\*:\s*`([^`]+)`/);
    const filePath = pathMatch ? pathMatch[1] : jsName;

    // API 호출 URL + 이 JS가 실제 사용하는 requestType 추출
    // 형식: `- \`/url\` (requestType: \`rt1\`, \`rt2\`) → [[...]]`
    const urlRtMap = {}; // url → string[]
    for (const line of content.split('\n')) {
      const urlMatch = line.match(/^- `(\/[^`]+)`/);
      if (!urlMatch) continue;
      const url = urlMatch[1];
      const rtMatch = line.match(/\(requestType:\s*(.*?)\)/);
      urlRtMap[url] = rtMatch
        ? [...rtMatch[1].matchAll(/`([^`]+)`/g)].map(m => m[1])
        : [];
    }
    const apiUrls = Object.keys(urlRtMap);

    if (!apiUrls.length) continue;

    let md = `# ${jsName} 참조 관계\n\n`;
    md += `- **경로**: \`${filePath}\`\n\n`;

    // Outbound
    md += `## Outbound (이 파일이 호출하는 것)\n\n`;
    md += `| URL | Servlet 클래스 | requestType |\n|---|---|---|\n`;
    const outboundUrls = [];
    for (const url of apiUrls) {
      const sv = servletMap[url];
      const cls = sv ? sv.cls : '-';
      // JS wiki에 명시된 requestType 우선, 없으면 '-'
      const jsRts = urlRtMap[url];
      const rts = jsRts && jsRts.length ? jsRts.map(r => `\`${r}\``).join(', ') : '-';
      const servLink = sv ? `[[../Pages/Servlets/${sv.mdFile.replace('.md', '')}\\|${cls}]]` : cls;
      md += `| \`${url}\` | ${servLink} | ${rts} |\n`;
      outboundUrls.push(url);
    }
    md += '\n';

    // 체인 요약
    md += `## 의존성 체인\n\n`;
    for (const url of outboundUrls) {
      const sv = servletMap[url];
      const jsRts = urlRtMap[url];
      const rtSuffix = jsRts && jsRts.length ? ` [${jsRts.join('|')}]` : '';
      const chain = sv
        ? `\`${jsName}\` ➡️ \`${url}\` ➡️ \`${sv.cls}\`` + rtSuffix
        : `\`${jsName}\` ➡️ \`${url}\``;
      md += `- ${chain}\n`;
    }

    fs.writeFileSync(path.join(filesDir, `${jsName}.md`), md, 'utf8');
    indexEntries.push({ name: jsName, outCount: outboundUrls.length, type: 'JS' });
  }

  // Servlet 페이지에 Inbound(JS 호출자) 정보 추가
  // → 별도 Graph/Files/{servlet}.md 생성
  const servletCallers = {}; // url → jsName[]
  for (const mdFile of jsFiles) {
    const content = readWikiPage(pagesDir, 'JS', mdFile);
    const jsName = mdFile.replace('.md', '');
    const apiUrls = [...content.matchAll(/^- `([^`]+)`/mg)].map(m => m[1]).filter(u => u.startsWith('/'));
    for (const url of apiUrls) {
      if (!servletCallers[url]) servletCallers[url] = [];
      if (!servletCallers[url].includes(jsName)) servletCallers[url].push(jsName);
    }
  }

  for (const url in servletMap) {
    const sv = servletMap[url];
    const callers = servletCallers[url] || [];
    const safeName = sv.cls || url.replace(/\//g, '_');

    let md = `# ${sv.cls || url} 참조 관계\n\n`;
    md += `- **URL**: \`${url}\`\n`;
    if (sv.cls) md += `- **구현**: \`${sv.cls}\`\n`;
    md += '\n';

    if (callers.length) {
      md += `## Inbound (이 Servlet을 호출하는 JS)\n\n`;
      callers.forEach(js => md += `- [[Files/${js}|${js}]]\n`);
      md += '\n';
    }

    if (sv.reqTypes.length) {
      md += `## 지원 requestType\n\n`;
      sv.reqTypes.forEach(rt => md += `- \`${rt}\`\n`);
    }

    fs.writeFileSync(path.join(filesDir, `${safeName}.md`), md, 'utf8');
    indexEntries.push({ name: safeName, inCount: callers.length, type: 'Servlet' });
  }

  writeGraphIndex(graphDir, indexEntries, repoId, 'web');
  console.log(`[Graphify] web: ${repoId} (JS:${jsFiles.length}, Servlet:${Object.keys(servletMap).length})`);
}

// ===== Server 타입 그래프 =====
// .pc 파일 → 함수 → EXEC SQL 테이블 체인
function buildServerGraph(wikiRoot, repoId) {
  const pagesDir = path.join(wikiRoot, 'Pages');
  const graphDir = path.join(wikiRoot, 'Graph');
  const filesDir = path.join(graphDir, 'Files');
  ensureDir(filesDir);

  const proCFiles = listWikiFiles(pagesDir, 'ProC');
  const indexEntries = [];

  for (const mdFile of proCFiles) {
    const content = readWikiPage(pagesDir, 'ProC', mdFile);
    const fileName = mdFile.replace('.md', '').replace(/_/g, '.').replace(/\.md$/, '');

    // 함수 목록과 SQL 연산 파싱
    const functions = [];
    let curFunc = null;
    let curAction = '';
    let curSqls = [];

    for (const line of content.split('\n')) {
      const fnMatch = line.match(/^### (\w+)/);
      if (fnMatch) {
        if (curFunc) functions.push({ name: curFunc, action: curAction, sqls: curSqls });
        curFunc = fnMatch[1];
        curAction = '';
        curSqls = [];
        continue;
      }
      const actionMatch = line.match(/^> (.+)/);
      if (actionMatch && curFunc && !curAction) curAction = actionMatch[1];

      const sqlMatch = line.match(/^- `(SELECT|INSERT|UPDATE|DELETE|CALL)` → \[\[Tables\/([^\]|]+)/);
      if (sqlMatch && curFunc) curSqls.push({ op: sqlMatch[1], table: sqlMatch[2] });
    }
    if (curFunc) functions.push({ name: curFunc, action: curAction, sqls: curSqls });

    if (!functions.length) continue;

    // 이 파일이 참조하는 테이블 집합
    const allTables = [...new Set(functions.flatMap(fn => fn.sqls.map(s => s.table)))];

    let md = `# ${mdFile.replace('.md', '')} 참조 관계\n\n`;

    // 의존성 체인 요약
    md += `## 의존성 체인\n\n`;
    for (const fn of functions) {
      if (!fn.sqls.length) continue;
      const tableList = fn.sqls.map(s => `\`${s.table}\`(${s.op})`).join(', ');
      md += `- \`${fn.name}()\` ➡️ ${tableList}\n`;
    }
    md += '\n';

    // 함수별 상세
    md += `## 함수별 SQL 상세\n\n`;
    md += `| 함수 | 기능 | SQL | 테이블 |\n|---|---|---|---|\n`;
    for (const fn of functions) {
      if (!fn.sqls.length) {
        md += `| \`${fn.name}\` | ${fn.action || '-'} | - | - |\n`;
      } else {
        fn.sqls.forEach((s, i) => {
          md += `| ${i === 0 ? `\`${fn.name}\`` : ''} | ${i === 0 ? (fn.action || '-') : ''} | \`${s.op}\` | [[../Pages/Tables/${s.table}\\|${s.table}]] |\n`;
        });
      }
    }

    if (allTables.length) {
      md += `\n## 참조 테이블 목록\n\n`;
      allTables.forEach(t => md += `- [[../Pages/Tables/${t}|${t}]]\n`);
    }

    fs.writeFileSync(path.join(filesDir, mdFile), md, 'utf8');
    indexEntries.push({ name: mdFile.replace('.md', ''), tableCount: allTables.length, funcCount: functions.length, type: 'ProC' });
  }

  writeGraphIndex(graphDir, indexEntries, repoId, 'server');
  console.log(`[Graphify] server: ${repoId} (ProC:${proCFiles.length})`);
}

// ===== DB 타입 그래프 =====
// 프로시저 → 테이블 참조 관계
function buildDbGraph(wikiRoot, repoId) {
  const pagesDir = path.join(wikiRoot, 'Pages');
  const graphDir = path.join(wikiRoot, 'Graph');
  const filesDir = path.join(graphDir, 'Files');
  ensureDir(filesDir);

  const procFiles = listWikiFiles(pagesDir, 'Procedures');
  const tableFiles = listWikiFiles(pagesDir, 'Tables');
  const indexEntries = [];

  // 테이블 이름 집합
  const tableNames = new Set(tableFiles.map(f => f.replace('.md', '')));

  for (const mdFile of procFiles) {
    const content = readWikiPage(pagesDir, 'Procedures', mdFile);
    const procName = mdFile.replace('.md', '');

    // SQL 본문에서 테이블 참조 추출
    const referenced = new Set();
    for (const m of content.matchAll(/\b(FROM|INTO|UPDATE|JOIN)\s+([A-Z][A-Z0-9_]{2,})/gi)) {
      const tName = m[2].toUpperCase();
      if (tableNames.has(tName)) referenced.add(tName);
    }

    if (!referenced.size) continue;

    let md = `# Procedure: ${procName} 참조 관계\n\n`;
    md += `## 의존성 체인\n\n`;
    md += `\`${procName}\` ➡️ ${[...referenced].map(t => `\`${t}\``).join(', ')}\n\n`;
    md += `## 참조 테이블\n\n`;
    [...referenced].forEach(t => md += `- [[../Pages/Tables/${t}|${t}]]\n`);

    fs.writeFileSync(path.join(filesDir, mdFile), md, 'utf8');
    indexEntries.push({ name: procName, tableCount: referenced.size, type: 'Procedure' });
  }

  writeGraphIndex(graphDir, indexEntries, repoId, 'db');
  console.log(`[Graphify] db: ${repoId} (Procs:${procFiles.length})`);
}

// ===== Plugin 타입 그래프 =====
// 클래스 상속/구현 체인
function buildPluginGraph(wikiRoot, repoId) {
  const pagesDir = path.join(wikiRoot, 'Pages');
  const graphDir = path.join(wikiRoot, 'Graph');
  const filesDir = path.join(graphDir, 'Files');
  ensureDir(filesDir);

  const classFiles = listWikiFiles(pagesDir, 'Classes');
  const indexEntries = [];

  // 클래스 정보 수집
  const classMap = {}; // className → { extends, implements[], methods[] }
  for (const mdFile of classFiles) {
    const content = readWikiPage(pagesDir, 'Classes', mdFile);
    const className = mdFile.replace('.md', '');
    const extendsMatch = content.match(/\*\*extends\*\*:\s*`([^`]+)`/);
    const implMatch = content.match(/\*\*implements\*\*:\s*(.+)/);
    const methods = [...content.matchAll(/^- `(\w+)\(\)`/mg)].map(m => m[1]);

    classMap[className] = {
      extends: extendsMatch ? extendsMatch[1] : '',
      implements: implMatch ? [...implMatch[1].matchAll(/`([^`]+)`/g)].map(m => m[1]) : [],
      methods
    };
  }

  const classNames = new Set(Object.keys(classMap));

  // 클래스별 관계도
  for (const [className, info] of Object.entries(classMap)) {
    const hasRelations = info.extends || info.implements.length;
    if (!hasRelations) continue;

    // 이 클래스를 상속하는 자식들
    const children = Object.entries(classMap)
      .filter(([, v]) => v.extends === className)
      .map(([k]) => k);

    let md = `# ${className} 참조 관계\n\n`;

    // 상속 체인
    md += `## 의존성 체인\n\n`;
    if (info.extends) md += `\`${info.extends}\` ⬅️ \`${className}\` (extends)\n`;
    info.implements.forEach(i => md += `\`${i}\` ⬅️ \`${className}\` (implements)\n`);
    if (children.length) children.forEach(c => md += `\`${className}\` ⬅️ \`${c}\` (자식 클래스)\n`);
    md += '\n';

    // 상세 관계표
    md += `## 상세 관계\n\n| 관계 | 대상 | 연결 |\n|---|---|---|\n`;
    if (info.extends) {
      const link = classNames.has(info.extends) ? `[[Files/${info.extends}|${info.extends}]]` : `\`${info.extends}\``;
      md += `| extends | ${link} | 부모 클래스 |\n`;
    }
    info.implements.forEach(i => {
      const link = classNames.has(i) ? `[[Files/${i}|${i}]]` : `\`${i}\``;
      md += `| implements | ${link} | 인터페이스 |\n`;
    });
    children.forEach(c => md += `| ← extends | [[Files/${c}|${c}]] | 자식 클래스 |\n`);

    fs.writeFileSync(path.join(filesDir, `${className}.md`), md, 'utf8');
    indexEntries.push({ name: className, type: 'Class', childCount: children.length });
  }

  writeGraphIndex(graphDir, indexEntries, repoId, 'plugin');
  console.log(`[Graphify] plugin: ${repoId} (Classes:${classFiles.length})`);
}

// ===== Graph/_Index.md 생성 =====
function writeGraphIndex(graphDir, entries, repoId, repoType) {
  const now = new Date().toLocaleString('ko-KR');
  let md = `# ${repoId} Graph Index\n\n`;
  md += `> 생성: ${now} | 타입: ${repoType}\n\n`;
  md += `## 사용 방법\n\n`;
  md += `> LLM은 질문에 답하기 전에 이 인덱스에서 관련 파일을 먼저 찾고,\n`;
  md += `> \`Files/{파일명}.md\` 를 읽어 의존성 체인을 파악한 뒤, 타겟 소스만 분석한다.\n\n`;

  if (repoType === 'web') {
    const jsEntries = entries.filter(e => e.type === 'JS');
    const svEntries = entries.filter(e => e.type === 'Servlet');
    md += `## JS 파일 (${jsEntries.length}개) — 서버 API 호출 관계\n\n`;
    md += `| JS 파일 | 호출 URL 수 |\n|---|---|\n`;
    jsEntries.forEach(e => md += `| [[Files/${e.name}|${e.name}]] | ${e.outCount} |\n`);
    md += `\n## Servlet (${svEntries.length}개) — 호출자 관계\n\n`;
    md += `| Servlet | 호출 JS 수 |\n|---|---|\n`;
    svEntries.forEach(e => md += `| [[Files/${e.name}|${e.name}]] | ${e.inCount || 0} |\n`);
  } else if (repoType === 'server') {
    md += `## Pro*C 파일 (${entries.length}개) — 함수/테이블 관계\n\n`;
    md += `| 파일 | 함수 수 | 참조 테이블 수 |\n|---|---|---|\n`;
    entries.forEach(e => md += `| [[Files/${e.name}|${e.name}]] | ${e.funcCount} | ${e.tableCount} |\n`);
  } else if (repoType === 'db') {
    md += `## 프로시저 (${entries.length}개) — 테이블 참조 관계\n\n`;
    md += `| 프로시저 | 참조 테이블 수 |\n|---|---|\n`;
    entries.forEach(e => md += `| [[Files/${e.name}|${e.name}]] | ${e.tableCount} |\n`);
  } else if (repoType === 'plugin') {
    md += `## 클래스 상속/구현 관계 (${entries.length}개)\n\n`;
    md += `| 클래스 | 자식 클래스 수 |\n|---|---|\n`;
    entries.forEach(e => md += `| [[Files/${e.name}|${e.name}]] | ${e.childCount || 0} |\n`);
  }

  fs.writeFileSync(path.join(graphDir, '_Index.md'), md, 'utf8');
}

// ===== 메인 진입점 =====
async function buildGraphify(repoPath, repoId, repoType = 'web_general', companyFolder = '고객사없음') {
  const safeId  = repoId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const wikiRoot = path.join(__dirname, 'wiki', companyFolder, safeId);

  if (!fs.existsSync(wikiRoot)) {
    console.warn(`[Graphify] wiki 없음, 스킵: ${repoId}`);
    return;
  }

  // 기존 Graph 폴더 초기화
  const graphDir = path.join(wikiRoot, 'Graph');
  if (fs.existsSync(graphDir)) fs.rmSync(graphDir, { recursive: true, force: true });
  ensureDir(graphDir);

  try {
    if (repoType === 'server') {
      buildServerGraph(wikiRoot, repoId);
    } else if (repoType.startsWith('plugin_')) {
      buildPluginGraph(wikiRoot, repoId);
    } else if (repoType === 'db') {
      buildDbGraph(wikiRoot, repoId);
    } else {
      buildWebGraph(wikiRoot, repoId);
    }
  } catch (e) {
    console.error(`[Graphify] Error for ${repoId}:`, e.message);
  }
}

module.exports = { buildGraphify };
