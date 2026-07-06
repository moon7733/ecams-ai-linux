'use strict';
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function dayFile(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(LOG_DIR, `answer_log_${y}${m}${dd}.jsonl`);
}

// 답변 한 건 기록 (append-only)
function logAnswer(entry) {
  try {
    const record = {
      timestamp: new Date().toISOString(),
      audited: false,
      ...entry,
    };
    fs.appendFileSync(dayFile(), JSON.stringify(record) + '\n', 'utf8');
  } catch (e) {
    console.error('[answerLogger.logAnswer]', e.message);
  }
}

// 미검증 항목 이터레이션
function* iterUnauditedLogs() {
  let files;
  try { files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('answer_log_')).sort(); } catch (e) { return; }
  for (const f of files) {
    let lines;
    try { lines = fs.readFileSync(path.join(LOG_DIR, f), 'utf8').split('\n'); } catch (e) { continue; }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        const r = JSON.parse(lines[i]);
        if (!r.audited) yield { file: f, lineNo: i, record: r };
      } catch (e) {}
    }
  }
}

// 검증 완료 마킹 (해당 줄만 업데이트)
function markAudited(file, lineNo, verdict = null) {
  const fp = path.join(LOG_DIR, file);
  try {
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    if (lineNo < lines.length && lines[lineNo].trim()) {
      const r = JSON.parse(lines[lineNo]);
      r.audited = true;
      r.auditedAt = new Date().toISOString();
      if (verdict) r.verdict = verdict; // 'ok' | 'bad'
      lines[lineNo] = JSON.stringify(r);
      fs.writeFileSync(fp, lines.join('\n'), 'utf8');
    }
  } catch (e) {
    console.error('[answerLogger.markAudited]', e.message);
  }
}

function countUnaudited() {
  let count = 0;
  for (const _ of iterUnauditedLogs()) count++;
  return count;
}

module.exports = { logAnswer, iterUnauditedLogs, markAudited, countUnaudited, LOG_DIR };
