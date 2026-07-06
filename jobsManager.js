// Job 기반 비동기 LLM 답변 관리 모듈 (async-jobs 결정 1~12)
const crypto = require('crypto');

// jobId → job 상태 Map
const jobs = new Map();

function createJob(userId) {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    userId,
    status: 'running',        // 'running' | 'completed' | 'failed' | 'cancelled'
    startedAt: Date.now(),
    completedAt: null,
    chunks: [],               // raw SSE 라인 누적 (재구독 시 처음부터 재전송)
    subscribers: new Set(),   // 현재 구독 중인 SSE res 객체들
    currentProcess: null,     // kill 가능한 프로세스 핸들
    finalAnswer: null,
  });
  return jobId;
}

// auth 검증 포함 — 결정 5 (404로 존재 은닉)
function getJob(jobId, userId) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return job;
}

// 내부 전용: auth 없이 status만 확인
function getJobStatus(jobId) {
  return jobs.get(jobId)?.status ?? null;
}

function setCurrentProcess(jobId, proc) {
  const job = jobs.get(jobId);
  if (job) job.currentProcess = proc;
}

function appendChunk(jobId, rawLine) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.chunks.push(rawLine);
  // 끊긴 연결 제거 — write 실패 시 구독자에서 제거
  for (const sub of job.subscribers) {
    try { sub.write(rawLine); } catch (e) {
      job.subscribers.delete(sub);
      try { sub.end(); } catch (e2) {}
    }
  }
}

function finishJob(jobId, finalAnswer) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return;
  job.status = 'completed';
  job.completedAt = Date.now();
  job.finalAnswer = finalAnswer;
  for (const sub of job.subscribers) {
    try { sub.end(); } catch (e) {}
  }
  job.subscribers.clear();
}

function failJob(jobId, errText) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return;
  job.status = 'failed';
  job.completedAt = Date.now();
  const errLine = 'data: ' + JSON.stringify({ type: 'error', text: errText }) + '\n\n';
  job.chunks.push(errLine);
  for (const sub of job.subscribers) {
    try { sub.write(errLine); sub.end(); } catch (e) {}
  }
  job.subscribers.clear();
}

function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  if (job.currentProcess) {
    try { job.currentProcess.kill(); } catch (e) {}
  }
  if (job.status !== 'running') return;
  job.status = 'cancelled';
  job.completedAt = Date.now();
  for (const sub of job.subscribers) {
    try { sub.end(); } catch (e) {}
  }
  job.subscribers.clear();
}

// 누적 chunks 즉시 flush 후 live 구독 등록
function subscribe(jobId, sseRes) {
  const job = jobs.get(jobId);
  if (!job) return false;
  for (const chunk of job.chunks) {
    try { sseRes.write(chunk); } catch (e) {}
  }
  if (job.status !== 'running') {
    try { sseRes.end(); } catch (e) {}
    return true;
  }
  job.subscribers.add(sseRes);
  return true;
}

function unsubscribe(jobId, sseRes) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.subscribers.delete(sseRes);
}

function countRunningJobs(userId) {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.userId === userId && job.status === 'running') count++;
  }
  return count;
}

// 현재 SSE 구독자 수 (web-push 결정 4: 0이면 push 알림 보내기)
function getSubscriberCount(jobId) {
  const job = jobs.get(jobId);
  return job ? job.subscribers.size : 0;
}

// TTL cleanup — 결정 6 (completed/failed/cancelled: 30분, idle: 5분)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (job.status === 'running') continue;
    const age = now - (job.completedAt || job.startedAt);
    const isIdle = job.subscribers.size === 0;
    if (age > 30 * 60 * 1000 || (isIdle && age > 5 * 60 * 1000)) {
      jobs.delete(jobId);
    }
  }
}, 60_000);

module.exports = {
  createJob,
  getJob,
  getJobStatus,
  setCurrentProcess,
  appendChunk,
  finishJob,
  failJob,
  cancelJob,
  subscribe,
  unsubscribe,
  countRunningJobs,
  getSubscriberCount,
};
