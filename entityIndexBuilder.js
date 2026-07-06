// 소스(JS/JSP/Java) 추출 텍스트 기반 엔티티 임베딩 인덱스 — 화면/JS·Class·Servlet 의미검색용
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { decodeBuffer } = require('./encoding');

const WIKI_BASE = path.join(__dirname, 'wiki');

// ── 인코딩 자동판별 읽기 (JS/JSP=UTF-8, Java=EUC-KR 혼재) ──
// UTF-8 디코드 후 replacement char(�)가 많으면 EUC-KR 로 재디코드.
function readSmart(p) {
  // 인코딩 감지는 공용 encoding.js 로 위임 (UTF-8/EUC-KR 자동)
  try { return decodeBuffer(fs.readFileSync(p)); }
  catch (e) { return ''; }
}

// ── 한국어 런 추출 (주석·UI 라벨·알럿 메시지) ──
function extractKorean(text) {
  const runs = text.match(/[가-힣][가-힣0-9A-Za-z()_\/ ]{1,40}/g) || [];
  const out = [];
  const seen = new Set();
  for (const r of runs) {
    const t = r.trim().replace(/\s+/g, ' ');
    if (t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out;
}

// ── 심볼(함수/메서드 정의명) 추출 — 사용자가 질문에 그대로 붙여넣는 식별자 ──
function extractSymbols(text, isJava) {
  const syms = new Set();
  if (isJava) {
    // public/private/protected [static] <리턴타입> 메서드명(
    for (const m of text.matchAll(/(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\],\s]+?\s+([A-Za-z_]\w{2,})\s*\(/g)) syms.add(m[1]);
    // 커서/프로시저 흔한 패턴 (대문자_숫자)
    for (const m of text.matchAll(/\b([A-Z][A-Za-z]+_?[A-Za-z]*\d?[A-Za-z0-9_]*)\s*\(/g)) { if (m[1].length >= 4) syms.add(m[1]); }
  } else {
    for (const m of text.matchAll(/function\s+([A-Za-z_]\w{2,})/g)) syms.add(m[1]);
    for (const m of text.matchAll(/([A-Za-z_]\w{2,})\s*[:=]\s*function/g)) syms.add(m[1]);
  }
  return [...syms];
}

// 위키 오집 화면명(작성자/버전/수정일 주석) 판별 — 라벨로 부적합
function isGarbageLabel(s) {
  return /작성자|작성일|수정일|버전\s*[:：]/.test(s || '');
}

// ── ScreenMap/MenuMap 별칭 로드 (JS 파일 → 화면명·메뉴명) ──
function loadAliases(wikiRoot) {
  const map = new Map(); // jsFileBase(소문자) → Set(별칭)
  const add = (js, alias) => {
    const k = js.toLowerCase().replace(/\.js$/, '');
    if (!map.has(k)) map.set(k, new Set());
    if (alias) map.get(k).add(alias);
  };
  // ScreenMap.md: | 화면명 | [[Pages/JS/X.js\|..]] | ..
  const sm = path.join(wikiRoot, 'ScreenMap.md');
  if (fs.existsSync(sm)) {
    for (const line of readSmart(sm).split('\n')) {
      if (!line.startsWith('|')) continue;
      const parts = line.split('|');
      if (parts.length < 3) continue;
      const screen = parts[1].trim();
      const m = parts[2].match(/Pages\/JS\/([^\\|]+)/);
      // 위키 생성기가 .js History 주석(작성자/버전/수정일)을 화면명으로 오집한 행 거부 → 코드명 폴백
      if (m && screen && screen !== '화면명' && !isGarbageLabel(screen)) add(m[1].trim(), screen);
    }
  }
  return map;
}

// ── workspace 1회 walk → basename(소문자) → [fullpath] 인덱스 ──
function buildBasenameIndex(root) {
  const idx = new Map();
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/node_modules|vendor|\.git/i.test(e.name)) continue;
        stack.push(full);
      } else {
        const k = e.name.toLowerCase();
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(full);
      }
    }
  }
  return idx;
}

// ── 엔티티 열거 (wiki = app-only 정규 목록) + 소스 매핑 ──
// 반환: [{ id, kind, name, sourcePaths:[...] }]
function enumerateEntities(repoWorkspacePath, wikiRoot) {
  const ents = [];
  const fileIdx = buildBasenameIndex(repoWorkspacePath);
  const findSrc = (basename, exts) =>
    exts.flatMap(x => fileIdx.get((basename + x).toLowerCase()) || []);

  const jsDir = path.join(wikiRoot, 'Pages', 'JS');
  if (fs.existsSync(jsDir)) {
    for (const f of fs.readdirSync(jsDir).filter(f => f.endsWith('.js.md'))) {
      const name = f.replace(/\.js\.md$/, '');
      const js = findSrc(name, ['.js']);
      const jsp = findSrc(name, ['.jsp']); // 라벨 소스
      if (js.length) ents.push({ id: 'js:' + name, kind: 'js', name, sourcePaths: [...js.slice(0,1), ...jsp.slice(0,1)] });
    }
  }
  for (const sub of ['Classes', 'Servlets']) {
    const kind = sub === 'Classes' ? 'class' : 'servlet';
    const dir = path.join(wikiRoot, 'Pages', sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'Index.md' && !f.startsWith('_test'))) {
      const name = f.replace(/\.md$/, '');
      const java = findSrc(name, ['.java']);
      if (java.length) ents.push({ id: kind + ':' + name, kind, name, sourcePaths: java.slice(0, 1) });
    }
  }
  return ents;
}

// ── 엔티티별 임베딩 문서 텍스트 조립 ──
function buildDoc(ent, aliases) {
  const parts = [];
  parts.push(ent.name);
  if (ent.kind === 'js') {
    const al = aliases.get(ent.name.toLowerCase());
    if (al && al.size) parts.push([...al].join(' '));
  }
  let kor = [], syms = [];
  for (const sp of ent.sourcePaths) {
    const txt = readSmart(sp);
    if (!txt) continue;
    const isJava = sp.toLowerCase().endsWith('.java');
    kor = kor.concat(extractKorean(txt));
    syms = syms.concat(extractSymbols(txt, isJava));
  }
  // dedupe
  kor = [...new Set(kor)]; syms = [...new Set(syms)];
  if (syms.length) parts.push(syms.join(' '));
  if (kor.length) parts.push(kor.join(' '));
  return parts.join('\n').slice(0, 6000); // 임베딩 입력 상한 여유
}

// ── 임베딩 (task type 지정, gemini-embedding-001, 768차원 MRL) ──
const EMBED_DIM = 768;
function embedText(text, apiKey, taskType) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      content: { parts: [{ text: text.substring(0, 8000) }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${(apiKey || '').trim()}`;
    const req = https.request(url, {
      method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (j.embedding && j.embedding.values) resolve({ vector: j.embedding.values });
          else resolve({ error: j.error ? `${res.statusCode} ${j.error.status}` : `${res.statusCode}` });
        } catch (e) { resolve({ error: 'parse' }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(body); req.end();
  });
}

function cosine(a, b) {
  let d = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const den = Math.sqrt(ma) * Math.sqrt(mb);
  return den ? d / den : 0;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 인덱스 빌드 (엔티티 → 임베딩 → 디스크). 429/503 재시도, 캐시 재사용(증분). ──
function indexPath(repoId) {
  return path.join(__dirname, 'knowledge', repoId.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_entity_index.json');
}

// 사람이 읽을 라벨 — JS는 화면명(ScreenMap), 그 외는 엔티티명
function entityLabel(ent, aliases) {
  if (ent.kind === 'js') {
    const al = aliases.get(ent.name.toLowerCase());
    if (al && al.size) return [...al][0];
  }
  return ent.name;
}

async function buildIndex(repoId, repoWorkspacePath, wikiRoot, apiKey, onProgress) {
  const aliases = loadAliases(wikiRoot);
  const ents = enumerateEntities(repoWorkspacePath, wikiRoot);

  // 기존 인덱스 재사용 (문서 동일하면 임베딩 스킵 — 증분 빌드)
  const prev = loadIndex(repoId);
  const prevById = new Map((prev?.entries || []).map(e => [e.id, e]));

  const entries = [];
  let embedded = 0, reused = 0, failed = 0;
  for (let i = 0; i < ents.length; i++) {
    const ent = ents[i];
    const doc = buildDoc(ent, aliases);
    if (!doc || doc.length < 10) continue;

    const label = entityLabel(ent, aliases);
    const cached = prevById.get(ent.id);
    if (cached && cached.docHash === hash(doc) && cached.vector?.length === EMBED_DIM) {
      entries.push({ ...cached, label, doc: doc.toLowerCase() }); reused++; // doc·label 부착
      if (onProgress) onProgress(i + 1, ents.length, 'reuse');
      continue;
    }

    let r, attempt = 0;
    do {
      r = await embedText(doc, apiKey, 'RETRIEVAL_DOCUMENT');
      if (r.vector) break;
      attempt++;
      if (/429|503/.test(r.error || '')) await sleep(1500 * attempt);
    } while (attempt < 3 && /429|503|timeout/.test(r.error || ''));

    if (r.vector) {
      entries.push({ id: ent.id, kind: ent.kind, name: ent.name, label, sourcePaths: ent.sourcePaths, docHash: hash(doc), vector: r.vector, doc: doc.toLowerCase() });
      embedded++;
    } else { failed++; }
    if (onProgress) onProgress(i + 1, ents.length, r.vector ? 'embed' : 'fail:' + r.error);
    await sleep(80); // rate-limit 여유
  }

  const index = { repoId, dim: EMBED_DIM, built: new Date().toISOString(), entries };
  fs.writeFileSync(indexPath(repoId), JSON.stringify(index), 'utf8');
  return { total: ents.length, embedded, reused, failed, saved: entries.length };
}

// 인메모리 캐시 (mtime 기반 무효화) — 매 요청마다 4.3MB JSON 파싱·DF재계산 방지
const _indexCache = new Map();
function loadIndex(repoId) {
  const p = indexPath(repoId);
  try {
    const mtime = fs.statSync(p).mtimeMs;
    const c = _indexCache.get(repoId);
    if (c && c.mtime === mtime) return c.index; // ensureDocTokens 가 붙인 _df·_ktoks 도 재사용
    const index = JSON.parse(fs.readFileSync(p, 'utf8'));
    _indexCache.set(repoId, { mtime, index });
    return index;
  } catch (e) { return null; }
}

function hash(s) {
  let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

// ── 질문에서 코드심볼 토큰 추출 (강매칭용) ──
function queryStrongTokens(q) {
  const strong = new Set();
  for (const m of q.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) || []) {
    if (/[_0-9]/.test(m) || /[a-z][A-Z]/.test(m) || m.length >= 6) strong.add(m.toLowerCase());
  }
  return [...strong];
}

// ── doc 의 한국어 토큰 집합 + DF(문서빈도) 맵 — 인덱스당 1회 캐시 ──
function ensureDocTokens(index) {
  if (index._df) return;
  const df = new Map();
  for (const e of index.entries) {
    const toks = new Set();
    for (const tok of (e.doc || '').split(/\s+/)) {
      if (tok.length >= 3 && /[가-힣]/.test(tok)) toks.add(tok);
    }
    e._ktoks = [...toks];
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  index._df = df;
}

// ── 하이브리드 쿼리: 임베딩 코사인 + 강(코드심볼 정확) + 약(희귀 한국어 doc토큰이 질문에 등장) ──
async function queryIndex(repoId, question, apiKey, topK = 8) {
  const index = loadIndex(repoId);
  if (!index || !index.entries.length) return [];
  const r = await embedText(question, apiKey, 'RETRIEVAL_QUERY');
  if (!r.vector) return [];
  ensureDocTokens(index);
  const strong = queryStrongTokens(question);
  const q = question.toLowerCase();
  const DF_MAX = index.entries.length * 0.15; // 15% 초과 등장 토큰 = 흔한말, 스킵
  return index.entries
    .map(e => {
      const sim = cosine(r.vector, e.vector);
      const doc = e.doc || '';
      let boost = 0; const hits = [];
      // 강: 질문의 코드심볼이 doc 에 정확히 있으면 큰 부스트
      for (const t of strong) if (doc.includes(t)) { boost += 0.5; hits.push(t); }
      // 약: doc 의 희귀 한국어 토큰이 질문 안에 등장하면 부스트 (방향 반전 → 형태소 문제 회피)
      for (const t of e._ktoks) {
        if ((index._df.get(t) || 0) > DF_MAX) continue;
        if (q.includes(t)) { boost += 0.15; hits.push(t); }
      }
      const safeLabel = (e.label && !isGarbageLabel(e.label)) ? e.label : e.name; // 기존 인덱스의 오집 라벨 런타임 차단
      return { id: e.id, kind: e.kind, name: e.name, label: safeLabel, sim, score: sim + Math.min(boost, 1.2), hits: [...new Set(hits)] };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

module.exports = {
  readSmart, extractKorean, extractSymbols, loadAliases, enumerateEntities, buildDoc,
  embedText, cosine, buildIndex, loadIndex, queryIndex, indexPath, EMBED_DIM, WIKI_BASE, isGarbageLabel,
};
