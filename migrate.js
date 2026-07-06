const fs = require('fs');
const path = require('path');

const REPOS_PATH = path.join(__dirname, 'repos.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const REQ_PATH = path.join(__dirname, 'requests.json');
const WORKSPACE_DIR = path.join(__dirname, 'workspace');
const WIKI_DIR = path.join(__dirname, 'wiki');
const INDEXES_DIR = path.join(__dirname, 'indexes');
const COMPANIES_PATH = path.join(__dirname, 'companies.json');

let repos = {};
let users = {};
let requests = [];
let companies = [];

try { repos = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8')); } catch (e) { }
try { users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); } catch (e) { }
try { requests = JSON.parse(fs.readFileSync(REQ_PATH, 'utf8')); } catch (e) { }
try { companies = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf8')); } catch (e) { }

function getCompanyFolder(companyId) {
  const comp = companies.find(c => c.id === companyId);
  return comp ? comp.name : '고객사없음';
}

console.log('1. Migrating repos.json...');
const newRepos = {};
for (const key in repos) {
  let newKey = key;
  if (newKey.startsWith('moon7733/')) newKey = newKey.replace('moon7733/', '');
  
  const repoData = repos[key];
  if (repoData.path) {
    if (repoData.path.includes('moon7733_')) {
      repoData.path = repoData.path.replace('moon7733_', '');
    }
  }
  newRepos[newKey] = repoData;
}
fs.writeFileSync(REPOS_PATH, JSON.stringify(newRepos, null, 2), 'utf8');

console.log('2. Migrating users.json...');
for (const userId in users) {
  const u = users[userId];
  if (u.repos) {
    const newURepos = {};
    for (const rk in u.repos) {
      let newRk = rk;
      if (newRk.startsWith('moon7733/')) newRk = newRk.replace('moon7733/', '');
      newURepos[newRk] = u.repos[rk];
    }
    u.repos = newURepos;
  }
}
fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');

console.log('3. Migrating requests.json...');
requests.forEach(req => {
  if (req.repo && req.repo.startsWith('moon7733/')) {
    req.repo = req.repo.replace('moon7733/', '');
  }
});
fs.writeFileSync(REQ_PATH, JSON.stringify(requests, null, 2), 'utf8');

console.log('4. Migrating workspace directories...');
if (fs.existsSync(WORKSPACE_DIR)) {
  const companiesDirs = fs.readdirSync(WORKSPACE_DIR);
  for (const cDir of companiesDirs) {
    const cPath = path.join(WORKSPACE_DIR, cDir);
    if (!fs.statSync(cPath).isDirectory()) continue;
    const projDirs = fs.readdirSync(cPath);
    for (const pDir of projDirs) {
      if (pDir.startsWith('moon7733_')) {
        const oldPath = path.join(cPath, pDir);
        const newPath = path.join(cPath, pDir.replace('moon7733_', ''));
        try {
          fs.renameSync(oldPath, newPath);
          console.log(`Renamed workspace: ${oldPath} -> ${newPath}`);
        } catch(e) { console.error(`Error renaming ${oldPath}:`, e); }
      }
    }
  }
}

console.log('5. Migrating wiki/ directories to company folders...');
if (fs.existsSync(WIKI_DIR)) {
  const wikiEntries = fs.readdirSync(WIKI_DIR);
  for (const ent of wikiEntries) {
    const oldPath = path.join(WIKI_DIR, ent);
    if (!fs.statSync(oldPath).isDirectory()) continue;
    
    // Ignore existing company folders (assume company folders are in COMPANIES or '고객사없음')
    const isCompanyFolder = companies.some(c => c.name === ent) || ent === '고객사없음';
    if (isCompanyFolder) continue;

    // Remove moon7733_ prefix if present
    let newSafeId = ent;
    if (newSafeId.startsWith('moon7733_')) newSafeId = newSafeId.replace('moon7733_', '');
    else if (newSafeId.startsWith('moon7733')) newSafeId = newSafeId.replace('moon7733', ''); // sometimes it's just moon7733ecamsap

    // Find company folder for this safeId
    // Match safeId to a repo in newRepos
    let matchedRepo = null;
    for (const k in newRepos) {
      const sId = k.replace(/[^a-zA-Z0-9_\-]/g, '_');
      if (sId === newSafeId) {
        matchedRepo = newRepos[k];
        break;
      }
    }

    const companyFolder = matchedRepo ? getCompanyFolder(matchedRepo.companyId) : '고객사없음';
    const targetCompDir = path.join(WIKI_DIR, companyFolder);
    if (!fs.existsSync(targetCompDir)) fs.mkdirSync(targetCompDir, { recursive: true });

    const newPath = path.join(targetCompDir, newSafeId);
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`Moved wiki: ${oldPath} -> ${newPath}`);
    } catch(e) { console.error(`Error moving ${oldPath}:`, e); }
  }
}

console.log('6. Migrating indexes/ to company folders...');
if (fs.existsSync(INDEXES_DIR)) {
  const indexEntries = fs.readdirSync(INDEXES_DIR);
  for (const ent of indexEntries) {
    const oldPath = path.join(INDEXES_DIR, ent);
    if (!fs.statSync(oldPath).isFile()) continue;
    if (!ent.endsWith('_index.md')) continue;

    let newFileName = ent;
    if (newFileName.startsWith('moon7733_')) newFileName = newFileName.replace('moon7733_', '');
    else if (newFileName.startsWith('moon7733')) newFileName = newFileName.replace('moon7733', '');
    
    const safeId = newFileName.replace('_index.md', '');

    let matchedRepo = null;
    for (const k in newRepos) {
      const sId = k.replace(/[^a-zA-Z0-9_\-]/g, '_');
      if (sId === safeId) {
        matchedRepo = newRepos[k];
        break;
      }
    }

    const companyFolder = matchedRepo ? getCompanyFolder(matchedRepo.companyId) : '고객사없음';
    const targetCompDir = path.join(INDEXES_DIR, companyFolder);
    if (!fs.existsSync(targetCompDir)) fs.mkdirSync(targetCompDir, { recursive: true });

    const newPath = path.join(targetCompDir, newFileName);
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`Moved index: ${oldPath} -> ${newPath}`);
    } catch(e) { console.error(`Error moving ${oldPath}:`, e); }
  }
}

console.log('Migration complete.');
