// 사용자 권한 해석 — 레포 단위(repos) + 고객사 단위(companies) 통합. 순수 함수(서버/IO 의존 없음).
'use strict';

const RANK = { edit: 2, read: 1 };

// 두 권한 레벨 중 높은 쪽 반환 (max-wins). 둘 다 없으면 null.
function maxLevel(a, b) {
  const ra = RANK[a] || 0;
  const rb = RANK[b] || 0;
  if (ra === 0 && rb === 0) return null;
  return ra >= rb ? a : b;
}

// 특정 레포에 대한 사용자의 유효 권한 레벨 ('edit' | 'read' | null)
// repos[repo](개별 부여)와 companies[해당 레포의 companyId](고객사 부여) 중 max-wins.
// live: companyId 는 호출 시점의 localRepos 에서 조회하므로 고객사에 새 레포가 추가되면 자동 포함.
function getRepoLevel(user, repo, localRepos) {
  const repoLevel = (user.repos && user.repos[repo]) || null;
  const info = localRepos && localRepos[repo];
  const cid = info && info.companyId;
  const compLevel = (cid && user.companies && user.companies[cid]) || null;
  return maxLevel(repoLevel, compLevel);
}

// 사용자가 접근 가능한 전체 레포 이름 목록 (개별 부여 repos + 고객사 부여 확장)
function getUserRepos(user, localRepos) {
  const set = new Set(Object.keys(user.repos || {}));
  const comps = user.companies || {};
  if (localRepos) {
    for (const repo of Object.keys(localRepos)) {
      const cid = localRepos[repo].companyId;
      if (cid && comps[cid]) set.add(repo);
    }
  }
  return [...set];
}

// 사용자의 전체 권한 맵 {repo: level} — 개별 + 고객사 확장을 합쳐 펼침 (UI 표시/하위호환용)
function getUserRepoMap(user, localRepos) {
  const map = {};
  for (const repo of getUserRepos(user, localRepos)) {
    map[repo] = getRepoLevel(user, repo, localRepos);
  }
  return map;
}

module.exports = { maxLevel, getRepoLevel, getUserRepos, getUserRepoMap };
