// 질문 명확화(되묻기) 트리아지 — 엔티티 인덱스 retrieval → 확신/모호 판정 → flash-lite 자연어 되묻기
'use strict';
const https = require('https');
const idx = require('./entityIndexBuilder');

const CLARIFY_MODEL = 'gemini-3.1-flash-lite'; // thinking off, ~0.8s (실측 D-9)

// 버전중복 collapse: PopDevRepository_20231220 → PopDevRepository
function baseName(n) {
  return n.replace(/_\d{6,8}$/, '').replace(/_\d+$/, '');
}

// 같은 base 이름(버전중복) 합치기 — 최고점만 남김
function dedupCandidates(top) {
  const seen = new Set(); const out = [];
  for (const t of top) {
    const b = baseName(t.name).toLowerCase();
    if (seen.has(b)) continue;
    seen.add(b); out.push(t);
  }
  return out;
}

// gemini 단발 generateContent (무료, thinking off)
function generateContent(prompt, apiKey, model = CLARIFY_MODEL, jsonResponse = false) {
  const generationConfig = { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 300 };
  if (jsonResponse) generationConfig.responseMimeType = "application/json";

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${(apiKey || '').trim()}`;
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => {
      let b = ''; r.on('data', c => b += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve({ text: j.candidates?.[0]?.content?.parts?.[0]?.text?.trim(), err: j.error?.status });
        } catch (e) { resolve({ err: 'parse' }); }
      });
    });
    req.on('error', e => resolve({ err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ err: 'timeout' }); });
    req.write(body); req.end();
  });
}

// 503/429 재시도 1회 래퍼 → JSON 파싱까지 (실패 시 null)
async function judgeJson(prompt, apiKey) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const g = await generateContent(prompt, apiKey, CLARIFY_MODEL, true);
    if (g.text) {
      try { return JSON.parse(g.text); }
      catch (e) { console.warn('[Clarify] JSON 파싱 실패:', e.message); }
    }
    if (!/RESOURCE_EXHAUSTED|UNAVAILABLE|503|429/.test(g.err || '')) break;
  }
  return null;
}

// 코드심볼이 top1 로 유일 수렴하는가 — top1 의 영문심볼 hit 을 top2 는 못 가짐 → LLM 없이 확신 (실측 fast-path)
function strongSymHits(c) {
  return new Set((c.hits || []).filter(h => /^[A-Za-z][A-Za-z0-9_]{2,}$/.test(h)));
}
function symbolConverges(top1, top2) {
  const s1 = strongSymHits(top1);
  if (!s1.size) return false;
  const s2 = top2 ? strongSymHits(top2) : new Set();
  for (const h of s1) if (!s2.has(h)) return true; // top1 단독 코드심볼 존재
  return false;
}

// round1 게이트 — 후보셋+질문으로 3-boolean(범위밖/의도명확/대상수렴) + 되묻기문장/버튼라벨 (실측 검증 프롬프트)
async function judgeGate(question, candidates, apiKey) {
  const cd = candidates.slice(0, 6).map(c => {
    const label = c.label && c.label !== c.name ? c.label : c.name;
    const hit = (c.hits || []).length ? ` [hit: ${c.hits.join(',')}]` : '';
    return { id: c.name, line: `- id=${c.name} | ${label}${hit}` };
  });
  const prompt = `너는 eCAMS 코드분석 AI의 "질문 게이트" 단계다. 사용자 질문과, 임베딩 검색으로 뽑힌 후보 화면 목록을 보고 판정하라.
검색은 노이즈가 섞인다 — 질문과 무관한 후보(예: 단어 우연 일치)가 끼어 있을 수 있으니 무관한 후보는 무시하라.

1. outOfScope: 질문이 특정 화면/코드가 아니라 서버 인프라·OS 패치·일반 잡담이면 true.
2. intentClear: 질문에 "무엇을/어떤 증상인지"가 행동 가능할 만큼 구체적이면 true. "오류 봐줘", "문제 확인해줘" 같은 막연한 표현만이면 false.
3. targetConverges: 질문이 후보 중 **하나의 화면을 명확히 지목**하면 true(나머지 후보가 무관해 보여도 무시). 질문이 여러 후보에 똑같이 해당돼 어느 하나로 못 좁히면 false. true 면 그 화면의 id 를 targetId 에 넣어라(반드시 후보 id 중 하나).

intentClear 와 targetConverges 가 모두 true 가 아니면, 사용자에게 범위를 좁히도록 자연스러운 되묻기 1문장(clarify)과 친절한 버튼라벨(options)을 생성하라.
options 에는 **질문과 관련 있는 후보만** 넣어라(우연히 단어만 겹친 무관한 후보는 제외). clarify 는 코드/파일명을 노출하지 말고 실제 기능을 구체적으로 언급하라. targetConverges 가 false 면 "어느 화면이요?" 식으로, intentClear 가 false 면 "무엇이 궁금하세요?" 식으로 물어라.

[후보 화면 (검색 점수순, hit=질문과 겹친 키워드)]
${cd.map(c => c.line).join('\n')}

[사용자 질문]
${question}

[응답 형식 (반드시 JSON)]
{
  "outOfScope": bool,
  "intentClear": bool,
  "targetConverges": bool,
  "targetId": "targetConverges 가 true 면 지목한 후보 id, 아니면 null",
  "clarify": "되묻기 1문장 (코드/파일명 금지)",
  "options": [ { "id": "후보 id 와 동일", "label": "짧고 친절한 버튼 텍스트" } ]
}`;

  const p = await judgeJson(prompt, apiKey);
  if (!p) return null;
  if (Array.isArray(p.options)) {
    p.options.forEach(opt => {
      const cand = candidates.find(c => c.name === opt.id);
      if (cand) cand.friendlyLabel = opt.label;
    });
  }
  const targetId = p.targetId && candidates.find(c => c.name === p.targetId) ? p.targetId : null; // 후보에 있는 id 만 신뢰
  return { outOfScope: !!p.outOfScope, intentClear: !!p.intentClear, targetConverges: !!p.targetConverges, targetId, clarify: p.clarify };
}

// locked 재판정 — 화면 고정 상태에서 의도 명확도만 (retrieval/수렴 무관, 멀티턴 좁히기)
async function judgeLocked(question, screenLabel, apiKey) {
  const prompt = `너는 eCAMS 코드분석 AI의 "질문 게이트" 단계다. 사용자가 이미 "${screenLabel}" 화면을 선택했다.
이제 그 화면 맥락에서 사용자 질문이 분석을 시작할 만큼 충분히 구체적인지(intentClear) 판정하라.
"오류 봐줘", "문제 확인해줘" 처럼 무엇이 궁금한지 막연하면 false. 구체적 증상·기능·요구가 있으면 true.
false 면 "${screenLabel}" 화면에서 무엇이 궁금한지 묻는 자연스러운 되묻기 1문장(clarify)을 코드/파일명 없이 생성하라.

[사용자 질문]
${question}

[응답 형식 (반드시 JSON)]
{ "intentClear": bool, "clarify": "되묻기 1문장" }`;
  const p = await judgeJson(prompt, apiKey);
  if (!p) return null;
  return { intentClear: !!p.intentClear, clarify: p.clarify };
}

// 인덱스 없는 repo(서버·플러그인·미빌드 web) — 후보 없이 질문만으로 의도/범위밖 판정 (B: 범용 의도게이트)
async function judgeIntentOnly(question, apiKey, history = []) {
  // 되묻기 멀티턴: 사용자가 이전 되묻기에 답하며 나눠 설명한 발화를 누적해서 종합 판정 (단답이 고립 판정돼 무한 되묻기 빠지는 것 방지, 실측 검증)
  const userTurns = (history || []).filter(m => m && m.role === 'user' && typeof m.content === 'string').map(m => m.content.trim()).filter(Boolean);
  const hasHist = userTurns.length > 0;
  const convo = hasHist
    ? [...userTurns, question].map((t, i, arr) =>
        `${i === 0 ? '[처음 질문]' : i === arr.length - 1 ? '[현재 추가설명]' : '[추가설명 ' + i + ']'} ${t}`).join('\n')
    : question;
  const prompt = `너는 eCAMS 코드분석 AI의 "질문 게이트" 단계다. (이 프로젝트는 화면 인덱스가 없어 후보 화면을 제시할 수 없다.)
${hasHist
    ? '사용자가 되묻기에 답하며 여러 번에 걸쳐 설명했다. 아래 발화 전체를 종합해서 판정하라.'
    : '사용자 질문만 보고 판정하라.'}
1. outOfScope: 질문이 특정 코드/화면이 아니라 서버 인프라·OS 패치·일반 잡담이면 true.
2. intentClear: "어떤 화면/기능에서 무슨 증상·요구인지"가 분석을 시작할 만큼 구체적이면 true. "오류나 확인해줘", "문제 봐줘" 처럼 화면·증상이 막연하면 false.
intentClear 가 false 면, 사용자가 어떤 화면/기능에서 무슨 문제인지 직접 적도록 자연스러운 되묻기 1문장(clarify)을 코드/파일명 없이 생성하라.

[사용자 발화${hasHist ? ' (누적)' : ''}]
${convo}

[응답 형식 (반드시 JSON)]
{ "outOfScope": bool, "intentClear": bool, "clarify": "되묻기 1문장" }`;
  const p = await judgeJson(prompt, apiKey);
  if (!p) return null;
  return { outOfScope: !!p.outOfScope, intentClear: !!p.intentClear, clarify: p.clarify };
}

// 엔티티명 → 사람이 읽을 화면명 (locked 재질문 문장용)
function lookupLabel(repoId, name) {
  try {
    const ix = idx.loadIndex(repoId);
    const e = (ix?.entries || []).find(x => x.name === name);
    const l = e?.label;
    return l && l !== name && !idx.isGarbageLabel(l) ? l : name;
  } catch (e) { return name; }
}

// 메인: 질문 → { mode, ... }
//  confident   : 타깃 1개 확정 → 바로 답변 스테이지
//  clarify     : 자연어 되묻기 문장 → 사용자에게 (intentClear/targetConverges 동봉)
//  passthrough : 인덱스 무관(인프라·일반) → 되묻기 없이 바로 답변
//  no_index    : 인덱스 없음 → 기존 경로 fallback
//  lockedTarget: 사용자가 화면 선택 후 재전송 → 화면 고정한 채 의도 명확도만 재판정
async function triage(repoId, question, apiKey, lockedTarget = null, history = [], topK = 6) {
  // locked 모드 — 화면 고정, 의도 명확도만 (멀티턴 좁히기)
  if (lockedTarget) {
    const g = await judgeLocked(question, lookupLabel(repoId, lockedTarget), apiKey);
    if (!g) return { mode: 'confident', target: { name: lockedTarget }, _judgeFailed: true }; // graceful
    if (g.intentClear) return { mode: 'confident', target: { name: lockedTarget } };
    return { mode: 'clarify', clarify: g.clarify, lockedTarget, intentClear: false };
  }

  const raw = await idx.queryIndex(repoId, question, apiKey, topK);
  if (!raw.length) {
    // 인덱스 없음 → 범용 의도게이트(B): 후보 없이 의도만 판정 (서버·플러그인·미빌드 web 포함). history 누적해 멀티턴 좁히기
    const g = await judgeIntentOnly(question, apiKey, history);
    if (!g) return { mode: 'no_index' };           // LLM 실패 → 기존 경로(되묻기 없이 진행)
    if (g.outOfScope) return { mode: 'passthrough' };
    if (g.intentClear) return { mode: 'no_index' }; // 구체적(누적 종합) → 기존 경로로 바로 분석(타깃 힌트 없음)
    // backstop — 이미 여러 번 되물었는데도 막연하면 강제 진행(무한 루프 방지). history 누적이 정상이면 보통 그 전에 intentClear 로 풀림
    const priorUserTurns = (history || []).filter(m => m && m.role === 'user').length;
    if (priorUserTurns >= 3) return { mode: 'no_index' };
    return { mode: 'clarify', clarify: g.clarify, intentClear: false, candidates: [] };
  }
  const cands = dedupCandidates(raw);
  const top1 = cands[0], top2 = cands[1];

  // fast-path — 코드심볼이 top1 로 유일 수렴 → LLM 0회 확신
  if (symbolConverges(top1, top2)) {
    return { mode: 'confident', target: top1, candidates: cands, _fast: true };
  }

  // 2신호 AND 게이트
  const g = await judgeGate(question, cands, apiKey);
  if (!g) return { mode: 'confident', target: top1, candidates: cands, _judgeFailed: true }; // 실패 → graceful 즉답
  if (g.outOfScope) return { mode: 'passthrough', candidates: cands };
  if (g.intentClear && g.targetConverges) {
    const target = (g.targetId && cands.find(c => c.name === g.targetId)) || top1; // LLM 지목 후보 우선(점수 노이즈 회피)
    return { mode: 'confident', target, candidates: cands };
  }
  // 버튼은 LLM 이 관련 있다고 option 을 준 후보만 노출(검색 노이즈 제거). 하나도 없으면 전체 폴백
  const shown = cands.filter(c => c.friendlyLabel);
  return { mode: 'clarify', clarify: g.clarify, intentClear: g.intentClear, targetConverges: g.targetConverges, candidates: shown.length ? shown : cands };
}

module.exports = { triage, judgeGate, judgeLocked, generateContent, baseName, dedupCandidates };
