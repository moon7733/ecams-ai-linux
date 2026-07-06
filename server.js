const express = require('express');
const path = require('path');
const { spawn, execFileSync, execFile } = require('child_process');
const pty = require('node-pty');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const extractZip = require('extract-zip');
const axios = require('axios');
const Diff = require('diff');
const { buildIndex } = require('./indexBuilder');
const { buildWiki } = require('./wikiBuilder');
const { buildGraphify } = require('./graphifyBuilder');
const { addKnowledge, getRelevantKnowledge, getAllKnowledge, clearKnowledge, getEmbedding, cosineSimilarity, addGuideChunks, getGuideKnowledge } = require('./knowledgeManager');
const officeParser = require('officeparser');
const { generateSqlSummary } = require('./sqlParser');
const { buildContext } = require('./contextBuilder');
const { smartRead, convertRepoToUtf8, SOURCE_EXTS } = require('./encoding');
const answerLogger = require('./answerLogger');
const clarifier = require('./clarifier');
const { getRepoLevel, getUserRepos, getUserRepoMap } = require('./permissions');
const { createJob, getJob, getJobStatus, setCurrentProcess, appendChunk, finishJob, failJob, cancelJob, subscribe, unsubscribe, countRunningJobs, getSubscriberCount } = require('./jobsManager');
const pushManager = require('./pushManager');
const { dataRoot, isPathInside, repoInfoPath, splitKnownDataPath } = require('./pathUtils');

// 로그에 한국 시간 타임스탬프 추가
const originalLog = console.log;
const originalError = console.error;

function getKoreanTime() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localIso = new Date(d.getTime() - tzOffset).toISOString().slice(0, 19).replace('T', ' ');
  return `[${localIso}]`;
}

console.log = function(...args) {
  originalLog.apply(console, [getKoreanTime(), ...args]);
};
console.error = function(...args) {
  originalError.apply(console, [getKoreanTime(), ...args]);
};


// ===== 결정 70: 지능형 전역 사전/스키마 메모리 로드 =====
let globalCodeMap = {};
let globalColMap = {};
let globalTableMap = {};

function loadGlobalDictionaries() {
  const wikiBase = path.join(__dirname, 'wiki');
  if (!fs.existsSync(wikiBase)) return;
  let dirs;
  try { dirs = fs.readdirSync(wikiBase, { withFileTypes: true }); } catch(e) { return; }
  for (const ent of dirs) {
    if (!ent.isDirectory()) continue;
    const codeMapPath = path.join(wikiBase, ent.name, 'CodeMap.json');
    const colMapPath = path.join(wikiBase, ent.name, 'ColumnCodeMap.json');
    const tableMapPath = path.join(wikiBase, ent.name, 'TableSchemas.json');
    
    if (fs.existsSync(codeMapPath)) {
      try {
        const cm = JSON.parse(fs.readFileSync(codeMapPath, 'utf8'));
        for (const k in cm) {
          if (!globalCodeMap[k]) globalCodeMap[k] = {};
          Object.assign(globalCodeMap[k], cm[k]);
        }
      } catch (e) {}
    }
    if (fs.existsSync(colMapPath)) {
      try { Object.assign(globalColMap, JSON.parse(fs.readFileSync(colMapPath, 'utf8'))); } catch (e) {}
    }
    if (fs.existsSync(tableMapPath)) {
      try { Object.assign(globalTableMap, JSON.parse(fs.readFileSync(tableMapPath, 'utf8'))); } catch (e) {}
    }
  }
  
  // 프론트엔드 축약형 변수 강제 매핑
  globalColMap['REQSTA'] = 'CMR0020';
  globalColMap['TEAMCD2'] = 'SYSGBN';
  globalColMap['REQCD'] = 'REQUEST';
  console.log(`[Dict] Loaded CodeMaps: ${Object.keys(globalCodeMap).length}, ColMaps: ${Object.keys(globalColMap).length}, Tables: ${Object.keys(globalTableMap).length}`);
}
loadGlobalDictionaries();

// Gemini API 키 로드 (단일 키 — 무료 키 다중 로테이션은 Google 자동정지로 폐기, 2026-06-25)
const GEMINI_KEY = (() => {
  const p = path.join(__dirname, '.env');
  let key = '';
  try {
    if (fs.existsSync(p)) {
      fs.readFileSync(p, 'utf8').split('\n').forEach(l => {
        const m = l.match(/^GEMINI_API_KEY(?:_\d+)?=(.+)/);
        if (m && !key) key = m[1].trim();
      });
    }
  } catch (e) { }
  return key;
})();
console.log(`[Gemini] API 키 ${GEMINI_KEY ? '로드됨' : '미설정'}`);

const INDEXES_DIR = path.join(__dirname, 'indexes');
if (!fs.existsSync(INDEXES_DIR)) fs.mkdirSync(INDEXES_DIR);

function getIndexPath(repoId) {
  const repoInfo = LOCAL_REPOS[repoId] || {};
  let companyFolder = '고객사없음';
  if (repoInfo.companyId) {
    const comp = COMPANIES.find(c => c.id === repoInfo.companyId);
    if (comp) companyFolder = comp.name;
  }
  const targetDir = path.join(INDEXES_DIR, companyFolder);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  return path.join(targetDir, repoId.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_index.md');
}

function getIndexMeta(repoId) {
  const p = getIndexPath(repoId);
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  return { exists: true, builtAt: stat.mtime.toISOString(), size: stat.size };
}

async function triggerIndexBuild(repoId, repoPath) {
  try {
    const repoInfo = LOCAL_REPOS[repoId] || {};
    const repoType = repoInfo.type || 'web';
    let companyFolder = '고객사없음';
    if (repoInfo.companyId) {
      const comp = COMPANIES.find(c => c.id === repoInfo.companyId);
      if (comp) companyFolder = comp.name;
    }

    console.log(`[Index] Building index for ${repoId}...`);
    const content = await buildIndex(repoPath, repoId);
    fs.writeFileSync(getIndexPath(repoId), content, 'utf8');
    console.log(`[Index] Done: ${repoId} (${content.length} chars)`);

    console.log(`[Wiki] Building Wiki for ${repoId} (type: ${repoType})...`);
    await buildWiki(repoPath, repoId, repoType, companyFolder);

    console.log(`[Graphify] Building graph for ${repoId}...`);
    await buildGraphify(repoPath, repoId, repoType, companyFolder);
  } catch (e) {
    console.error(`[Index/Wiki/Graphify] Failed for ${repoId}:`, e.message);
  }
}

const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== 데이터 로드 및 저장 =====
let USERS = {};
let LOCAL_REPOS = {};
let REQUESTS = [];
let COMPANIES = [];

function loadData() {
  try {
    const usersPath = path.join(__dirname, 'users.json');
    if (fs.existsSync(usersPath)) USERS = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  } catch (e) { console.error('[Load] Users failed', e); USERS = {}; }

  try {
    const reposPath = path.join(__dirname, 'repos.json');
    if (fs.existsSync(reposPath)) {
      const rawRepos = JSON.parse(fs.readFileSync(reposPath, 'utf8'));
      let migrated = false;
      for (const id in rawRepos) {
        if (typeof rawRepos[id] === 'string') {
          LOCAL_REPOS[id] = {
            path: rawRepos[id],
            companyId: 'none',
            type: id.includes('html') ? 'web_html5' : (id.includes('server') ? 'server' : (id.includes('db') ? 'db' : 'server'))
          };
          migrated = true;
        } else {
          LOCAL_REPOS[id] = rawRepos[id];
          if (LOCAL_REPOS[id].type === 'web') {
            LOCAL_REPOS[id].type = id.endsWith('_html5') ? 'web_html5' : 'web_general';
            migrated = true;
          }
        }
      }
      if (migrated) saveRepos(); // 파일 포맷 영구 변환
    }
  } catch (e) { console.error('[Load] Repos failed', e); LOCAL_REPOS = {}; }

  try {
    const reqPath = path.join(__dirname, 'requests.json');
    if (fs.existsSync(reqPath)) REQUESTS = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
  } catch (e) { REQUESTS = []; }

  try {
    const compPath = path.join(__dirname, 'companies.json');
    if (fs.existsSync(compPath)) COMPANIES = JSON.parse(fs.readFileSync(compPath, 'utf8'));
  } catch (e) { COMPANIES = []; }
}
function saveUsers() { fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(USERS, null, 2)); }
function saveRepos() { fs.writeFileSync(path.join(__dirname, 'repos.json'), JSON.stringify(LOCAL_REPOS, null, 2)); }
function saveRequests() { fs.writeFileSync(path.join(__dirname, 'requests.json'), JSON.stringify(REQUESTS, null, 2)); }
function saveCompanies() { fs.writeFileSync(path.join(__dirname, 'companies.json'), JSON.stringify(COMPANIES, null, 2)); }

function getRepoBasePath(repoId) {
  return repoInfoPath(LOCAL_REPOS[repoId], __dirname);
}

const CHAT_HISTORY_LIMIT = 50;
const CHAT_HISTORY_DIR = path.join(__dirname, 'logs', 'chat_history');

function chatHistoryPath(userId) {
  const safeId = String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
  return path.join(CHAT_HISTORY_DIR, `${safeId}.json`);
}

function normalizeChatForStorage(chat, fallbackId) {
  const id = String(chat?.id || fallbackId || Date.now());
  return {
    id,
    title: String(chat?.title || '새 대화').slice(0, 200),
    messages: Array.isArray(chat?.messages) ? chat.messages : [],
    updatedAt: Number(chat?.updatedAt) || Date.now(),
    deleted: !!chat?.deleted,
  };
}

function readChatHistory(userId) {
  try {
    const file = chatHistoryPath(userId);
    if (!fs.existsSync(file)) return [];
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw.map(c => normalizeChatForStorage(c)).slice(-CHAT_HISTORY_LIMIT) : [];
  } catch (e) {
    console.warn('[ChatHistory] read failed:', userId, e.message);
    return [];
  }
}

function writeChatHistory(userId, chats) {
  fs.mkdirSync(CHAT_HISTORY_DIR, { recursive: true });
  const normalized = (Array.isArray(chats) ? chats : [])
    .map(c => normalizeChatForStorage(c))
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(-CHAT_HISTORY_LIMIT);
  fs.writeFileSync(chatHistoryPath(userId), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

loadData();
resetLeftoverDenies(); // 이전 비정상 종료로 남은 workspace 쓰기거부 ACL 정리 (함수 hoisting)

// 평문 비밀번호 자동 해싱 (최초 1회 마이그레이션)
(function migratePasswords() {
  let changed = false;
  for (const user of Object.values(USERS)) {
    if (user.password && !user.password.startsWith('$2')) {
      user.password = bcrypt.hashSync(user.password, 10);
      changed = true;
    }
  }
  if (changed) { saveUsers(); console.log('[Migration] 기존 비밀번호 bcrypt 해싱 완료'); }
})();

const sessions = {}; // { token: { id, isAdmin, repos: { repo_name: 'read'|'edit' } } }
const loginAttempts = {}; // { ip: { count, lockedUntil } }

// ===== 멀터 설정 =====
const upload = multer({ dest: path.join(os.tmpdir(), 'ecams_uploads'), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB 제한

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8시간

// ===== 인증 미들웨어 =====
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1] || req.headers['authorization'];
  if (!token || !sessions[token]) return res.status(401).json({ error: 'Unauthorized: 로그인이 필요합니다.' });

  const session = sessions[token];
  if (Date.now() - session.createdAt > SESSION_TTL) {
    delete sessions[token];
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
  }

  const user = USERS[session.id];
  if (!user) {
    delete sessions[token];
    return res.status(401).json({ error: '존재하지 않는 사용자입니다.' });
  }

  session.repos = user.repos || {};
  session.companies = user.companies || {}; // 고객사 단위 권한 (레포 권한과 max-wins, live 반영)
  session.userType = user.userType; // persona 판정용 (캐시 분리·응답 분기)
  req.user = session;
  next();
}

// ===== API 라우트 =====

app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lockedUntil: 0 };
  const attempt = loginAttempts[ip];

  if (attempt.lockedUntil > now) {
    const remaining = Math.ceil((attempt.lockedUntil - now) / 60000);
    return res.status(429).json({ error: `로그인 시도 횟수 초과. ${remaining}분 후 다시 시도하세요.` });
  }

  const { id, password } = req.body;
  const user = USERS[id];
  if (user && bcrypt.compareSync(password, user.password)) {
    loginAttempts[ip] = { count: 0, lockedUntil: 0 };
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = { id, isAdmin: id === 'admin', repos: user.repos || {}, createdAt: Date.now() };
    res.json({ token, id, isAdmin: id === 'admin', repos: user.repos || {} });
  } else {
    attempt.count++;
    if (attempt.count >= 5) {
      attempt.lockedUntil = now + 15 * 60 * 1000;
      attempt.count = 0;
      return res.status(429).json({ error: '로그인 시도 횟수 초과. 15분 후 다시 시도하세요.' });
    }
    res.status(401).json({ error: `아이디 또는 비밀번호가 올바르지 않습니다. (${attempt.count}/5)` });
  }
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.headers['authorization'];
  if (token && sessions[token]) delete sessions[token];
  res.json({ success: true });
});

// 로그인 아이디 기준 대화기록 저장소. localStorage 는 캐시로만 사용한다.
// 삭제는 항목을 지우지 않고 deleted:true 툼스톤으로 남긴다 — 여러 기기가 각자 로컬 캐시를 갖고 있어서,
// 그냥 지우면 아직 그 대화를 캐시에 들고 있는 다른 기기가 다음 동기화 때 그대로 되살려 올린다.
// 툼스톤 + updatedAt 최신순 우선(last-write-wins)이면 어느 기기가 나중에 델리트해도 항상 이긴다.
app.get('/api/chat/history', authMiddleware, (req, res) => {
  res.json({ chats: readChatHistory(req.user.id) });
});

app.put('/api/chat/history/:id', authMiddleware, (req, res) => {
  const incoming = normalizeChatForStorage(req.body?.chat || req.body, req.params.id);
  if (incoming.id !== String(req.params.id)) {
    return res.status(400).json({ error: '대화 ID가 일치하지 않습니다.' });
  }
  const chats = readChatHistory(req.user.id);
  const existing = chats.find(c => c.id === incoming.id);
  // 이미 더 최신(또는 동시) 상태가 저장돼 있으면(다른 기기의 삭제 포함) 오래된 요청은 무시
  if (existing && (existing.updatedAt || 0) >= (incoming.updatedAt || 0)) {
    return res.json({ chats });
  }
  const next = chats.filter(c => c.id !== incoming.id);
  next.push(incoming);
  res.json({ chats: writeChatHistory(req.user.id, next) });
});

app.delete('/api/chat/history/:id', authMiddleware, (req, res) => {
  const chats = readChatHistory(req.user.id);
  const tombstone = { id: String(req.params.id), title: '', messages: [], updatedAt: Date.now(), deleted: true };
  const next = chats.filter(c => c.id !== tombstone.id);
  next.push(tombstone);
  res.json({ chats: writeChatHistory(req.user.id, next) });
});

// 고객사 목록 (회원가입 폼용, 인증 불필요)
app.get('/api/companies', (req, res) => {
  const sorted = [...COMPANIES].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  res.json({ companies: sorted });
});

app.post('/api/signup', (req, res) => {
  const { id, password, name, phone, affiliation } = req.body;
  if (!id || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
  if (!name || !name.trim()) return res.status(400).json({ error: '성명을 입력해주세요.' });
  if (!phone || !/^010-\d{4}-\d{4}$/.test(phone)) return res.status(400).json({ error: '올바른 핸드폰 번호를 입력해주세요. (010-0000-0000)' });
  if (!affiliation) return res.status(400).json({ error: '소속을 선택해주세요.' });

  if (USERS[id]) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
  const existingReq = REQUESTS.find(r => r.type === 'signup' && r.userId === id && r.status === 'pending');
  if (existingReq) return res.status(400).json({ error: '이미 가입 신청이 진행 중입니다.' });

  const userType = affiliation === '(주)아즈소프트' ? 'azsoft' : 'customer';
  const hashedPassword = bcrypt.hashSync(password, 10);
  REQUESTS.push({ id: 'req_' + Date.now(), type: 'signup', userId: id, password: hashedPassword, name: name.trim(), phone, affiliation, userType, status: 'pending', timestamp: Date.now() });
  saveRequests();
  res.json({ success: true, message: '회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.' });
});

app.get('/api/repos/all', authMiddleware, (req, res) => {
  res.json({ allRepos: Object.keys(LOCAL_REPOS) });
});

app.get('/api/repos', authMiddleware, (req, res) => {
  const userRepos = getUserRepoMap(req.user, LOCAL_REPOS); // 개별 + 고객사 부여 확장
  const repoMeta = {};

  // 사용자가 권한을 가진 레포지토리들의 상세 정보 추출
  Object.keys(userRepos).forEach(id => {
    if (LOCAL_REPOS[id]) {
      repoMeta[id] = LOCAL_REPOS[id];
    }
  });

  res.json({
    repos: userRepos,
    repoMeta: repoMeta, // 상세 정보 추가
    isAdmin: req.user.isAdmin
  });
});

// 업로드/클론 직후 repo 트리를 UTF-8로 정규화 (EUC-KR 감지분만 변환, 원본은 백업 경로에 백업)
const ENCODING_BACKUP_BASE = process.env.BACKUP_DIR || path.join(__dirname, 'backup');
function normalizeRepoEncoding(repoDir) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRoot = path.join(ENCODING_BACKUP_BASE, 'encoding-convert-' + ts);
    const r = convertRepoToUtf8(repoDir, { backupRoot, relativeTo: path.join(__dirname, 'workspace') });
    if (r.converted.length) {
      console.log(`[Encoding] ${repoDir}: ${r.converted.length}개 EUC-KR→UTF-8 변환 (백업: ${backupRoot})`);
    }
    return r;
  } catch (e) {
    console.error('[Encoding] 변환 실패:', e.message);
    return null;
  }
}

// 신규 레포지토리 - ZIP
app.post('/api/repos/create-zip', authMiddleware, upload.single('zipfile'), async (req, res) => {
  const { reponame, overwrite } = req.body;
  if (!reponame || !req.file) return res.status(400).json({ error: '레포명과 파일을 입력하세요.' });
  if (LOCAL_REPOS[reponame] && overwrite !== 'true') return res.status(400).json({ error: '이미 존재하는 레포지토리입니다.' });

  const company = COMPANIES.find(c => c.id === (req.body.companyId || 'none'));
  const companyFolder = company ? company.name : '고객사없음';
  const safeRepoName = path.basename(reponame).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const targetDir = path.join(process.env.WORKSPACE_DIR || path.join(__dirname, 'workspace'), companyFolder, safeRepoName);

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  try {
    // 덮어쓰기인 경우 기존 폴더 삭제 후 재생성 (선택 사항: 또는 그냥 덮어쓰기)
    if (overwrite === 'true' && fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await extractZip(req.file.path, { dir: targetDir });
    fs.unlinkSync(req.file.path);

    // 인코딩 정규화 (EUC-KR→UTF-8) — SQL 파싱·인덱스 빌드가 깨끗한 UTF-8을 보도록 선행
    normalizeRepoEncoding(targetDir);

    // zip 내부에 단일 최상위 폴더가 있으면 그 폴더를 실제 경로로 사용
    let actualRepoPath = targetDir;
    try {
      const entries = fs.readdirSync(targetDir).filter(e => !e.startsWith('.'));
      if (entries.length === 1) {
        const sub = path.join(targetDir, entries[0]);
        if (fs.statSync(sub).isDirectory()) actualRepoPath = sub;
      }
    } catch (e) { }

    LOCAL_REPOS[reponame] = {
      path: actualRepoPath.replace(/\\/g, '/'),
      companyId: req.body.companyId || 'none',
      type: req.body.projectType || 'server'
    };
    saveRepos();

    // DB 유형인 경우 SQL 파싱 자동 실행
    if (req.body.projectType === 'db') {
      await generateSqlSummary(targetDir);
    }

    USERS[req.user.id].repos[reponame] = 'edit'; // 생성자에게 권한 부여
    saveUsers();

    triggerIndexBuild(reponame, targetDir); // 백그라운드 인덱스 빌드
    res.json({ success: true, message: '레포지토리가 생성되었습니다. 인덱스를 백그라운드에서 생성 중입니다.' });
  } catch (err) {
    res.status(500).json({ error: '압축 해제 오류: ' + err.message });
  }
});

// 신규 레포지토리 - GIT
app.post('/api/repos/create-git', authMiddleware, (req, res) => {
  const { reponame, gitUrl, gitToken, overwrite } = req.body;
  if (!reponame || !gitUrl) return res.status(400).json({ error: '레포명과 Git URL을 입력하세요.' });
  if (LOCAL_REPOS[reponame] && overwrite !== true) return res.status(400).json({ error: '이미 존재하는 레포지토리입니다.' });

  const company = COMPANIES.find(c => c.id === (req.body.companyId || 'none'));
  const companyFolder = company ? company.name : '고객사없음';
  const safeRepoName = path.basename(reponame).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const targetDir = path.join(process.env.WORKSPACE_DIR || path.join(__dirname, 'workspace'), companyFolder, safeRepoName);

  if (!fs.existsSync(path.dirname(targetDir))) fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  let cloneUrl = gitUrl;
  if (gitToken) {
    try {
      const urlObj = new URL(gitUrl);
      urlObj.username = gitToken;
      cloneUrl = urlObj.toString();
    } catch (e) {
      return res.status(400).json({ error: '유효하지 않은 URL 형식입니다.' });
    }
  }

  // 덮어쓰기인 경우 기존 폴더 삭제
  if (overwrite === true && fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  const gitProc = spawn('git', ['clone', cloneUrl, targetDir], { shell: false });
  let gitStderr = '';
  gitProc.stderr.on('data', d => gitStderr += d.toString());
  gitProc.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: 'Git Clone 오류: ' + gitStderr });

    // 인코딩 정규화 (EUC-KR→UTF-8) — SQL 파싱·인덱스 빌드 선행
    normalizeRepoEncoding(targetDir);

    LOCAL_REPOS[reponame] = {
      path: targetDir.replace(/\\/g, '/'),
      companyId: req.body.companyId || 'none',
      type: req.body.projectType || 'server'
    };
    saveRepos();

    // DB 유형인 경우 SQL 파싱 자동 실행
    if (req.body.projectType === 'db') {
      generateSqlSummary(targetDir);
    }
    USERS[req.user.id].repos[reponame] = 'edit';
    saveUsers();
    triggerIndexBuild(reponame, targetDir); // 백그라운드 인덱스 빌드
    res.json({ success: true, message: '레포지토리가 생성되었습니다. 인덱스를 백그라운드에서 생성 중입니다.' });
  });
  gitProc.on('error', (err) => res.status(500).json({ error: 'Git 실행 오류: ' + err.message }));
});

// 결재 시스템 API
app.post('/api/requests', authMiddleware, (req, res) => {
  const { companyId, level } = req.body;
  if (!companyId || !level) return res.status(400).json({ error: '잘못된 요청입니다.' });
  if (!['read', 'edit'].includes(level)) return res.status(400).json({ error: '권한은 read 또는 edit만 가능합니다.' });
  const comp = COMPANIES.find(c => c.id === companyId);
  if (!comp) return res.status(400).json({ error: '존재하지 않는 고객사입니다.' });

  REQUESTS.push({ id: 'req_' + Date.now(), type: 'company_auth', userId: req.user.id, companyId, companyName: comp.name, level, status: 'pending', timestamp: Date.now() });
  saveRequests();
  res.json({ success: true });
});

app.get('/api/requests', authMiddleware, (req, res) => {
  if (req.user.isAdmin) {
    res.json({ requests: REQUESTS.filter(r => r.status === 'pending') });
  } else {
    res.json({ requests: REQUESTS.filter(r => r.userId === req.user.id && r.status === 'pending') });
  }
});

app.post('/api/requests/:id/approve', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const reqObj = REQUESTS.find(r => r.id === req.params.id);
  if (!reqObj) return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });

  reqObj.status = 'approved';
  if (reqObj.type === 'signup') {
    USERS[reqObj.userId] = { password: reqObj.password, repos: {}, name: reqObj.name || '', phone: reqObj.phone || '', affiliation: reqObj.affiliation || '', userType: reqObj.userType || 'customer' };
  } else if (reqObj.type === 'repo_auth') {
    if (!USERS[reqObj.userId]) return res.status(400).json({ error: '존재하지 않는 유저입니다.' });
    USERS[reqObj.userId].repos[reqObj.repo] = reqObj.level;
  } else if (reqObj.type === 'company_auth') {
    if (!USERS[reqObj.userId]) return res.status(400).json({ error: '존재하지 않는 유저입니다.' });
    if (!USERS[reqObj.userId].companies) USERS[reqObj.userId].companies = {};
    USERS[reqObj.userId].companies[reqObj.companyId] = reqObj.level;
  }
  saveUsers();
  saveRequests();
  res.json({ success: true });
});

app.post('/api/requests/:id/reject', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const reqObj = REQUESTS.find(r => r.id === req.params.id);
  if (!reqObj) return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });

  reqObj.status = 'rejected';
  saveRequests();
  res.json({ success: true });
});

// ===== 관리자 사용자 관리 API =====

app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const users = Object.entries(USERS).map(([id, user]) => ({ id, repos: user.repos || {}, companies: user.companies || {}, name: user.name || '', phone: user.phone || '', affiliation: user.affiliation || '', userType: user.userType || '' }));
  res.json({ users });
});


app.post('/api/admin/users/:id/repos', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { id } = req.params;
  const { repo, level } = req.body;
  if (!['read', 'edit'].includes(level)) return res.status(400).json({ error: 'level은 read 또는 edit만 가능합니다.' });
  if (!USERS[id]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (!LOCAL_REPOS[repo]) return res.status(400).json({ error: '존재하지 않는 레포지토리입니다.' });
  USERS[id].repos[repo] = level;
  saveUsers();
  res.json({ success: true });
});

app.put('/api/admin/users/:id/repos/:repo', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { id, repo } = req.params;
  const { level } = req.body;
  if (!['read', 'edit'].includes(level)) return res.status(400).json({ error: 'level은 read 또는 edit만 가능합니다.' });
  if (!USERS[id]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  USERS[id].repos[repo] = level;
  saveUsers();
  res.json({ success: true });
});

app.delete('/api/admin/users/:id/repos/:repo', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { id, repo } = req.params;
  if (!USERS[id]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  delete USERS[id].repos[repo];
  saveUsers();
  res.json({ success: true });
});

// ===== 고객사 단위 권한 부여/회수 (admin) =====
app.post('/api/admin/users/:id/companies', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { id } = req.params;
  const { companyId, level } = req.body;
  if (!['read', 'edit'].includes(level)) return res.status(400).json({ error: 'level은 read 또는 edit만 가능합니다.' });
  if (!USERS[id]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (!COMPANIES.find(c => c.id === companyId)) return res.status(400).json({ error: '존재하지 않는 고객사입니다.' });
  if (!USERS[id].companies) USERS[id].companies = {};
  USERS[id].companies[companyId] = level;
  saveUsers();
  res.json({ success: true });
});

app.delete('/api/admin/users/:id/companies/:companyId', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { id, companyId } = req.params;
  if (!USERS[id]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (USERS[id].companies) delete USERS[id].companies[companyId];
  saveUsers();
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
  if (!USERS[id]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  delete USERS[id];
  for (const [token, session] of Object.entries(sessions)) {
    if (session.id === id) delete sessions[token];
  }
  saveUsers();
  res.json({ success: true });
});

// ===== 인덱스 관리 API =====
app.get('/api/admin/indexes', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const result = Object.entries(LOCAL_REPOS).map(([id, info]) => ({
    id,
    repoPath: getRepoBasePath(id),
    meta: getIndexMeta(id)
  }));
  res.json({ indexes: result });
});

app.post('/api/admin/indexes/:repo/build', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const repoId = decodeURIComponent(req.params.repo);
  const info = LOCAL_REPOS[repoId];
  if (!info) return res.status(404).json({ error: '레포지토리를 찾을 수 없습니다.' });

  const repoPath = getRepoBasePath(repoId);
  res.json({ success: true, message: '인덱스 생성을 시작합니다.' });
  triggerIndexBuild(repoId, repoPath); // 추출된 경로 전달
});

// ===== 고객사 관리 API (Admin) =====
app.get('/api/admin/companies', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const sorted = [...COMPANIES].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  res.json({ companies: sorted });
});

app.post('/api/admin/companies', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const { name, address, manager } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '고객사명을 입력해주세요.' });
  if (COMPANIES.find(c => c.name === name.trim())) return res.status(400).json({ error: '이미 존재하는 고객사명입니다.' });
  COMPANIES.push({ id: 'comp_' + Date.now(), name: name.trim(), address: (address || '').trim(), manager: (manager || '').trim() });
  saveCompanies();
  res.json({ success: true });
});

app.put('/api/admin/companies/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const comp = COMPANIES.find(c => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: '고객사를 찾을 수 없습니다.' });
  const { name, address, manager } = req.body;
  if (name !== undefined) comp.name = name.trim();
  if (address !== undefined) comp.address = address.trim();
  if (manager !== undefined) comp.manager = manager.trim();
  saveCompanies();
  res.json({ success: true });
});

app.delete('/api/admin/companies/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const idx = COMPANIES.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '고객사를 찾을 수 없습니다.' });
  COMPANIES.splice(idx, 1);
  saveCompanies();
  res.json({ success: true });
});

// ===== 소스 뷰어 API =====
app.get('/api/fs/list', authMiddleware, (req, res) => {
  const { repo, dirPath = '' } = req.query;
  if (!getRepoLevel(req.user, repo, LOCAL_REPOS)) return res.status(403).json({ error: '권한이 없습니다.' });

  const basePath = getRepoBasePath(repo);
  if (!basePath) return res.status(404).json({ error: '레포지토리 경로를 찾을 수 없습니다.' });

  const targetPath = path.resolve(basePath, dirPath);
  if (!isPathInside(basePath, targetPath)) {
    return res.status(400).json({ error: '잘못된 경로입니다.' });
  }

  try {
    if (!fs.existsSync(targetPath)) return res.json({ files: [] });
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const result = items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      path: path.join(dirPath, item.name).replace(/\\/g, '/')
    })).sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
    res.json({ files: result });
  } catch (err) {
    res.status(500).json({ error: '디렉토리 조회 실패' });
  }
});

app.get('/api/fs/read', authMiddleware, (req, res) => {
  const { repo, filePath } = req.query;
  if (!getRepoLevel(req.user, repo, LOCAL_REPOS)) return res.status(403).json({ error: '권한이 없습니다.' });

  const basePath = getRepoBasePath(repo);
  if (!basePath) return res.status(404).json({ error: '레포지토리 경로를 찾을 수 없습니다.' });

  const targetPath = path.resolve(basePath, filePath);
  if (!isPathInside(basePath, targetPath)) {
    return res.status(400).json({ error: '잘못된 경로입니다.' });
  }

  try {
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      return res.status(400).json({ error: '파일을 찾을 수 없거나 디렉토리입니다.' });
    }
    const content = fs.readFileSync(targetPath);
    res.json({ base64: content.toString('base64') });
  } catch (err) {
    res.status(500).json({ error: '파일 읽기 실패' });
  }
});

// ===== 소스뷰어 단일 파일/선택영역 AI 분석 — 클라이언트가 디코드한 텍스트를 받아 Claude CLI lean 스폰으로 분석 =====
// RAG용 getSystemPrompt 미사용(단일파일 분석엔 해로움). 도구·MCP 없이 1턴 단발. 비스트리밍(스피너 UX).
const ANALYZE_MAX_CHARS = 200000; // 파일 전체 분석이 본 용도 — 큰 .java/.pc 도 수용(약 50k토큰, Sonnet 200k 컨텍스트). 초과 시만 거부.
app.post('/api/fs/analyze', authMiddleware, (req, res) => {
  const { text, filename = '', question = '' } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: '분석할 내용이 없습니다.' });
  if (text.length > ANALYZE_MAX_CHARS) {
    return res.status(413).json({ error: `내용이 너무 큽니다(${text.length}자). ${ANALYZE_MAX_CHARS}자 이하만 분석 가능합니다. 일부 영역을 드래그해 분석해주세요.` });
  }

  const isSelection = !!question;
  const instruction = isSelection
    ? [
        '당신은 시니어 소프트웨어 엔지니어입니다. 아래 소스의 "선택한 일부 영역"을 한국어로 분석하세요.',
        '- 이 코드 조각이 하는 일',
        '- 핵심 로직 흐름과 의도',
        '- 주의할 점·잠재 버그(있으면)',
        '도구를 쓰지 말고 주어진 내용만으로 답하세요. 마크다운으로 간결하게.',
        '흐름도·트리 같은 도식은 반드시 ``` 코드블록으로 감싸고, 표는 GFM 표 문법(| --- |)을 정확히 지키세요.',
      ].join('\n')
    : [
        '당신은 시니어 소프트웨어 엔지니어입니다. 아래 소스 파일 전체를 한국어로 분석하세요.',
        '- 이 파일의 역할/목적',
        '- 핵심 로직 흐름(주요 함수·클래스)',
        '- 주의할 점·잠재 버그(있으면)',
        '도구를 쓰지 말고 주어진 내용만으로 답하세요. 마크다운으로 간결하게.',
        '흐름도·트리 같은 도식은 반드시 ``` 코드블록으로 감싸고, 표는 GFM 표 문법(| --- |)을 정확히 지키세요.',
      ].join('\n');

  const prompt = `${instruction}\n\n파일명: ${filename || '(미상)'}\n\n\`\`\`\n${text}\n\`\`\``;

  const args = ['-p', '--model', MODEL_IDS.sonnet, '--max-turns', '1',
    '--dangerously-skip-permissions',
    '--disallowedTools', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'Read', 'Grep', 'Glob'];
  const proc = spawn('claude', args, { shell: true, windowsHide: true, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] });

  let out = '', err = '';
  const killer = setTimeout(() => { try { proc.kill(); } catch (e) {} }, 120000);
  proc.stdout.on('data', d => { out += d.toString(); });
  proc.stderr.on('data', d => { err += d.toString(); });
  proc.on('error', e => { clearTimeout(killer); res.status(500).json({ error: '분석 엔진 실행 실패: ' + e.message }); });
  proc.on('close', code => {
    clearTimeout(killer);
    const analysis = out.trim();
    if (!analysis) {
      console.error('[Analyze] empty output, code=', code, 'stderr=', err.slice(0, 300));
      return res.status(500).json({ error: '분석 결과를 생성하지 못했습니다.' });
    }
    res.json({ analysis });
  });
  proc.stdin.write(prompt, 'utf8');
  proc.stdin.end();
});

// ===== 소스 검색 API — 레포 전체 파일명 + 내용(grep). 동기 walk + 타임버짓(이벤트루프 장시간 점유 방지). =====
// 노이즈 디렉터리는 그림자 미러와 동일(SHADOW_XD) 제외, 내용검색은 텍스트 확장자(SOURCE_EXTS)만.
const SEARCH_BUDGET_MS = 1000;
// 이름 매칭에서 제외할 노이즈 확장자 (컴파일/압축/이미지/SVN·eCAMS 메타/백업) — 내용검색은 SOURCE_EXTS 로 별도 게이트.
const NAME_SKIP_EXTS = new Set(['.class', '.o', '.obj', '.jar', '.war', '.ear', '.zip', '.7z', '.tar', '.gz',
  '.png', '.gif', '.jpg', '.jpeg', '.ico', '.svg', '.bmp', '.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.hwp',
  '.svn-base', '.ecm-meta', '.bak']);
const SEARCH_MAX_NAME = 100;
const SEARCH_MAX_CONTENT = 200;
const SEARCH_MAX_PER_FILE = 20;
const SEARCH_MAX_FILE_BYTES = 1500000;

app.get('/api/fs/search', authMiddleware, (req, res) => {
  const { repo } = req.query;
  const q = (req.query.q || '').trim();
  if (!getRepoLevel(req.user, repo, LOCAL_REPOS)) return res.status(403).json({ error: '권한이 없습니다.' });
  if (q.length < 2) return res.json({ nameMatches: [], contentMatches: [], truncated: false });

  const basePath = getRepoBasePath(repo);
  if (!basePath || !fs.existsSync(basePath)) return res.status(404).json({ error: '레포지토리 경로를 찾을 수 없습니다.' });

  const baseResolved = path.resolve(basePath);
  const ql = q.toLowerCase();
  const start = Date.now();
  const nameMatches = [];
  const contentMatches = [];
  let truncated = false;
  const stack = [baseResolved];

  while (stack.length) {
    if (Date.now() - start > SEARCH_BUDGET_MS) { truncated = true; break; }
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (!isPathInside(baseResolved, full)) continue; // 경로이탈 안전망
      const rel = path.relative(baseResolved, full).replace(/\\/g, '/');

      if (e.isDirectory()) {
        if (!SHADOW_XD.includes(e.name)) stack.push(full);
        if (nameMatches.length < SEARCH_MAX_NAME && e.name.toLowerCase().includes(ql))
          nameMatches.push({ path: rel, name: e.name, isDirectory: true });
        continue;
      }

      const fext = path.extname(e.name).toLowerCase();
      if (nameMatches.length < SEARCH_MAX_NAME && !NAME_SKIP_EXTS.has(fext) && e.name.toLowerCase().includes(ql))
        nameMatches.push({ path: rel, name: e.name, isDirectory: false });

      // 내용 검색 — 텍스트 확장자만, 대용량 제외
      if (contentMatches.length >= SEARCH_MAX_CONTENT) continue;
      if (!SOURCE_EXTS.has(fext)) continue;
      let stt; try { stt = fs.statSync(full); } catch (e) { continue; }
      if (stt.size > SEARCH_MAX_FILE_BYTES) continue;
      const content = smartRead(full);
      if (!content || content.toLowerCase().indexOf(ql) === -1) continue;
      const lines = content.split('\n');
      let perFile = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(ql)) {
          contentMatches.push({ path: rel, name: e.name, line: i + 1, text: lines[i].trim().slice(0, 200) });
          if (++perFile >= SEARCH_MAX_PER_FILE || contentMatches.length >= SEARCH_MAX_CONTENT) break;
        }
      }
    }
  }

  res.json({ nameMatches, contentMatches, truncated, elapsed: Date.now() - start });
});

// repoIds → 존재하는 repo 루트 절대경로 배열 (snapshot-restore 가 사용).
function repoRootsFor(repoIds) {
  const set = new Set();
  for (const id of (repoIds || [])) {
    const p = getRepoBasePath(id);
    if (p && fs.existsSync(p)) set.add(path.resolve(p));
  }
  return [...set];
}
// 구버전 ACL 방식(denyWorkspaceWrites)이 남긴 deny ACE 정리 — 시작 시 1회.
// 현재는 snapshot-restore 로 전환됐으나, 이전 버전이 건 잔재 해제를 위해 유지.
function resetLeftoverDenies() {
  if (process.platform !== 'win32') return;
  const user = process.env.USERNAME;
  if (!user) return;
  for (const id in LOCAL_REPOS) {
    const p = getRepoBasePath(id);
    if (p && fs.existsSync(p)) {
      try { execFileSync('icacls', [p, '/remove:d', user], { stdio: 'ignore', windowsHide: true }); } catch (e) {}
    }
  }
}

// ===== Snapshot-Restore: AGY/비-claude 모델의 workspace 수정 복원 =====
// 주의: workspace 는 별도 repo 가 아니라 gitRoot(c:\ecams-ai) 의 하위 폴더다.
// git diff 는 gitRoot 기준 경로를 출력하므로, cwd=gitRoot + pathspec(-- repoRoot)로
// 해당 repo 변경만 scope 한다 (companies.json/users.json 등 서버 파일 오복원 방지).
// core.quotepath=false: 한글 경로가 octal escape 로 깨지는 것 방지.
function gitDiffNamesForRepos(repos) {
  const gitRoot = __dirname;
  const roots = repoRootsFor(repos);
  const set = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const output = execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only', '--', root], { cwd: gitRoot, encoding: 'utf8' }).trim();
      if (output) output.split('\n').forEach(f => set.add(f));
    } catch (e) {
      console.warn(`[Snapshot] git diff 실패 (${root}):`, e.message);
    }
  }
  return set;
}

// 에이전트 실행 전: 현재 수정된 파일 목록을 스냅샷 (gitRoot 기준 경로 배열)
function snapshotModifiedFiles(repos) {
  try {
    return Array.from(gitDiffNamesForRepos(repos));
  } catch (e) {
    console.error('[Snapshot] 스냅샷 생성 실패:', e.message);
    return [];
  }
}

// 에이전트 실행 후: 실행 중 새로 수정된 파일들만 복원 (신규 untracked 파일은 그대로 둠)
function restoreModifiedFiles(repos, beforeSnapshot, meta = {}) {
  try {
    const gitRoot = __dirname;
    const beforeArr = Array.isArray(beforeSnapshot) ? beforeSnapshot : [];
    const afterSet = gitDiffNamesForRepos(repos);

    // 실행 전엔 없었는데 이제 있는 파일들 = 에이전트가 새로 수정한 파일들
    const newlyModified = Array.from(afterSet).filter(f => !beforeArr.includes(f));
    if (newlyModified.length === 0) return;

    const tag = [
      `user=${meta.userId || 'unknown'}`,
      `persona=${meta.persona || 'unknown'}`,
      `model=${meta.model || 'unknown'}`,
      `job=${meta.jobId || 'unknown'}`,
      `repos=${(repos || []).join(',') || 'none'}`
    ].join(' ');
    console.log(`[Restore] 복원 대상: ${newlyModified.length}개 파일 (${tag})`);
    logAgy(`RESTORE_START count=${newlyModified.length} ${tag}`);
    for (const f of newlyModified) {
      try {
        execFileSync('git', ['checkout', '--', f], { cwd: gitRoot, stdio: 'ignore' });
        console.log(`[Restore] ✓ 복원됨: ${f}`);
        logAgy(`RESTORE_FILE ok ${tag} file=${JSON.stringify(f)}`);
      } catch (e) {
        console.warn(`[Restore] 복원 실패 (${f}):`, e.message);
        logAgy(`RESTORE_FILE fail ${tag} file=${JSON.stringify(f)} error=${JSON.stringify(e.message)}`);
      }
    }
  } catch (e) {
    console.error('[Restore] 복원 과정 실패:', e.message);
    logAgy(`RESTORE_ERROR error=${JSON.stringify(e.message)}`);
  }
}

// 같은 repo 를 건드리는 AGY 작업을 직렬화 — 동시 job 의 restore 가 서로의 변경을 되돌리는 것 방지.
// 겹치지 않는 repo(다른 고객사)는 병렬 유지. roots 를 정렬해 잡아 deadlock 회피.
const _repoLocks = new Map(); // repoRoot -> 현재 그 repo 작업 체인의 tail Promise
async function withRepoLock(repos, fn) {
  const roots = repoRootsFor(repos).sort();
  if (roots.length === 0) return await fn();
  const prev = roots.map(r => _repoLocks.get(r) || Promise.resolve());
  let release;
  const gate = new Promise(res => { release = res; });
  roots.forEach(r => _repoLocks.set(r, gate));
  await Promise.all(prev); // 같은 repo 의 이전 작업이 끝나길 대기
  try {
    return await fn();
  } finally {
    release();
    roots.forEach(r => { if (_repoLocks.get(r) === gate) _repoLocks.delete(r); });
  }
}

// LLM diff 는 prefix 누락·들여쓰기 변형이 잦음 → 단계적으로 느슨하게 적용
function tryApplyPatch(original, diff, opt) {
  try { return Diff.applyPatch(original, diff, opt); } catch (e) { return false; }
}
// hunk 본문에서 +/-/공백 prefix 가 없는 줄(맨 앞에 코드가 붙은 줄)은 컨텍스트로 보고 공백 1칸 보정
function repairDiffPrefixes(diff) {
  let inHunk = false;
  return diff.split('\n').map(l => {
    if (/^@@/.test(l)) { inHunk = true; return l; }
    if (/^(---|\+\+\+|diff |index )/.test(l)) { inHunk = false; return l; }
    if (inHunk && l.length && !/^[ +\-\\]/.test(l)) return ' ' + l;
    return l;
  }).join('\n');
}
const collapseWs = s => s.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
function applyDiffTolerant(original, diff) {
  // 1) 엄격 적용
  let out = tryApplyPatch(original, diff, { fuzzFactor: 2 });
  if (typeof out === 'string') return out;
  // 2) prefix 복구 + 공백 무시 비교로 느슨 적용
  const repaired = repairDiffPrefixes(diff);
  out = tryApplyPatch(original, repaired, { fuzzFactor: 4, compareLine: (n, l, op, p) => collapseWs(l) === collapseWs(p) });
  return out; // 실패 시 false
}

// 답변의 unified diff 를 원본에 적용해 수정본 전체 파일을 돌려줌 (diff 블록 "수정본 다운로드")
app.post('/api/fs/apply-diff', authMiddleware, (req, res) => {
  const { diff, repos } = req.body;
  if (!diff || typeof diff !== 'string') return res.status(400).json({ error: 'diff 가 없습니다.' });

  // diff 헤더에서 대상 파일 경로 추출 (+++ b/<path> 또는 --- a/<path>)
  let parsed;
  try { parsed = Diff.parsePatch(diff); } catch (e) { return res.status(400).json({ error: 'diff 파싱 실패' }); }
  if (!parsed.length) return res.status(400).json({ error: '적용할 diff 가 없습니다.' });
  const hunkFile = (parsed[0].newFileName || parsed[0].oldFileName || '').replace(/^[ab]\//, '').replace(/^\.\/+/, '');
  if (!hunkFile || hunkFile === '/dev/null') return res.status(400).json({ error: '대상 파일을 알 수 없습니다.' });

  // 후보 repo 중 해당 파일이 실제로 존재하는 곳 찾기 (권한 있는 repo 한정)
  const candidates = (Array.isArray(repos) && repos.length ? repos : getUserRepos(req.user, LOCAL_REPOS))
    .filter(r => getRepoLevel(req.user, r, LOCAL_REPOS));
  let found = null;
  for (const repo of candidates) {
    const base = getRepoBasePath(repo);
    if (!base) continue;
    const target = path.resolve(base, hunkFile);
    if (isPathInside(base, target) && fs.existsSync(target) && fs.statSync(target).isFile()) {
      found = { repo, target }; break;
    }
  }
  if (!found) return res.status(404).json({ error: '원본 파일을 찾지 못했습니다. (' + hunkFile + ')' });

  try {
    // CRLF 정규화 후 적용 (모델 diff 는 LF 기준이라 컨텍스트 불일치 방지). 엄격→느슨 단계 적용
    const original = smartRead(found.target).replace(/\r\n/g, '\n');
    const applied = applyDiffTolerant(original, diff);
    if (applied === false) {
      return res.status(409).json({ error: 'diff 적용 실패 (원본과 컨텍스트 불일치)', applied: false });
    }
    res.json({ ok: true, fileName: path.basename(hunkFile), content: applied });
  } catch (e) {
    res.status(500).json({ error: '적용 중 오류: ' + e.message });
  }
});

app.get('/api/wiki/read', authMiddleware, (req, res) => {
  const { repo, wikiPath } = req.query;
  if (!getRepoLevel(req.user, repo, LOCAL_REPOS)) return res.status(403).json({ error: '권한이 없습니다.' });

  const safeRepo = repo.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const repoInfo = LOCAL_REPOS[repo] || {};
  let companyFolder = '고객사없음';
  if (repoInfo.companyId) {
    const comp = COMPANIES.find(c => c.id === repoInfo.companyId);
    if (comp) companyFolder = comp.name;
  }
  const baseWikiPath = path.join(__dirname, 'wiki', companyFolder, safeRepo);
  const targetPath = path.resolve(baseWikiPath, wikiPath || 'Main.md');

  if (!isPathInside(baseWikiPath, targetPath)) {
    return res.status(400).json({ error: '잘못된 경로입니다.' });
  }

  try {
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Wiki 파일을 찾을 수 없습니다.' });
    const content = smartRead(targetPath);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: 'Wiki 읽기 실패' });
  }
});

// ===== GitHub MCP 설정 =====
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const MCP_CONFIG = {
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer " + GITHUB_TOKEN
      }
    }
  }
};
const MCP_CONFIG_PATH = path.join(os.tmpdir(), 'ecams_mcp_config.json');
fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(MCP_CONFIG, null, 2), 'utf8');

const SYSTEM_PROMPT = `# ⚠️ 환각 방지 원칙

1. **이름의 함정**: eCAMS는 테이블명(\`CMR0020\`)과 유사 로직명(\`cmr0020_Insert\`)이 공존합니다. 이름만 보고 단정하지 마십시오.

2. **Wiki/Graph 우선 신뢰**: 프롬프트에 주입된 Graph Index와 Wiki는 소스에서 직접 파싱한 검증된 정보입니다. 이를 먼저 활용하십시오.

3. **Grep은 Wiki에 없는 정보만**: Wiki/Graph에 이미 requestType·Servlet 클래스가 명시된 경우 Grep 불필요. Wiki에 없는 세부 SQL·테이블명·비즈니스 로직 확인 시에만 Grep을 사용하십시오.

4. **추적 불가능 핑계 금지**: 서블릿·자바 클래스·위키 문서를 뒤져서 끝까지 추적하십시오.

# 🎯 질문 의도 판별 (답변 형식 선택 전 반드시 수행)

질문을 읽고 아래 유형을 판별한 뒤, 해당 답변 형식을 따르십시오.
- **분석** (what/how): "이 화면 뭐야?", "실행 흐름", "이 함수 역할" → **형식 A** 사용
- **트러블슈팅** (why/not working): "안 돼", "오류", "왜 그런지", "어제는 됐는데" → **형식 B** 사용
- **수정 요청**: "수정해줘", "바꿔줘" → **형식 A** + §5 유지보수 참고사항 필수 작성
- **설계/신규 요구**: "설계해줘", "새로 만들어줘", "추가하고 싶어", "정책 정리", "md로 정리" → **형식 C** 사용

문서 산출물 요청 원칙.
- repo/워크스페이스에 파일을 생성·저장했다고 말하지 마십시오(실제로 저장되지 않습니다).
- 사용자가 "md 파일", "설계서", "정리본" 을 요청하면 답변 본문에 완성된 Markdown 문서 형태로 전부 포함하십시오.
- 신규 소스 파일(신규 클래스/스크립트/DDL 등)을 완전한 내용으로 만들어 달라고 하면 형식 C의 "신규 파일 첨부 규칙"을 따르십시오.

# 📋 답변 형식 A — 분석 (반드시 이 순서대로, 섹션 번호 정확히 유지)

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)
## 1. 요약 (화면 목적 + 서버측 최종 처리 결과)
## 2. 실행 흐름 (JS 버튼/이벤트 → Servlet → Java Class → DB)
## 3. 로직 상세 (Java Class의 핵심 처리 로직: 유효성 검사·분기 조건·트랜잭션·연쇄 처리 등)
## 4. 주요 파일 및 DB 테이블
## 5. 유지보수 참고사항 (사용자가 "수정/개선 방법" 을 물었을 때만 작성)

**5-1. 수정 범위 판정 (반드시 한 줄로 먼저 명시)**
다음 4개 기준을 자가 점검. 하나라도 yes → "넓음", 모두 no → "좁음".
1. DB 스키마 변경이 필요한가? (CREATE/ALTER TABLE, 신규 컬럼/인덱스/FK)
2. 공통 함수/공유 유틸을 수정해야 하는가? (다른 모듈도 호출하는 것)
3. 3개 이상의 파일을 수정해야 하는가?
4. 함수/메서드 시그니처 변경으로 호출자도 같이 수정해야 하는가?

판정 한 줄 예시. \`판정. 넓음 — 사유. DB 스키마 변경(1) + 공통 함수 수정(2)\`

**5-2. 판정별 출력 형식**
- **좁음** → 실제 수정 코드를 unified diff 형식으로 출력. 아래 **diff 작성 규칙을 반드시 준수** (어기면 "수정본 다운로드" 자동 적용이 실패함).
  - \`\`\`diff 코드블록으로 감싸고, 파일 경로 헤더 \`--- a/<상대경로>\` 와 \`+++ b/<상대경로>\` (repo 루트 기준 상대경로) 를 붙일 것.
  - **모든 줄 맨 앞 1글자는 반드시 prefix**. 변경 없는 컨텍스트 줄은 **공백 1칸**, 삭제는 \`-\`, 추가는 \`+\`. prefix 를 빠뜨려 코드를 맨 앞에 붙이지 말 것.
  - 컨텍스트·삭제 줄의 코드는 **원본 파일의 들여쓰기/공백/탭을 글자 그대로** 복사. 임의로 들여쓰기를 더하거나 빼지 말 것.
  - 변경 지점 위아래 컨텍스트 3줄을 **건너뛰지 말고 연속으로** 포함할 것.
  - \`@@ -<구시작>,<구줄수> +<신시작>,<신줄수> @@\` 의 줄 번호·줄 수를 실제 원본과 정확히 일치시킬 것. 라인 위치가 불확실하면 좁음 판정을 포기하고 넓음(스니펫)으로 격상할 것.
- **넓음** → 다음 3개로 분할 출력.
  (a) 변경 대상 리스트 (파일 / 클래스 / 메서드 단위)
  (b) 핵심 변경 지점 before/after 스니펫 3~5개 (DDL, 핵심 메서드, JS 진입점 등)
  (c) 추가 결정이 필요한 항목 (PK 설계, 마이그레이션 방식, 호환성 영향 등)

> 정확한 라인 위치를 Wiki/Graph/Read 로 확인하지 못한 경우 좁음 판정 금지. 추측 diff 작성 금지. 라인 번호 모르면 넓음 으로 격상해서 스니펫 형태로만 제공할 것.

## 6. 추천 추가 질문
- [관련 심화 질문 1]
- [관련 심화 질문 2]
- [관련 심화 질문 3]

> **주의**: ## 3 로직 상세는 반드시 작성하십시오. "Wiki에 없다"는 이유로 생략 불가 — Class Wiki 또는 Java 소스를 읽어서 채우십시오.

# 📋 답변 형식 B — 트러블슈팅 (질문이 "안 된다/오류/왜" 유형일 때)

> 형식 B의 핵심: "무엇을 하는 코드인가" 설명이 아니라 **"왜 안 되는가"에 대한 원인 분석**이 답변의 중심이어야 합니다. 정상 흐름은 원인 비교용으로 간략히만 서술하십시오.

## 0. 분석 근거 (사용한 Wiki/Graph 파일 명시)
## 1. 증상 요약 (사용자가 겪는 현상 1~2문장 정리)
## 2. 원인 후보 (가능성 높은 순서. 각 후보마다 코드 근거·조건 명시)
## 3. 점검 포인트 (사용자/운영자가 확인해야 할 설정·조건·로그·화면 상태)
## 4. 정상 동작 흐름 (해당 기능이 정상일 때의 흐름 — 비교 기준용으로 간략히)
## 5. 주요 파일 및 DB 테이블
## 6. 추천 추가 질문

# 📋 답변 형식 C — 설계/신규 요구 (새 기능·정책·문서화 요청)

> 형식 C의 핵심: 기존 코드 실행 흐름을 억지로 채우지 말고, 사용자가 만들고 싶은 신규 기능/정책/문서를 설계 산출물로 정리하십시오. 단, 근거가 되는 기존 코드·화면·테이블은 확인한 범위에서만 명시하십시오.

## 0. 분석 근거 (사용한 Wiki/Graph/소스 파일 명시)
## 1. 요구사항 정리 (사용자 요청을 기능·데이터·화면·운영 관점으로 재정리)
## 2. 현행 구조 (설계 근거가 되는 기존 코드·테이블·화면 흐름. 확인한 것만 작성)
## 3. 설계안 (신규/변경 테이블, 컬럼, 화면, API, 처리 흐름, 복사/이관 정책 등)
## 4. 변경 대상 목록 (파일/클래스/메서드/DDL/설정 단위)
## 5. 미결정 사항 (PK, 마이그레이션, 권한, 호환성, 운영 정책 등 사용자 결정 필요 항목)
## 6. 추천 추가 질문

> "md 파일로 만들어줘" 라는 요청이 있으면 위 섹션을 Markdown 문서 본문으로 완성해서 답변하십시오. repo에 저장했다고 말하지 마십시오.

### 신규 파일 첨부 규칙 (완전한 내용의 신규 소스 파일을 줄 때)
"## 4. 변경 대상 목록"의 신규 파일 중 내용이 확정되어 사용자가 실제로 내려받아야 하는 것은, 그 항목 바로 아래에 아래 형식으로 전체 내용을 첨부하십시오. 여러 파일이면 파일 수만큼 이 쌍을 반복하십시오.

[📄 <파일명>](newfile:///<repo 루트 기준 상대경로>)
\`\`\`<언어>
<파일 전체 내용>
\`\`\`

- 링크 줄 바로 다음 줄에 코드블록이 와야 합니다(사이에 다른 문장 금지).
- 이 파일은 repo에 저장되지 않습니다. "다운로드 가능한 파일로 첨부했습니다"라고만 안내하고 "저장했다"고 말하지 마십시오.

# 📐 마크다운 출력 규칙 (가독성 — 반드시 준수)
- 모든 섹션 헤더(\`##\`)·소제목(\`**5-1.**\` 같은 굵은 소제목)·구분선(\`---\`)은 **앞뒤로 빈 줄**을 두어 독립된 줄로 출력. 문장 끝에 헤더를 붙이지 말 것 (예: \`...했습니다.## 4. 주요 파일\` 금지 → 마침표 후 빈 줄, 다음 줄에 \`## 4. 주요 파일\`).
- \`## 5. 유지보수 참고사항\` 과 \`**5-1. ...**\` 처럼 헤더 뒤에 소제목이 오면 둘 사이에 **빈 줄**을 넣어 절대 한 줄로 붙이지 말 것.
- 리스트 중첩은 하위 항목을 공백 2칸 들여쓰기로 표현.
- \`(1) (2) (3)\` 처럼 나열할 항목은 줄바꿈하여 적되, 한 문장으로 둘 경우 백틱 인라인코드(\` \` \`)로 통째 감싸지 말 것 (줄바꿈이 죽음).
- **줄바꿈은 빈 줄(개행)로만 표현하고 \`<br>\` 같은 HTML 태그는 절대 쓰지 말 것.** 화면 렌더러가 마크다운만 처리하므로 \`<br>\` 은 글자 그대로 노출됩니다.

# ⛔ 화면명 → 파일 찾기 순서 (반드시 이 순서)

1. **프롬프트 내 [메뉴명 → 파일 매핑] 표** 에서 화면명 검색 → JS 파일명 즉시 확보 ← **가장 먼저**
2. **프롬프트 내 [화면명 매핑: ScreenMap]** 에서 검색 (JS 주석 자동 추출본)
3. **직접 검색**: 위 두 곳에서 못 찾은 경우에만 Grep 사용

# ⛔ 탐색 순서 (Workflow) — 반드시 이 순서 준수

1. **화면명 → 파일명 확보** (위 화면명 찾기 순서 참조)
2. **Graph/Files 읽기**: \`wiki/[repo_id]/Graph/Files/[파일명].md\` 를 Read하여 JS→Servlet→requestType 체인을 파악한다.
3. **Servlet Wiki 읽기**: \`wiki/[repo_id]/Pages/Servlets/[파일명].md\` 를 Read하여 requestType별 Java 클래스를 확인한다.
4. **Class Wiki 읽기**: \`wiki/[repo_id]/Pages/Classes/[클래스명].md\` 를 Read하여 메서드별 처리 로직을 파악한다. ← **로직 상세 작성에 필수**
5. **Grep (필요시만)**: 위에서 파악 못한 SQL·테이블명·조건 분기가 있을 때만 Java 소스를 Grep한다.
6. **답변 작성**: 위에서 수집한 정보로 즉시 답변한다.

# ⛔ 파일 탐색 규칙
- 총 도구 사용 8회 제한 (Class Wiki 포함하므로 +2 여유).
- LS/Glob은 사용하지 마십시오 — 파일 목록은 프롬프트에 이미 주입됨.
- 반드시 한국어 답변`;

// ===== Repo-map 모드 SYSTEM_PROMPT (USE_REPO_MAP=true 시, system.md 13개 규칙 기반) =====
const USE_REPO_MAP = process.env.USE_REPO_MAP === 'true';

const SYSTEM_PROMPT_REPO_MAP = `# eCAMS 답변 시스템 — Repo-map 모드 (system.md 13개 규칙 적용)

## ⛔ 답변 절대 규칙 (모든 답변 적용)

### 1. 사실/추정/자료없음 표기 (모든 주장에 명시)
- (사실) — 자료에서 직접 인용. 출처 \`file:line\` 필수.
- (추정) — 코드 정독 추론. 추론 근거 한 줄 + 출처.
- (자료 없음) — 입력 자료에 없음. 추측 금지.

### 2. 출처 핀포인트 인용 강제
모든 사실 주장은 문장 끝에 \`[파일경로:라인번호]\` 형식으로 달아주세요. 예: \`[PopApprovalInfo.js:129]\`.
출처 없는 단정은 거짓입니다. 추측일 경우 "추정됩니다" 처럼 부드럽게 서술하세요.

### 3. 동명 컬럼 분리 (가장 중요)
eCAMS는 cr_status, cr_acptno, cr_qrycd 등 동명 컬럼이 여러 테이블에 존재. **의미가 다름**.
- CMR0020.CR_STATUS = 프로그램 정보 상태 (22개 코드)
- CMR1000.CR_STATUS = 신청 상태 (4~5개 코드)
- CMR9900.CR_STATUS = 결재 단계 상태 ('0' 신청진행중, '3' 반려, '9' 완료)
**한 페이지/답변은 한 테이블의 컬럼만 다룰 것. 다른 테이블 enrichment 적용 금지.**

### 4. 도메인 환경 인식
- DB: Oracle/Tibero (CHAR 부등호 비교 안전)
- 일반 SQL 지식으로 의심하지 말 것. Oracle/Tibero 우선.
- PL/SQL 비즈니스 로직 정상 패턴.

### 5. Negative finding 명시
"검색했으나 발견 못함" 도 결과. 단조 상태머신, read-only 레이어, dead code 단서.

### 6. Writer/Reader 분석
어떤 값을 누가 쓰는지(writer) / 누가 읽는지(reader) cross-layer 식별. 유일한 writer 식별 시 명시.

### 7. eCAMS 4-layer 명시
| Layer | 패턴 |
|---|---|
| UI | kjbank_html5/, *.js, *.jsp, *Servlet.java |
| Server | kjbank_server/, *.pc, *.c |
| DB | sample_db/, *.sql, triggers/, procedures/ |
| Plugin | (별도) |
각 사실이 어느 레이어인지 명시.

### 8. 사이트별 변동
한 페이지는 한 사이트 (kjbank 또는 toss 등) 한정. 다른 사이트는 다를 수 있음 명시.

### 9. Enrichment 전 값 인용 + 출처 메타
코드사전 (CMM0020) 매핑 N개 있으면 전 N개 인용. 발췌 시 "총 N개 중 주요 M개" 명시.
출처: \`(사실, 출처: ENRICHMENT cm_macode='X')\` 형식.

### 10. 추측 금지 — "자료 없음" 강제
출처 file:line 없으면 (자료 없음) 표기. **추측은 거짓**.

## 📋 답변 형식 (자연스럽고 읽기 편하게 작성하되 출처 명시)

### 0. 분석 근거 (읽어들인 파일 명시)
### 1. 핵심 요약 (화면/기능의 목적과 서버측 처리 결과)
### 2. 상세 실행 흐름 및 조건 (UI → Server → DB)
- **로직 상세**: (유효성 검사, 분기 조건, 트랜잭션 등)
### 3. 주요 연관 테이블 및 공통코드
### 4. 미확인 사항 및 추가 권장 조사 (필요 시)

> **주의사항**:
> 1. 모든 기술적 주장이나 로직 설명의 문장 끝에는 반드시 \`[PopApprovalInfo.js:129]\` 처럼 출처 라인을 달아주세요. 
> 2. 프롬프트에 주입된 "DB 사전 & 스키마"에서 온 정보라면, "자료 없음"이 아닌 \`[자동 주입 스키마]\` 라고 출처를 적으세요.
> 3. "(사실)", "(추정)" 같은 딱딱한 태그는 문장 앞에 붙이지 말고, 자연스러운 줄글 형태로 부드럽게 설명해 주세요. (출처만 대괄호로 달아주면 됩니다)
> 4. 만약 도구를 써도 찾지 못한 정보가 있다면 "현재 제공된 소스에서는 확인이 불가능합니다" 라고 부드럽게 명시하세요.

## ⛔ Repo-map 활용 워크플로우

1. **Repo-map 의 Top 심볼 우선 read** — 도메인 핵심으로 자동 ranking 된 결과
2. 첫 grep/read 시 Top 1~5 파일 우선
3. cross-cutting 필요 시 Top 10~20 도 read
4. Repo-map 에 없는 entity 도 추가 grep 가능 (단 정직 표기)
5. **모든 답변에 file:line 인용 강제**

## ⛔ 절대 금지
- 출처 없는 단정 ("이 함수는 X 한다" — file:line 없으면 거부)
- 동명 컬럼 의미 혼동 (CMR0020.CR_STATUS 의미를 CMR9900.CR_STATUS 에 적용)
- 한국어 도메인 룰을 일반 SQL 지식으로 의심
- 추측을 (사실) 로 표기

반드시 한국어 답변. 모든 사실에 표기 + 출처 강제.`;

function getSystemPrompt() {
  return USE_REPO_MAP ? SYSTEM_PROMPT_REPO_MAP : SYSTEM_PROMPT;
}

// ===== Persona 판정 (소속 기반) =====
// customer(고객사 직원)만 enduser. azsoft·레거시 미설정 계정은 developer(기존 동작 유지).
function getPersona(user) {
  return user && user.userType === 'customer' ? 'enduser' : 'developer';
}

// ===== 엔드유저(고객사 직원) 응답 지시 — user prompt 최상단 prepend 용 =====
// 개발자용 SYSTEM_PROMPT 의 소스/diff 중심 답변 형식(## 0~6)을 명시적으로 덮어쓴다.
const ENDUSER_DIRECTIVE = `# 🧭 응답 대상: 일반 사용자 (고객사 직원)

당신은 이 시스템을 사용하는 **일반 사용자**를 돕는 친절한 안내 도우미입니다. 상대는 개발자가 아니며, 소스코드·내부 로직이 아니라 **"화면에서 무엇을 어떻게 클릭/입력해야 하는지"** 만 알고 싶어 합니다.

## 반드시 지킬 것
- **위 시스템 프롬프트의 답변 형식(## 0. 분석 근거 ~ ## 6. 추천 질문, diff, 실행 흐름 등)은 모두 무시**하십시오. 이 형식은 개발자용입니다.
- 소스 파일명·함수명·테이블명·Servlet·코드·diff·SQL 을 **답변에 절대 노출하지 마십시오**.
- 화면 이름, 메뉴 경로, 버튼/입력칸 라벨, 클릭 순서로만 설명하십시오.
- 답변은 **번호가 매겨진 단계(1. 2. 3. …)** 로 작성하고, 각 단계는 한 문장으로 짧고 쉽게.
- 오류/문제 상황이면 "왜 그런지" 보다 "그래서 화면에서 어떻게 해결/우회하는지" 를 먼저 제시.
- 파일을 생성/저장했다고 말하지 마십시오. 사용자가 "md 파일", "정리본" 을 요청하면 답변 본문에 읽기 쉬운 Markdown 형식으로 작성하십시오.

## 환각 금지 (중요)
- 화면 라벨·메뉴 경로·동작은 주입된 가이드/화면 정보에 **실제로 있는 것만** 사용하십시오.
- 확인되지 않은 버튼 위치나 절차를 지어내지 마십시오. 모르면 "해당 부분은 담당자/관리자에게 문의가 필요합니다" 라고 안내하십시오.

## 답변 형식
1. 한 줄 요약 (무엇을 하려는 건지)
2. 따라하기 단계 (1. 2. 3. … 화면 조작 순서)
3. (필요 시) 주의할 점 / 자주 막히는 부분

---

`;

// ===== 동시 처리 세마포어 (최대 N명 병렬 처리) =====
const MAX_CONCURRENT = 3;

class Semaphore {
  constructor(max) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }
  add(job) {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this._process();
    });
  }
  async _process() {
    if (this.running >= this.max || this.queue.length === 0) return;
    this.running++;
    const { job, resolve, reject } = this.queue.shift();
    try { resolve(await job()); } catch (e) { reject(e); }
    finally { this.running--; this._process(); }
  }
  get size() { return this.queue.length; }
  get isRunning() { return this.running > 0; }
}

const requestQueue = new Semaphore(MAX_CONCURRENT);

// 피드백 대기 중인 답변 (chatId → { repos, question, answer, timestamp })
const pendingFeedback = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, entry] of pendingFeedback) {
    if (entry.timestamp < cutoff) pendingFeedback.delete(id);
  }
}, 5 * 60 * 1000);

// 답변 캐시 (동일 질문 + 동일 레포 → 즉시 반환, 24시간 TTL, 파일 영속화)
const ANSWER_CACHE_PATH = path.join(__dirname, 'answer_cache.json');
let answerCache = new Map();

// 시맨틱 캐시 임계값 (결정 73~74) — 자동반환은 보수적, 후보는 사용자가 직접 선택
const SEMANTIC_AUTO = 0.95;          // 이상 → 자동 반환 (modeTag 일치)
const SEMANTIC_CANDIDATE_MIN = 0.80; // 이상 & 자동반환 실패 → 후보 제시 (modeTag 무관)
const SEMANTIC_CANDIDATE_MAX = 5;    // 후보 최대 개수

function loadAnswerCache() {
  try {
    if (fs.existsSync(ANSWER_CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(ANSWER_CACHE_PATH, 'utf8'));
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const [k, v] of Object.entries(raw)) {
        if (v.date > cutoff) answerCache.set(k, v); // 만료된 것은 로드 안 함
      }
      console.log(`[Cache] Loaded ${answerCache.size} cached answers`);
    }
  } catch (e) { console.error('[Cache] Load failed:', e.message); }
}

function saveAnswerCache() {
  try {
    const obj = Object.fromEntries(answerCache);
    fs.writeFileSync(ANSWER_CACHE_PATH, JSON.stringify(obj), 'utf8');
  } catch (e) { console.error('[Cache] Save failed:', e.message); }
}

loadAnswerCache();

function getAnswerCacheKey(question, repoIds, model = 'claude', fastMode = false, persona = 'developer') {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, ' ');
  const reposKey = [...repoIds].sort().join(',');
  const modeTag = (fastMode ? 'F' : 'P') + '|' + model;
  // persona 차원 추가 — 개발자 답변(소스 노출)이 엔드유저에게 캐시로 새는 것 방지 (결정 79)
  return crypto.createHash('md5').update(normalized + '|' + reposKey + '|' + modeTag + '|' + persona).digest('hex');
}

// 만료 항목 정리 + 파일 저장 (1시간마다)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, v] of answerCache) {
    if (v.date < cutoff) answerCache.delete(k);
  }
  saveAnswerCache();
}, 60 * 60 * 1000);

// ===== 메뉴명 → JSP/JS 매핑 로드 =====
// screen_maps/{safeRepoId}.txt 우선, 없으면 default.txt
// 형식: 메뉴명\t/webPage/경로/파일.jsp  (한 줄에 하나)
function loadMenuMap(repoId) {
  const safeId = repoId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const specific = path.join(__dirname, 'screen_maps', safeId + '.txt');
  const defaultFile = path.join(__dirname, 'screen_maps', 'default.txt');
  const filePath = fs.existsSync(specific) ? specific : (fs.existsSync(defaultFile) ? defaultFile : null);
  if (!filePath) return '';

  const entries = [];
  // jspPath → [menuNames] (중복 JSP 처리)
  const jspToMenus = new Map();
  for (const line of smartRead(filePath).split('\n')) {
    const parts = line.trim().split('\t');
    if (parts.length < 2) continue;
    const menuName = parts[0].trim();
    const jspPath  = parts[1].trim();
    if (!menuName || !jspPath) continue;
    if (!jspToMenus.has(jspPath)) jspToMenus.set(jspPath, []);
    jspToMenus.get(jspPath).push(menuName);
  }

  for (const [jspPath, menus] of jspToMenus) {
    const jsFile = jspPath.endsWith('.jsp') ? path.basename(jspPath, '.jsp') + '.js' : '';
    entries.push({ menus, jspPath, jsFile });
  }

  if (!entries.length) return '';
  let md = `## [메뉴명 → 파일 매핑 (최우선 조회 — 이 표에서 먼저 찾을 것)]\n`;
  md += `> 화면명 찾기 순서: ① 이 표 → ② ScreenMap(아래) → ③ 직접 검색\n\n`;
  md += `| 메뉴명(들) | JSP 경로 | JS 파일 |\n|---|---|---|\n`;
  entries.forEach(({ menus, jspPath, jsFile }) => {
    md += `| ${menus.join(', ')} | \`${jspPath}\` | ${jsFile || '-'} |\n`;
  });
  return md + '\n';
}

// ===== 프롬프트 구성 =====
async function buildPrompt(message, allowedRepos, userReposPerms, history, imagePaths, apiKey, fastMode = false, concise = true, persona = 'developer', triageTarget = null) {
  // imagePaths: 절대경로 문자열 배열 (다중 첨부). 하위호환 — 단일 문자열로 들어와도 배열로 정규화.
  if (typeof imagePaths === 'string') imagePaths = [imagePaths];
  const hasImages = Array.isArray(imagePaths) && imagePaths.length > 0;
  let prompt = '';
  let usedFastMode = false;

  // ===== 엔드유저(고객사 직원) 응답 지시 — 개발자용 형식보다 우선하도록 최상단 prepend =====
  if (persona === 'enduser') {
    prompt += ENDUSER_DIRECTIVE;
  }

  // ===== 간결 모드 지시 (출력 토큰 감축) =====
  if (concise) {
    prompt += '## ⚡ 간결 모드 (응답 길이 제한)\n';
    prompt += '- 핵심 정보만 답하십시오. 불필요한 섹션·표·반복을 피하십시오.\n';
    prompt += '- 권장 구성: ① 1~2문장 요약 ② 실행 흐름(코드블록 1개) ③ 핵심 SQL/로직(짧게) ④ 주요 파일·테이블 1~5줄.\n';
    prompt += '- "유지보수 참고사항", "상세 분석 근거" 같은 부가 섹션은 사용자가 명시적으로 요청한 경우에만 작성하십시오.\n';
    prompt += '- 총 출력 1,500 토큰 이하를 목표로 하십시오. 빠른 응답을 위해서입니다.\n\n';
  }

  // ===== 레포지토리 목록 및 권한 =====
  prompt += '# 접근 허가된 레포지토리 목록\n';
  allowedRepos.forEach(r => {
    const repoInfo = LOCAL_REPOS[r];
    const localPath = getRepoBasePath(r);
    const perm = userReposPerms[r];
    if (localPath) {
      prompt += `- [${r}]: ${localPath} (권한: ${perm === 'edit' ? '수정 가능' : '읽기 전용'})\n`;
    }
  });
  prompt += '\n';

  // ===== Wiki 선조립 컨텍스트 주입 (빠른모드/정밀모드 공통) =====
  // 단, fastContext 플래그(usedFastMode)는 빠른모드일 때만 True → max-turns·MCP는 모드별 분리
  let preloadOK = false;
  if (!hasImages) {
    const ctx = await buildContext(message, allowedRepos, LOCAL_REPOS, history, apiKey, triageTarget);
    if (!ctx.isEmpty) {
      preloadOK = true;
      console.log(`[Preload] 선조립 완료 (${fastMode ? 'Fast' : 'Precise'}): JS [${ctx.hits.join(', ')}] (${ctx.elapsed}ms)`);
      prompt += '## [중요: 파일 탐색 지침] ##\n';
      if (fastMode) {
        prompt += '아래 선조립 컨텍스트에 이미 관련 Wiki가 주입되어 있습니다. Read 도구는 컨텍스트에 명백히 없는 정보에만 사용하십시오.\n\n';
      } else {
        prompt += '아래 선조립 컨텍스트가 주요 Wiki를 미리 가져왔습니다. 우선 이 컨텍스트로 답변을 작성하고, 추가 깊이 분석이 필요할 때만 Read·Grep으로 보충하십시오.\n\n';
      }
      prompt += ctx.contextBlock;
      if (fastMode) usedFastMode = true;
    } else {
      console.log(`[Preload] 매칭 실패 (${fastMode ? 'Fast' : 'Precise'} 모드) → wiki 목록만 안내`);
    }
  }

  // ===== 정밀 모드(또는 fast 모드 매칭 실패): 기존 방식으로 Wiki 목록 주입 (선조립과 병행 가능) =====
  // USE_REPO_MAP + repo-map 성공 시 이중 주입 방지 (결정 66, 2026-05-21)
  if (!usedFastMode && !(USE_REPO_MAP && preloadOK)) {
    prompt += '## [중요: 파일 탐색 지침] ##\n';
    prompt += '1. 파일 구조가 궁금하면 직접 `indexes/[repo_id]_index.md` 파일을 Read 도구로 읽으십시오. 프롬프트에는 인덱스를 포함하지 않습니다.\n';
    prompt += '2. 시스템 구조와 관계를 파악하려면 `wiki/[repo_id]/Main.md` 또는 `wiki/[repo_id]/Graph/_Index.md`를 먼저 읽으십시오.\n\n';

    prompt += '# 💡 분석 가이드: 위키 및 인덱스 활용\n';
    prompt += '- **Graph Index와 Wiki 파일 목록은 이미 아래에 주입됨** — LS/Glob/Index Read 불필요. 필요한 파일을 바로 `Read`하십시오.\n';
    prompt += '- **🔑 관계도 파일 경로 (가장 먼저 읽을 것)**: `wiki/[repo_id]/Graph/Files/[JS파일명].md` — JS→Servlet→requestType 체인이 여기에 있습니다.\n';
    prompt += '- **Servlet Wiki 경로**: `wiki/[repo_id]/Pages/Servlets/[파일명].md`\n';
    prompt += '- **JS Wiki 경로**: `wiki/[repo_id]/Pages/JS/[파일명].md`\n\n';

    const menuMapContent = loadMenuMap(allowedRepos[0] || '');
    if (menuMapContent) prompt += menuMapContent;

    for (const r of allowedRepos) {
      const repoInfo = LOCAL_REPOS[r] || {};
      let companyFolder = '고객사없음';
      if (repoInfo.companyId) {
        const comp = COMPANIES.find(c => c.id === repoInfo.companyId);
        if (comp) companyFolder = comp.name;
      }
      const wikiRoot = path.join(__dirname, 'wiki', companyFolder, r);

      const screenMapPath = path.join(wikiRoot, 'ScreenMap.md');
      if (fs.existsSync(screenMapPath)) {
        try {
          const smContent = fs.readFileSync(screenMapPath, 'utf8');
          prompt += `## [화면명 매핑: ${r}]\n${smContent.substring(0, 4000)}\n\n`;
        } catch (e) {}
      }

      const indexMdPath = path.join(wikiRoot, 'Graph', '_Index.md');
      if (fs.existsSync(indexMdPath)) {
        try {
          const indexContent = fs.readFileSync(indexMdPath, 'utf8');
          prompt += `## [Graph Index: ${r}]\n${indexContent.substring(0, 3000)}\n\n`;
        } catch (e) {}
      }

      const pagesDir = path.join(wikiRoot, 'Pages');
      if (fs.existsSync(pagesDir)) {
        prompt += `## [Wiki 파일 목록: ${r}]\n`;
        try {
          const categories = fs.readdirSync(pagesDir, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name);
          for (const cat of categories) {
            try {
              const files = fs.readdirSync(path.join(pagesDir, cat))
                .filter(f => f.endsWith('.md') && f !== 'Index.md');
              if (files.length > 0)
                prompt += `- **${cat}**: ${files.map(f => f.replace('.md', '')).join(', ')}\n`;
            } catch (e) {}
          }
        } catch (e) {}
        prompt += '\n';
      }
    }

    for (const r of allowedRepos) {
      const repoPath = getRepoBasePath(r);
      if (!repoPath) continue;
      const isRelevant = message.includes(r) || r === allowedRepos[0];
      if (!isRelevant) continue;
      const absRepoPath = path.resolve(repoPath);
      const graphResult = await runGraphifyQuery(message, absRepoPath, history);
      if (graphResult && graphResult.length > 100) {
        prompt += `\n# [Graphify: ${r}]\n${graphResult}\n\n`;
      }
    }
  }

  // ===== 지능형 사이트 관계 정보 (경량화) =====
  const siteContexts = new Set();
  allowedRepos.forEach(r => {
    const info = LOCAL_REPOS[r];
    if (info?.companyId && info.companyId !== 'none') siteContexts.add(info.companyId);
  });

  if (siteContexts.size > 0) {
    prompt += '## [연관 레포지토리 관계] ##\n';
    siteContexts.forEach(cid => {
      const company = COMPANIES.find(c => c.id === cid) || { name: cid };
      const siteRepos = Object.keys(LOCAL_REPOS).filter(id => LOCAL_REPOS[id].companyId === cid);
      const dbs = siteRepos.filter(id => LOCAL_REPOS[id].type === 'db');
      prompt += `- ${company.name} 사이트: DB 정보 필요 시 [${dbs.join(', ')}] 레포지토리의 Wiki/Index를 확인하십시오.\n`;
    });
    prompt += '\n';
  }

  // ===== 관련 과거 지식 주입 =====
  if (persona === 'enduser') {
    // 엔드유저(고객사 직원) — 가이드 store 만 주입 (개발자 QA/코드 지식은 노출하지 않음, 결정 76)
    const guide = await getGuideKnowledge(message, allowedRepos, apiKey);
    console.log(`[Persona] enduser — 가이드 검색: ${guide ? guide.length + '자 hit' : 'miss(임계값 0.65 미달)'}`);
    if (guide) prompt += guide + '\n';
  } else if (!(USE_REPO_MAP && preloadOK)) {
    // 개발자 — 기존 경로 그대로 (결정 66, 2026-05-21: repo-map 성공 시 이중 주입 방지)
    const relevantKnowledge = await getRelevantKnowledge(message, allowedRepos, apiKey);
    if (relevantKnowledge) prompt += '# [참고: 과거 유사 분석 사례]\n' + relevantKnowledge + '\n';
  }

  const recentHistory = (history || []).slice(-4); // 되묻기 멀티턴에서 처음 질문(핵심 증상)이 잘려나가지 않도록 윈도우 확보
  if (recentHistory.length > 0) {
    prompt += '# 이전 대화 (요약)\n';
    recentHistory.forEach(msg => {
      prompt += `[${msg.role === 'user' ? '사용자' : 'AI'}]: ${msg.content.substring(0, 300)}\n`;
    });
  }

  // 이미지 첨부 — 절대경로를 prompt 본문에 줄단위로 주입하면 각 모델이 직접 이미지에 접근.
  // agy(1.0.10+): prompt 파일 본문 안 절대경로를 멀티모달로 자동 첨부 (probe 재검증, 결정 19 폐기).
  // Claude CLI: prompt 에 path 박혀있으면 Read tool 로 자동 인식.
  if (hasImages) {
    prompt += '\n# 첨부 이미지\n아래 경로의 이미지 파일들을 직접 열어 분석에 참고해줘.\n';
    imagePaths.forEach(p => { prompt += p + '\n'; });
    prompt += '\n';
  }

  prompt += '\n# [현재 질문]\n' + message;

  // ===== 지능형 DB 코드 사전 및 스키마 추출 (결정 70) =====
  const textToScan = prompt.toUpperCase();
  const injectedCodes = {};
  const injectedTables = {};

  // 필수 사전 및 테이블 강제 주입 (환각 방지)
  const alwaysIncludeCodes = ['REQUEST', 'CMR0020'];
  const alwaysIncludeTables = ['CMR1000', 'CMR0020', 'CMR9900'];
  
  for (const macode of alwaysIncludeCodes) {
    if (globalCodeMap[macode]) injectedCodes[macode] = globalCodeMap[macode];
  }
  for (const tb of alwaysIncludeTables) {
    if (globalTableMap[tb]) injectedTables[tb] = globalTableMap[tb];
  }

  // 동적 스캔
  for (const [col, macode] of Object.entries(globalColMap)) {
    if (col.length < 3) continue;
    if (textToScan.includes(col)) {
      if (globalCodeMap[macode]) injectedCodes[macode] = globalCodeMap[macode];
    }
  }

  for (const [tbName, schema] of Object.entries(globalTableMap)) {
    if (tbName.length < 3) continue;
    if (textToScan.includes(tbName)) {
      injectedTables[tbName] = schema;
    }
  }

  const codeKeys = Object.keys(injectedCodes);
  const tableKeys = Object.keys(injectedTables);

  if (codeKeys.length > 0 || tableKeys.length > 0) {
    prompt += '\n\n## [자동 추출된 DB 사전 & 스키마] ##\n';
    prompt += '아래는 현재 질문/문맥에 연관된 DB 테이블 스키마와 공통코드 값들입니다. SQL 작성이나 로직 분석 시 이 값들을 최우선으로 참고하십시오.\n\n';
    
    if (tableKeys.length > 0) {
      prompt += '### 연관 테이블 스키마\n';
      tableKeys.forEach(tb => {
        prompt += `- **${tb}**\n`;
        injectedTables[tb].forEach(col => {
          prompt += `  - ${col.name} (${col.type})\n`;
        });
      });
      prompt += '\n';
    }

    if (codeKeys.length > 0) {
      prompt += '### 연관 공통코드 사전 (CM_MACODE / COLUMN)\n';
      codeKeys.forEach(macode => {
        prompt += `- **${macode}**: ${JSON.stringify(injectedCodes[macode])}\n`;
      });
      prompt += '\n';
    }
    
    console.log(`[Dynamic Inject] Tables: ${tableKeys.join(', ')} | Codes: ${codeKeys.join(', ')}`);
  }

  return { prompt, usedFastMode };
}

// ===== stream-json 파싱해서 SSE로 전송 =====
function parseStreamAndSend(line, res, state) {
  try {
    if (!line.trim()) return;
    const obj = JSON.parse(line);

    if (obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
      obj.message.content.forEach(block => {
        if (block.type === 'text' && block.text) {
          res.write('data: ' + JSON.stringify({ type: 'text', text: block.text }) + '\n\n');
          state.answer += block.text;
        }
        if (block.type === 'tool_use') {
          const toolName = block.name || '';
          const input = block.input || {};
          let statusMsg = '';

          if (toolName === 'Read') statusMsg = '📄 파일 읽는 중: ' + (input.file_path || input.path || '');
          else if (toolName === 'LS' || toolName === 'Glob') statusMsg = '📁 탐색 중: ' + (input.path || input.pattern || '');
          else if (toolName === 'Grep') statusMsg = '🔍 검색 중: ' + (input.pattern || '');
          else if (toolName === 'WebFetch') statusMsg = '🌐 웹 조회 중: ' + (input.url || '').substring(0, 60);
          else if (toolName === 'Bash' || toolName === 'PowerShell') statusMsg = '⚙️ 명령 실행 중...';
          else if (toolName) statusMsg = '🔧 ' + toolName + ': ' + JSON.stringify(input).substring(0, 60);

          if (statusMsg) res.write('data: ' + JSON.stringify({ type: 'status', text: statusMsg }) + '\n\n');
        }
      });
    }

    if (obj.type === 'result') {
      if (obj.result && !state.answer) {
        state.answer = obj.result;
        res.write('data: ' + JSON.stringify({ type: 'text', text: obj.result }) + '\n\n');
      }
      if (obj.usage) state.usage = obj.usage;
      if (obj.duration_ms) state.duration_ms = obj.duration_ms;
    }
  } catch (e) { }
}

// ===== Graphify Query 실행 =====
function runGraphifyQuery(question, repoPath, history) {
  const graphJsonPath = path.join(repoPath, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphJsonPath)) {
    console.log(`[Graphify] Skip: graph.json not found at ${graphJsonPath}`);
    return Promise.resolve(null);
  }

  // 질문에서 식별자 추출 + 질문 전체도 활용
  const combinedText = [question, ...(history || []).slice(-2).map(m => m.content || '')].join(' ');
  const terms = [...new Set((combinedText.match(/[A-Za-z][A-Za-z0-9_]{3,}/g) || []))].slice(0, 15);

  // 식별자가 없으면 질문 전체를 사용, 있으면 식별자와 질문을 섞음
  const queryStr = terms.length > 0 ? terms.join(' ') : question;

  return new Promise((resolve) => {
    const proc = spawn('graphify', [
      'query', `"${queryStr}"`,
      '--budget', '3000',
      '--graph', `"${graphJsonPath}"`
    ], {
      shell: true,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let output = '';
    proc.stdout.on('data', d => { output += d.toString(); });
    proc.stderr.on('data', () => { });
    proc.on('close', () => resolve(output.trim() || null));
    proc.on('error', () => resolve(null));
    setTimeout(() => { try { proc.kill(); } catch (e) { } resolve(output.trim() || null); }, 12000);
  });
}

// ===== AGY 그림자(shadow) 격리 =====
// AGY 는 도구 차단 플래그가 없어 원본을 직접 수정한다(검증 완료). 원본 대신 미러 복사본에서 실행해 보호한다.
const SHADOW_ROOT = path.join(__dirname, '.shadow');

// 실제 경로 → 그림자 경로 (gitRoot 기준 상대구조 유지). 예: workspace/광주은행/x → .shadow/workspace/광주은행/x
function shadowPathFor(realPath) {
  const resolved = path.resolve(realPath);
  const rel = path.relative(__dirname, resolved);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return path.join(SHADOW_ROOT, rel);
  const known = splitKnownDataPath(resolved);
  if (known) return path.join(SHADOW_ROOT, known.kind, ...known.rest);
  return path.join(SHADOW_ROOT, path.basename(resolved));
}

// 그림자 미러에서 제외할 노이즈 디렉토리 — VCS/IDE/빌드/바이너리/웹정적자원. AGY 의 Grep/Glob 탐색 표면을 줄여 수렴 실패·타임아웃 방지.
// web: js·webPage·ecams_win_flex·initech·bancs·루트파일은 제외목록에 없어 자동 보존. server/plugin: 소스 위치 무관하게 .pc·mapper·app/org 보존.
const SHADOW_XD = ['.svn', '.git', '.settings', 'bin', 'lib', 'lib_', 'libaes', 'libenc', 'libsock',
  'tmp', 'docs', 'graphify-out', 'css', 'fonts', 'img', 'scripts', 'styles', 'vendor',
  'META-INF', 'WEB-INF', 'ecamsplugin'];
// 제외할 노이즈 파일 패턴 — 컴파일/압축/이미지/SVN/메타/백업(.bak·.back·_back·_real·_날짜).
const SHADOW_XF = ['*.class', '*.o', '*.obj', '*.jar', '*.war', '*.ear', '*.zip', '*.7z', '*.tar', '*.gz',
  '*.png', '*.gif', '*.jpg', '*.jpeg', '*.ico', '*.svg', '*.bmp',
  '*.ppt', '*.pptx', '*.doc', '*.docx', '*.xls', '*.xlsx', '*.pdf', '*.hwp',
  '*.svn-base', '*.ecm-meta', '*.bak', '*.back', '*_back', '*_bak', '*_real', '*_20??????*'];

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}
const SHADOW_XF_RE = SHADOW_XF.map(wildcardToRegExp);
function isShadowExcludedFile(name) {
  return SHADOW_XF_RE.some(re => re.test(name));
}

function mirrorDirectorySync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const sourceNames = new Set();
  let entries;
  try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch (e) { return; }

  for (const e of entries) {
    if (e.isDirectory() && SHADOW_XD.includes(e.name)) continue;
    if (e.isFile() && isShadowExcludedFile(e.name)) continue;
    sourceNames.add(e.name);
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      mirrorDirectorySync(s, d);
    } else if (e.isFile()) {
      fs.copyFileSync(s, d);
    }
  }

  let dstEntries;
  try { dstEntries = fs.readdirSync(dst, { withFileTypes: true }); } catch (e) { return; }
  for (const e of dstEntries) {
    if (!sourceNames.has(e.name)) {
      fs.rmSync(path.join(dst, e.name), { recursive: true, force: true });
    }
  }
}

// Windows는 robocopy /MIR, 그 외 OS는 Node 기반 미러. 둘 다 shadow 하위만 갱신한다.
function robomirror(src, dst) {
  return new Promise((resolve, reject) => {
    try { fs.mkdirSync(dst, { recursive: true }); } catch (e) {}
    if (process.platform !== 'win32') {
      try {
        mirrorDirectorySync(src, dst);
        return resolve();
      } catch (e) {
        console.error(`[Shadow] mirror 실패: ${src} → ${dst}`, e.message);
        return reject(e);
      }
    }
    execFile('robocopy', [src, dst, '/MIR', '/MT:16', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1',
      '/XD', ...SHADOW_XD, '/XF', ...SHADOW_XF],
      { windowsHide: true }, (err) => {
        const code = err && typeof err.code === 'number' ? err.code : 0;
        if (code >= 8) {
          console.error(`[Shadow] robocopy 실패 (code ${code}): ${src} → ${dst}`);
          return reject(err);
        }
        resolve();
      });
  });
}

// 그림자 wiki/indexes 내용에 박힌 절대 원본 경로(예: index 헤더 "경로: C:/ecams-ai/workspace/...")를 그림자 경로로 치환.
// AGY 가 그 문자열을 따라가 원본을 직접 수정하는 누출을 차단. 패턴 포함 파일만 덮어써 /MIR 델타를 보존한다.
function neutralizeShadowPaths(shadowDir) {
  const wsShadow = path.resolve(SHADOW_ROOT, 'workspace');
  const fwdTo = wsShadow.replace(/\\/g, '/');   // C:/ecams-ai/.shadow/workspace
  const backTo = wsShadow.replace(/\//g, '\\'); // C:\ecams-ai\.shadow\workspace
  const stack = [shadowDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!e.name.endsWith('.md')) continue;
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
      if (!content.includes('/workspace') && !content.includes('\\workspace')) continue;
      const fixed = content
        .replace(/[A-Za-z]:\/[^ \n\r\t`"'<>]*\/workspace/g, fwdTo)
        .replace(/[A-Za-z]:\\[^ \n\r\t`"'<>]*\\workspace/g, backTo)
        .replace(/\/[^ \n\r\t`"'<>]*\/workspace/g, fwdTo);
      try { fs.writeFileSync(full, fixed, 'utf8'); } catch (e) {}
    }
  }
}

// 그림자의 .java 안 native2ascii 유니코드 이스케이프(\uXXXX, 한글이 ASCII 로 표기됨)를 실제 문자로 디코드.
// 그림자 한정 — 원본 workspace 는 불변. AGY 가 "입력" 같은 한글 키워드로 grep 할 수 있게 해 검색·가독성 향상.
// (?<!\\) 로 \\uXXXX(이스케이프된 백슬래시 리터럴)는 건너뛰고, code>=0x80(비ASCII=한글)만 디코드해 A 같은 ASCII 이스케이프는 보존.
function decodeJavaEscapesInShadow(shadowDir) {
  const stack = [shadowDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!e.name.endsWith('.java')) continue;
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
      if (!content.includes('\\u')) continue;
      const decoded = content.replace(/(?<!\\)\\u([0-9a-fA-F]{4})/g, (m, hex) => {
        const code = parseInt(hex, 16);
        return code >= 0x80 ? String.fromCharCode(code) : m;
      });
      if (decoded !== content) { try { fs.writeFileSync(full, decoded, 'utf8'); } catch (e) {} }
    }
  }
}

// AGY 실행 직전: 선택 repo + 해당 은행 wiki/indexes 를 그림자로 미러하고, AGY 가 쓸 cwd/includeDirs 를 그림자 경로로 반환.
// /MIR 미러라 직전 실행에서 AGY 가 그림자에 한 수정은 원본으로 덮여 원복되고, AGY 가 만든 신규 파일은 purge 된다 (원본은 AGY 가 보지 못함).
async function prepareShadows(allowedRepos) {
  const wsShadowRoot = path.join(SHADOW_ROOT, 'workspace');
  try { fs.mkdirSync(wsShadowRoot, { recursive: true }); } catch (e) {}
  const includeDirs = [];
  const banks = new Set();
  const workspaceRoot = dataRoot('workspace', __dirname);
  for (const r of allowedRepos) {
    const p = getRepoBasePath(r);
    if (!p) continue;
    const real = path.resolve(p);
    if (!fs.existsSync(real)) continue;
    const shadow = shadowPathFor(real);
    await robomirror(real, shadow);
    decodeJavaEscapesInShadow(shadow); // .java 의 \uXXXX 한글 이스케이프 → 실제 한글 (그림자 한정, 검색성↑)
    includeDirs.push(shadow);
    // 은행명 = workspace 바로 아래 첫 세그먼트 (wiki/indexes 가 은행명으로 분류됨)
    const rel = path.relative(workspaceRoot, real);
    const bank = rel.split(path.sep)[0];
    if (bank && !bank.startsWith('..')) banks.add(bank);
  }
  // 시스템 프롬프트는 AGY 에게 `wiki/[repo_id]/...`, `indexes/[repo_id]_index.md` 를 읽으라고 지시한다.
  // → add-dir 의 basename 이 반드시 `wiki`/`indexes` 여야 AGY 가 그 루트를 찾는다. 내용은 선택 은행만 미러하되 루트 구조는 보존.
  const refRoots = new Set();
  for (const bank of banks) {
    for (const base of ['wiki', 'indexes']) {
      const realB = path.join(__dirname, base, bank);
      if (!fs.existsSync(realB)) continue;
      const shadowB = shadowPathFor(realB);
      await robomirror(realB, shadowB);
      neutralizeShadowPaths(shadowB); // 내용 속 절대 원본경로 → 그림자경로 (누출 차단)
      refRoots.add(path.join(SHADOW_ROOT, base)); // .shadow/wiki, .shadow/indexes 루트를 add-dir (basename 보존)
    }
  }
  for (const r of refRoots) includeDirs.push(r);
  return { cwd: wsShadowRoot, includeDirs };
}

// agy CLI 통합 — 결정 11 (2026-06-01): node-pty 로 ConPTY wrapping. raw spawn 은 stdout TTY 미감지 시 응답 직전 셧다운 (silent fail). docs/agy-integration/context-notes.md 참고.
const AGY_EXE = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
  : (process.env.AGY_EXE_PATH || '/usr/local/bin/agy');
const CODEX_EXE = process.env.CODEX_EXE || path.join(os.homedir(), 'AppData', 'Local', 'OpenAI', 'Codex', 'bin', 'd8dfab353c0001dc', 'codex.exe');

// AGY 비결정성: 분석을 끝내지 않고 짧은 영문 placeholder("I am waiting for the ... search to complete...")만 내고 종료하는 bail 감지.
// 정상 답변은 분석 템플릿(섹션 0~6 + 추천질문)으로 항상 길다(2400자+). docs/agy-bail-retry 참고.
function isAgyBail(answer, exitCode = 0) {
  if (exitCode !== 0) return true;      // process 실패(timeout 등)는 길이·내용 무관 bail
  if (!answer) return true;
  const a = answer.trim();
  if (!/[가-힣]/.test(a)) return true;   // 한글 전무 = 영문 계획만 흘림 (한글 검사를 길이보다 먼저)
  if (a.length < 200) return true;
  if (a.length > 300) return false;      // 한글 있고 300자 초과 = 상세 답변 (이제 안전)
  const lower = a.toLowerCase();
  return ['waiting for', 'timed out waiting', 'will proceed with the analysis', 'search to complete', 'once the search']
    .some(m => lower.includes(m));
}

// AGY 가 본문 앞에 영문 계획 멘트("I will wait for the search command to complete...", "Let me search ...")나
// 서브에이전트 tool 출력(grep 덤프, [[uuid/task-N] status: COMPLETED], [task-N stdout])을 흘리고
// 이어서 정상 한글 답변을 내면, 그 노이즈에도 한글(코드 주석 등)이 섞여 있어 "첫 한글 라인 이전만 스킵"
// 방식으론 안 잘리고 소스 경로·grep 결과가 그대로 노출된다(관측: answer_log_20260701, enduser 누출).
// 정상 답변은 항상 한글 섹션 헤더로 시작하므로 — 개발자(## 0. 분석 근거 / ### 0.) · 일반사용자(1. 한 줄 요약) —
// 그 헤더 위치를 substring 으로 찾아 그 지점부터 잘라낸다. (줄 단위 필터 금지: 답변 첫 줄이 grep 라인 끝에
// 붙어 나오는 경우가 있어 — "...</iframe>1. 한 줄 요약" — 라인을 통째로 버리면 답변 시작이 사라진다.)
function stripAgyPreamble(answer) {
  if (!answer) return answer;
  const anchor = /#{2,3}\s*0\.\s*분석 근거|1\.\s*한 줄 요약/;
  const m = anchor.exec(answer);
  if (m) return answer.slice(m.index).trim(); // 실제 답변 헤더부터 슬라이스 (영문 프리앰블 케이스도 포함 처리)

  // 앵커 없음 + agy orchestration 마커 존재 = 미지의 tool-echo 형식. 버퍼를 그대로 내보내면 소스 누출이므로
  // 빈 문자열 반환 → isAgyBail 이 bail 로 처리(범위 축소 안내). 미래 agy 포맷 변경도 조용한 누출이 아니라 가시적 bail 로.
  if (/\[task-\d+ stdout\]|\/task-\d+\]\s*status:|\]\s*status:\s*COMPLETED/.test(answer)) return '';

  // 앵커도 마커도 없음 = 기존 영문 프리앰블 케이스 (종전 동작 보존): 첫 한글 라인 이전만 스킵.
  const lines = answer.split('\n');
  const hasHangul = s => /[가-힣]/.test(s);
  if (!lines.some(hasHangul)) return answer; // 전체가 한글 없음 = 진짜 bail → 손대지 않고 isAgyBail 이 처리
  let start = 0;
  while (start < lines.length && !hasHangul(lines[start])) start++; // 한글 첫 등장 전까지 스킵
  return lines.slice(start).join('\n').trim();
}

// agy 타임아웃 원인 진단용 전용 로그 — 서버 콘솔이 파일로 안 남아도 캡처되게 (slow vs hang 구분).
const AGY_DEBUG_LOG = path.join(__dirname, 'logs', 'agy_debug.log');
function logAgy(msg) {
  try {
    fs.mkdirSync(path.dirname(AGY_DEBUG_LOG), { recursive: true });
    fs.appendFileSync(AGY_DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (e) {}
}

function stripAnsi(s) {
  return s
    .replace(/\x1b\[[\d;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

function runAgyOnce(fullPrompt, res, cwd, includeDirs, req = null) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const state = { answer: '', errorMsg: '', duration_ms: null, usage: null };

    // ASCII 전용 임시 prompt 파일 (결정 7)
    const promptFile = path.join(__dirname, 'scratch', `agy_prompt_${crypto.randomUUID()}.txt`);
    try { fs.mkdirSync(path.dirname(promptFile), { recursive: true }); } catch (e) {}
    try { fs.writeFileSync(promptFile, fullPrompt, 'utf8'); }
    catch (e) {
      state.errorMsg = `temp file write failed: ${e.message}`;
      resolve({ code: -1, state, startTime });
      return;
    }

    // --add-dir 는 repeatable (Gemini comma-join 과 다름)
    const args = [];
    for (const d of includeDirs) { args.push('--add-dir', d); }
    args.push(
      '--dangerously-skip-permissions',
      '--print-timeout', '5m',
      '-p', `${promptFile.replace(/\\/g, '/')} 파일을 읽고 그대로 지시에 따라 답해줘.`
    );

    logAgy(`START promptLen=${fullPrompt.length} cwd=${cwd} dirs=${includeDirs.length}`);
    let term;
    try {
      term = pty.spawn(AGY_EXE, args, {
        name: 'xterm-color',
        // cols 폭에서 줄이 wrap 되면 ConPTY 가 경계 문자를 중복 출력함("Servlet→Servlett", "kjbank_→kjbank__").
        // 어떤 단락도 wrap 되지 않도록 폭을 크게 잡아 중복 자체를 차단 (scratch/agy_wrap_probe.js 로 200=중복10 / 20000=중복0 검증).
        cols: 20000, rows: 40,
        cwd, env: process.env,
      });
      if (req) req.currentProcess = term;
    } catch (e) {
      console.error('[agy Spawn Error]:', e);
      logAgy(`SPAWN_FAILED ${e.message}`);
      try { fs.unlinkSync(promptFile); } catch {}
      state.errorMsg = `spawn failed: ${e.message}`;
      resolve({ code: -1, state, startTime });
      return;
    }

    let buf = '';
    let firstDataAt = null;
    let bytes = 0;
    term.onData(d => {
      buf += d;
      bytes += d.length;
      if (firstDataAt === null) {
        firstDataAt = Date.now();
        logAgy(`FIRST_OUTPUT after ${((firstDataAt - startTime) / 1000).toFixed(1)}s`);
      }
    });

    term.onExit(({ exitCode }) => {
      try { fs.unlinkSync(promptFile); } catch {}
      const clean = stripAgyPreamble(stripAnsi(buf).trim());
      state.answer = clean;
      state.duration_ms = Date.now() - startTime;
      // bailType: 재시도 래퍼가 timeout(재시도 안 함) vs text-bail(재시도)을 구분하는 근거.
      const bail = isAgyBail(clean, exitCode);
      state.bailType = exitCode !== 0 ? 'timeout' : (bail ? 'text-bail' : 'ok');
      if (!bail) {
        // buffered send — agy 는 stream-json 미지원 (결정 5). bail(불완전 응답)은 스트리밍 억제 → 재시도 래퍼가 처리.
        res.write('data: ' + JSON.stringify({ type: 'text', text: clean }) + '\n\n');
      } else if (exitCode !== 0) {
        state.errorMsg = `agy exit code ${exitCode}`;
      }
      const ttfb = firstDataAt ? ((firstDataAt - startTime) / 1000).toFixed(1) + 's' : 'NONE(무출력=hang 의심)';
      const tail = stripAnsi(buf).slice(-300).replace(/\n/g, '\\n');
      logAgy(`EXIT code=${exitCode} bailType=${state.bailType} elapsed=${(state.duration_ms / 1000).toFixed(1)}s cleanLen=${clean.length} rawBytes=${bytes} ttfb=${ttfb} tail=${JSON.stringify(tail)}`);
      console.log(`[agy] code=${exitCode} answerLen=${clean.length} elapsed=${(state.duration_ms / 1000).toFixed(1)}s`);
      resolve({ code: exitCode, state, startTime });
    });
  });
}

function runAgyStream(prompt, res, allowedRepos = [], overallStartTime = null, req = null) {
  return new Promise(async (resolve) => {
    // DB 없는 고객사 → sample_db 자동 포함 (Gemini 와 동일)
    const hasDb = allowedRepos.some(r => LOCAL_REPOS[r]?.type === 'db');
    const effectiveRepos = (!hasDb && LOCAL_REPOS['sample_db'])
      ? [...allowedRepos, 'sample_db']
      : [...allowedRepos];
    // 원본 대신 그림자 미러에서 실행 — AGY 가 원본을 수정·오염하지 못하게 격리 (원본은 AGY 가 보지 못함).
    const { cwd, includeDirs } = await prepareShadows(effectiveRepos);
    const fullPrompt = `${getSystemPrompt()}\n\n---\n\n${prompt}`;
    console.log(`[agy] cwd=${cwd} includeDirs=${includeDirs.join(',')}`);

    const startTime = Date.now();
    const { code, state } = await runAgyOnce(fullPrompt, res, cwd, includeDirs, req);
    // overallStartTime 이 있으면 (e.g. Sonnet 묘사 → agy 2-stage) 전체 wall time 으로 계산.
    // 없으면 agy 단계만 (state.duration_ms 우선, fallback 으로 함수 진입 시점).
    const elapsed = overallStartTime
      ? ((Date.now() - overallStartTime) / 1000).toFixed(1)
      : (state.duration_ms
          ? (state.duration_ms / 1000).toFixed(1)
          : ((Date.now() - startTime) / 1000).toFixed(1));

    // 비정상 종료(code!==0) 안내는 runAgyWithRetry 가 buckets(인프라 에러 / timeout)로 전담 — 여기서 중복 write 하지 않음.
    res.write('data: ' + JSON.stringify({ type: 'elapsed', seconds: elapsed, usage: null }) + '\n\n');
    resolve({ answer: state.answer.trim(), code, bailType: state.bailType, durationMs: state.duration_ms });
  });
}

// AGY bail(불완전 응답) 시 자동 재시도 — AGY 비결정성 대응 (사용자 결정: claude 폴백 아닌 AGY 그대로 재시도).
// runAgyOnce 가 bail 답변 스트리밍을 억제하므로 실패 시도의 garbage 는 안 보이고 성공 답변만 노출된다.
async function runAgyWithRetry(prompt, res, allowedRepos, overallStartTime, req, jobId, maxAttempts = 3) {
  // 범위 축소 안내 — timeout(code!==0) 과 느린 text-bail(실질 timeout) 공용.
  const SCOPE_GUIDE = '⚠️ 질문 범위가 넓어 분석을 제시간에 마치지 못했습니다. 특정 화면이나 파일, 기능으로 질문을 좁혀서 다시 물어봐 주세요.';
  // 이 시간 이상 걸린 text-bail 은 재시도해도 또 오래 걸릴 뿐이므로 재시도하지 않는다 (실측: 정상 bail 35~45s, 실질 timeout 300s+).
  const SLOW_BAIL_MS = 180000; // 3분 (사용자 결정)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let currentPrompt = prompt;
    if (attempt > 1) {
      const nudge = `[시스템 긴급 지시사항]\n이전 분석 시도에서 코드를 제대로 찾지 못해 실패했습니다.\n이번 시도에서는 절대 포기하거나 "알 수 없다"고 하지 마십시오. 주어진 파일들을 끝까지 파고들어 문제의 원인을 반드시 찾아내서 한국어로 상세히 답변하십시오.\n\n`;
      currentPrompt = nudge + prompt;
    }
    const { answer, code, bailType, durationMs } = await runAgyStream(currentPrompt, res, allowedRepos, overallStartTime, req);

    // 버킷 A: 인프라 실패(엔진 미기동, 리눅스 명령어 없음(127), spawn/write 실패 → code=-1). "질문 좁혀달라"는 오해 유발 → 별도 문구, 재시도 안 함.
    if (code === -1 || code === 127) {
      const errMsg = '⚠️ 분석 엔진(AGY)을 시작하지 못했거나 실행 파일을 찾을 수 없습니다. 설정 또는 경로를 확인해 주세요.';
      res.write('data: ' + JSON.stringify({ type: 'text', text: errMsg }) + '\n\n');
      return errMsg;
    }
    // 버킷 B: timeout 등 비정상 종료(code!==0). agy 는 돌았으나 5분 내 완결 실패 → 재시도 안 함(사용자 승인), 범위 축소 안내.
    if (code !== 0) {
      logAgy(`GIVEUP_TIMEOUT code=${code} attempt=${attempt}`);
      res.write('data: ' + JSON.stringify({ type: 'text', text: SCOPE_GUIDE }) + '\n\n');
      return SCOPE_GUIDE;
    }
    // 정상 (code===0, 한글 충분)
    if (bailType === 'ok') return answer;

    // 버킷 C: 느린 text-bail(code=0 이지만 이미 SLOW_BAIL_MS 이상 소진). exit 0 이라 code 버킷을 못 타지만 실질은 timeout.
    // 재시도하면 또 수 분 → 최악 15분. 재시도 대신 timeout 과 동일하게 범위 축소 안내로 종료.
    if (durationMs != null && durationMs >= SLOW_BAIL_MS) {
      logAgy(`GIVEUP_SLOW_BAIL durationMs=${durationMs} attempt=${attempt}`);
      res.write('data: ' + JSON.stringify({ type: 'text', text: SCOPE_GUIDE }) + '\n\n');
      return SCOPE_GUIDE;
    }

    // code===0 && 빠른 text-bail → AGY 비결정성 재시도
    console.log(`[agy] text-bail 감지 (시도 ${attempt}/${maxAttempts}, len=${answer.length}, durationMs=${durationMs})`);
    if (attempt < maxAttempts) {
      appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'status', text: `⚠️ Antigravity 응답이 불완전합니다 — 재시도 ${attempt + 1}/${maxAttempts}...` }) + '\n\n');
    }
  }
  const giveUp = '⚠️ Antigravity가 여러 번 시도했지만 완전한 답변을 내지 못했습니다. 잠시 후 다시 질문해주세요.';
  res.write('data: ' + JSON.stringify({ type: 'text', text: giveUp }) + '\n\n');
  return giveUp;
}

// ===== 레포지토리 관리 (Admin) =====
// 레포지토리 정보 수정 (관리자 전용)
app.patch('/api/admin/repos/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const repoId = req.params.id;
  const { companyId, type } = req.body;

  if (!LOCAL_REPOS[repoId]) return res.status(404).json({ error: '존재하지 않는 레포지토리입니다.' });

  if (companyId) LOCAL_REPOS[repoId].companyId = companyId;
  if (type) LOCAL_REPOS[repoId].type = type;

  saveRepos();
  res.json({ success: true, message: '레포지토리 정보가 수정되었습니다.' });
});

app.delete('/api/admin/repos/:id', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const repoId = req.params.id;

  if (!LOCAL_REPOS[repoId]) return res.status(404).json({ error: '존재하지 않는 레포지토리입니다.' });

  try {
    // 1. repos.json에서 삭제
    delete LOCAL_REPOS[repoId];
    saveRepos();

    // 2. 인덱스 파일 삭제
    const indexPath = getIndexPath(repoId);
    if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);

    // 3. 모든 사용자의 권한 목록에서 삭제
    let userChanged = false;
    for (const userId in USERS) {
      if (USERS[userId].repos && USERS[userId].repos[repoId]) {
        delete USERS[userId].repos[repoId];
        userChanged = true;
      }
    }
    if (userChanged) saveUsers();

    console.log(`[Admin] Repo deleted: ${repoId}`);
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] Repo delete error:', e);
    res.status(500).json({ error: '삭제 중 오류가 발생했습니다: ' + e.message });
  }
});

app.get('/api/admin/repos/all', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const repos = Object.keys(LOCAL_REPOS).map(id => {
    const info = LOCAL_REPOS[id];
    return {
      id,
      path: getRepoBasePath(id),
      companyId: info.companyId || 'none',
      type: info.type || 'server'
    };
  });
  res.json({ allRepos: repos });
});

// ===== Claude Code 스트리밍 실행 =====
const MODEL_IDS = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001'
};
const MAX_TURNS = {
  sonnet: 12, // Graph Index+Wiki 목록 프롬프트 주입 → 최소 7턴으로 충분, 여유 5턴
  haiku: 14
};

// Repo-map 모드: top symbols 가 정확해서 turn 적게 필요 → 시간 단축
// 결정 68 (2026-05-21) — sonnet 6 → 14 로 임시 복원: 깊은 질문에서 도구만 호출하고 답변 본문 없이 종료하는 패턴 검증용.
//                       narration-only 가 max-turns 한계 때문인지 (H1) 모델 자체 결함인지 (H2) 가름.
const MAX_TURNS_REPO_MAP = {
  sonnet: 14,
  haiku: 8
};

function runClaudeCodeStream(prompt, res, model = 'sonnet', apiKey, fastContext = false, isPlannerMode = false, sendCompletion = true, req = null) {
  return new Promise(async (resolve, reject) => {
    let finalPrompt = prompt;
    if (isPlannerMode) {
      finalPrompt = prompt + `\n\n[System Instructions for Planner Mode]\nYou are acting as a planner. Analyze the request and output a step-by-step technical plan to solve it. DO NOT USE ANY TOOLS. DO NOT READ FILES OR RUN SEARCHES. Just output the text plan.`;
    }
    const fullPrompt = `${getSystemPrompt()}\n\n---\n\n${finalPrompt}`;
    const startTime = Date.now();
    const modelId = MODEL_IDS[model] || MODEL_IDS.sonnet;
    // 빠른 모드: 선조립 컨텍스트 있어도 wiki 1~2개 Read는 허용 (도구 호출 후 답변 완성)
    // USE_REPO_MAP 시 max-turns 단축 (repo-map top symbols 가 정확)
    const maxTurns = isPlannerMode ? 1 : (fastContext
      ? 6
      : (USE_REPO_MAP
          ? (MAX_TURNS_REPO_MAP[model] || MAX_TURNS_REPO_MAP.sonnet)
          : (MAX_TURNS[model] || MAX_TURNS.sonnet)));

    const claudeArgs = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--disallowedTools', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', // 분석 답변에 파일 쓰기 금지 (원본/메인앱 보호)
      '--model', modelId,
      '--max-turns', String(maxTurns),
    ];
    // 빠른 모드: MCP 비활성 (도구 호출 거의 없으니 초기화 오버헤드 제거)
    if (!fastContext) claudeArgs.push('--mcp-config', MCP_CONFIG_PATH);

    const proc = spawn('claude', claudeArgs, {
      shell: true,
      windowsHide: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (req) req.currentProcess = proc;

    const state = { answer: '' };
    let buffer = '';

    proc.stdin.write(fullPrompt, 'utf8');
    proc.stdin.end();

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(line => parseStreamAndSend(line, res, state));
    });

    proc.stderr.on('data', (data) => {
      const errStr = data.toString();
      console.error('[Claude Stderr]:', errStr);
      // 에러 메시지가 포함되어 있다면 클라이언트에 알림 (선택 사항)
      if (errStr.includes('Error') || errStr.includes('Fail')) {
        res.write('data: ' + JSON.stringify({ type: 'status', text: '⚠️ 엔진 경고: ' + errStr.substring(0, 100) }) + '\n\n');
      }
    });

    proc.on('close', (code) => {
      console.log(`[Claude Process] Closed with code ${code}. Total answer length: ${state.answer.length}`);
      if (buffer.trim()) parseStreamAndSend(buffer, res, state);
      if (sendCompletion) {
        const elapsed = state.duration_ms ? (state.duration_ms / 1000).toFixed(1) : ((Date.now() - startTime) / 1000).toFixed(1);
        res.write('data: ' + JSON.stringify({ type: 'elapsed', seconds: elapsed, usage: state.usage }) + '\n\n');
      }
      resolve(state.answer.trim());
    });

    proc.on('error', (err) => {
      console.error('[Claude Spawn Error]:', err);
      res.write('data: ' + JSON.stringify({ type: 'error', text: '엔진 실행 오류: ' + err.message }) + '\n\n');
      reject(err);
    });
  });
}

function runCodexExecStream(prompt, res, req = null) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${getSystemPrompt()}\n\n---\n\n${prompt}`;
    const startTime = Date.now();
    const args = [
      'exec',
      '--json',
      '--sandbox', 'read-only',
      '--cd', __dirname,
      '--skip-git-repo-check',
      '--ignore-rules',
      '-'
    ];

    const proc = spawn(CODEX_EXE, args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (req) req.currentProcess = proc;

    const state = { answer: '', usage: null };
    let stdoutBuffer = '';
    let stderrTail = '';

    function handleJsonLine(line) {
      if (!line.trim() || line.trim()[0] !== '{') return;
      let event;
      try { event = JSON.parse(line); } catch (e) { return; }
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        const text = event.item.text || '';
        if (text) {
          state.answer += (state.answer ? '\n\n' : '') + text;
          res.write('data: ' + JSON.stringify({ type: 'text', text }) + '\n\n');
        }
      } else if (event.type === 'turn.completed' && event.usage) {
        state.usage = event.usage;
      }
    }

    proc.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop();
      lines.forEach(handleJsonLine);
    });

    proc.stderr.on('data', (data) => {
      const errStr = data.toString();
      stderrTail = (stderrTail + errStr).slice(-1000);
      if (errStr.includes('ERROR') || errStr.includes('error')) {
        console.error('[Codex Stderr]:', errStr);
      }
    });

    proc.on('close', (code) => {
      if (stdoutBuffer.trim()) handleJsonLine(stdoutBuffer);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      res.write('data: ' + JSON.stringify({ type: 'elapsed', seconds: elapsed, usage: state.usage }) + '\n\n');
      console.log(`[codex] code=${code} answerLen=${state.answer.length} elapsed=${elapsed}s`);
      if (code !== 0 && !state.answer.trim()) {
        reject(new Error(stderrTail.trim() || `codex exit code ${code}`));
      } else {
        resolve(state.answer.trim());
      }
    });

    proc.on('error', (err) => {
      console.error('[Codex Spawn Error]:', err);
      res.write('data: ' + JSON.stringify({ type: 'error', text: 'Codex 실행 오류: ' + err.message }) + '\n\n');
      reject(err);
    });

    proc.stdin.write(fullPrompt, 'utf8');
    proc.stdin.end();
  });
}

app.get('/api/queue', authMiddleware, (req, res) => {
  res.json({ waiting: requestQueue.size, running: requestQueue.isRunning });
});

// fake res — run* 함수의 res.write 를 job chunks 로 라우팅 (결정 7)
function createFakeRes(jobId) {
  return {
    writableEnded: false,
    headersSent: true,
    write(chunk) { appendChunk(jobId, chunk); },
    setHeader() {},
    end() {},
  };
}

// fake req — run* 함수의 req.currentProcess 를 job.currentProcess 로 연결
function createFakeReq(jobId) {
  return {
    set currentProcess(p) { setCurrentProcess(jobId, p); },
    get currentProcess() { return null; },
  };
}

// 백그라운드 LLM 실행 — /api/chat 에서 setImmediate 로 호출
// 답변 완료 시점에 SSE 구독자 없으면 push 알림 (web-push 결정 4, 10)
function maybeSendPush(jobId, userId, originalText, chatId) {
  if (getSubscriberCount(jobId) > 0) return;
  const t = (originalText || '').trim();
  const title = t ? (t.length > 40 ? t.slice(0, 40) + '...' : t) : '사진 분석';
  pushManager.notifyUser(userId, {
    type: 'job-complete',
    jobId,
    chatId,
    title,
    body: '답변이 완료되었습니다. 탭하여 확인하세요.',
  }).then(({ sent, removed }) => {
    if (sent > 0 || removed > 0) console.log(`[push] notifyUser sent=${sent} removed=${removed} user=${userId}`);
  }).catch(e => console.warn('[push] notifyUser 실패:', e.message));
}

async function runChatJob(jobId, { message, allowedRepos, userRepos, history, images, model, modelInput, fastMode, concise, userId, triageTarget }) {
  const fakeRes = createFakeRes(jobId);
  const fakeReq = createFakeReq(jobId);

  // 첨부 이미지(다중) 를 임시 파일로 저장 → 절대경로 배열. agy/Gemini/Claude 가 경로로 직접 접근.
  const imagePaths = [];
  (images || []).forEach((img, i) => {
    if (!img || !img.data) return;
    try {
      const ext = (img.mime || 'image/png').includes('jpeg') ? 'jpg' : 'png';
      const p = path.join(os.tmpdir(), 'ecams_img_' + Date.now() + '_' + i + '.' + ext);
      fs.writeFileSync(p, Buffer.from(img.data, 'base64'));
      // agy/Gemini 는 forward-slash 경로를 기대 (runAgyOnce:1879 와 probe 4종 모두 정규화). unlink 는 fs 가 양쪽 다 처리.
      imagePaths.push(p.replace(/\\/g, '/'));
    } catch (e) {
      console.error('[Image Write Error]', e);
    }
  });

  const isLearnMore = message.includes('[더 알아보기]');
  const disableAnswerCache = process.env.DISABLE_ANSWER_CACHE === 'true';
  const persona = getPersona(USERS[userId]); // 소속 기반 응답 분기 (customer → enduser)

  try {
    // 시맨틱 캐시 검색은 /api/chat 진입부로 이동(결정 73). 여기서는 LLM 실행만 수행.
    if (requestQueue.size > 0) {
      appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'status', text: `⏳ 대기 중 (${requestQueue.size}명 앞에 대기 중)` }) + '\n\n');
    }

    console.log('[Chat] Adding job to queue. jobId:', jobId, 'msg:', message.substring(0, 50));
    const answer = await requestQueue.add(async () => {
      if (getJobStatus(jobId) === 'cancelled') return '';

      let modelLabel = '⚡ Sonnet 정밀 분석 중...';
      if (model === 'haiku') modelLabel = (modelInput === 'haiku') ? '🚀 Haiku 단독 분석 중 (Repo-map 모드)...' : '🚀 Haiku 빠른 분석 중...';
      else if (model === 'sonnet' && modelInput === 'sonnet') modelLabel = '⚡ Sonnet 단독 정밀 분석 중...';
      else if (model === 'sonnet+haiku') modelLabel = '🎯 Sonnet planner + Haiku executor 라우팅 중 (2-Stage)...';
      else if (model === 'agy') modelLabel = '🌌 Antigravity flash 3.5 분석 중...';

      if (model === 'codex') modelLabel = 'Codex GPT exec read-only 분석 중...';
      appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'status', text: modelLabel }) + '\n\n');

      const apiKey = GEMINI_KEY;

      const { prompt: promptStr, usedFastMode } = await buildPrompt(message, allowedRepos, userRepos, history, imagePaths, apiKey, fastMode, concise, persona, triageTarget);


      // 에이전트 실행 중 workspace 수정 복원 (snapshot-restore). "수정해줘" 해도 원본 파일은 자동 복원됨.
      // withRepoLock: 같은 repo 동시 작업을 직렬화해 restore 간섭 방지 (다른 고객사는 병렬 유지).
      return await withRepoLock(allowedRepos, async () => {
      const _wsSnapshot = snapshotModifiedFiles(allowedRepos);
      try {
      if (model === 'agy') {
        // agy 1.0.10+ 는 prompt 본문 내 절대경로를 멀티모달로 자동 첨부 (probe 재검증, 결정 19 폐기).
        // buildPrompt 가 imagePaths 를 본문에 주입했으므로 Sonnet 묘사 우회 없이 직접 실행.
        return await runAgyWithRetry(promptStr, fakeRes, allowedRepos, null, fakeReq, jobId);
      }
      if (model === 'codex') {
        return await runCodexExecStream(promptStr, fakeRes, fakeReq);
      }
      if (model === 'sonnet' || model === 'haiku') {
        return await runClaudeCodeStream(promptStr, fakeRes, model, apiKey, usedFastMode, false, true, fakeReq);
      }
      // Sonnet planner + Haiku executor 라우팅 (결정 69, 2026-05-21) — 2-stage claude CLI
      if (model === 'sonnet+haiku') {
        appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'status', text: '🎯 [Stage 1] Sonnet이 도구 없이 분석 계획을 수립 중입니다...' }) + '\n\n');
        // Stage 1: Planner (Sonnet, no tools, max_turns=1, no elapsed summary)
        const planStr = await runClaudeCodeStream(promptStr, fakeRes, 'sonnet', apiKey, false, true, false, fakeReq);

        appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'text', text: '\n\n---\n\n' }) + '\n\n');
        appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'status', text: '🎯 [Stage 2] Haiku가 수립된 계획을 바탕으로 코드를 분석합니다...' }) + '\n\n');

        // Stage 2: Executor (Haiku, with tools)
        const executorPrompt = `${promptStr}\n\n[Sonnet 정밀 분석 계획]\n${planStr}\n위 계획에 따라 코드를 탐색하고 답변을 완성해.`;
        return await runClaudeCodeStream(executorPrompt, fakeRes, 'haiku', apiKey, usedFastMode, false, true, fakeReq);
      }
      throw new Error(`지원하지 않는 chat model: ${modelInput}`);
      } finally {
        restoreModifiedFiles(allowedRepos, _wsSnapshot, { userId, persona, model: modelInput, jobId }); // 수정된 파일만 복원 (신규 파일은 그대로 둠)
      }
      });
    });

    const chatId = crypto.randomUUID();
    appendChunk(jobId, 'data: ' + JSON.stringify({ type: 'done', answer, chatId }) + '\n\n');
    console.log('[Chat Success] jobId:', jobId, 'answer len:', answer?.length);

    // 답변 로그 저장 (검증·감사용)
    if (answer && answer.length > 100) {
      try {
        answerLogger.logAnswer({ chatId, question: message, answer, model: modelInput, fastMode, concise, repos: allowedRepos, user: userId });
      } catch (e) { console.error('[Log] save failed', e.message); }
    }
    // 답변 캐시 저장 + 피드백 대기 등록
    // 완전한 답변만 캐시: ## 섹션 헤더 포함 + 2000자 이상 (도구 호출 텍스트만 있는 불완전 답변 방지)
    const isCompleteAnswer = answer && answer.length > 2000 && answer.includes('##');
    if (allowedRepos.length > 0 && isCompleteAnswer) {
      if (!disableAnswerCache && !imagePaths.length && !isLearnMore) { // 더 알아보기·이미지 첨부는 캐시 저장 안 함 (컨텍스트 의존적)
        const cacheKey = getAnswerCacheKey(message, allowedRepos, modelInput, fastMode, persona);
        const apiKey = GEMINI_KEY;
        getEmbedding(message, apiKey).then(vector => {
          const reposKey = [...allowedRepos].sort().join(',');
          const modeTag = (fastMode ? 'F' : 'P') + '|' + modelInput;
          answerCache.set(cacheKey, { answer, date: Date.now(), chatId, question: message, vector, reposKey, modeTag, persona });
          saveAnswerCache();
        }).catch(() => {
          answerCache.set(cacheKey, { answer, date: Date.now(), chatId, persona });
          saveAnswerCache();
        });
      }
      pendingFeedback.set(chatId, { repos: allowedRepos, question: message, answer, model: modelInput, fastMode, persona, timestamp: Date.now() });
    } else if (allowedRepos.length > 0 && answer && answer.length > 100) {
      // 불완전 답변: 캐시 저장은 안 하지만 피드백은 받을 수 있게
      pendingFeedback.set(chatId, { repos: allowedRepos, question: message, answer, model: modelInput, fastMode, persona, timestamp: Date.now() });
    }

    maybeSendPush(jobId, userId, message, chatId);
    finishJob(jobId, answer);
  } catch (e) {
    console.error('[Chat Error] jobId:', jobId, e);
    failJob(jobId, '오류: ' + e.message);
  } finally {
    imagePaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
  }
}

app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, repos = [], history = [], image, imageMime, images: imagesInput, model: modelInput = 'agy', fastMode = false, concise = true } = req.body;
  // 다중 이미지 정규화 — 신규 클라이언트는 images:[{data,mime}], 구 클라이언트는 image/imageMime 단일.
  const images = Array.isArray(imagesInput)
    ? imagesInput.filter(im => im && im.data)
    : (image ? [{ data: image, mime: imageMime }] : []);

  // 입력값 검증 및 로깅
  console.log('[Chat] Request:', { message: message?.substring(0, 50), repos: Array.isArray(repos) ? repos.length : 'invalid', reposType: typeof repos, model: modelInput, user: req.user.id });
  if (!Array.isArray(repos)) {
    console.error('[Chat] ERROR: repos is not array:', typeof repos, repos);
    return res.status(400).json({ error: 'repos 값이 배열이 아닙니다.' });
  }
  if (!message || !message.trim()) return res.json({ answer: '질문을 입력해주세요.' });

  // 통합 모델 키 → 실제 모델 ID 매핑 (fastMode에 따라 분기)
  let model = modelInput;
  if (modelInput === 'claude') model = fastMode ? 'haiku' : 'sonnet';
  else if (modelInput === 'haiku') model = 'haiku';
  else if (modelInput === 'sonnet') model = 'sonnet';
  else if (modelInput === 'codex') model = 'codex';

  // sample_db 는 실제 DB 없는 고객사의 공용 폴백 → 권한 무관 항상 허용 (effectiveRepos 자동포함과 일관)
  const allowedRepos = repos.filter(r => r === 'sample_db' || getRepoLevel(req.user, r, LOCAL_REPOS));

  if (!message || !message.trim()) return res.json({ answer: '질문을 입력해주세요.' });

  // 결정 68 — 정량 측정 시 캐시 우회
  const disableAnswerCache = process.env.DISABLE_ANSWER_CACHE === 'true';
  const isLearnMore = message.includes('[더 알아보기]');
  const forceFresh = req.body.forceFresh === true; // 후보 거부 시 캐시·후보 모두 스킵하고 새로 분석

  const cacheEligible = !disableAnswerCache && !images.length && !isLearnMore && !forceFresh && !req.body.clarifyTarget && allowedRepos.length > 0;
  const persona = getPersona(req.user); // 캐시 분리·응답 분기용 (결정 79)

  // ===== 1b 되묻기(질문 명확화) 트리아지 — 캐시 검색 전 수행 =====
  const clarifyTarget = req.body.clarifyTarget || null; // 사용자가 화면을 선택해 재전송 → locked 재판정(멀티턴 좁히기)
  const skipClarify = req.body.skipClarify === true; // 추천질문/이어서질문 → 되묻기 스킵(맥락은 history로 유지)
  let triageResult = null;
  if (!forceFresh && !skipClarify && !images.length && !isLearnMore && allowedRepos.length > 0) {
    try {
      // 인덱스 있는 web repo 우선(화면 후보까지) / 없으면 아무 repo로 의도게이트(B: 서버·플러그인 포함)
      const triageRepo = allowedRepos.find(r => (LOCAL_REPOS[r]?.type || '').startsWith('web')) || allowedRepos[0];
      if (triageRepo) {
        const apiKey = GEMINI_KEY;
        triageResult = await clarifier.triage(triageRepo, message, apiKey, clarifyTarget, history);
        console.log(`[Triage] repo=${triageRepo} mode=${triageResult.mode}${clarifyTarget ? ' (locked:' + clarifyTarget + ')' : ''}`);
        if (triageResult.mode === 'clarify') {
          // 되묻기 문장 즉시 반환 (AGY 호출 전). locked 재질문이면 화면버튼 없이 lockedTarget 동봉(프론트 재잠금)
          return res.json({
            type: 'clarify',
            text: triageResult.clarify,
            lockedTarget: clarifyTarget || null,
            intentClear: triageResult.intentClear,
            targetConverges: triageResult.targetConverges,
            candidates: clarifyTarget ? [] : (triageResult.candidates || []).slice(0, 5).map(c => ({
              name: c.name,
              label: c.label || c.name,
              friendlyLabel: c.friendlyLabel,
              score: Math.round((c.score || 0) * 100),
            })),
          });
        }
      }
    } catch (e) {
      console.warn('[Triage] 실패 (graceful skip):', e.message);
    }
  }

  // ===== 정확 매칭 캐시 — 즉시 JSON 응답 (jobId 불필요, 결정 8) =====
  if (cacheEligible) {
    const cacheKey = getAnswerCacheKey(message, allowedRepos, modelInput, fastMode, persona);
    const cached = answerCache.get(cacheKey);
    if (cached) {
      console.log('[Cache HIT (exact)]', message.substring(0, 50));
      const newChatId = crypto.randomUUID();
      pendingFeedback.set(newChatId, { repos: allowedRepos, question: message, answer: cached.answer, model: modelInput, fastMode, persona, timestamp: Date.now() });
      return res.json({ type: 'cached', answer: cached.answer, chatId: newChatId });
    }
  }

  // ===== 시맨틱 캐시 — 자동반환(0.95, modeTag 일치) + 후보 제시(≥0.80, modeTag 무관) (결정 73~74) =====
  // persona 가 일치하는 캐시만 검색 — 개발자 답변이 엔드유저에게 새지 않도록 (결정 79)
  if (cacheEligible) {
    try {
      const apiKey = GEMINI_KEY;
      const questionVector = await getEmbedding(message, apiKey);
      if (questionVector) {
        const reposKey = [...allowedRepos].sort().join(',');
        const modeTag = (fastMode ? 'F' : 'P') + '|' + modelInput;
        let autoBest = null, autoMax = -1;
        const pool = [];
        for (const [k, v] of answerCache.entries()) {
          if (!v.vector || v.reposKey !== reposKey) continue;
          if ((v.persona || 'developer') !== persona) continue; // persona 격리
          const sim = cosineSimilarity(questionVector, v.vector);
          if (v.modeTag === modeTag && sim > autoMax) { autoMax = sim; autoBest = v; }
          if (v.question) pool.push({ id: k, question: v.question, sim });
        }
        // 자동 반환 (보수적: modeTag 일치)
        if (autoBest && autoMax >= SEMANTIC_AUTO) {
          console.log(`[Cache HIT (semantic ${autoMax.toFixed(3)})]`, message.substring(0, 50));
          const newChatId = crypto.randomUUID();
          pendingFeedback.set(newChatId, { repos: allowedRepos, question: message, answer: autoBest.answer, model: modelInput, fastMode, persona, timestamp: Date.now() });
          return res.json({ type: 'cached', answer: autoBest.answer, chatId: newChatId });
        }
        // 후보 제시 (사용자가 직접 선택: modeTag 무관)
        const candidates = pool
          .filter(c => c.sim >= SEMANTIC_CANDIDATE_MIN)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, SEMANTIC_CANDIDATE_MAX)
          .map(c => ({ id: c.id, question: c.question, sim: Math.round(c.sim * 100) }));
        if (candidates.length > 0) {
          console.log(`[Cache] ${candidates.length} candidate(s) for:`, message.substring(0, 50));
          return res.json({ type: 'candidates', candidates });
        }
      }
    } catch (e) {
      console.warn('[Cache] semantic pre-check 실패:', e.message);
    }
  }

  // ===== LLM 호출 경로 — jobId 발급 (결정 2, 3, 6) =====
  if (countRunningJobs(req.user.id) >= 3) {
    return res.status(429).json({ error: '진행 중인 요청이 3개입니다. 잠시 후 시도하세요.' });
  }

  const jobId = createJob(req.user.id);
  res.json({ type: 'job', jobId });

  // triageTarget: confident 타깃 or 사용자 선택 타깃 → buildContext 힌트
  const triageTarget = clarifyTarget || (triageResult?.mode === 'confident' ? triageResult.target?.name : null);
  setImmediate(() => runChatJob(jobId, {
    message, allowedRepos, userRepos: getUserRepoMap(req.user, LOCAL_REPOS), history,
    images, model, modelInput, fastMode, concise, userId: req.user.id, triageTarget,
  }));
});

// ===== 후보 캐시 선택 — 후보 id(md5 cacheKey)로 저장된 답변 반환 (결정 75) =====
app.post('/api/chat/select-cache', authMiddleware, (req, res) => {
  const { id, model: modelInput = 'claude', fastMode = false } = req.body;
  const persona = getPersona(req.user);
  const cached = id ? answerCache.get(id) : null;
  if (!cached) return res.status(404).json({ error: '캐시가 만료되었거나 존재하지 않습니다.' });
  // 권한 검증 — 캐시의 repo 조합이 사용자 권한의 부분집합인지
  const cachedRepos = (cached.reposKey || '').split(',').filter(Boolean);
  if (cachedRepos.length === 0 || !cachedRepos.every(r => getRepoLevel(req.user, r, LOCAL_REPOS))) {
    return res.status(403).json({ error: '권한이 없는 캐시입니다.' });
  }
  // persona 격리 — 다른 persona 의 캐시는 반환 금지 (결정 79)
  if ((cached.persona || 'developer') !== persona) {
    return res.status(403).json({ error: '권한이 없는 캐시입니다.' });
  }
  const newChatId = crypto.randomUUID();
  pendingFeedback.set(newChatId, { repos: cachedRepos, question: cached.question, answer: cached.answer, model: modelInput, fastMode, persona, timestamp: Date.now() });
  res.json({ type: 'cached', answer: cached.answer, chatId: newChatId });
});

// ===== Job 스트림 / 취소 / 메타 엔드포인트 (결정 3) =====

// SSE 재구독 — 누적 chunks 즉시 flush 후 live 구독 (결정 11: 처음부터 재전송)
app.get('/api/chat/jobs/:jobId/stream', authMiddleware, (req, res) => {
  const job = getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 결정 10: Cloudflare/nginx buffer 회피

  subscribe(req.params.jobId, res);
  req.on('close', () => unsubscribe(req.params.jobId, res));
});

// 명시적 취소 — 결정 4 (fetch abort ≠ 사용자 Stop)
app.post('/api/chat/jobs/:jobId/cancel', authMiddleware, (req, res) => {
  const job = getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  cancelJob(req.params.jobId);
  res.json({ success: true });
});

// 메타 폴링 (선택 — SSE 미지원 환경 대비)
app.get('/api/chat/jobs/:jobId', authMiddleware, (req, res) => {
  const job = getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    chunkCount: job.chunks.length,
    finalAnswer: job.status === 'completed' ? job.finalAnswer : null,
  });
});

// ===== Web Push 엔드포인트 (web-push 결정 2, 3, 5, 9) =====

// VAPID public key — 클라이언트가 subscribe 시 applicationServerKey 로 사용
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: pushManager.getVapidPublicKey() });
});

// 사용자 device subscription 등록 — 동일 endpoint 재등록 시 lastSeenAt 만 업데이트
app.post('/api/push/subscribe', authMiddleware, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  pushManager.addSubscription(req.user.id, { endpoint, keys });
  res.json({ success: true });
});

// 사용자가 알림 끄기 — 해당 endpoint 만 제거
app.post('/api/push/unsubscribe', authMiddleware, (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  pushManager.removeSubscription(endpoint);
  res.json({ success: true });
});

// ===== 피드백 API =====
app.post('/api/feedback', authMiddleware, async (req, res) => {
  const { chatId, type, correction, question: bodyQuestion, answer: bodyAnswer, repos: bodyRepos } = req.body;
  console.log(`[Feedback] type=${type} chatId=${chatId} pendingSize=${pendingFeedback.size} hasBodyData=${!!(bodyQuestion && bodyAnswer)}`);

  // pendingFeedback에서 먼저 조회, 없으면 body 데이터로 fallback (서버 재시작 대응)
  const pending = pendingFeedback.get(chatId) || (
    bodyQuestion && (bodyAnswer || type === 'bad') && Array.isArray(bodyRepos) && bodyRepos.length > 0
      ? { repos: bodyRepos, question: bodyQuestion, answer: bodyAnswer || '' }
      : null
  );

  if (!pending) {
    console.log(`[Feedback] chatId not found and no body fallback data.`);
    return res.status(404).json({ error: '만료되었거나 존재하지 않는 피드백입니다.' });
  }

  if (type === 'good') {
    const apiKey = GEMINI_KEY;
    await addKnowledge(pending.repos, pending.question, pending.answer, apiKey);
    pendingFeedback.delete(chatId);
    console.log(`[Feedback] Knowledge saved with Vector for repos: ${pending.repos.join(',')}`);
    return res.json({ success: true, message: '지식이 벡터 DB에 저장됐습니다.' });
  }

  if (type === 'bad') {
    // 답변 캐시 무효화 (틀린 답변이 캐시에서 계속 나오지 않도록)
    const cacheKey = getAnswerCacheKey(pending.question, pending.repos, pending.model || 'claude', pending.fastMode || false, pending.persona || 'developer');
    answerCache.delete(cacheKey);
    saveAnswerCache();
    if (correction && correction.trim()) {
      const correctionNote = `[오류 수정] 이전 분석이 틀렸습니다.\n원래 질문: ${pending.question.substring(0, 100)}\n수정 내용: ${correction.trim()}`;
      addKnowledge(pending.repos, pending.question, correctionNote);
    }
    pendingFeedback.delete(chatId);
    return res.json({ success: true });
  }

  res.status(400).json({ error: '잘못된 피드백 유형입니다.' });
});

// ===== 지식 관리 API (Admin) =====
app.get('/api/admin/knowledge', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const repoIds = Object.keys(LOCAL_REPOS);
  res.json(getAllKnowledge(repoIds));
});

app.delete('/api/admin/knowledge/:repoId', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  clearKnowledge(req.params.repoId);
  res.json({ success: true });
});

// ===== 엔드유저 가이드 문서 인제스트 (PPT/Word/PDF → 청크 → 임베딩 → 가이드 store, 결정 76) =====
// officeparser 로 파싱 → 내장 청킹 → 짧은 청크 인접 병합(~800자) → addGuideChunks
async function ingestGuideDoc(repoId, filePath, originalName, apiKey) {
  const ast = await officeParser.parseOffice(filePath);
  const chunksRes = await ast.to('chunks', { strategy: 'fixed-size', chunkSize: 1000 });
  const merged = [];
  let buf = '';
  for (const c of (chunksRes.value || [])) {
    const t = (c.text || '').trim();
    if (!t) continue;
    buf += (buf ? '\n' : '') + t;
    if (buf.length >= 800) { merged.push(buf); buf = ''; }
  }
  if (buf.trim()) merged.push(buf);
  if (merged.length === 0) throw new Error('문서에서 추출된 텍스트가 없습니다.');
  return await addGuideChunks(repoId, originalName, merged, apiKey);
}

app.post('/api/admin/guides/upload', authMiddleware, upload.single('docfile'), async (req, res) => {
  if (!req.user.isAdmin) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { repoId } = req.body;
  if (!repoId || !LOCAL_REPOS[repoId]) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: '유효한 사이트(레포지토리)를 선택하세요.' });
  }
  if (!req.file) return res.status(400).json({ error: '문서 파일을 업로드하세요.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.pdf', '.docx', '.pptx'].includes(ext)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: 'PDF, Word(.docx), PowerPoint(.pptx) 만 지원합니다.' });
  }

  // officeParser 는 확장자로 파일 타입을 판별한다 — multer 임시파일은 확장자 없는 해시 이름이라
  // 그대로 넘기면 "supports docx/pptx/... only" 로 인제스트가 실패한다. 검증된 ext 를 붙여준다.
  const filePath = req.file.path + ext;
  try { fs.renameSync(req.file.path, filePath); } catch (e) {}
  // multer 한글 파일명 깨짐 복원 (latin1 → utf8)
  let originalName = req.file.originalname;
  try { originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch (e) {}

  // 즉시 응답 + 백그라운드 인제스트(여러 청크 임베딩은 시간 소요)
  res.json({ success: true, message: '가이드 업로드 완료. 백그라운드에서 분석·저장 중입니다.' });
  setImmediate(async () => {
    try {
      const apiKey = GEMINI_KEY;
      const added = await ingestGuideDoc(repoId, filePath, originalName, apiKey);
      console.log(`[Guide] 인제스트 완료 — ${repoId} ← "${originalName}": ${added}개 청크`);
    } catch (e) {
      console.error(`[Guide] 인제스트 실패 — "${originalName}":`, e.message);
    } finally {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log('Server running: http://0.0.0.0:' + PORT));
