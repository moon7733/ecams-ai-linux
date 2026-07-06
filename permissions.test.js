// permissions.js fixture 테스트 — 접근 결정(access-flip) 검증. 서버/포트 불필요. 실행: node permissions.test.js
'use strict';
const assert = require('assert');
const { maxLevel, getRepoLevel, getUserRepos } = require('./permissions');

// 고정 레포↔고객사 매핑 (repos.json 모사)
const LOCAL = {
  r_kj_html: { companyId: 'c_kj' },
  r_kj_srv: { companyId: 'c_kj' },
  r_toss: { companyId: 'c_toss' },
  r_orphan: {},            // 고객사없음 (companyId 미정의)
};

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('  ok -', name); }

// 1) 핵심 기능: company-only 유저가 개별 권한 없는 레포를 고객사 부여로 접근
t('company-only 유저 → 해당 고객사 레포 edit 해석', () => {
  const u = { repos: {}, companies: { c_kj: 'edit' } };
  assert.strictEqual(getRepoLevel(u, 'r_kj_html', LOCAL), 'edit');
  assert.strictEqual(getRepoLevel(u, 'r_kj_srv', LOCAL), 'edit');
});

// 2) 다른 고객사 레포는 접근 불가
t('company 부여는 그 고객사 레포에만 적용', () => {
  const u = { repos: {}, companies: { c_kj: 'read' } };
  assert.strictEqual(getRepoLevel(u, 'r_toss', LOCAL), null);
});

// 3) companyId 없는(고객사없음) 레포는 어떤 company 부여에도 매칭 안 됨
t('companyId 미정의 레포는 company 부여 매칭 안 됨', () => {
  const u = { repos: {}, companies: { c_kj: 'edit' } };
  assert.strictEqual(getRepoLevel(u, 'r_orphan', LOCAL), null);
});

// 4) 회수 → 접근 결정이 null 로 뒤집힘
t('고객사 부여 회수 시 null 로 flip', () => {
  const granted = { repos: {}, companies: { c_kj: 'edit' } };
  assert.strictEqual(getRepoLevel(granted, 'r_kj_html', LOCAL), 'edit');
  const revoked = { repos: {}, companies: {} };
  assert.strictEqual(getRepoLevel(revoked, 'r_kj_html', LOCAL), null);
});

// 5) precedence = max-wins (개별 read + 고객사 edit → edit)
t('max-wins: 개별 read + 고객사 edit → edit', () => {
  const u = { repos: { r_kj_html: 'read' }, companies: { c_kj: 'edit' } };
  assert.strictEqual(getRepoLevel(u, 'r_kj_html', LOCAL), 'edit');
});
t('max-wins: 개별 edit + 고객사 read → edit', () => {
  const u = { repos: { r_kj_html: 'edit' }, companies: { c_kj: 'read' } };
  assert.strictEqual(getRepoLevel(u, 'r_kj_html', LOCAL), 'edit');
});

// 6) getUserRepos: company-only 유저도 고객사 레포가 목록에 포함 (열거 지점 silent-failure 방지)
t('getUserRepos 가 company 부여 레포를 확장 포함', () => {
  const u = { repos: { r_orphan: 'read' }, companies: { c_kj: 'edit' } };
  const list = getUserRepos(u, LOCAL).sort();
  assert.deepStrictEqual(list, ['r_kj_html', 'r_kj_srv', 'r_orphan'].sort());
});

// 7) undefined 가드 (기존 유저는 .companies 없음)
t('companies/repos 미정의 유저 가드', () => {
  assert.strictEqual(getRepoLevel({}, 'r_kj_html', LOCAL), null);
  assert.deepStrictEqual(getUserRepos({}, LOCAL), []);
  const legacy = { repos: { r_toss: 'edit' } };   // companies 키 자체가 없음
  assert.strictEqual(getRepoLevel(legacy, 'r_toss', LOCAL), 'edit');
  assert.deepStrictEqual(getUserRepos(legacy, LOCAL), ['r_toss']);
});

// 8) maxLevel 단위
t('maxLevel 단위', () => {
  assert.strictEqual(maxLevel('read', 'edit'), 'edit');
  assert.strictEqual(maxLevel('edit', null), 'edit');
  assert.strictEqual(maxLevel(null, null), null);
});

console.log(`\n✅ ${pass} passed`);
