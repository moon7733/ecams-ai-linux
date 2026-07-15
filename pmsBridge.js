#!/usr/bin/env node
'use strict';
/**
 * pmsBridge.js — PMS ↔ azbrain 얇은 HTTP 브릿지 (Gemini 분류/WBS비전 노출).
 * azbrain server.js(RAG·auth)와 완전 분리된 독립 프로세스. Node 내장 http만 사용.
 *
 * 기동: PMS_BRIDGE_TOKEN=<서비스토큰> PMS_BRIDGE_PORT=8790 node pmsBridge.js
 * 인증: 모든 요청에 헤더 X-PMS-Token 필요(PMS_BRIDGE_TOKEN 미설정 시 경고 후 무인증=개발용).
 *
 * POST /pms/classify     {text}                  -> {items,elapsedMs,model}
 * POST /pms/wbs-vision    {imageBase64,mime}       -> {rows,notes,elapsedMs,model}
 * GET  /pms/health                               -> {ok:true}
 */
const http = require('http');
const { classify, extractWbs, loadKey } = require('./pmsGemini');

const PORT = Number(process.env.PMS_BRIDGE_PORT || 8790);
const TOKEN = process.env.PMS_BRIDGE_TOKEN || '';
const MAX_BODY = Number(process.env.PMS_BRIDGE_MAX_BODY || 25 * 1024 * 1024); // 25MB (이미지 여유)

function send(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/pms/health') return send(res, 200, { ok: true, keyLoaded: !!loadKey() });

  if (TOKEN && req.headers['x-pms-token'] !== TOKEN) return send(res, 401, { error: 'invalid token' });
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });

  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, { error: `bad request: ${e.message}` }); }

  try {
    if (url === '/pms/classify') {
      if (!body.text || !body.text.trim()) return send(res, 400, { error: 'text required' });
      const r = await classify(body.text, Array.isArray(body.knownTags) ? body.knownTags : []);
      return r.items ? send(res, 200, r) : send(res, 502, { error: `classify failed: ${r.err}` });
    }
    if (url === '/pms/wbs-vision') {
      if (!body.imageBase64) return send(res, 400, { error: 'imageBase64 required' });
      const r = await extractWbs(body.imageBase64, body.mime || 'image/jpeg');
      return r.rows ? send(res, 200, r) : send(res, 502, { error: `wbs extract failed: ${r.err}` });
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: `internal: ${e.message}` });
  }
});

server.listen(PORT, () => {
  console.log(`[pmsBridge] listening on :${PORT}  token=${TOKEN ? 'ON' : 'OFF(개발용 무인증)'}  key=${loadKey() ? 'loaded' : 'MISSING'}`);
});
