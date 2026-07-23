#!/usr/bin/env node
/**
 * wbsVisionTest.js — WBS 사진 → 구조화 행 추출 프로브 (Gemini vision).
 * pmsClassifyGemini.js 와 같은 무료 키·엔드포인트에 이미지를 inlineData(base64)로 실어 보낸다.
 *
 * 사용: node wbsVisionTest.js <이미지경로>
 *   PMS_VISION_MODEL=gemini-3.1-flash node wbsVisionTest.js wbs.jpg   # 정확도 원하면 lite 말고 flash
 *
 * 출력: stdout=JSON 배열([{level,name,start,end,note}]), stderr=[wbsVision] elapsed=NNNms.
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL = process.env.PMS_VISION_MODEL || 'gemini-3.1-flash-lite';
const TIMEOUT_MS = Number(process.env.PMS_VISION_TIMEOUT_MS || 30000);

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const dir of [__dirname, process.cwd()]) {
    const p = path.join(dir, '.env');
    try {
      if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = l.match(/^GEMINI_API_KEY(?:_\d+)?=(.+)/); if (m) return m[1].trim();
      }
    } catch {}
  }
  return '';
}

function mimeOf(p) {
  const e = p.toLowerCase();
  if (e.endsWith('.png')) return 'image/png';
  if (e.endsWith('.webp')) return 'image/webp';
  if (e.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

const PROMPT = [
  '이 이미지는 SI 프로젝트 WBS(엑셀) 화면이다. 표의 각 작업 행을 위에서 아래 순서대로 JSON 배열로 추출하라.',
  '각 원소: {"level","name","start","end","note"}',
  '- level: 들여쓰기 깊이(최상위=0, 하위로 갈수록 +1). 작업이름 셀의 들여쓰기/굵기로 판단.',
  '- name: 작업이름. start/end: 시작·완료일 YYYY-MM-DD (없으면 null).',
  '- note: 비고나 우측 노란 협조요청 칸 내용이 그 행과 관련되면 넣고, 없으면 null.',
  '표에 안 보이는 값은 지어내지 말고 null. 오직 JSON 배열만 출력.'
].join('\n');

async function main() {
  const apiKey = loadKey();
  const imgPath = process.argv[2];
  if (!apiKey) { process.stderr.write('WBSVISION_ERROR: GEMINI_API_KEY 미설정\n'); process.exit(1); }
  if (!imgPath) { process.stderr.write('WBSVISION_ERROR: 이미지 경로 인자 필요 (node wbsVisionTest.js wbs.jpg)\n'); process.exit(1); }
  let b64;
  try { b64 = fs.readFileSync(imgPath).toString('base64'); }
  catch (e) { process.stderr.write(`WBSVISION_ERROR: 이미지 읽기 실패: ${e.message}\n`); process.exit(1); }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mimeOf(imgPath), data: b64 } }] }],
    generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 8192, responseMimeType: 'application/json' }
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const t0 = Date.now();
  const res = await new Promise((resolve) => {
    const req = https.request(url, { method: 'POST', timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let b = ''; r.on('data', c => b += c);
      r.on('end', () => { try { const j = JSON.parse(b); resolve({ text: j.candidates?.[0]?.content?.parts?.[0]?.text, err: j.error?.message }); } catch { resolve({ err: 'parse' }); } });
    });
    req.on('error', e => resolve({ err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ err: `timeout ${TIMEOUT_MS}ms` }); });
    req.write(body); req.end();
  });
  process.stderr.write(`[wbsVision] model=${MODEL} elapsed=${Date.now() - t0}ms\n`);
  if (!res.text) { process.stderr.write(`WBSVISION_ERROR: ${res.err || 'no text'}\n`); process.exit(1); }
  let j; try { j = JSON.parse(res.text); } catch { const m = res.text.match(/\[[\s\S]*\]/); j = m ? JSON.parse(m[0]) : null; }
  if (!j) { process.stderr.write(`WBSVISION_ERROR: no JSON. head: ${res.text.slice(0,300)}\n`); process.exit(1); }
  process.stdout.write(JSON.stringify(Array.isArray(j) ? j : (j.rows || j.items || j), null, 2));
  process.exit(0);
}
main();
