// PMS 코드 검색의 고객사 매핑과 응답 형태를 검증한다.
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findCompany,
  normalizeCustomerName,
  resolveRepoIds,
  searchCode
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
const indexed = new Set(['kjbank_html5', 'hana_html5', 'hnbank_cn_html', 'toss_html5']);
const indexExists = repoId => indexed.has(repoId);

test('고객사명은 공백과 기호를 제거해 비교한다', () => {
  assert.equal(normalizeCustomerName(' 하나은행(중국법인) '), '하나은행중국법인');
  assert.equal(findCompany('하나은행(중국법인)', companies).id, 'hana-cn');
});

test('PMS 이름이 더 길면 가장 긴 회사명 포함 일치를 사용한다', () => {
  assert.equal(findCompany('토스뱅크', companies).id, 'toss');
  assert.equal(findCompany('하나은행 중국법인 운영', companies).id, 'hana-cn');
});

test('고객사 소유이며 실제 인덱스가 있는 repo만 선택한다', () => {
  assert.deepEqual(
    resolveRepoIds(
      { customer: '광주은행' },
      { companies, repos, indexExists }
    ),
    ['kjbank_html5']
  );
});

test('고객사와 함께 온 명시 repo가 다른 회사 소유면 차단한다', () => {
  assert.deepEqual(
    resolveRepoIds(
      { customer: '광주은행', repo: 'toss_html5' },
      { companies, repos, indexExists }
    ),
    []
  );
});

test('검색 응답은 실제 인덱스 경로를 paths로 반환한다', async () => {
  const results = await searchCode(
    { customer: '광주은행', q: 'Cmr02', topK: 5 },
    {
      registry: { companies, repos },
      indexExists,
      apiKey: 'test',
      loadIndex: () => ({
        entries: [{ id: 'js:Cmr0250', sourcePaths: ['src/Cmr0250.java'] }]
      }),
      queryIndex: async () => [
        { id: 'js:Cmr0250', kind: 'js', name: 'Cmr0250.java', score: 0.91 }
      ]
    }
  );

  assert.deepEqual(results, [{
    entityId: 'js:Cmr0250',
    kind: 'js',
    name: 'Cmr0250.java',
    paths: ['src/Cmr0250.java'],
    score: 0.91
  }]);
});

test('파일명 부분일치는 의미검색 결과보다 먼저 나온다', async () => {
  const results = await searchCode(
    { customer: '광주은행', q: 'Cmr02', topK: 2 },
    {
      registry: { companies, repos },
      indexExists,
      apiKey: 'test',
      loadIndex: () => ({
        entries: [
          { id: 'class:Cmr0200', kind: 'class', name: 'Cmr0200', sourcePaths: ['Cmr0200.java'] },
          { id: 'class:Other', kind: 'class', name: 'Other', sourcePaths: ['Other.java'] }
        ]
      }),
      queryIndex: async () => [
        { id: 'class:Other', kind: 'class', name: 'Other', score: 0.99 }
      ]
    }
  );

  assert.deepEqual(results.map(item => item.name), ['Cmr0200', 'Other']);
});
