// 엔티티 임베딩 인덱스 검증 — 실제 질문 12개로 top-K retrieval 이 키워드보다 핵심을 잘 찾는지 실측
'use strict';
const fs = require('fs');
const b = require('./entityIndexBuilder');

let key = '';
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => { const m = l.match(/^GEMINI_API_KEY(?:_\d+)?=(.+)/); if (m && !key) key = m[1].trim(); });

const REPO = 'moon7733_kjbank_html5';

// 실제 로그 질문 + 기대 엔티티(사람 판정) + 유형
const CASES = [
  { q: '운영배포화면에서 chk_SrCheckOutCancel 펑션 결과에 상관없이 진행되게 수정해줘', expect: ['Cmr0200'], type: '코드심볼' },
  { q: '어제는 파일추출됬는데 오늘은 파일추출해도 아무것도 안나온데 왜그럴까?', expect: ['PopDevRepository'], type: '기능어' },
  { q: '개발영역연결등록 화면에서 아무것도 파일추출안되면 추출된 파일이없습니다 라고 알럿뜨게 수정해줘', expect: ['PopDevRepository'], type: '화면명' },
  { q: '결재정보팝업창인데 중간에 결재자명안나오는데 왜그런지 파악해줘', expect: ['PopApprovalInfo'], type: '모호화면' },
  { q: '다국어 환경에서도 결재자명 제대로 나오게 수정해줘', expect: ['PopApprovalInfo', 'Cmr6000'], type: '기능어' },
  { q: '서버프로그램이 리눅스 9.6에서 리눅스 9.8로 올렸을때 문제가 발생할까??', expect: [], type: '인프라(범위밖)' },
  { q: '우리 서버소스에서 발생할수있는 오류는 뭐가있어??', expect: [], type: '광범위(범위밖)' },
  { q: 'Syscom_rsrc1커서 조회조건이 어떻게돼? Sql문 상세히 알려줘', expect: ['Syscom_rsrc1'], type: '코드심볼' },
  { q: '프로그램이 이미 운영배포카피도 체크되어있고 운영서버에도 연결되어있대 그런데도 uploadysedrsrc가 안돈 이유가 멀까?', expect: ['uploadysedrsrc'], type: '코드심볼' },
];

(async () => {
  const idx = b.loadIndex(REPO);
  if (!idx) { console.log('인덱스 없음 — 빌드 먼저'); return; }
  console.log(`인덱스 ${idx.entries.length}개 엔티티, dim=${idx.dim}\n`);

  let hit = 0, scoped = 0;
  for (const c of CASES) {
    const top = await b.queryIndex(REPO, c.q, key, 5);
    const names = top.map(t => `${t.name}(${(t.score * 100).toFixed(0)}${t.hits && t.hits.length ? '*' : ''})`);
    // 기대 엔티티가 top-5 이름 또는 심볼로 잡혔나 (이름 부분일치 — Syscom_rsrc1 등은 엔티티명 아닌 심볼이라 별도)
    const inTop = c.expect.length === 0 ? null :
      c.expect.some(e => top.some(t => t.name.toLowerCase().includes(e.toLowerCase())));
    if (c.expect.length === 0) { scoped++; }
    else if (inTop) hit++;
    const mark = c.expect.length === 0 ? '—(범위밖)' : (inTop ? '✅HIT' : '❌MISS');
    console.log(`[${c.type}] ${mark}  "${c.q.slice(0, 38)}..."`);
    console.log(`   기대:${JSON.stringify(c.expect)}  top5: ${names.join(', ')}`);
  }
  const total = CASES.filter(c => c.expect.length > 0).length;
  console.log(`\n=== 매핑대상 ${total}건 중 top-5 HIT: ${hit}건 (범위밖 ${scoped}건 제외) ===`);
})();
