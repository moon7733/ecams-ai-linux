// 결정 68 (2026-05-21) — 3 모델 × 5 질문 정량 측정 스크립트 (Haiku / Sonnet / Sonnet+Haiku)
// 2026-06-01 확장: Q5/Q6/Q7 추가 (agy 도메인 variance 검증), --qid 다중 지원 (콤마 구분)
// 사용법: MEASURE_USER=xx MEASURE_PASS=yy node scripts/measure-decision-68.js [--dry-run] [--qid=Q4 또는 --qid=Q5,Q6,Q7]
// 사전 조건: PM2 ecams-bot 가 USE_REPO_MAP=true DISABLE_ANSWER_CACHE=true 로 기동 중

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const MEASURE_USER = process.env.MEASURE_USER;
const MEASURE_PASS = process.env.MEASURE_PASS;
const MODELS = (process.env.MODELS || 'haiku,sonnet,sonnet+haiku').split(',').map(s => s.trim());
const REPOS_OVERRIDE = process.env.REPOS ? process.env.REPOS.split(',').map(s => s.trim()) : null;
const DRY_RUN = process.argv.includes('--dry-run');
const QID_FILTER_RAW = (process.argv.find(a => a.startsWith('--qid=')) || '').split('=')[1] || null;
const QID_FILTER = QID_FILTER_RAW ? QID_FILTER_RAW.split(',').map(s => s.trim()) : null;

if (!MEASURE_USER || !MEASURE_PASS) {
  console.error('필수 env 누락: MEASURE_USER, MEASURE_PASS');
  process.exit(1);
}

const QUESTIONS = [
  {
    qid: 'Q0',
    text: '결재자 정보 팝업화면에서 결재자 변경 가능 경우알려줘',
    domain: 'JS 화면 깊이 (기준선)',
    keywords: ['PopApprovalInfo', 'updateProc', 'teamcd2', 'reqSta', 'strAdmin'],
  },
  {
    qid: 'Q1',
    text: '운영배포신청화면에서 알럿창중에 "체크아웃취소 된 프로그램" 으로 시작하는 알럿창이 뜸. 왜그런거야?',
    domain: 'JS → SQL 다층',
    keywords: ['chk_SrCheckOutCancel', 'Cmr0200', '체크아웃취소', 'SR'],
  },
  {
    qid: 'Q2',
    text: `select 쿼리 하나 만들어줘.
25년1월1일부터 25년 12월 말일까지 신청된 신청건에 대한 정보를 뽑아줘
운영배포 신청건중 신청 완료된 신청건만 뽑아
시스템코드는 바꿔서 입력가능하게
뽑아야할 컬럼값들은
a. 신청번호
b. 시스템명
c. 운영적용요청상세 팝업창에서 나오는 처리구분
d. 신청사유
e. 요청자(요청자부서)
f. 신청건 요청일시
g. 신청건 완료일시
h. 해당 신청건의 결재라인중 부장결재라인의 결재자이름
i. 해당 신청건의 결재라인중 부장결재라인의 결재완료시간
j. 해당 신청건의 결재라인중 팀장결재라인의 결재자이름
k. 해당 신청건의 결재라인중 팀장결재라인의 결재완료시간
l. 해당 신청건의 결재라인중 PL결재라인의 결재자이름
m. 해당 신청건의 결재라인중 PL결재라인의 결재완료시간
n. 해당 신청건의 결재라인중 개발품질관리자 결재라인의 결재자이름
o. 해당 신청건의 결재라인중 개발품질관리자 결재라인의 결재완료시간

h~o 항목에서 참고할것. cmr9900의 cr_team은 각
팀장 41
부장 31
PL 54
개발품질 92`,
    domain: 'pure DB + 코드 매핑',
    keywords: ['cmr1000', 'cmr9900', 'cr_team', "'41'", "'31'", "'54'", "'92'", 'cr_qrycd', "'04'", 'cr_confusr', 'cr_confdate', 'cr_locat'],
  },
  {
    qid: 'Q3',
    text: '형상관리 프로세스 흐름을 알려줘, 체크아웃부터 운영배포까지. 그리고 신청건은 어떻게 처리되는거야?',
    domain: '프로세스 도메인',
    keywords: ['체크아웃', '체크인', '테스트배포', '운영배포', 'ecams_mgr'],
  },
  {
    qid: 'Q4',
    text: '운영적용요청상세 화면에서 프로그램 하나만 오류가 발생했을경우 프로그램 하나만 회수하는방법 있어?',
    domain: 'UI 인터랙션',
    keywords: ['프로그램목록', '개별회수'],
  },
  // 2026-06-01 추가 — agy 도메인 variance 검증 (사용자 직접 본문 평가, 키워드 자동 채점 미사용)
  {
    qid: 'Q5',
    text: '개발툴연계화면에서 프로그램종류 추가해서 조회하려면 어디어디 수정해야돼?',
    domain: '비즈니스 로직 수정 영향도',
    keywords: [],
  },
  {
    qid: 'Q6',
    text: '시스템정보화면에서 시스템 폐기시 보고서 화면들에 어떤영향이 가?',
    domain: '환경설정 영향도 파악',
    keywords: [],
  },
  {
    qid: 'Q7',
    text: 'cmc0100에 insert되는 sr들이 어디서 insert되는지 확인해줘',
    domain: '타 시스템 연계 추적',
    keywords: [],
  },
];

// 결정 67 등 과거에 식별된 환각 entity — 신규 발견용 blacklist
const NOVEL_HALLUCINATION_BLACKLIST = ['ApprovalModal', 'getRequestList', 'screen_map', 'CopyApprovalInfoModal'];

async function login() {
  const { data } = await axios.post(`${SERVER_URL}/api/login`, { id: MEASURE_USER, password: MEASURE_PASS });
  return { token: data.token, repos: Object.keys(data.repos || {}) };
}

function parseSSELine(line) {
  if (!line.startsWith('data: ')) return null;
  try { return JSON.parse(line.slice(6)); } catch { return null; }
}

async function askOnce({ token, repos, model, question }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let answerFromText = '';
    let answerFromDone = '';
    let lastElapsed = null;
    let lastUsage = null;
    let toolCallStatusCount = 0;
    let buffer = '';

    axios.post(`${SERVER_URL}/api/chat`, {
      message: question.text,
      repos,
      history: [],
      model,
      fastMode: false,
      concise: false,
    }, {
      headers: { 'Authorization': 'Bearer ' + token },
      responseType: 'stream',
      timeout: 15 * 60 * 1000,
    }).then(resp => {
      resp.data.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const ln of lines) {
          const obj = parseSSELine(ln);
          if (!obj) continue;
          if (obj.type === 'text') answerFromText += obj.text;
          if (obj.type === 'status' && /📄|🔍|📁|🔧|⚙️|🌐/.test(obj.text || '')) toolCallStatusCount++;
          if (obj.type === 'elapsed') { lastElapsed = obj.seconds; lastUsage = obj.usage; }
          if (obj.type === 'done') answerFromDone = obj.answer;
          if (obj.type === 'error') reject(new Error(obj.text || 'server error'));
        }
      });
      resp.data.on('end', () => {
        const wallSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        resolve({
          answer: answerFromDone || answerFromText,
          seconds: lastElapsed || wallSeconds,
          wallSeconds,
          usage: lastUsage,
          toolCallStatusCount,
        });
      });
      resp.data.on('error', reject);
    }).catch(reject);
  });
}

function scoreKeywords(answer, keywords) {
  const lower = (answer || '').toLowerCase();
  const hits = [];
  const misses = [];
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) hits.push(kw);
    else misses.push(kw);
  }
  return { hits, misses, score: keywords.length ? hits.length / keywords.length : 0 };
}

function findFileLineCitations(text) {
  const re = /([A-Za-z0-9_./\\-]+\.(?:js|java|jsp|sql|c|pc|xml|html|cs|py|ts))(?::(\d+))?/g;
  const out = [];
  let m;
  while ((m = re.exec(text || '')) !== null) out.push({ ref: m[0], file: m[1], line: m[2] ? Number(m[2]) : null });
  return out;
}

function checkHallucinations(answer) {
  const novelFlags = [];
  for (const w of NOVEL_HALLUCINATION_BLACKLIST) if ((answer || '').includes(w)) novelFlags.push(w);
  return { novelFlags, citations: findFileLineCitations(answer) };
}

async function main() {
  console.log(`[측정] 시작 — 모델=${MODELS.join('/')} × 질문 ${QUESTIONS.length}개 (DRY_RUN=${DRY_RUN}, QID_FILTER=${QID_FILTER || 'all'})`);
  const session = await login();
  console.log(`[측정] 로그인 OK — repos: ${session.repos.join(', ')}`);
  const repos = REPOS_OVERRIDE || session.repos;
  console.log(`[측정] 측정 대상 repos: ${repos.join(', ')}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(__dirname, '..', 'repo-map-poc', 'results', 'decision-68', stamp);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[측정] 출력 디렉토리: ${outDir}`);

  const questionsFiltered = QUESTIONS.filter(q => !QID_FILTER || QID_FILTER.includes(q.qid));
  if (questionsFiltered.some(q => q.text.includes('__Q0_ORIGINAL_TEXT_TBD__'))) {
    console.error('[측정] Q0 원문이 placeholder 입니다. 사용자에게 원문 확인 후 채우세요.');
    process.exit(1);
  }
  const modelsToRun = DRY_RUN ? [MODELS[0]] : MODELS;

  const results = [];
  for (const model of modelsToRun) {
    for (const q of questionsFiltered) {
      console.log(`\n[측정] ▶ model=${model} qid=${q.qid} (${q.domain})`);
      try {
        const r = await askOnce({ token: session.token, repos, model, question: q });
        const kw = scoreKeywords(r.answer, q.keywords);
        const hall = checkHallucinations(r.answer);
        // 답변 본문 vs narration-only 판별 — server.js 의 answerCache 저장 기준과 유사 (## 헤더 + 길이)
        // narration-only = 도구 호출 설명만 있고 결론 본문 없음 → 키워드 점수 가짜 정답
        const hasAnswerBody = !!r.answer && (r.answer.includes('##') || r.answer.length > 1500);
        const result = {
          model, qid: q.qid, domain: q.domain,
          question: q.text, keywords: q.keywords,
          seconds: r.seconds, wallSeconds: r.wallSeconds,
          usage: r.usage,
          toolCallStatusCount: r.toolCallStatusCount,
          answerLength: (r.answer || '').length,
          hasAnswerBody,
          answer: r.answer,
          keywordScore: kw,
          hallucination: hall,
        };
        results.push(result);
        const fname = `run-${model.replace(/[+/]/g, '-')}-${q.qid}.json`;
        fs.writeFileSync(path.join(outDir, fname), JSON.stringify(result, null, 2));
        console.log(`[측정] ✓ ${r.seconds}s / 키워드 ${kw.hits.length}/${q.keywords.length} (${(kw.score * 100).toFixed(0)}%) / 본문${hasAnswerBody ? '✓' : '✗narration'} / 환각 ${hall.novelFlags.length} / 인용 ${hall.citations.length} / 길이 ${result.answerLength}`);
      } catch (e) {
        console.error(`[측정] ✗ 실패: ${e.message}`);
        results.push({ model, qid: q.qid, error: e.message });
      }
    }
  }

  const summary = renderSummary(results, modelsToRun, questionsFiltered);
  fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
  console.log(`\n[측정] 완료 → ${outDir}/summary.md`);
}

function renderSummary(results, models, questions) {
  const get = (m, qid) => results.find(r => r.model === m && r.qid === qid);
  let md = `# 결정 68 측정 결과 — ${new Date().toISOString()}\n\n`;
  md += `**조건**: USE_REPO_MAP=true, DISABLE_ANSWER_CACHE=true, 빠른모드 OFF, 간결모드 OFF, 직렬 실행\n\n`;

  md += `## 시간 (s)\n\n| 질문 | ${models.join(' | ')} |\n|---|${models.map(()=>'---').join('|')}|\n`;
  for (const q of questions) {
    md += `| ${q.qid} ${q.domain} | ${models.map(m => { const r = get(m, q.qid); return r?.error ? '✗' : r?.seconds + 's'; }).join(' | ')} |\n`;
  }

  md += `\n## 답변 본문 유무 (narration-only 식별)\n\n| 질문 | ${models.join(' | ')} |\n|---|${models.map(()=>'---').join('|')}|\n`;
  for (const q of questions) {
    md += `| ${q.qid} | ${models.map(m => { const r = get(m, q.qid); if (r?.error) return '✗'; return r.hasAnswerBody ? `본문✓ (${r.answerLength}자)` : `❌ narration only (${r.answerLength}자)`; }).join(' | ')} |\n`;
  }

  md += `\n## 키워드 정확도 (narration-only 면 가짜 정답 주의)\n\n| 질문 | ${models.join(' | ')} |\n|---|${models.map(()=>'---').join('|')}|\n`;
  for (const q of questions) {
    md += `| ${q.qid} | ${models.map(m => { const r = get(m, q.qid); if (r?.error) return '✗'; const k = r.keywordScore; const tag = r.hasAnswerBody ? '' : ' ⚠️narration'; return `${k.hits.length}/${q.keywords.length} (${(k.score*100).toFixed(0)}%)${tag}`; }).join(' | ')} |\n`;
  }

  md += `\n## 환각/인용\n\n| 질문 | ${models.join(' | ')} |\n|---|${models.map(()=>'---').join('|')}|\n`;
  for (const q of questions) {
    md += `| ${q.qid} | ${models.map(m => { const r = get(m, q.qid); if (r?.error) return '✗'; return `환각${r.hallucination.novelFlags.length} / 인용${r.hallucination.citations.length}`; }).join(' | ')} |\n`;
  }

  md += `\n## 토큰 + 답변 길이 + 도구상태 카운트\n\n| 모델 | 질문 | 입력 | 출력 | 캐시읽기 | 길이 | 도구 |\n|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    if (r.error) continue;
    const u = r.usage || {};
    md += `| ${r.model} | ${r.qid} | ${u.input_tokens ?? '-'} | ${u.output_tokens ?? '-'} | ${u.cache_read_input_tokens ?? '-'} | ${r.answerLength} | ${r.toolCallStatusCount} |\n`;
  }

  md += `\n## 누락 키워드 (모델별 약점)\n\n`;
  for (const m of models) {
    md += `### ${m}\n`;
    for (const q of questions) {
      const r = get(m, q.qid);
      if (!r || r.error) continue;
      if (r.keywordScore.misses.length) md += `- ${r.qid}: ${r.keywordScore.misses.join(', ')}\n`;
    }
    md += `\n`;
  }

  md += `## 신규 환각 의심 (수동 검증 대상)\n\n`;
  for (const r of results) {
    if (r.error || !r.hallucination?.novelFlags?.length) continue;
    md += `- **${r.model} ${r.qid}**: ${r.hallucination.novelFlags.join(', ')}\n`;
  }

  md += `\n## 파일:라인 인용 list (수동 환각 검증용)\n\n`;
  for (const r of results) {
    if (r.error || !r.hallucination?.citations?.length) continue;
    md += `**${r.model} ${r.qid}**: ${r.hallucination.citations.map(c => c.ref).join(', ')}\n\n`;
  }

  return md;
}

main().catch(e => { console.error(e); process.exit(1); });
