const { buildWiki } = require('./wikiBuilder');
const { buildGraphify } = require('./graphifyBuilder');
const fs = require('fs');

const repos = JSON.parse(fs.readFileSync('./repos.json', 'utf8'));

async function test() {
  for (const id in repos) {
    const r = repos[id];
    const repoPath = typeof r === 'string' ? r : r.path;
    const repoType = typeof r === 'string' ? 'web' : (r.type || 'web');
    console.log(`Building Wiki+Graph for ${id} (${repoType})...`);
    await buildWiki(repoPath, id, repoType);
    await buildGraphify(repoPath, id, repoType);
  }
  console.log('\n=== 완료 ===');
}

test().catch(e => console.error(e));
