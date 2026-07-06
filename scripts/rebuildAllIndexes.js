// 전체 repo 의 인덱스/위키/그래프를 재생성하는 CLI (로컬 전용, LLM 미사용)
// 인코딩 정규화(EUC-KR→UTF-8) 이후 깨끗한 소스로 index/wiki/graphify 를 다시 빌드한다.
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('../indexBuilder');
const { buildWiki } = require('../wikiBuilder');
const { buildGraphify } = require('../graphifyBuilder');
const { repoInfoPath } = require('../pathUtils');

const ROOT = path.join(__dirname, '..');
const INDEXES_DIR = path.join(ROOT, 'indexes');

const repos = JSON.parse(fs.readFileSync(path.join(ROOT, 'repos.json'), 'utf8'));
const companies = JSON.parse(fs.readFileSync(path.join(ROOT, 'companies.json'), 'utf8'));

function companyFolderOf(repoInfo) {
  if (repoInfo && repoInfo.companyId) {
    const comp = companies.find(c => c.id === repoInfo.companyId);
    if (comp) return comp.name;
  }
  return '고객사없음';
}

function indexPathOf(repoId, companyFolder) {
  const dir = path.join(INDEXES_DIR, companyFolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, repoId.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_index.md');
}

async function main() {
  const ids = Object.keys(repos);
  console.log(`전체 ${ids.length}개 repo 인덱스 재생성 시작 (로컬, LLM 미사용)\n`);
  let ok = 0, fail = 0;
  for (const repoId of ids) {
    const info = repos[repoId];
    const repoPath = repoInfoPath(info, ROOT);
    const repoType = (typeof info === 'object' && info.type) || 'server';
    const companyFolder = companyFolderOf(info);
    if (!repoPath || !fs.existsSync(repoPath)) {
      console.log(`SKIP ${repoId} (경로 없음: ${repoPath})`);
      fail++;
      continue;
    }
    try {
      const content = await buildIndex(repoPath, repoId);
      fs.writeFileSync(indexPathOf(repoId, companyFolder), content, 'utf8');
      await buildWiki(repoPath, repoId, repoType, companyFolder);
      await buildGraphify(repoPath, repoId, repoType, companyFolder);
      console.log(`OK   ${repoId} (${companyFolder}, ${content.length} chars)`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${repoId}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n완료 — 성공 ${ok} / 실패 ${fail}`);
}

main();
