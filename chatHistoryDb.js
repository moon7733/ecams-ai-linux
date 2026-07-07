// 대화 히스토리를 PostgreSQL에 저장하는 어댑터
const { Pool } = require('pg');

const CHAT_HISTORY_LIMIT = 50;
const hasDatabaseConfig = !!(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE);

let pool = null;
let readyPromise = null;
let disabled = !hasDatabaseConfig;
let warned = false;

function warnOnce(message, err) {
  if (warned) return;
  warned = true;
  console.warn('[ChatHistoryDB]', message, err?.message || '');
}

function getPool() {
  if (disabled) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      max: Number(process.env.PGPOOL_MAX || 5),
    });
  }
  return pool;
}

async function ensureReady() {
  const db = getPool();
  if (!db) return false;
  if (!readyPromise) {
    readyPromise = db.query('select 1').then(() => true).catch(err => {
      disabled = true;
      warnOnce('PostgreSQL 연결 실패. 파일 저장소로 폴백합니다.', err);
      return false;
    });
  }
  return readyPromise;
}

async function readChatHistory(userId) {
  if (!(await ensureReady())) return null;
  try {
    const sessions = await pool.query(
      `
      select chat_id as id, title, updated_at_ms as "updatedAt", deleted
      from (
        select *
        from chat_sessions
        where user_id = $1
        order by updated_at_ms desc
        limit $2
      ) s
      order by updated_at_ms asc
      `,
      [userId, CHAT_HISTORY_LIMIT],
    );

    if (!sessions.rows.length) return [];

    const ids = sessions.rows.map(row => row.id);
    const messages = await pool.query(
      `
      select chat_id as id, message
      from chat_messages
      where user_id = $1 and chat_id = any($2::text[])
      order by chat_id asc, seq asc
      `,
      [userId, ids],
    );

    const messagesByChat = new Map();
    for (const row of messages.rows) {
      if (!messagesByChat.has(row.id)) messagesByChat.set(row.id, []);
      messagesByChat.get(row.id).push(row.message);
    }

    return sessions.rows.map(row => ({
      id: String(row.id),
      title: row.title || '새 대화',
      messages: messagesByChat.get(row.id) || [],
      updatedAt: Number(row.updatedAt) || 0,
      deleted: !!row.deleted,
    }));
  } catch (err) {
    warnOnce('대화 히스토리 조회 실패. 파일 저장소로 폴백합니다.', err);
    return null;
  }
}

async function writeChatHistory(userId, chats) {
  if (!(await ensureReady())) return false;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from chat_sessions where user_id = $1', [userId]);

    for (const chat of chats) {
      await client.query(
        `
        insert into chat_sessions (user_id, chat_id, title, updated_at_ms, deleted)
        values ($1, $2, $3, $4, $5)
        `,
        [userId, chat.id, chat.title || '새 대화', chat.updatedAt || Date.now(), !!chat.deleted],
      );

      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] || {};
        await client.query(
          `
          insert into chat_messages (user_id, chat_id, seq, role, content, message)
          values ($1, $2, $3, $4, $5, $6)
          `,
          [userId, chat.id, i, String(msg.role || ''), typeof msg.content === 'string' ? msg.content : null, msg],
        );
      }
    }

    await client.query('commit');
    return true;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    warnOnce('대화 히스토리 저장 실패. 파일 저장소만 사용합니다.', err);
    return false;
  } finally {
    client.release();
  }
}

module.exports = {
  readChatHistory,
  writeChatHistory,
};
