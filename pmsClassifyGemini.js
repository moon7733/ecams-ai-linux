#!/usr/bin/env node
/**
 * pmsClassifyGemini.js — PMS 인수인계 덤프 분류기 (Gemini flash-lite API 버전).
 *
 * azbrain clarifier.js 패턴 그대로: https 직접 호출, thinkingBudget 0(thinking off),
 * responseMimeType JSON 강제. CLI 스폰 없이 API라 claude -p(11~15s)보다 빠를 것으로 기대(실측 필요).
 *
 * 표준입력(또는 파일 인자) 텍스트 → JSON 배열만 stdout. 소요시간은 stderr에 [pmsClassify] 로그.
 * 성공 exit 0 / 실패 stderr "PMSCLASSIFY_ERROR: ..." + exit 1 (호출측[PMS]은 규칙기반 폴백).
 *
 * 사용:
 *   node pmsClassifyGemini.js < blob.txt
 *   node pmsClassifyGemini.js blob.txt
 *   PMS_CLASSIFY_MODEL=gemini-3.1-flash node pmsClassifyGemini.js blob.txt
 *
 * 주의: 비번·경로 등 민감정보는 호출측(PMS)이 먼저 걸러 보낸다. 이 스크립트가 받은 텍스트는
 *       그대로 Google(Gemini API)로 전송된다. 무료 티어 키는 데이터가 학습에 쓰일 수 있음.
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL = process.env.PMS_CLASSIFY_MODEL || 'gemini-3.1-flash-lite';
const TIMEOUT_MS = Number(process.env.PMS_CLASSIFY_TIMEOUT_MS || 15000);

// azbrain server.js 와 동일한 .env 로더 (GEMINI_API_KEY 또는 _N 첫 값)
function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const dir of [__dirname, process.cwd()]) {
    const p = path.join(dir, '.env');
    try {
      if (fs.existsSync(p)) {
        for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
          const m = l.match(/^GEMINI_API_KEY(?:_\d+)?=(.+)/);
          if (m) return m[1].trim();
        }
      }
    } catch {}
  }
  return '';
}

const INSTRUCTION = [
  '당신은 SI 프로젝트 인수인계 메모 분류기다. 아래 <DUMP>의 각 정보 조각을 분류해 JSON 배열로만 출력한다.',
  '각 원소 형식: {"target","key","title","body","tag"}',
  '- target 은 "info" | "knowledge" | "credential" 중 하나.',
  '- "info": 값이 아래 정형 필드 중 하나에 정확히 해당할 때만. key 는 반드시 다음 중 하나:',
  '  "DB","WAS","SCM","SERVER_IP","LOGIN_STEPS". body 는 그 필드의 값만(부연설명 제외). title 은 필드명.',
  '- "credential": 비밀번호 등 민감정보. tag="접속 정보".',
  '- 그 외 운영절차·특이사항·하우툴은 "knowledge". key=null, title=짧은 제목, body=내용 전문, tag=짧은 분류어(예: 운영절차).',
  '- 확실치 않으면 "knowledge". 조각을 억지로 쪼개지 말 것.',
  '오직 JSON 배열만 출력.'
].join('\n');

function readInput() {
  const fileArg = process.argv[2];
  return fileArg ? fs.readFileSync(fileArg, 'utf8') : fs.readFileSync(0, 'utf8');
}

function callGemini(prompt, apiKey) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 2048, responseMimeType: 'application/json' }
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST', timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve({ text: j.candidates?.[0]?.content?.parts?.[0]?.text, err: j.error?.status || j.error?.message });
        } catch { resolve({ err: 'response parse failed' }); }
      });
    });
    req.on('error', (e) => resolve({ err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ err: `timeout ${TIMEOUT_MS}ms` }); });
    req.write(body); req.end();
  });
}

function toArray(text) {
  if (!text) return null;
  let j;
  try { j = JSON.parse(text); } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try { j = JSON.parse(m[0]); } catch { return null; }
  }
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.items)) return j.items;      // {items:[...]} 방어
  if (Array.isArray(j.results)) return j.results;
  return null;
}

async function main() {
  const apiKey = loadKey();
  if (!apiKey) { process.stderr.write('PMSCLASSIFY_ERROR: GEMINI_API_KEY 미설정(.env 확인)\n'); process.exit(1); }
  let dump;
  try { dump = readInput().trim(); } catch (e) {
    process.stderr.write(`PMSCLASSIFY_ERROR: input read failed: ${e.message}\n`); process.exit(1);
  }
  if (!dump) { process.stderr.write('PMSCLASSIFY_ERROR: empty input\n'); process.exit(1); }

  const prompt = `${INSTRUCTION}\n<DUMP>\n${dump}\n</DUMP>`;
  const t0 = Date.now();
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {   // 503/429 1회 재시도
    last = await callGemini(prompt, apiKey);
    if (last.text) break;
    if (!/RESOURCE_EXHAUSTED|UNAVAILABLE|503|429/.test(last.err || '')) break;
  }
  const elapsed = Date.now() - t0;
  process.stderr.write(`[pmsClassify] model=${MODEL} elapsed=${elapsed}ms\n`);

  if (!last.text) { process.stderr.write(`PMSCLASSIFY_ERROR: gemini: ${last.err || 'no text'}\n`); process.exit(1); }
  const arr = toArray(last.text);
  if (!arr) { process.stderr.write(`PMSCLASSIFY_ERROR: no JSON array. raw head: ${last.text.slice(0, 300)}\n`); process.exit(1); }
  process.stdout.write(JSON.stringify(arr));
  process.exit(0);
}

main();
