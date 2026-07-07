// 파일 기반 대화 히스토리를 PostgreSQL로 이전하는 스크립트
const fs = require('fs');
const path = require('path');
const chatHistoryDb = require('../chatHistoryDb');

const CHAT_HISTORY_LIMIT = 50;
const CHAT_HISTORY_DIR = path.join(__dirname, '..', 'logs', 'chat_history');

function normalizeChat(chat, fallbackId) {
  return {
    id: String(chat?.id || fallbackId || Date.now()),
    title: String(chat?.title || '새 대화').slice(0, 200),
    messages: Array.isArray(chat?.messages) ? chat.messages : [],
    updatedAt: Number(chat?.updatedAt) || Date.now(),
    deleted: !!chat?.deleted,
  };
}

function readUserChats(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (Array.isArray(raw) ? raw : [])
    .map(chat => normalizeChat(chat))
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(-CHAT_HISTORY_LIMIT);
}

async function main() {
  if (!fs.existsSync(CHAT_HISTORY_DIR)) {
    console.log('[migrateChatHistory] logs/chat_history 디렉터리가 없습니다.');
    return;
  }

  const files = fs.readdirSync(CHAT_HISTORY_DIR).filter(name => name.endsWith('.json'));
  let migrated = 0;
  for (const name of files) {
    const userId = path.basename(name, '.json');
    const file = path.join(CHAT_HISTORY_DIR, name);
    const chats = readUserChats(file);
    const ok = await chatHistoryDb.writeChatHistory(userId, chats);
    if (!ok) throw new Error('PostgreSQL 저장 실패: ' + userId);
    migrated += 1;
    console.log(`[migrateChatHistory] ${userId}: ${chats.length} chats`);
  }
  console.log(`[migrateChatHistory] 완료: ${migrated} user file(s)`);
}

main().catch(err => {
  console.error('[migrateChatHistory] 실패:', err.message);
  process.exit(1);
});
