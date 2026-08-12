// PMS 코드 검색의 고객사 매핑과 소스뷰어 응답 변환을 검증한다.
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findCompany,
  normalizeCustomerName,
  resolveRepoIds,
  searchCode,
  searchSourceViewer
} = require('./pmsCodeSearch');

const companies = [
  { id: 'gwangju', name: '광주은행' },
  { id: 'hana', name: '하나은행' },
  { id: 'hana-cn', name: '하나은행중국법인' },
  { id: 'toss', name: '토스' }
];
const repos = {
  kjbank_html5: { companyId: 'gwangju' },
  kjbank_server: { companyId: 'gwangju' },
  hana_html5: { companyId: 'hana' },
  hnbank_cn_html: { companyId: 'hana-cn' },
  toss_html5: { companyId: 'toss' }
};

test('고객사명은 공백과 기호를 제거해 비교한다', () => {
  assert.equal(normalizeCustomerName(' 하나은행(중국법인) '), '하나은행중국법인');
  assert.equal(findCompany('하나은행(중국법인)', companies).id, 'hana-cn');
});

test('PMS 이름이 더 길면 가장 긴 회사명 포함 일치를 사용한다', () => {
  assert.equal(findCompany('토스뱅크', companies).id, 'toss');
  assert.equal(findCompany('하나은행 중국법인 운영', companies).id, 'hana-cn');
});

test('고객사가 소유한 소스뷰어 repo를 모두 선택한다', () => {
  assert.deepEqual(
    resolveRepoIds({ customer: '광주은행' }, { companies, repos }),
    ['kjbank_html5', 'kjbank_server']
  );
});

test('고객사와 함께 온 명시 repo가 다른 회사 소유면 차단한다', () => {
  assert.deepEqual(
    resolveRepoIds({ customer: '광주은행', repo: 'toss_html5' }, { companies, repos }),
    []
  );
});

test('소스뷰어 내부 API에 서비스 토큰과 repo를 전달한다', async () => {
  let request;
  const response = await searchSourceViewer('kjbank_html5', 'cmr', {
    baseUrl: 'http://azbrain:3000/',
    token: 'secret',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ nameMatches: [] }) };
    }
  });
  assert.deepEqual(response, { nameMatches: [] });
  assert.equal(request.url, 'http://azbrain:3000/internal/pms/repo-search');
  assert.equal(request.options.headers['X-PMS-Token'], 'secret');
  assert.deepEqual(JSON.parse(request.options.body), { repo: 'kjbank_html5', q: 'cmr', limit: 50 });
});

test('소스뷰어 파일명 결과를 PMS 자동완성 형태로 변환한다', async () => {
  const results = await searchCode(
    { customer: '광주은행', q: 'cmr', topK: 2 },
    {
      registry: { companies, repos },
      repoSearch: async repo => repo === 'kjbank_html5'
        ? { nameMatches: [
            { path: 'src/app/eCmr', name: 'eCmr', isDirectory: true },
            { path: 'src/app/eCmr/Cmr0200.java', name: 'Cmr0200.java', isDirectory: false },
            { path: 'src/app/eCmr/Cmr0202.java', name: 'Cmr0202.java', isDirectory: false }
          ] }
        : { nameMatches: [] }
    }
  );
  assert.deepEqual(results, [
    {
      entityId: 'file:kjbank_html5:src/app/eCmr/Cmr0200.java',
      kind: 'java',
      name: 'Cmr0200.java',
      paths: ['src/app/eCmr/Cmr0200.java'],
      score: 2.1
    },
    {
      entityId: 'file:kjbank_html5:src/app/eCmr/Cmr0202.java',
      kind: 'java',
      name: 'Cmr0202.java',
      paths: ['src/app/eCmr/Cmr0202.java'],
      score: 2.1
    }
  ]);
});
