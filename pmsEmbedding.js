'use strict';
/**
 * pmsEmbedding.js — PMS FIND 의미 검색 저장소 (azbrain PostgreSQL + pgvector).
 *
 * PMS(갭 리뷰 §20.3 임베딩 hybrid retrieval)가 보내는 redacted BUSINESS 문서를 Gemini 임베딩으로
 * 벡터화해 pms_search_embedding 테이블(pgvector)에 저장하고, 질문 벡터와의 cosine 근접 순으로
 * 원천 key(sourceType, sourceId)만 돌려준다. **문서 텍스트는 저장하지 않는다** — 임베딩 계산에만
 * 쓰고 버린다. 권한 판정·행 되찾기는 PMS가 자기 DB에서 한다.
 *
 * 전제: azbrain postgres(PGHOST 등 pg 표준 env)에 pgvector 확장 설치.
 *   미설치면: apt install postgresql-16-pgvector (또는 배포판 대응 패키지) 후
 *   CREATE EXTENSION은 이 모듈이 시도한다(권한 없으면 슈퍼유저로 1회 실행 필요).
 *
 * 브릿지(pmsBridge.js)가 /pms/embed-sync, /pms/semantic-search 로 노출한다.
 */
const https = require('https');
const { loadKey } = require('./pmsGemini');

const EMBED_MODEL = process.env.PMS_EMBED_MODEL || 'gemini-embedding-001';
const EMBED_DIM = Number(process.env.PMS_EMBED_DIM || 768);
const BATCH_SIZE = 64;           // batchEmbedContents 요청당 문서 수(API 상한 100 미만 여유)
const MAX_TOP_K = 50;

let pool = null;
let initPromise = null;

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');   // azbrain 기존 의존성 재사용(pg 표준 env로 접속)
    pool = new Pool({ max: 3 });
  }
  return pool;
}

/** 스키마 준비(1회). 실패하면 다음 호출에서 재시도한다. */
function ensureReady() {
  if (!initPromise) {
    initPromise = (async () => {
      const p = getPool();
      await p.query('CREATE EXTENSION IF NOT EXISTS vector');
      await p.query(`CREATE TABLE IF NOT EXISTS pms_search_embedding (
        source_type  text NOT NULL,
        source_id    bigint NOT NULL,
        content_hash text NOT NULL,
        embedding    vector(${EMBED_DIM}) NOT NULL,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (source_type, source_id))`);
    })().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

/** Gemini batchEmbedContents — texts 배열을 같은 순서의 벡터 배열로. */
function embedBatch(texts, taskType, timeoutMs = 60000) {
  const body = JSON.stringify({
    requests: texts.map((t) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: t }] },
      taskType,
      outputDimensionality: EMBED_DIM
    }))
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${loadKey()}`;
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let b = ''; r.on('data', (c) => b += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve({ vectors: j.embeddings ? j.embeddings.map((e) => e.values) : null, err: j.error && j.error.message });
        } catch { resolve({ err: 'embed response parse failed' }); }
      });
    });
    req.on('error', (e) => resolve({ err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ err: `embed timeout ${timeoutMs}ms` }); });
    req.write(body); req.end();
  });
}

function toVectorLiteral(values) {
  return `[${values.join(',')}]`;
}

/**
 * 전체 동기화(상태 없는 reconcile) — PMS가 보낸 docs가 완전한 원하는 상태다.
 * content_hash 가 같은 문서는 건너뛰고, 바뀐 것만 임베딩·upsert, 목록에 없는 key는 삭제.
 * docs: [{sourceType, sourceId, contentHash, text}]
 */
async function sync(docs) {
  const t0 = Date.now();
  try {
    await ensureReady();
    const p = getPool();
    const existing = await p.query('SELECT source_type, source_id, content_hash FROM pms_search_embedding');
    const current = new Map(existing.rows.map((r) => [`${r.source_type}:${r.source_id}`, r.content_hash]));

    const wanted = new Set();
    const changed = [];
    for (const d of docs) {
      if (!d || !d.sourceType || d.sourceId == null || !d.contentHash || !d.text || !String(d.text).trim()) continue;
      const key = `${d.sourceType}:${d.sourceId}`;
      wanted.add(key);
      if (current.get(key) !== d.contentHash) changed.push(d);
    }

    let embedded = 0;
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const chunk = changed.slice(i, i + BATCH_SIZE);
      const r = await embedBatch(chunk.map((d) => String(d.text)), 'RETRIEVAL_DOCUMENT');
      if (!r.vectors || r.vectors.length !== chunk.length) {
        return { err: `embed failed: ${r.err || 'vector count mismatch'}` };
      }
      for (let j = 0; j < chunk.length; j++) {
        const d = chunk[j];
        await p.query(
          `INSERT INTO pms_search_embedding (source_type, source_id, content_hash, embedding, updated_at)
           VALUES ($1, $2, $3, $4::vector, now())
           ON CONFLICT (source_type, source_id)
           DO UPDATE SET content_hash = $3, embedding = $4::vector, updated_at = now()`,
          [d.sourceType, d.sourceId, d.contentHash, toVectorLiteral(r.vectors[j])]);
        embedded++;
      }
    }

    let deleted = 0;
    for (const key of current.keys()) {
      if (!wanted.has(key)) {
        const at = key.lastIndexOf(':');
        await p.query('DELETE FROM pms_search_embedding WHERE source_type = $1 AND source_id = $2',
          [key.slice(0, at), key.slice(at + 1)]);
        deleted++;
      }
    }

    return {
      embedded, skipped: wanted.size - changed.length, deleted, total: wanted.size,
      elapsedMs: Date.now() - t0, model: EMBED_MODEL
    };
  } catch (e) {
    return { err: e.message };
  }
}

/** 질문과 cosine 근접 순 상위 topK key. hits: [{sourceType, sourceId, score}] (score=cosine 유사도). */
async function search(question, topK) {
  const t0 = Date.now();
  try {
    await ensureReady();
    const r = await embedBatch([String(question)], 'RETRIEVAL_QUERY', 8000);
    if (!r.vectors || !r.vectors[0]) return { err: `query embed failed: ${r.err || 'no vector'}` };
    const k = Math.min(Math.max(Number(topK) || 16, 1), MAX_TOP_K);
    const res = await getPool().query(
      `SELECT source_type, source_id, 1 - (embedding <=> $1::vector) AS score
         FROM pms_search_embedding
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [toVectorLiteral(r.vectors[0]), k]);
    return {
      hits: res.rows.map((row) => ({
        sourceType: row.source_type, sourceId: Number(row.source_id), score: Number(row.score)
      })),
      elapsedMs: Date.now() - t0, model: EMBED_MODEL
    };
  } catch (e) {
    return { err: e.message };
  }
}

module.exports = { sync, search };
