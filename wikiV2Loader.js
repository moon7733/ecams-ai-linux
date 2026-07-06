// LLM 합성 wiki v2/v3 페이지를 ecams-ai RAG context에 주입 (kjbank 한정, 동적 선택)
'use strict';
const fs = require('fs');
const path = require('path');

const WIKI_V2_BASE = path.join(__dirname, 'wiki-poc', 'out');

const REPO_TO_V2_FOLDER = { 'moon7733_kjbank_html5': 'moon7733_kjbank' };

// 검증된 핵심 페이지 (PoC 12·13·15·16·17·결정 61 검증)
// ApprovalModal 제거 — Phase 16 가정 틀림 (운영배포 결재팝업이 아니라 별도 모달)
// PopApprovalInfo + Cmr6000 추가 — 사용자 도메인 정정 (winpop 결재정보 팝업이 진짜)
const CORE_WHITELIST = {
  'moon7733_kjbank_html5': [
    'CMM0020_코드사전.gpt5-mini-v3.md',
    'CMR0020_자원원장.gpt5-mini-v3.md',
    'CMR9900_결재큐.gpt5-mini-v2.md',
    'CMR9900_STR_프로시저.gpt5-mini-v2.md',
    'CMR1000_CR_QRYCD_신청구분.gpt5-mini-v2.md',
    'PopApprovalInfo_결재팝업.gpt5-mini-v3.md',
    'Cmr6000_결재자변경서버.gpt5-mini-v3.md',
    'Cmr0200_신청진입점.gpt5-mini-v3.md',
  ],
};

// 한국어 도메인 키워드 → entity 매핑 (사용자 질문에서 영문 entity 추출)
// 각 entity 에 가중치 (boost) 부여 가능 — 예: '결재자 변경' 같이 강한 의도 → ApprovalModal 강제 우선
const KEYWORD_TO_ENTITIES = {
  '운영배포': ['request_Deploy', 'CMR1000', 'CMR1010', 'CMR9900', 'CR_QRYCD'],
  '체크인': ['request_Check_In', 'CMR0020', 'CMR1010', 'CMR1000'],
  '체크아웃': ['request_Check_Out', 'request_Check_Out_Cancel', 'CMR0020'],
  '결재': ['CMR9900', 'CMR9900_STR', 'PopApprovalInfo', 'Cmr6000', 'request_Confirm'],
  '신청': ['CMR1000', 'request_Check_In', 'request_Deploy', 'CR_QRYCD'],
  '코드사전': ['CMM0020', 'CodeInfo'],
  '신청구분': ['CR_QRYCD', 'CMR1000', 'CMM0020'],
  '대결': ['PopApprovalInfo', 'Cmr6000', 'CMM0040'],
  '결재자': ['PopApprovalInfo', 'Cmr6000', 'CMR9900', 'CMM0040'],
  '트리거': ['CMR1010_TRG', 'CMR1000_TRG', 'CMR9900_TRG', 'CMR0020_TRG'],
  '프로시저': ['CMR9900_STR'],
  '취소': ['request_Check_Out_Cancel', 'request_REAL_Cancel', 'CMR1000'],
  '반려': ['CMR9900_STR', 'CMR1000', 'CMR9900'],
  '완료': ['CMR9900', 'CMR1000'],
  '진입중': ['CMR1000'],
  '자원': ['CMR0020', 'CMM0072', 'CMM0073'],
  '버전': ['CMR0020', 'CMR1010'],
  '시스템': ['CMM0030', 'CMM0031', 'CMM0036'],
  '폐기': ['CMR0020', 'CR_STATUS'],
  '복원': ['CMR0020'],
  '결재정보': ['PopApprovalInfo', 'Cmr6000', 'CMR9900'],
  '결재라인': ['CMR9900', 'PopApprovalInfo'],
  '팝업': ['PopApprovalInfo'],
  '변경': ['PopApprovalInfo', 'Cmr6000'], // '결재자 변경' 복합 키워드 대응
};

// 복합 키워드 — 두 단어 함께 등장 시 특정 entity 강하게 boost
const COMPOSITE_KEYWORDS = [
  { all: ['결재자', '변경'], boost: 100, entities: ['PopApprovalInfo', 'Cmr6000'] },
  { all: ['결재자', '바꾸'], boost: 100, entities: ['PopApprovalInfo', 'Cmr6000'] },
  { all: ['결재정보', '팝업'], boost: 100, entities: ['PopApprovalInfo', 'Cmr6000'] },
  { all: ['운영배포', 'INSERT'], boost: 80, entities: ['request_Deploy', 'Cmr0200'] },
  { all: ['신청', '신청버튼', 'INSERT'], boost: 50, entities: ['request_Deploy', 'request_Check_In', 'Cmr0200'] },
];

const CORE_MAX_PAGES = 7; // CORE_WHITELIST에서 항상 주입
const DYNAMIC_MAX_PAGES = 5; // 메시지 매칭으로 추가 주입 (총 12 페이지 한도, ~120K chars / ~30K tokens)

function safeReadPage(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch (_) { return null; }
}

// 페이지 파일명에서 entity 키워드 추출
function entityKeywordsFromFilename(fname) {
  // CMM0020_코드사전.gpt5-mini-v3.md → ['CMM0020', '코드사전']
  // request_Deploy.gpt5-mini-batch.md → ['request_Deploy', 'request', 'Deploy']
  const base = fname.replace(/\.gpt5-mini.*\.md$/, '');
  const tokens = new Set();
  tokens.add(base);
  for (const t of base.split(/[_\.]+/)) {
    if (t.length >= 3) tokens.add(t);
  }
  return [...tokens];
}

function loadAllPages(repoId) {
  const v2Folder = REPO_TO_V2_FOLDER[repoId];
  if (!v2Folder) return [];
  const conceptsDir = path.join(WIKI_V2_BASE, v2Folder, 'Concepts');
  if (!fs.existsSync(conceptsDir)) return [];
  const files = fs.readdirSync(conceptsDir).filter(f => /\.gpt5-mini-(v\d|batch).*\.md$/.test(f));
  return files.map(name => ({
    name,
    path: path.join(conceptsDir, name),
    keywords: entityKeywordsFromFilename(name),
    isCore: (CORE_WHITELIST[repoId] || []).includes(name),
  }));
}

// 메시지에서 entity 후보 추출 (한국어 키워드 매핑 + 영문 entity 직접 매칭)
function extractEntityHints(message) {
  const hints = new Set();
  for (const [kw, entities] of Object.entries(KEYWORD_TO_ENTITIES)) {
    if (message.includes(kw)) {
      for (const e of entities) hints.add(e.toLowerCase());
    }
  }
  // 영문 대문자 entity (CMM0020, CMR9900 등) 직접 추출
  const matches = message.match(/\b(CM[RMS]\d{4}|CR_[A-Z][A-Z0-9_]+|CM_[A-Z][A-Z0-9_]+|request_[A-Z][a-zA-Z_]+|[A-Z][a-zA-Z]+(Modal|Info|Tab|Reg))\b/g);
  if (matches) for (const m of matches) hints.add(m.toLowerCase());
  return hints;
}

function scorePage(page, hints) {
  let score = 0;
  for (const kw of page.keywords) {
    if (hints.has(kw.toLowerCase())) score += 10;
    // 부분 매칭 (CMR1000 가 CR_QRYCD 페이지 안에 있는 경우)
    for (const hint of hints) {
      if (kw.toLowerCase().includes(hint) || hint.includes(kw.toLowerCase())) score += 1;
    }
  }
  return score;
}

function selectPagesForMessage(repoId, message) {
  const all = loadAllPages(repoId);
  if (all.length === 0) return [];

  const hints = message ? extractEntityHints(message) : new Set();

  // 1) Core whitelist 항상 포함 (PoC 검증된 핵심)
  const corePages = all.filter(p => p.isCore).slice(0, CORE_MAX_PAGES);
  const coreNames = new Set(corePages.map(p => p.name));

  // 2) 동적 매칭 — message 키워드와 점수 매칭, 상위 N
  const dynamic = all
    .filter(p => !coreNames.has(p.name))
    .map(p => ({ ...p, score: scorePage(p, hints) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, DYNAMIC_MAX_PAGES);

  return [...corePages, ...dynamic];
}

function loadWikiV2Pages(repoId, message = null) {
  const selected = selectPagesForMessage(repoId, message);
  const loaded = [];
  for (const p of selected) {
    const content = safeReadPage(p.path);
    if (content) loaded.push({ name: p.name, content, isCore: p.isCore, score: p.score });
  }
  return loaded;
}

function buildV2Section(repoId, message = null) {
  const pages = loadWikiV2Pages(repoId, message);
  if (pages.length === 0) return '';

  const coreCount = pages.filter(p => p.isCore).length;
  const dynCount = pages.length - coreCount;

  const lines = [];
  lines.push('\n---\n');
  lines.push(`# 🧠 LLM 합성 도메인 사전 (v2/v3) [${repoId}] — 절대 우선 참조 섹션\n`);
  lines.push(`> 합성 페이지 ${pages.length}개 (검증 코어 ${coreCount}, 메시지 매칭 ${dynCount})\n`);
  lines.push(`> ⛔ **이 섹션의 합성 페이지가 위의 선조립 mechanical extract 보다 절대 우선**입니다.\n`);
  lines.push(`> ⛔ 사용자 질문이 이 섹션의 페이지가 다루는 영역이면 위 mechanical extract 자료 무시하고 이 섹션 페이지 인용.\n`);
  lines.push(`> 예: "결재정보 팝업/결재자 변경" 질문 → 이 섹션의 PopApprovalInfo·Cmr6000 페이지만 답변 근거로 사용. ApprovalInfo/CopyApprovalInfoModal/ApprovalModal 자료가 위에 있어도 무시.\n`);
  lines.push(`> 예: "운영배포 신청 INSERT" 질문 → Cmr0200_신청진입점 + CR_QRYCD 페이지 사용.\n`);
  lines.push(`> ⚠️ \`(추정)\`·\`(자료 없음)\` 표기는 그대로 인용. 합성 페이지를 단정으로 격상 금지.\n`);
  lines.push(`> ⚠️ 인용 시 페이지 이름 + 라인 출처 명시.\n\n`);

  for (const p of pages) {
    const tag = p.isCore ? '✓ 검증' : `⚙ 자동 (score=${p.score})`;
    lines.push(`## ${p.name} (${tag})\n\n${p.content}\n\n`);
  }
  return lines.join('');
}

module.exports = { loadWikiV2Pages, buildV2Section, selectPagesForMessage };
