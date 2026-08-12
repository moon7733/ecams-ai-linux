#!/usr/bin/env node
'use strict';
/**
 * pmsBridge.js — PMS ↔ azbrain 얇은 HTTP 브릿지 (Gemini 분류/WBS비전 노출).
 * azbrain server.js(RAG·auth)와 완전 분리된 독립 프로세스. Node 내장 http만 사용.
 *
 * 기동: PMS_BRIDGE_TOKEN=<서비스토큰> PMS_BRIDGE_PORT=8790 node pmsBridge.js
 * 인증: 모든 요청에 헤더 X-PMS-Token 필요(PMS_BRIDGE_TOKEN 미설정 시 경고 후 무인증=개발용).
 *
 * POST /pms/classify         {text} 또는 {nodes[],predicates[]} -> {items,clarify,elapsedMs,model}
 *   - nodes: [{nodePath,heading,text}] 아웃라인 좌표. 주면 좌표 모드(항목마다 nodePath·kind·predicate·route 반환).
 *   - predicates: [{code,name,valueType,qualifierKeys[]}] PMS 어휘 정본. 좌표 모드에서만 쓴다.
 *   - clarify: 모델이 사람에게 되묻는 문장(최대 3). 구버전 PMS는 이 필드를 무시하므로 추가해도 안전하다.
 *   - 값이 가려진 자리에는 «SECRET#n» 토큰이 오고, 모델은 그 토큰을 body에 그대로 되돌려준다(PMS가 값과 다시 잇는다).
 * POST /pms/wbs-vision        {imageBase64,mime}            -> {rows,notes,elapsedMs,model}
 * POST /pms/assistant-answer  {question,mode,citations}     -> {answer,followUps,elapsedMs,model}
 * GET  /pms/health                                        -> {ok:true}
 * POST /pms/embed-sync        {docs[]}                      -> {embedded,skipped,deleted,total}
 * POST /pms/semantic-search   {question,topK?}              -> {hits:[{sourceType,sourceId,score}]}
 * POST /pms/code-search       {repo?,customer?,q,kind?,topK?} -> [{entityId,kind,name,paths,score}]
 */
const http = require('http');
const { classify, extractWbs, synthesizeAnswer, loadKey } = require('./pmsGemini');
const { sync: syncEmbeddings, search: semanticSearch } = require('./pmsEmbedding');
const { searchCode } = require('./pmsCodeSearch');

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
      // nodes(아웃라인 좌표)가 오면 좌표 모드 — text 없이도 된다. 없으면 기존 text 모드(레거시 /assistant 경로).
      const nodes = Array.isArray(body.nodes) ? body.nodes : [];
      if (!nodes.length && (!body.text || !body.text.trim())) return send(res, 400, { error: 'text or nodes required' });
      const r = await classify(body.text || '', Array.isArray(body.knownTags) ? body.knownTags : [],
        { nodes, predicates: Array.isArray(body.predicates) ? body.predicates : [] });
      return r.items ? send(res, 200, r) : send(res, 502, { error: `classify failed: ${r.err}` });
    }
    if (url === '/pms/wbs-vision') {
      if (!body.imageBase64) return send(res, 400, { error: 'imageBase64 required' });
      const r = await extractWbs(body.imageBase64, body.mime || 'image/jpeg');
      return r.rows ? send(res, 200, r) : send(res, 502, { error: `wbs extract failed: ${r.err}` });
    }
    if (url === '/pms/assistant-answer') {
      if (!body.question || !body.question.trim()) return send(res, 400, { error: 'question required' });
      if (!Array.isArray(body.citations) || body.citations.length === 0) return send(res, 400, { error: 'citations required' });
      const r = await synthesizeAnswer(body.question, body.citations, body.mode || 'CURRENT');
      return r.answer ? send(res, 200, r) : send(res, 502, { error: `answer synthesis failed: ${r.err}` });
    }
    if (url === '/pms/embed-sync') {
      if (!Array.isArray(body.docs)) return send(res, 400, { error: 'docs array required' });
      const r = await syncEmbeddings(body.docs);
      return r.err ? send(res, 502, { error: `embedding sync failed: ${r.err}` }) : send(res, 200, r);
    }
    if (url === '/pms/semantic-search') {
      if (!body.question || !body.question.trim()) return send(res, 400, { error: 'question required' });
      const r = await semanticSearch(body.question, body.topK);
      return r.err ? send(res, 502, { error: `semantic search failed: ${r.err}` }) : send(res, 200, r);
    }
    if (url === '/pms/code-search') {
      const q = typeof body.q === 'string' ? body.q.trim() : '';
      if (Array.from(q).length < 2) return send(res, 400, { error: 'q must be at least 2 characters' });
      if (!body.repo && !body.customer) return send(res, 400, { error: 'repo or customer required' });
      const r = await searchCode({ ...body, q }, {
        baseUrl: process.env.AZBRAIN_INTERNAL_URL || 'http://ecams-ai:3000',
        token: TOKEN
      });
      return send(res, 200, r);
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: `internal: ${e.message}` });
  }
});

server.listen(PORT, () => {
  console.log(`[pmsBridge] listening on :${PORT}  token=${TOKEN ? 'ON' : 'OFF(개발용 무인증)'}  key=${loadKey() ? 'loaded' : 'MISSING'}`);
});
