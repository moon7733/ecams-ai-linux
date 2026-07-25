'use strict';
/**
 * pmsGemini.js — PMS용 Gemini 호출 코어 (분류 + WBS 비전). azbrain RAG와 무관.
 * clarifier.js 패턴: https 직접호출, thinking off, JSON 강제. 무료 GEMINI_API_KEY 재사용.
 * CLI 프로브(pmsClassifyGemini.js / wbsVisionTest.js)와 브릿지(pmsBridge.js)가 공유.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 텍스트 분류: flash-lite 는 환각(입력에 없는 항목 생성·실제 항목 누락) 확인 → 2.5-flash 로 충실도 확보(실측 ~1.5s).
// WBS 비전: flash-lite 로도 29행 정확 추출(~7s) → 저렴한 lite 유지.
const TEXT_MODEL = process.env.PMS_CLASSIFY_MODEL || 'gemini-2.5-flash';
const VISION_MODEL = process.env.PMS_VISION_MODEL || 'gemini-3.1-flash-lite';

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const dir of [__dirname, process.cwd()]) {
    const p = path.join(dir, '.env');
    try {
      if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = l.match(/^GEMINI_API_KEY(?:_\d+)?=(.+)/); if (m) return m[1].trim();
      }
    } catch {}
  }
  return '';
}

// 단발 generateContent (parts 배열 직접 전달). 503/429 1회 재시도.
function callGemini(parts, { model, maxOutputTokens = 2048, timeoutMs = 30000 }) {
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens, responseMimeType: 'application/json' }
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${loadKey()}`;
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let b = ''; r.on('data', c => b += c);
      r.on('end', () => { try { const j = JSON.parse(b); resolve({ text: j.candidates?.[0]?.content?.parts?.[0]?.text, err: j.error?.message }); } catch { resolve({ err: 'response parse failed' }); } });
    });
    req.on('error', e => resolve({ err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ err: `timeout ${timeoutMs}ms` }); });
    req.write(body); req.end();
  });
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  // 객체 우선 — 좌표 모드는 {"items":[...],"clarify":[...]}를 낸다. 배열만 온 응답도 계속 받는다.
  for (const re of [/\{[\s\S]*\}/, /\[[\s\S]*\]/]) {
    const m = text.match(re);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
  }
  return null;
}

function parseArray(text) {
  const j = parseJson(text);
  if (!j) return null;
  if (Array.isArray(j)) return j;
  return j.items || j.rows || j.results || null;
}

/** 좌표 모드 응답 = 항목 + 되묻기. 구버전 모델이 배열만 내도 clarify는 빈 배열로 받는다. */
function parsePayload(text) {
  const j = parseJson(text);
  if (!j) return { items: null, clarify: [] };
  if (Array.isArray(j)) return { items: j, clarify: [] };
  const clarify = Array.isArray(j.clarify)
    ? j.clarify.map((c) => (typeof c === 'string' ? c : c && c.question))
        .filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()).slice(0, 3)
    : [];
  return { items: j.items || j.rows || j.results || null, clarify };
}

async function withRetry(fn) {
  let last;
  for (let i = 0; i < 2; i++) {
    last = await fn();
    if (last.text) break;
    if (!/RESOURCE_EXHAUSTED|UNAVAILABLE|503|429/.test(last.err || '')) break;
  }
  return last;
}

// 흔한 카테고리(일관성용 어휘). AI는 여기 맞는 게 있으면 재사용하고, 없으면 내용에 맞는 새 카테고리를 만든다.
const COMMON_CATEGORIES = [
  '접속 정보', '운영 절차', '배포 절차', '방화벽·네트워크', '형상관리', '서버·인프라',
  '일정·회의', '이슈·장애', '요구사항', '특이사항', '인수인계'
];
// 지식 좌표 모드에서 쓰는 고정 어휘. PMS가 판정을 다시 하므로(CapturePredicateGate) 여기 값은 "제안"이다.
const KINDS = ['FIELD', 'NOTE', 'PROCEDURE'];
const ROUTES = ['KNOWLEDGE_FACT', 'WORK_RECORD', 'ISSUE_TASK', 'DOMAIN_CANON', 'DISCARD_VIEW'];

/**
 * 좌표 모드 지시문 — PMS가 아웃라인 노드(nodePath)와 predicate 어휘를 함께 보낼 때 쓴다.
 * 노드 하나에서 사실이 여러 개 나오면 같은 nodePath로 여러 항목을 낸다(PMS가 노드당 다항목을 받는다).
 */
function outlineInstruction(nodes, predicates, cats) {
  const paths = nodes.map((n) => `"${n.nodePath}"`).join(', ');
  const vocab = predicates.map((p) => {
    const q = (p.qualifierKeys || []).length ? ` qualifiers=[${p.qualifierKeys.join(',')}]` : '';
    return `  ${p.code}  (${p.name || ''}${p.valueType ? `, ${p.valueType}` : ''})${q}`;
  }).join('\n');
  return [
    '당신은 SI 프로젝트 인수인계 메모의 지식 좌표 분류기다. <NODES>의 각 노드를 읽고 사실 단위로 분류한다.',
    '출력은 JSON 객체 하나: {"items":[...],"clarify":[...]}',
    '각 item: {"nodePath","kind","predicate","qualifiers","target","key","category","title","body","tag","route","sensitive","warning"}',
    '',
    '■ nodePath (필수)',
    `- 반드시 다음 좌표 중 하나를 문자열 그대로 쓴다: ${paths}`,
    '- 대괄호·따옴표·기호를 덧붙이지 마라. 좌표가 "1"이면 nodePath는 "1"이다("[1]" 아님).',
    '- 없는 좌표를 만들지 마라. 좌표가 틀린 항목은 PMS가 버린다.',
    '- 한 노드에 사실이 여러 개면 **같은 nodePath로 항목을 여러 개** 내라. 그게 정상이다.',
    '- 노드의 모든 내용이 어느 항목에든 담겨야 한다. 빠뜨린 내용은 그대로 유실된다.',
    '',
    '■ kind (필수)',
    `- 반드시 ${KINDS.join(' | ')} 중 하나. route 값(ISSUE_TASK 등)을 kind에 넣지 마라 — 별개 필드다.`,
    '- FIELD: "무엇 = 값" 하나로 떨어지는 사실. **아래 어휘에 맞는 코드가 있으면 적극적으로 FIELD로 잡아라.**',
    '  예: "항군회관 5층" → SITE.ADDRESS / "아이디 lym7733" → ACCESS.USERNAME',
    '      "위키 > 인프라 > 형상관리" → DOCUMENT.LOCATION / "리눅스 레드햇 8.10" → 서버 OS 값',
    '  예외 하나: 라벨만 있고 값이 원문에 없으면(예: "프로젝트뷰 (웹사이트)" — URL이 안 적혀 있다)'
      + ' 값을 지어내지 말고 그 항목만 NOTE로 둔다.',
    '- PROCEDURE: 순서가 있는 절차(1단계·2단계, 체크아웃→배포 같은 흐름).',
    '- NOTE: 위 둘이 아닌 서술.',
    '',
    '■ predicate (FIELD일 때만, 아래 목록에서만)',
    vocab || '  (등록된 어휘 없음 — predicate는 null)',
    '- 목록에 맞는 코드가 없으면 predicate=null, kind="NOTE"로 둔다. **코드를 새로 만들지 마라.**',
    '- qualifiers: 그 코드에 표시된 키만 쓴다. 예: ACCESS.CREDENTIAL + {"asset":"LAPTOP"}.',
    '  같은 predicate가 대상별로 여러 번 나오면 qualifiers로 구분한다(노트북 비번 / 망관리 비번).',
    '  해당 키가 없으면 qualifiers={}.',
    '',
    '■ route (필수) — 이 내용이 지식인지 다른 곳으로 갈 것인지',
    `- ${ROUTES.join(' | ')}`,
    '- KNOWLEDGE_FACT: 계속 참조할 사실(기본값).',
    '- WORK_RECORD: 날짜별로 "무엇을 했다"는 작업 기록.',
    '- ISSUE_TASK: 아직 안 된 일·요청·미결(예: "문서 작성 필요", "설명 필요").',
    '- DOMAIN_CANON: 고객사·계약·인스턴스 정본 화면이 따로 관리하는 값(OS·계약기간·점검주기 등).',
    '- DISCARD_VIEW: 화면이 자동 집계할 수 있어 저장할 필요 없는 것.',
    '',
    '■ «SECRET#n» — 가려진 비밀 값 (가장 중요)',
    '- 원문의 비밀 값은 PMS가 «SECRET#1» 같은 토큰으로 바꿔 보낸다. 라벨("노트북 패스워드")은 그대로 있다.',
    '- 그 토큰을 **글자 그대로 body에 옮겨 적어라.** 지우거나 바꿔 쓰면 PMS가 그 비밀을 어느 사실에 붙일지 잃는다.',
    '- 토큰이 든 사실은 라벨을 보고 좌표를 붙여라. 예:',
    '    "노트북 패스워드 «SECRET#1»" → kind="FIELD", predicate="ACCESS.CREDENTIAL",',
    '     qualifiers={"asset":"LAPTOP"}, title="노트북 로그인 비밀번호", body="노트북 패스워드 «SECRET#1»"',
    '- 값을 추측해 쓰지 마라. 토큰이 곧 값이다.',
    '- 무엇의 비밀인지 라벨로도 알 수 없으면 qualifiers는 비우고 clarify에 질문을 넣어라.',
    '',
    '■ sensitive',
    '- 비밀번호·키처럼 값 자체가 비밀이면 true(«SECRET#n»이 들어간 항목이 여기 해당).',
    '',
    '■ title은 body의 복사본이 아니다',
    '- title: 목록에서 이 사실을 식별할 짧은 이름(대개 10~20자). body 문장을 그대로 넣지 마라.',
    '- body: 내용 본문. title과 같은 문자열이면 잘못된 것이다.',
    '',
    '■ 묶기와 나누기',
    '- 이어진 하나의 서술(예: SVN 배포 흐름 전체)은 한 항목으로 묶어라.',
    '- 단, "나중에는 ~로 바꿀 예정" 같은 **계획·예정**은 현재 사실과 나눠 별도 항목으로 내라.',
    '',
    '■ warning (선택)',
    '- 그 사실이 오래 못 갈 위험을 한 문장으로. 예: "성현씨 부재 시 출입 불가 — 사람 의존".',
    '- 위험이 없으면 넣지 마라. 값·비밀은 절대 담지 마라.',
    '',
    '■ clarify (선택) — 사람에게 되묻기',
    '- 분류를 확신할 수 없을 때 추측하지 말고 질문 문장을 clarify 배열에 넣어라(최대 3개).',
    '- 예: "MASTER / ecamssh는 계정/비밀번호 쌍인가요?", "이 비밀번호는 어느 시스템 것인가요?"',
    '- 되물을 게 없으면 clarify는 빈 배열.',
    '',
    '■ 그 밖의 필드 — 기존 규칙 그대로',
    ...legacyFieldRules(cats),
    '오직 JSON 객체만.'
  ].join('\n');
}

/** target/key/category/tag/body 규칙 — 좌표 모드와 레거시 모드가 공유한다. */
function legacyFieldRules(cats) {
  return [
    '- target: "info" | "knowledge" | "credential".',
    '- "info": 값이 아래 정형 필드에 해당할 때(문장 속에 값이 있으면 값만 뽑아 body에). key는 "DB","WAS","SCM","SERVER_IP","LOGIN_STEPS" 중 하나.',
    '- "credential": 비밀번호 등 민감정보. tag="접속 정보".',
    '- 그 외는 "knowledge". key=null, title=짧고 명확한 제목.',
    '- category: 반드시 다음 6개 코드 중 하나(대문자 코드로만):',
    '    ACCESS   = 접속·환경 / OPERATION= 운영·배포 / PROCESS  = 프로세스·지식',
    '    CONTACT  = 담당·연락 / ISSUE    = 이슈·리스크 / ETC      = 기타',
    '  판단은 값이 아니라 **의미**로 한다.',
    '- tag: category보다 더 구체적인 소분류 라벨. 기존 목록에 맞으면 재사용, 없으면 새로:',
    `    [${cats.join(', ')}]`,
    '  "메모","기타","정보" 같은 막연한 태그 금지.',
    '- body: 원문을 읽기 좋게 다듬는다(문장·순서 정돈, 군더더기 제거). info는 값만 뽑는다.',
    '- ★★사실 보존(최우선·엄수): 회사명·기관명·시스템명·사람이름·직급·날짜·시각·전화번호·계정·경로·IP·수치 등'
      + ' **모든 고유명사와 값은 입력에 있는 글자 그대로** 유지하라. 표현만 다듬고 사실은 건드리지 마라.',
    '  절대 금지: 입력에 없는 고유명사·사실을 지어내거나, 있는 것을 비슷한 다른 것으로 치환.'
  ];
}

function classifyInstruction(knownTags = []) {
  const cats = Array.from(new Set([...(knownTags || []), ...COMMON_CATEGORIES]));
  return [
    '당신은 SI 프로젝트 인수인계 메모 분류기다. 아래 <DUMP>의 각 정보 조각을 분류해 JSON 배열로만 출력한다.',
    '각 원소: {"target","key","category","title","body","tag"}',
    '- target: "info" | "knowledge" | "credential".',
    '- "info": 값이 아래 정형 필드에 해당할 때(문장 속에 값이 있으면 값만 뽑아 body에). key는 "DB","WAS","SCM","SERVER_IP","LOGIN_STEPS" 중 하나.',
    '  예: "와스는 웹로직 씀" → {target:"info", key:"WAS", body:"WebLogic"}.',
    '- "credential": 비밀번호 등 민감정보. tag="접속 정보".',
    '- 그 외는 "knowledge". key=null, title=짧고 명확한 제목, body=아래 규칙대로 "다듬은" 내용.',
    '- category: 반드시 다음 6개 코드 중 하나(대문자 코드로만):',
    '    ACCESS   = 접속·환경 (서버·DB·WAS·IP·경로·계정·형상관리 접속·비번 등 접속/환경 값)',
    '    OPERATION= 운영·배포 (운영 리듬·배포 절차·반영/반영제외·릴리즈·점검 절차)',
    '    PROCESS  = 프로세스·지식 (하우투·설정 방법·규칙·특이사항·주의점)',
    '    CONTACT  = 담당·연락 (담당자·연락처·정기점검 "방문" 안내·문자/메일 템플릿·일정 통보)',
    '    ISSUE    = 이슈·리스크 (미해결·오류·장애·리스크)',
    '    ETC      = 기타 (위 어디에도 안 맞을 때)',
    '  판단은 값이 아니라 **의미**로 한다. 예: "형상관리 정기점검 방문 문자(날짜·담당·연락처)"는 형상 단어가 있어도 ACCESS가 아니라 CONTACT다.',
    '- tag: category보다 더 구체적인 소분류 라벨. 기존 목록에 맞으면 재사용, 없으면 새로:',
    `    [${cats.join(', ')}]`,
    '  "메모","기타","정보" 같은 막연한 태그 금지.',
    '- body 다듬기(knowledge의 핵심 역할): 사용자가 급히·구어체로 적은 원문을 **읽기 좋게 정리**하라 — 문장 다듬기, 순서·구조 정돈, 군더더기 제거, 항목이면 깔끔한 줄바꿈. 나중에 보기 편하게. (info는 값만 뽑는다.)',
    '- ★★사실 보존(최우선·엄수): 회사명·기관명·시스템명·사람이름·직급·날짜·시각·전화번호·계정·경로·IP·수치 등 **모든 고유명사와 값은 입력에 있는 글자 그대로** 유지하라. 표현만 다듬고 사실은 건드리지 마라.',
    '  절대 금지: 입력에 없는 고유명사·사실을 지어내거나, 있는 것을 비슷한 다른 것으로 치환. 예) "한화시스템"→"방화벽 시스템", "수협공제"→"한국전력공사", "황해권"→"방화벽", "이용문"→"이선우" 같은 치환·창작은 심각한 오류다. 확실치 않으면 원문 단어를 그대로 둬라.',
    '- 논리적으로 한 덩어리인 내용(예: 방문 안내 문자 한 통, 하나의 절차 설명)은 억지로 여러 항목으로 쪼개지 마라.',
    '- 입력의 모든 조각을 빠뜨리지 마라. <DUMP>에 실제로 있는 내용만 다룬다.',
    '오직 JSON 배열만.'
  ].join('\n');
}

/**
 * 프롬프트 조립. opts.nodes(아웃라인 좌표)가 있으면 좌표 모드, 없으면 기존 <DUMP> 모드다.
 * 좌표 모드는 어휘 목록 + 노드당 다항목이라 출력이 길어져 토큰 상한을 넉넉히 준다.
 */
function buildClassifyPrompt(text, knownTags = [], opts = {}) {
  const cats = Array.from(new Set([...(knownTags || []), ...COMMON_CATEGORIES]));
  const nodes = Array.isArray(opts.nodes) ? opts.nodes.filter((n) => n && n.nodePath && n.text) : [];
  if (!nodes.length) {
    return {
      prompt: `${classifyInstruction(knownTags)}\n<DUMP>\n${text}\n</DUMP>`,
      maxOutputTokens: 2048,
      timeoutMs: Number(process.env.PMS_CLASSIFY_TIMEOUT_MS || 15000),
      nodes
    };
  }
  const predicates = Array.isArray(opts.predicates) ? opts.predicates.filter((p) => p && p.code) : [];
  const rendered = nodes.map((n) =>
    `[${n.nodePath}]${n.heading ? ` ${n.heading}` : ''}\n${n.text}`).join('\n\n');
  return {
    prompt: `${outlineInstruction(nodes, predicates, cats)}\n<NODES>\n${rendered}\n</NODES>`,
    maxOutputTokens: Number(process.env.PMS_CLASSIFY_MAX_TOKENS || 8192),
    // 좌표 모드는 어휘 44개 + 노드별 다항목이라 출력이 길다. 실메모에서 15초로는 끊긴다.
    timeoutMs: Number(process.env.PMS_CLASSIFY_OUTLINE_TIMEOUT_MS || 40000),
    nodes
  };
}

/**
 * nodePath 정돈. 모델이 "[1]"·"'1'"처럼 기호를 덧붙이는 일이 실제로 있었다 —
 * 좌표가 틀리면 PMS가 그 노드를 통짜로 저장해 분할이 무의미해지므로 여기서 되돌린다.
 * 그래도 모르는 좌표인데 노드가 하나뿐이면 그 노드로 본다(달리 갈 곳이 없다).
 */
function normalizeNodePaths(items, nodes) {
  if (!Array.isArray(items) || !nodes.length) return items;
  const known = new Set(nodes.map((n) => String(n.nodePath)));
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    let p = it.nodePath == null ? '' : String(it.nodePath).trim().replace(/^[[("'`]+|[\])"'`]+$/g, '').trim();
    if (!known.has(p)) p = nodes.length === 1 ? String(nodes[0].nodePath) : p;
    it.nodePath = p;
    // kind 칸에 route 값을 넣는 혼동이 실제로 있었다. PMS도 모르는 kind는 NOTE로 떨구지만 여기서 먼저 맞춘다.
    const kind = it.kind == null ? '' : String(it.kind).trim().toUpperCase();
    it.kind = KINDS.includes(kind) ? kind : 'NOTE';
    if (it.kind !== 'FIELD') it.predicate = null;
    const route = it.route == null ? '' : String(it.route).trim().toUpperCase();
    it.route = ROUTES.includes(route) ? route : null;
    // 품질 경고는 표시 전용이라 길이만 자른다. 객체·배열로 오면 버린다(PMS가 문자열만 받는다).
    it.warning = typeof it.warning === 'string' && it.warning.trim()
      ? it.warning.trim().slice(0, 200) : null;
  }
  return items;
}

async function classifyText(text, knownTags = [], opts = {}) {
  const { prompt, maxOutputTokens, timeoutMs, nodes } = buildClassifyPrompt(text, knownTags, opts);
  const t0 = Date.now();
  const res = await withRetry(() => callGemini([{ text: prompt }], {
    model: TEXT_MODEL, maxOutputTokens, timeoutMs
  }));
  const parsed = parsePayload(res.text);
  const items = normalizeNodePaths(parsed.items, nodes);
  return {
    items, clarify: parsed.clarify, elapsedMs: Date.now() - t0, model: TEXT_MODEL,
    err: items ? null : (res.err || 'no JSON array')
  };
}

const WBS_INSTRUCTION = [
  '이 이미지는 SI 프로젝트 WBS(엑셀) 화면이다. 두 가지를 JSON 객체로 출력하라: {"rows":[...],"notes":[...]}',
  'rows: 각 작업 행 {"level","name","start","end"} — level=들여쓰기 깊이(최상위 0), start/end=YYYY-MM-DD 또는 null. 위→아래 순서.',
  'notes: 우측 협조요청/비고 칸처럼 특정 행에 안 묶이는 프로젝트 전체 메모 문자열 배열.',
  '표에 없는 값은 지어내지 말고 null. 오직 JSON 객체만.'
].join('\n');

async function extractWbs(imageBase64, mime = 'image/jpeg') {
  const parts = [{ text: WBS_INSTRUCTION }, { inlineData: { mimeType: mime, data: imageBase64 } }];
  const t0 = Date.now();
  const res = await withRetry(() => callGemini(parts, { model: VISION_MODEL, maxOutputTokens: 8192, timeoutMs: 40000 }));
  let obj = null;
  if (res.text) { try { obj = JSON.parse(res.text); } catch { const m = res.text.match(/\{[\s\S]*\}/); if (m) try { obj = JSON.parse(m[0]); } catch {} } }
  const rows = obj?.rows || (Array.isArray(obj) ? obj : null);
  return { rows, notes: obj?.notes || [], elapsedMs: Date.now() - t0, model: VISION_MODEL, err: rows ? null : (res.err || 'no JSON') };
}

// ── FIND 생성형 답변 합성 (/pms/assistant-answer) ────────────────────────────
// PMS가 권한 선필터·redaction을 마친 citation만 보낸다(비밀값은 원래 안 옴 — secret=true는
// "비밀 값이 등록되어 있음" 고정 문자열). 실패 시 PMS가 extractive 답변으로 폴백하므로
// agy 폴백은 안 쓴다(대화형 응답에 수십초 지연은 부적합).
function answerInstruction(mode) {
  return [
    '당신은 사내 PMS 지식비서의 답변 합성기다. 아래 <QUESTION>에 대해 <CITATIONS>(권한 검증된 근거 목록)만 사용해 한국어로 답한다. JSON 객체로만 출력한다.',
    '출력: {"answer": string, "followUps": [string, ...]}',
    '- answer: 근거를 종합한 자연어 답변. 서술마다 근거 번호를 [1], [2] 형식으로 인용한다.',
    '- ★근거 밖 사실 생성 금지(최우선·엄수): <CITATIONS>에 없는 이름·값·날짜·연락처·사실을 지어내지 마라. 질문에 대한 근거가 부족하면 아는 범위만 답하고 부족하다고 명시해라.',
    '- [SECRET] 표시된 근거는 값이 감춰진 것이다("비밀 값이 등록되어 있음"). 값을 추측·창작하지 말고, 비밀 열람 기능으로 확인할 수 있다고만 안내해라.',
    mode === 'HISTORY'
      ? '- 이 질문은 변경 이력 조회다. 시간 순서를 살려 어떤 변경이 있었는지 요약해라.'
      : '- 답변 끝에 근거 내용에서 자연히 이어지는 선제 제안 한 문장을 덧붙여라(함께 확인하면 좋은 항목 등, 근거에 실제로 있는 것만).',
    '- followUps: 사용자가 이어서 물을 만한 짧은 후속 질문 2~3개(한국어).',
    '오직 JSON 객체만.'
  ].join('\n');
}

async function synthesizeAnswer(question, citations, mode = 'CURRENT') {
  const lines = (citations || []).map((c) =>
    `[${c.no}] (${c.sourceType || '?'}) ${c.breadcrumb || ''}${c.observedAt ? ` @${c.observedAt}` : ''}${c.secret ? ' [SECRET]' : ''}: ${c.excerpt || ''}`);
  const prompt = `${answerInstruction(mode)}\n<QUESTION>\n${question}\n</QUESTION>\n<CITATIONS>\n${lines.join('\n')}\n</CITATIONS>`;
  const t0 = Date.now();
  const res = await withRetry(() => callGemini([{ text: prompt }], { model: TEXT_MODEL, maxOutputTokens: 2048, timeoutMs: 12000 }));
  let obj = null;
  if (res.text) { try { obj = JSON.parse(res.text); } catch { const m = res.text.match(/\{[\s\S]*\}/); if (m) try { obj = JSON.parse(m[0]); } catch {} } }
  const answer = obj && typeof obj.answer === 'string' && obj.answer.trim() ? obj.answer.trim() : null;
  const followUps = Array.isArray(obj && obj.followUps)
    ? obj.followUps.filter((f) => typeof f === 'string' && f.trim()).slice(0, 3) : [];
  return { answer, followUps, elapsedMs: Date.now() - t0, model: TEXT_MODEL, err: answer ? null : (res.err || 'no JSON answer') };
}

// ── agy(월정액 세션) 백엔드 — API 키 쿼터 초과 시 폴백용 ────────────────────
// agy = Gemini 기반 에이전트 CLI. node-pty 로 print 모드 원샷 실행(server.js runAgyOnce 패턴).
// 무료 API 키(분당 20회)와 달리 월정액이라 쿼터 넉넉. 대신 수초~수십초 + 가끔 재시도.
const AGY_EXE = process.env.AGY_EXE_PATH || (process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
  : 'agy');

let _pty = null;
function getPty() {
  if (_pty === null) { try { _pty = require('node-pty'); } catch { _pty = false; } }
  return _pty;
}

function cleanAnsi(s) {
  return String(s || '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r/g, '');
}

// agy print 모드 1회 실행 → 원시 출력 수집(비스트리밍). pty 미탑재/실행실패는 err 로 알린다.
function runAgyPrint(prompt, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const pty = getPty();
    if (!pty) return resolve({ raw: '', err: 'node-pty 미탑재' });
    let raw = '', done = false, term;
    const finish = (err) => { if (done) return; done = true; clearTimeout(timer); try { term && term.kill(); } catch {} resolve({ raw, err }); };
    const timer = setTimeout(() => finish(`agy timeout ${timeoutMs}ms`), timeoutMs);
    try {
      term = pty.spawn(AGY_EXE, ['--dangerously-skip-permissions', '--print-timeout', '5m', '-p', prompt],
        { name: 'xterm-color', cols: 20000, rows: 40, env: process.env });
    } catch (e) { return finish(`agy spawn 실패: ${e.message}`); }
    term.onData((d) => { raw += d; });
    term.onExit(({ exitCode }) => finish(exitCode === 0 || raw ? null : `agy exit ${exitCode}`));
  });
}

async function classifyTextAgy(text, knownTags = [], opts = {}) {
  const { prompt, nodes } = buildClassifyPrompt(text, knownTags, opts);
  const t0 = Date.now();
  let items = null, clarify = [], err = null;
  for (let attempt = 0; attempt < 2 && !items; attempt++) {   // agy 비결정성 대비 1회 재시도
    const r = await runAgyPrint(prompt);
    if (r.err && !r.raw) { err = r.err; continue; }
    const parsed = parsePayload(cleanAnsi(r.raw));
    items = normalizeNodePaths(parsed.items, nodes);
    clarify = parsed.clarify;
    if (!items) err = r.err || 'agy: JSON 배열 없음';
  }
  return { items, clarify, elapsedMs: Date.now() - t0, model: 'agy', err: items ? null : err };
}

function isQuota(err) { return /RESOURCE_EXHAUSTED|quota|rate.?limit|\b429\b/i.test(err || ''); }

// 하이브리드: API 키 먼저(빠름), 실패(특히 쿼터)면 agy 로 폴백.
async function classifyHybrid(text, knownTags = [], opts = {}) {
  const api = await classifyText(text, knownTags, opts);
  if (api.items) return api;
  const agy = await classifyTextAgy(text, knownTags, opts);
  if (agy.items) {
    return {
      items: agy.items, clarify: agy.clarify, elapsedMs: agy.elapsedMs,
      model: 'agy(fallback)', err: null, apiErr: api.err
    };
  }
  return { items: null, elapsedMs: (api.elapsedMs || 0) + (agy.elapsedMs || 0), model: 'api+agy', err: `api:${api.err} | agy:${agy.err}` };
}

// 백엔드 선택: PMS_CLASSIFY_BACKEND = hybrid(기본) | api | agy
function classify(text, knownTags = [], opts = {}) {
  const backend = (process.env.PMS_CLASSIFY_BACKEND || 'hybrid').toLowerCase();
  if (backend === 'api') return classifyText(text, knownTags, opts);
  if (backend === 'agy') return classifyTextAgy(text, knownTags, opts);
  return classifyHybrid(text, knownTags, opts);
}

module.exports = {
  loadKey, callGemini, buildClassifyPrompt, parsePayload, classifyText, classifyTextAgy, classifyHybrid, classify,
  isQuota, extractWbs, synthesizeAnswer, TEXT_MODEL, VISION_MODEL, AGY_EXE
};
