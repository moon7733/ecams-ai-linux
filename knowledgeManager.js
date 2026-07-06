const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR);

const MAX_ENTRIES_PER_REPO = 500;
const MAX_INJECT_BYTES = 10 * 1024; // 프롬프트 주입 최대 10KB

function getKnowledgePath(repoId) {
  return path.join(KNOWLEDGE_DIR, repoId.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_knowledge.json');
}

function loadKnowledge(repoId) {
  try {
    const p = getKnowledgePath(repoId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch(e) {}
  return [];
}

function saveKnowledge(repoId, entries) {
  fs.writeFileSync(getKnowledgePath(repoId), JSON.stringify(entries, null, 2), 'utf8');
}

const STOP_WORDS = new Set([
  '있는', '없는', '하면', '에서', '으로', '하는', '때', '이', '가', '을', '를',
  '의', '은', '는', '도', '에', '로', '와', '과', '하고', '하여', '했어',
  '어떻게', '무엇', '어떤', '어디', '왜', '언제', '누가', '관련', '대해서',
  '하는데', '했는데', '이거', '이게', '그게', '뭐가', '해줘', '알려줘',
  '있어', '있나요', '있니', '뭐있어', '사용하는', '어떤게', '알려주세요', '말해줘'
]);

// 코사인 유사도 계산
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) return 0;
  let dotProduct = 0, mA = 0, mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(mA) * Math.sqrt(mB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// 임베딩 생성 (Gemini)
async function getEmbedding(text, apiKey) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) return null;

  return new Promise((resolve) => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${cleanKey}`;
      const postData = JSON.stringify({
        content: {
          parts: [{ text: text.substring(0, 5000) }]
        }
      });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      };

      const req = https.request(url, options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.embedding && data.embedding.values) {
              resolve(data.embedding.values);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.write(postData);
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

// 두 단어 사이의 유사도를 측정 (프러시저 vs 프로시저 대응)
function getSimilarity(s1, s2) {
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s2.includes(s1[i])) matches++;
  }
  return matches / Math.max(s1.length, s2.length);
}

function extractKeywords(text) {
  const words = text.split(/[\s,\.!?;:()\[\]{}'"\/\\+\-=]+/).filter(w => w.length >= 2);
  const keywords = new Set();
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    
    const upperW = w.toUpperCase();
    // 영문 CamelCase / 파일명 / DB 테이블명
    if (/^[A-Z][a-zA-Z0-9_]+$/.test(upperW) && w.length >= 3) keywords.add(w.toLowerCase());
    // DB 테이블명 패턴 (CMR1000, cmr1800 등 대소문자 모두 대응)
    if (/^[A-Z]{2,}\d{3,}/.test(upperW)) keywords.add(w.toLowerCase());
    // .jsp .java .js 파일명
    if (/\.(jsp|java|js)$/i.test(w)) keywords.add(w.toLowerCase());
    // 한국어 명사로 추정 (2~6글자)
    if (/^[가-힣]{2,6}$/.test(w) && !STOP_WORDS.has(w)) keywords.add(w);
  }
  return [...keywords];
}

function extractSummary(answer) {
  // ## 6. 추천 추가 질문 섹션은 제거하고 저장 (불필요한 내용)
  const withoutRecommend = answer.replace(/##\s*6[.\s]*추천[\s\S]*$/i, '').trim();
  // 전체 답변을 최대 4000자로 저장 (결론만 저장하면 Claude가 또 파일을 읽으러 감)
  return withoutRecommend.substring(0, 4000);
}

function scoreEntry(entry, questionKeywords, questionVector) {
  const qSet = new Set(questionKeywords.map(k => k.toLowerCase()));
  const entryKeywords = entry.keywords || [];
  const entryQuestionKeywords = extractKeywords(entry.question || '');
  const entryWords = new Set([...entryKeywords, ...entryQuestionKeywords].map(k => k.toLowerCase()));

  let lexicalScore = 0;
  for (const qk of qSet) {
    if (entryWords.has(qk)) {
      lexicalScore += 2.5;
    } else {
      for (const ew of entryWords) {
        if (getSimilarity(qk, ew) > 0.7) { lexicalScore += 2.0; break; }
        if (ew.includes(qk) || qk.includes(ew)) { lexicalScore += 1.0; break; }
      }
    }
  }

  // 벡터 유사도 점수 (0~1 사이 값을 10점 만점으로 환산)
  let vectorScore = 0;
  if (questionVector && entry.vector) {
    const similarity = cosineSimilarity(questionVector, entry.vector);
    // 유사도 0.7 이하는 무시, 그 이상부터 점수 부여
    if (similarity > 0.7) {
      vectorScore = (similarity - 0.7) * (10 / 0.3); // 0.7~1.0 -> 0~10점
    }
  }

  return lexicalScore + vectorScore;
}

async function addKnowledge(repoIds, question, answer, apiKey) {
  if (!answer || answer.length < 100) return;
  const summary = extractSummary(answer);
  const keywords = extractKeywords(question + ' ' + summary);
  
  // 벡터 생성
  const vector = await getEmbedding(question, apiKey);

  const entry = {
    date: new Date().toISOString(),
    question: question.substring(0, 200),
    summary,
    keywords,
    vector // 벡터 저장
  };

  for (const repoId of repoIds) {
    const entries = loadKnowledge(repoId);
    entries.push(entry);
    if (entries.length > MAX_ENTRIES_PER_REPO) {
      entries.splice(0, entries.length - MAX_ENTRIES_PER_REPO);
    }
    saveKnowledge(repoId, entries);
  }
  console.log(`[Knowledge] Saved with Vector for repos: ${repoIds.join(', ')}`);
}

async function getRelevantKnowledge(question, repoIds, apiKey) {
  const questionKeywords = extractKeywords(question);
  if (questionKeywords.length === 0) return '';

  // 질문의 벡터 생성
  const questionVector = await getEmbedding(question, apiKey);

  const candidates = [];
  console.log(`[Knowledge] Searching for: [${questionKeywords.join(', ')}] with Vector`);
  for (const repoId of repoIds) {
    const entries = loadKnowledge(repoId);
    for (const entry of entries) {
      const score = scoreEntry(entry, questionKeywords, questionVector);
      if (score >= 3) {
        console.log(`[Knowledge] Match found in ${repoId}: totalScore=${score.toFixed(1)}, Q="${entry.question.substring(0,30)}..."`);
        candidates.push({ ...entry, score, repoId });
      }
    }
  }

  if (candidates.length === 0) return '';

  // 점수 내림차순, 동점이면 최신순
  candidates.sort((a, b) => b.score - a.score || new Date(b.date) - new Date(a.date));

  const topScore = candidates[0].score;
  // 최고점이 높을수록 강한 금지 지시 (벡터 검색이 도입되었으므로 기준 7점으로 상향)
  const isHighConfidence = topScore >= 7.0;
  const headerInstruction = isHighConfidence
    ? '> ⛔ **[긴급] 도구 사용 금지**: 현재 질문에 대한 정확한 해답이 이미 아래 "과거 분석"에 존재합니다. Grep, Read, Glob 등 어떤 도구도 호출하지 말고, 아래 내용을 바탕으로 즉시 답변하십시오. 파일을 다시 읽는 것은 시간과 자원 낭비입니다.\n'
    : '> 아래는 과거에 확인된 사실입니다. 새로운 분석을 수행하기 전에 이 내용을 우선적으로 참고하십시오.\n';

  let result = '## [과거 분석에서 발견된 관련 지식]\n';
  result += headerInstruction + '\n';

  let totalBytes = Buffer.byteLength(result, 'utf8');
  let count = 0;

  for (const entry of candidates) {
    const block = `### 이전 질문: "${entry.question}"\n${entry.summary}\n*(${entry.date.substring(0, 10)}, ${entry.repoId})*\n\n`;
    const blockBytes = Buffer.byteLength(block, 'utf8');
    if (totalBytes + blockBytes > MAX_INJECT_BYTES) break;
    result += block;
    totalBytes += blockBytes;
    count++;
  }

  console.log(`[Knowledge] Injecting ${count} entries, topScore=${topScore}, highConfidence=${isHighConfidence} (${(totalBytes/1024).toFixed(1)}KB)`);
  return result;
}

// ===== 엔드유저 가이드 store (별도 파일 — 개발자 QA 지식과 분리, 결정 76) =====
// 이유. (1) addKnowledge 의 500개 front-splice 가 가이드를 같은 파일에 넣으면 QA 지식을 밀어냄
//       (2) getRelevantKnowledge(개발자 hot path) 무손상  (3) 가이드는 청크 본문을 임베딩(question 없음)
const MAX_GUIDE_ENTRIES_PER_REPO = 3000;
const GUIDE_MIN_SIM = 0.65; // 가이드 검색 임계값 (벡터 only)

function getGuidePath(repoId) {
  return path.join(KNOWLEDGE_DIR, repoId.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_guide.json');
}

function loadGuide(repoId) {
  try {
    const p = getGuidePath(repoId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return [];
}

function saveGuide(repoId, entries) {
  fs.writeFileSync(getGuidePath(repoId), JSON.stringify(entries, null, 2), 'utf8');
}

// 가이드 문서 청크들을 임베딩하여 저장. 임베딩 실패 청크는 검색 불가하므로 저장하지 않음(half-write 방지).
async function addGuideChunks(repoId, source, chunkTexts, apiKey) {
  const entries = loadGuide(repoId);
  let added = 0;
  for (const raw of chunkTexts) {
    const text = (raw || '').trim();
    if (text.length < 20) continue;
    const vector = await getEmbedding(text, apiKey);
    if (!vector) continue;
    entries.push({ date: new Date().toISOString(), source, text: text.substring(0, 4000), vector, type: 'guide' });
    added++;
  }
  if (entries.length > MAX_GUIDE_ENTRIES_PER_REPO) {
    entries.splice(0, entries.length - MAX_GUIDE_ENTRIES_PER_REPO);
  }
  saveGuide(repoId, entries);
  console.log(`[Guide] ${repoId} ← "${source}": ${added}개 청크 저장`);
  return added;
}

// 엔드유저 질문에 대해 가이드 store 만 검색 (벡터 유사도). 개발자 QA 지식은 섞지 않음.
async function getGuideKnowledge(question, repoIds, apiKey) {
  const qv = await getEmbedding(question, apiKey);
  if (!qv) return '';

  const cands = [];
  for (const repoId of repoIds) {
    for (const e of loadGuide(repoId)) {
      if (!e.vector) continue;
      const sim = cosineSimilarity(qv, e.vector);
      if (sim >= GUIDE_MIN_SIM) cands.push({ source: e.source, text: e.text, sim });
    }
  }
  if (cands.length === 0) return '';
  cands.sort((a, b) => b.sim - a.sim);

  let result = '# [사용 가이드 문서에서 찾은 내용]\n';
  result += '> 아래는 업로드된 사용자/운영자 가이드에서 발췌한 내용입니다. 이 내용을 근거로 화면 조작 절차를 안내하되, 여기에 없는 버튼·메뉴·절차는 지어내지 마십시오.\n\n';
  let totalBytes = Buffer.byteLength(result, 'utf8');
  let count = 0;
  for (const c of cands) {
    const block = `### 출처: ${c.source}\n${c.text}\n\n`;
    const blockBytes = Buffer.byteLength(block, 'utf8');
    if (totalBytes + blockBytes > MAX_INJECT_BYTES) break;
    result += block;
    totalBytes += blockBytes;
    count++;
    if (count >= 6) break;
  }
  console.log(`[Guide] Injecting ${count} chunk(s), topSim=${cands[0].sim.toFixed(3)}`);
  return result;
}

function getAllKnowledge(repoIds) {
  const result = {};
  for (const repoId of repoIds) {
    const entries = loadKnowledge(repoId);
    result[repoId] = { count: entries.length, entries: entries.slice(-20) }; // 최근 20개만 반환
  }
  return result;
}

function clearKnowledge(repoId) {
  const p = getKnowledgePath(repoId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { addKnowledge, getRelevantKnowledge, getAllKnowledge, clearKnowledge, getEmbedding, cosineSimilarity, addGuideChunks, getGuideKnowledge };
