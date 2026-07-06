const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.settings', 'build', 'out', '.deco', '__pycache__']);
const EXCLUDE_EXT  = new Set(['.class', '.jar', '.war', '.zip', '.png', '.jpg', '.gif', '.ico', '.svg', '.woff', '.ttf', '.eot', '.map']);

function walkFiles(dir, exts) {
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
      if (e.isDirectory()) { stack.push(full); }
      else {
        const ext = path.extname(e.name).toLowerCase();
        if (EXCLUDE_EXT.has(ext)) continue;
        if (!exts || exts.has(ext)) results.push(full);
      }
    }
  }
  return results;
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { return ''; }
}

function buildDirTree(dir, depth, maxDepth) {
  if (depth > maxDepth || !fs.existsSync(dir)) return '';
  let out = '';
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return ''; }
  entries = entries
    .filter(e => !e.name.startsWith('.') && !EXCLUDE_DIRS.has(e.name))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const e of entries) {
    const indent = '  '.repeat(depth);
    if (e.isDirectory()) {
      out += `${indent}${e.name}/\n`;
      out += buildDirTree(path.join(dir, e.name), depth + 1, maxDepth);
    } else {
      out += `${indent}${e.name}\n`;
    }
  }
  return out;
}

function extractServlets(javaFiles, repoPath) {
  const result = [];
  for (const f of javaFiles) {
    const content = readSafe(f);
    if (!content.includes('@WebServlet')) continue;
    const urlMatches = [...content.matchAll(/@WebServlet\s*\(\s*["']([^"']+)["']/g)];
    if (!urlMatches.length) continue;

    const requestTypes = [
      ...[...content.matchAll(/requestType\.equals\s*\(\s*["']([^"']+)["']/g)].map(m => m[1]),
      ...[...content.matchAll(/case\s+"([^"]+)"\s*:/g)].map(m => m[1]),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const rel = path.relative(repoPath, f).replace(/\\/g, '/');
    for (const um of urlMatches) {
      result.push({ url: um[1], file: rel, requestTypes });
    }
  }
  return result.sort((a, b) => a.url.localeCompare(b.url));
}

function buildJspJsMap(repoPath) {
  const jspFiles = walkFiles(repoPath, new Set(['.jsp']));
  const jsFiles  = walkFiles(repoPath, new Set(['.js']));

  const jsMap = new Map();
  for (const f of jsFiles) {
    const key = path.basename(f, '.js').toLowerCase();
    if (!jsMap.has(key)) jsMap.set(key, []);
    jsMap.get(key).push(path.relative(repoPath, f).replace(/\\/g, '/'));
  }

  const mappings = [];
  for (const f of jspFiles) {
    const base = path.basename(f, '.jsp');
    const relJsp = path.relative(repoPath, f).replace(/\\/g, '/');
    const matches = jsMap.get(base.toLowerCase()) || [];
    mappings.push({ jsp: relJsp, js: matches.join(', ') || '-' });
  }
  return mappings.sort((a, b) => path.basename(a.jsp).localeCompare(path.basename(b.jsp)));
}

function extractAjaxCalls(jsFiles, repoPath) {
  const urlSet = new Set();
  for (const f of jsFiles.slice(0, 300)) {
    const content = readSafe(f);
    for (const m of content.matchAll(/(?:ajaxAsync|ajaxCallWithJson|ajaxCall)\s*\(\s*["']([^"']+)["']/g)) {
      urlSet.add(m[1]);
    }
  }
  return [...urlSet].sort();
}

function extractJavaSkeleton(content) {
  const skeleton = [];
  // 클래스/인터페이스 선언 추출
  const classMatches = [...content.matchAll(/(?:public|protected|private)?\s*(?:class|interface|enum)\s+[\w<>]+(?:\s+extends\s+[\w<>]+)?(?:\s+implements\s+[\w<>,\s]+)?/g)];
  
  // 메서드 추출 정규식 (어노테이션 및 주석 포함 시도)
  const methodRegex = /(?:\/\*\*[\s\S]*?\*\/|\/\/[^\n]*\n)?\s*(?:@\w+(?:\([^\)]*\))?\s*)*(?:public|protected|private|static|final|native|synchronized|abstract|transient)+\s+[\w\<\>\[\]]+\s+([\w\$]+)\s*\([^\)]*\)\s*(?:throws\s+[\w\s,]+)?\s*\{/g;
  const methods = [...content.matchAll(methodRegex)];

  if (classMatches.length > 0) {
    skeleton.push(`  * ${classMatches[0][0].trim()}`);
  }
  
  methods.forEach(m => {
    let sig = m[0].replace(/\{$/, '').trim();
    if (sig.includes('/**')) {
        const commentMatch = sig.match(/\/\*\*([\s\S]*?)\*\//);
        if (commentMatch) {
            const comment = commentMatch[1].split('\n').map(l => l.replace(/\*|\//g, '').trim()).filter(l => l).join(' ');
            sig = sig.replace(/\/\*\*[\s\S]*?\*\//, `// ${comment.substring(0, 60)}${comment.length > 60 ? '...' : ''}\n    `);
        }
    }
    skeleton.push(`    - ${sig.replace(/\s+/g, ' ')}`);
  });
  
  return skeleton.length > 0 ? skeleton.join('\n') : '    (No methods found)';
}

function extractJsSkeleton(content) {
  const skeleton = [];
  const funcRegex = /(?:\/\*\*[\s\S]*?\*\/|\/\/[^\n]*\n)?\s*(?:function\s+([\w\$]+)|(?:const|let|var)\s+([\w\$]+)\s*=\s*(?:function|\([^\)]*\)\s*=>))/g;
  const matches = [...content.matchAll(funcRegex)];

  matches.forEach(m => {
    let sig = m[0].trim();
    if (sig.includes('/**')) {
        const commentMatch = sig.match(/\/\*\*([\s\S]*?)\*\//);
        if (commentMatch) {
            const comment = commentMatch[1].split('\n').map(l => l.replace(/\*|\//g, '').trim()).filter(l => l).join(' ');
            sig = sig.replace(/\/\*\*[\s\S]*?\*\//, `// ${comment.substring(0, 60)}... `);
        }
    }
    skeleton.push(`    - ${sig.replace(/\s+/g, ' ').substring(0, 120)}`);
  });
  return skeleton.length > 0 ? skeleton.join('\n') : '    (No functions found)';
}

async function buildIndex(repoPath, repoName) {
  const lines = [];
  lines.push(`# [코드 인덱스] ${repoName}`);
  lines.push(`> 생성: ${new Date().toLocaleString('ko-KR')} | 경로: ${repoPath}`);
  lines.push('');
  lines.push('> **[필독]** 이 인덱스로 관련 파일을 먼저 특정하고, 그 파일만 직접 읽으십시오. 본문을 읽기 전 Skeleton을 참고하세요.');
  lines.push('');

  // 1. 디렉토리 구조 (2단계)
  lines.push('## 1. 디렉토리 구조');
  lines.push('```');
  lines.push(buildDirTree(repoPath, 0, 2).trimEnd());
  lines.push('```');
  lines.push('');

  // 2. JSP ↔ JS 매핑
  const jspJsMap = buildJspJsMap(repoPath);
  if (jspJsMap.length) {
    lines.push('## 2. JSP ↔ JS 매핑');
    lines.push('| JSP 파일 | JS 파일 |');
    lines.push('|----------|---------|');
    for (const m of jspJsMap.slice(0, 300)) {
      lines.push(`| \`${m.jsp}\` | \`${m.js}\` |`);
    }
    lines.push('');
  }

  // 3. 서블릿 URL → Java 파일 + requestType 매핑
  const javaFiles = walkFiles(repoPath, new Set(['.java']));
  const servlets = extractServlets(javaFiles, repoPath);
  if (servlets.length) {
    lines.push('## 3. 서블릿 URL 매핑');
    for (const s of servlets) {
      lines.push(`- **\`${s.url}\`** → \`${s.file}\``);
      if (s.requestTypes.length) {
        lines.push(`  - requestType: ${s.requestTypes.map(r => `\`${r}\``).join(', ')}`);
      }
    }
    lines.push('');
  }

  // 4. JS에서 호출하는 서버 URL 목록
  const jsFiles = walkFiles(repoPath, new Set(['.js']));
  const ajaxUrls = extractAjaxCalls(jsFiles, repoPath);
  if (ajaxUrls.length) {
    lines.push('## 4. JS → 서버 호출 URL 목록');
    for (const u of ajaxUrls) lines.push(`- \`${u}\``);
    lines.push('');
  }

  // 5. 핵심 클래스 구조 (Skeletons)
  lines.push('## 5. 핵심 클래스 구조 (Skeletons)');
  const importantFiles = new Set(servlets.map(s => s.file));
  jspJsMap.forEach(m => { if(m.js !== '-') m.js.split(', ').forEach(j => importantFiles.add(j)); });

  for (const rel of Array.from(importantFiles).slice(0, 50)) {
    const full = path.join(repoPath, rel);
    if (!fs.existsSync(full)) continue;
    const content = readSafe(full);
    const ext = path.extname(rel).toLowerCase();
    
    lines.push(`### File: \`${rel}\``);
    if (ext === '.java') {
      lines.push('```java');
      lines.push(extractJavaSkeleton(content));
      lines.push('```');
    } else if (ext === '.js') {
      lines.push('```javascript');
      lines.push(extractJsSkeleton(content));
      lines.push('```');
    }
    lines.push('');
  }

  // 6. Java 파일 전체 목록
  if (javaFiles.length) {
    lines.push('## 6. Java 파일 목록');
    for (const f of javaFiles) {
      const rel = path.relative(repoPath, f).replace(/\\/g, '/');
      if (!rel.includes('/.deco/') && !rel.includes('\\.deco\\')) lines.push(`- \`${rel}\``);
    }
    lines.push('');
  }

  // 7. JSP 전체 목록
  const jspFiles = walkFiles(repoPath, new Set(['.jsp']));
  if (jspFiles.length) {
    lines.push('## 7. JSP 파일 목록');
    for (const f of jspFiles) lines.push(`- \`${path.relative(repoPath, f).replace(/\\/g, '/')}\``);
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { buildIndex };
