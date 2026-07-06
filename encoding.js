// 파일 인코딩(UTF-8/EUC-KR)을 감지해 항상 UTF-8 로 통일하는 공용 모듈
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// 디스크 변환 대상 소스 확장자 화이트리스트 (이진 파일 제외)
const SOURCE_EXTS = new Set([
  '.java', '.js', '.jsp', '.jspf', '.tld', '.xml', '.sql', '.properties',
  '.html', '.htm', '.css', '.txt', '.json', '.md', '.ts', '.tsx', '.jsx',
  '.pc', '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', // Pro*C/C 서버소스 — 누락돼 EUC-KR 로 남던 것 포함
]);
// 순회 시 건너뛸 디렉터리 (서드파티/메타)
const SKIP_DIRS = new Set(['vendor', 'node_modules', '.git']);

// 유효 UTF-8 여부 — 통과하면 그대로 둬도 안전(멱등 보장).
function isLikelyUtf8(buf) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; }
  catch { return false; }
}

// Buffer → UTF-8 string. 유효 UTF-8이면 그대로, 아니면 EUC-KR(CP949) 디코딩.
function decodeBuffer(buf) {
  if (!buf || buf.length === 0) return '';
  // UTF-8 BOM 제거
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) buf = buf.slice(3);
  if (isLikelyUtf8(buf)) return buf.toString('utf8');
  return iconv.decode(buf, 'euc-kr'); // 깨진 UTF-8 = 한국 레거시
}

// 소스 텍스트 읽기 (실패 시 ''). maxBytes 자르기는 호출부 책임.
function smartRead(filePath) {
  try { return decodeBuffer(fs.readFileSync(filePath)); }
  catch { return ''; }
}

// 단일 파일 디스크 변환: EUC-KR 감지분만 UTF-8(BOM 없음, CRLF 보존)로 덮어씀.
// 반환: 'converted' | 'utf8' | 'skip-ext' | 'error'
// backupRoot/relativeTo 지정 시, 변환 직전 원본을 백업 트리에 복사.
function convertFileToUtf8(filePath, { backupRoot, relativeTo } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXTS.has(ext)) return 'skip-ext';
  let buf;
  try { buf = fs.readFileSync(filePath); } catch { return 'error'; }
  if (isLikelyUtf8(buf)) return 'utf8'; // 멱등 — 무변경
  const decoded = iconv.decode(buf, 'euc-kr');
  // 백업 (원본 바이트 그대로)
  if (backupRoot && relativeTo) {
    const rel = path.relative(relativeTo, filePath);
    const dest = path.join(backupRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  fs.writeFileSync(filePath, decoded, 'utf8'); // BOM 미부여, decoded 의 CRLF 보존
  return 'converted';
}

// 디렉터리 트리 순회하며 소스 파일을 UTF-8로 변환.
// opts: { backupRoot, dryRun }. relativeTo 는 백업 상대경로 기준(기본 dir 상위).
// 반환: { converted:[], utf8:n, skipped:n, errors:[] }
function convertRepoToUtf8(dir, opts = {}) {
  const { backupRoot, dryRun = false, relativeTo } = opts;
  const base = relativeTo || path.dirname(dir);
  const result = { converted: [], utf8: 0, skipped: 0, errors: [] };
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!SOURCE_EXTS.has(ext)) { result.skipped++; continue; }
      let buf;
      try { buf = fs.readFileSync(full); } catch { result.errors.push(full); continue; }
      if (isLikelyUtf8(buf)) { result.utf8++; continue; }
      if (dryRun) { result.converted.push(full); continue; }
      const r = convertFileToUtf8(full, { backupRoot, relativeTo: base });
      if (r === 'converted') result.converted.push(full);
      else if (r === 'error') result.errors.push(full);
    }
  }
  return result;
}

module.exports = { decodeBuffer, smartRead, isLikelyUtf8, convertFileToUtf8, convertRepoToUtf8, SOURCE_EXTS };
