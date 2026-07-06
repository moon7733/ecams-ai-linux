const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const extractZip = require('extract-zip');
const { buildIndex } = require('./indexBuilder');

const INDEXES_DIR = path.join(__dirname, 'indexes');
if (!fs.existsSync(INDEXES_DIR)) fs.mkdirSync(INDEXES_DIR);

function getIndexPath(repoId) {
  return path.join(INDEXES_DIR, repoId.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_index.md');
}

function getIndexMeta(repoId) {
  const p = getIndexPath(repoId);
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  return { exists: true, builtAt: stat.mtime.toISOString(), size: stat.size };
}

async function triggerIndexBuild(repoId, repoPath) {
  try {
    console.log(`[Index] Building index for ${repoId}...`);
    const content = await buildIndex(repoPath, repoId);
    fs.writeFileSync(getIndexPath(repoId), content, 'utf8');
    console.log(`[Index] Done: ${repoId} (${content.length} chars)`);
  } catch(e) {
    console.error(`[Index] Failed for ${repoId}:`, e.message);
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
  try { USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8')); } catch(e) { USERS = {}; }
  try { LOCAL_REPOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'repos.json'), 'utf8')); } catch(e) { LOCAL_REPOS = {}; }
  try { REQUESTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'requests.json'), 'utf8')); } catch(e) { REQUESTS = []; }
  try { COMPANIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'companies.json'), 'utf8')); } catch(e) { COMPANIES = []; }
}
function saveUsers() { fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(USERS, null, 2)); }
function saveRepos() { fs.writeFileSync(path.join(__dirname, 'repos.json'), JSON.stringify(LOCAL_REPOS, null, 2)); }
function saveRequests() { fs.writeFileSync(path.join(__dirname, 'requests.json'), JSON.stringify(REQUESTS, null, 2)); }
function saveCompanies() { fs.writeFileSync(path.join(__dirname, 'companies.json'), JSON.stringify(COMPANIES, null, 2)); }

loadData();

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
  res.json({ repos: req.user.repos, isAdmin: req.user.isAdmin });
});

// 신규 레포지토리 - ZIP
app.post('/api/repos/create-zip', authMiddleware, upload.single('zipfile'), async (req, res) => {
  const { reponame } = req.body;
  if (!reponame || !req.file) return res.status(400).json({ error: '레포명과 파일을 입력하세요.' });
  if (LOCAL_REPOS[reponame]) return res.status(400).json({ error: '이미 존재하는 레포지토리입니다.' });
  
  const targetDir = path.join('C:\\ecams-ai\\workspace', reponame.replace(/[^a-zA-Z0-9_\-\/]/g, '_'));
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  try {
    await extractZip(req.file.path, { dir: targetDir });
    fs.unlinkSync(req.file.path);
    
    LOCAL_REPOS[reponame] = targetDir.replace(/\\/g, '/');
    saveRepos();

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
  const { reponame, gitUrl, gitToken } = req.body;
  if (!reponame || !gitUrl) return res.status(400).json({ error: '레포명과 Git URL을 입력하세요.' });
  if (LOCAL_REPOS[reponame]) return res.status(400).json({ error: '이미 존재하는 레포지토리입니다.' });

  const targetDir = path.join('C:\\ecams-ai\\workspace', reponame.replace(/[^a-zA-Z0-9_\-\/]/g, '_'));
  if (!fs.existsSync(path.dirname(targetDir))) fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  let cloneUrl = gitUrl;
  if (gitToken) {
    try {
      const urlObj = new URL(gitUrl);
      urlObj.username = gitToken; 
      cloneUrl = urlObj.toString();
    } catch(e) {
      return res.status(400).json({ error: '유효하지 않은 URL 형식입니다.' });
    }
  }

  const gitProc = spawn('git', ['clone', cloneUrl, targetDir], { shell: false });
  let gitStderr = '';
  gitProc.stderr.on('data', d => gitStderr += d.toString());
  gitProc.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: 'Git Clone 오류: ' + gitStderr });
    LOCAL_REPOS[reponame] = targetDir.replace(/\\/g, '/');
    saveRepos();
    USERS[req.user.id].repos[reponame] = 'edit';
    saveUsers();
    triggerIndexBuild(reponame, targetDir); // 백그라운드 인덱스 빌드
    res.json({ success: true, message: '레포지토리가 생성되었습니다. 인덱스를 백그라운드에서 생성 중입니다.' });
  });
  gitProc.on('error', (err) => res.status(500).json({ error: 'Git 실행 오류: ' + err.message }));
});

// 결재 시스템 API
app.post('/api/requests', authMiddleware, (req, res) => {
  const { repo, level } = req.body;
  if (!repo || !level) return res.status(400).json({ error: '잘못된 요청입니다.' });
  if (!['read', 'edit'].includes(level)) return res.status(400).json({ error: '권한은 read 또는 edit만 가능합니다.' });
  
  REQUESTS.push({ id: 'req_' + Date.now(), type: 'repo_auth', userId: req.user.id, repo, level, status: 'pending', timestamp: Date.now() });
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
  const users = Object.entries(USERS).map(([id, user]) => ({ id, repos: user.repos || {}, name: user.name || '', phone: user.phone || '', affiliation: user.affiliation || '', userType: user.userType || '' }));
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
  const result = Object.entries(LOCAL_REPOS).map(([id, repoPath]) => ({
    id, repoPath, meta: getIndexMeta(id)
  }));
  res.json({ indexes: result });
});

app.post('/api/admin/indexes/:repo/build', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: '권한이 없습니다.' });
  const repoId = decodeURIComponent(req.params.repo);
  const repoPath = LOCAL_REPOS[repoId];
  if (!repoPath) return res.status(404).json({ error: '레포지토리를 찾을 수 없습니다.' });
  res.json({ success: true, message: '인덱스 생성을 시작합니다.' });
  triggerIndexBuild(repoId, repoPath); // 응답 후 백그라운드 실행
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
  if (!req.user.repos[repo]) return res.status(403).json({ error: '권한이 없습니다.' });
  
  const basePath = LOCAL_REPOS[repo];
  if (!basePath) return res.status(404).json({ error: '레포지토리 경로를 찾을 수 없습니다.' });

  const targetPath = path.resolve(basePath, dirPath);
  if (!targetPath.startsWith(path.resolve(basePath))) {
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
  if (!req.user.repos[repo]) return res.status(403).json({ error: '권한이 없습니다.' });
  
  const basePath = LOCAL_REPOS[repo];
  if (!basePath) return res.status(404).json({ error: '레포지토리 경로를 찾을 수 없습니다.' });

  const targetPath = path.resolve(basePath, filePath);
  if (!targetPath.startsWith(path.resolve(basePath))) {
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

const SYSTEM_PROMPT = `You are a senior maintenance engineer for the eCAMS system.
반드시 한국어로만 답변하라. No English answers.

# 필수 분석 순서
1. 먼저 해당 프로젝트 README.md 읽기 (있으면)
2. 로컬 경로에서 직접 파일 읽기 (Read, Glob, Grep 도구 사용)
3. JSP → JS → Java Servlet → DB 순으로 흐름 추적
4. _server 연동 여부 확인
5. 한국어로 답변

# eCAMS 패턴
- JSP ↔ JS 항상 짝 (SysDetailTab.jsp ↔ SysDetailTab.js)
- ajaxAsync() / ajaxCallWithJson() 으로 서버 호출
- @WebServlet("/webPage/...") 으로 진입점 찾기
- requestType 파라미터로 Java 함수 분기
- /src/app/ 하위에 실제 처리 Java 파일
- DB: JDBC (PreparedStatement, ResultSet)

# 답변 형식
## 1. 요약
## 2. 실행 흐름
## 3. 주요 파일 및 DB 테이블
## 4. 유지보수 참고사항
## 5. 결론

# 절대 규칙
- 로컬 파일 직접 읽은 후에만 언급 (추측 금지)
- 못 찾으면 "확인 불가" 명시
- 반드시 한국어 답변`;

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
    try { resolve(await job()); } catch(e) { reject(e); }
    finally { this.running--; this._process(); }
  }
  get size() { return this.queue.length; }
  get isRunning() { return this.running > 0; }
}

const requestQueue = new Semaphore(MAX_CONCURRENT);

// ===== 프롬프트 구성 =====
function buildPrompt(message, allowedRepos, userReposPerms, history, imagePath) {
  let prompt = '';
  
  prompt += '# 당신은 아래의 레포지토리에 대해서만 접근이 허가되었습니다.\n';
  allowedRepos.forEach(r => {
    const localPath = LOCAL_REPOS[r];
    const perm = userReposPerms[r];
    if (localPath) {
      prompt += `- ${r} → ${localPath} (권한: ${perm === 'edit' ? '수정 가능' : '읽기 전용'})\n`;
    }
  });
  prompt += '\n## [보안 경고: 파일 수정 권한 제어] ##\n';
  prompt += '당신은 위 목록 중 "읽기 전용" 권한인 레포지토리의 파일은 절대 수정, 생성, 삭제해서는 안 됩니다.\n';
  prompt += '만약 사용자가 읽기 전용 레포지토리의 코드 수정을 지시한다면, "해당 레포지토리에 대한 수정 권한이 없습니다."라고 안내하고 작업을 거절하십시오.\n\n';

  // 사전 인덱스 주입
  const indexedRepos = [];
  allowedRepos.forEach(r => {
    const indexPath = getIndexPath(r);
    if (fs.existsSync(indexPath)) {
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        prompt += indexContent + '\n\n';
        indexedRepos.push(r);
      } catch(e) {}
    }
  });
  if (indexedRepos.length > 0) {
    prompt += `## [탐색 지시] 위 인덱스가 제공된 레포지토리(${indexedRepos.join(', ')})는 인덱스를 먼저 참고하여 파일 경로를 특정하고, 해당 파일만 직접 읽으십시오. README나 디렉토리 탐색 없이 바로 관련 파일로 이동하십시오.\n\n`;
  }

  prompt += '## [백그라운드 공통 지식: DB 스키마 요약 파일 자동 참조] ##\n';
  prompt += '당신은 데이터베이스의 테이블과 컬럼 설명이 요약된 다음 파일을 읽을 권한이 있습니다: D:/03.source/05. DB/engine/DB/AI_Schema_Summary.md\n';
  prompt += '만약 사용자의 질문이 데이터베이스 쿼리, 테이블 구조, 상태값, 컬럼 의미 등을 포함하거나 분석 과정에서 DB 확인이 필수적이라고 판단될 경우, 별도의 지시가 없더라도 이 요약 파일을 가장 먼저 검색하여 완벽한 답변을 도출하십시오.\n';
  prompt += '추가적인 프로시저나 함수의 내용이 필요하다면 D:/03.source/05. DB/engine/DB 경로 안의 sql 파일들을 추가로 읽어도 됩니다. 단, 이 파일들은 읽기 전용으로만 사용하십시오.\n\n';

  const recentHistory = (history || []).slice(-6);
  if (recentHistory.length > 0) {
    prompt += '# 이전 대화 내용\n';
    recentHistory.forEach(msg => {
      const role = msg.role === 'user' ? '사용자' : 'AI';
      prompt += '[' + role + ']: ' + msg.content.substring(0, 1000) + '\n\n';
    });
  }
  if (imagePath) {
    prompt += '# 첨부 이미지\n아래 경로의 이미지 파일을 참고하여 분석해줘:\n' + imagePath + '\n\n';
  }
  prompt += '# 현재 질문\n' + message;
  return prompt;
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
  } catch(e) {}
}

// ===== Claude Code 스트리밍 실행 =====
function runClaudeCodeStream(prompt, res) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;
    const startTime = Date.now();

    const proc = spawn('claude', [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--mcp-config', MCP_CONFIG_PATH
    ], {
      shell: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

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
      const elapsed = state.duration_ms ? (state.duration_ms / 1000).toFixed(1) : ((Date.now() - startTime) / 1000).toFixed(1);
      res.write('data: ' + JSON.stringify({ type: 'elapsed', seconds: elapsed, usage: state.usage }) + '\n\n');
      resolve(state.answer.trim());
    });

    proc.on('error', (err) => {
      console.error('[Claude Spawn Error]:', err);
      res.write('data: ' + JSON.stringify({ type: 'error', text: '엔진 실행 오류: ' + err.message }) + '\n\n');
      reject(err);
    });
  });
}

app.get('/api/queue', authMiddleware, (req, res) => {
  res.json({ waiting: requestQueue.size, running: requestQueue.isRunning });
});

app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, repos = [], history = [], image, imageMime } = req.body;

  const allowedRepos = repos.filter(r => req.user.repos[r]);
  
  if (!message || !message.trim()) return res.json({ answer: '질문을 입력해주세요.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let imagePath = null;
  if (image) {
    try {
      const ext = (imageMime || 'image/png').includes('jpeg') ? 'jpg' : 'png';
      imagePath = path.join(os.tmpdir(), 'ecams_img_' + Date.now() + '.' + ext);
      fs.writeFileSync(imagePath, Buffer.from(image, 'base64'));
    } catch(e) {
      console.error('[Image Write Error]', e);
    }
  }

  try {
    if (requestQueue.size > 0) {
      res.write('data: ' + JSON.stringify({ type: 'status', text: `⏳ 대기 중 (${requestQueue.size}명 앞에 대기 중)` }) + '\n\n');
    }
    const answer = await requestQueue.add(async () => {
      res.write('data: ' + JSON.stringify({ type: 'status', text: '🚀 봇 구동 및 분석 중...' }) + '\n\n');
      const prompt = buildPrompt(message, allowedRepos, req.user.repos, history, imagePath);
      return await runClaudeCodeStream(prompt, res);
    });
    res.write('data: ' + JSON.stringify({ type: 'done', answer }) + '\n\n');
    console.log('[Chat Success] Answer delivered.');
  } catch(e) {
    console.error('[Chat Error]', e);
    res.write('data: ' + JSON.stringify({ type: 'error', text: '오류: ' + e.message }) + '\n\n');
  } finally {
    if (imagePath) try { fs.unlinkSync(imagePath); } catch(e) {}
    res.end();
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log('Server running: http://0.0.0.0:' + PORT));