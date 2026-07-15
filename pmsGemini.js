'use strict';
/**
 * pmsGemini.js — PMS용 Gemini 호출 코어 (분류 + WBS 비전). azbrain RAG와 무관.
 * clarifier.js 패턴: https 직접호출, thinking off, JSON 강제. 무료 GEMINI_API_KEY 재사용.
 * CLI 프로브(pmsClassifyGemini.js / wbsVisionTest.js)와 브릿지(pmsBridge.js)가 공유.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

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

function parseArray(text) {
  if (!text) return null;
  let j; try { j = JSON.parse(text); } catch { const m = text.match(/\[[\s\S]*\]/); if (!m) return null; try { j = JSON.parse(m[0]); } catch { return null; } }
  if (Array.isArray(j)) return j;
  return j.items || j.rows || j.results || null;
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

async function classifyText(text, knownTags = []) {
  const prompt = `${classifyInstruction(knownTags)}\n<DUMP>\n${text}\n</DUMP>`;
  const t0 = Date.now();
  const res = await withRetry(() => callGemini([{ text: prompt }], { model: TEXT_MODEL, maxOutputTokens: 2048, timeoutMs: 15000 }));
  const items = parseArray(res.text);
  return { items, elapsedMs: Date.now() - t0, model: TEXT_MODEL, err: items ? null : (res.err || 'no JSON array') };
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

module.exports = { loadKey, callGemini, classifyText, extractWbs, TEXT_MODEL, VISION_MODEL };
