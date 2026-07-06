// Web Push 알림 — VAPID 키 lazy 관리 + subscription JSON 영속화 + 답변 완료 통지 (web-push 결정 2~4)
const fs = require('fs');
const path = require('path');
const webPush = require('web-push');

const VAPID_FILE = path.join(__dirname, '.vapid.json');
const SUBS_FILE = path.join(__dirname, 'pushSubscriptions.json');
const SUBJECT = 'mailto:admin@ecams-ai.local';

// .env 에서 VAPID 키를 직접 로드 — server.js 의 .env 로더보다 먼저 require 되므로 자체 로드한다.
// .env 는 git 커밋되어 본사 PC/집 노트북이 같은 키를 공유 → 서버를 옮겨도 구독이 유지됨.
(function loadVapidFromEnvFile() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return;
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
      const m = l.match(/^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=(.+)/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  } catch (e) {}
})();

let vapidKeys = null;
let subscriptions = [];

function loadOrGenerateVapid() {
  if (vapidKeys) return vapidKeys;
  // 환경변수 우선 — 여러 기기(본사 PC/집 노트북)에서 같은 키를 공유해 서버를 옮겨도 구독이 유지되게 함.
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    webPush.setVapidDetails(SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
    return vapidKeys;
  }
  if (fs.existsSync(VAPID_FILE)) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
      webPush.setVapidDetails(SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
      return vapidKeys;
    } catch (e) {
      console.warn('[pushManager] .vapid.json 파싱 실패 — 재생성:', e.message);
    }
  }
  vapidKeys = webPush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
  webPush.setVapidDetails(SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  console.log('[pushManager] VAPID 키 신규 생성 → .vapid.json');
  return vapidKeys;
}

function loadSubscriptions() {
  if (!fs.existsSync(SUBS_FILE)) {
    subscriptions = [];
    return;
  }
  try {
    subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    if (!Array.isArray(subscriptions)) subscriptions = [];
  } catch (e) {
    console.warn('[pushManager] pushSubscriptions.json 파싱 실패 — 초기화:', e.message);
    subscriptions = [];
  }
}

function saveSubscriptions() {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));
  } catch (e) {
    console.error('[pushManager] subscription 저장 실패:', e.message);
  }
}

function getVapidPublicKey() {
  return loadOrGenerateVapid().publicKey;
}

function addSubscription(userId, subscription) {
  const now = Date.now();
  const existing = subscriptions.find(s => s.endpoint === subscription.endpoint);
  if (existing) {
    existing.userId = userId;
    existing.keys = subscription.keys;
    existing.lastSeenAt = now;
  } else {
    subscriptions.push({
      userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      createdAt: now,
      lastSeenAt: now,
    });
  }
  saveSubscriptions();
}

function removeSubscription(endpoint) {
  const before = subscriptions.length;
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
  if (subscriptions.length !== before) saveSubscriptions();
}

function getUserSubscriptions(userId) {
  return subscriptions.filter(s => s.userId === userId);
}

// 답변 완료 통지 — 결정 4 (서버측에서 subscribers.size === 0 인 경우만 호출됨)
// payload: { type: 'job-complete', jobId, chatId, title, body }
async function notifyUser(userId, payload) {
  loadOrGenerateVapid();
  const subs = getUserSubscriptions(userId);
  if (subs.length === 0) return { sent: 0, removed: 0 };
  const json = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webPush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        json,
        { TTL: 60 * 60 } // 1시간 (그 후엔 의미 없음)
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        removeSubscription(s.endpoint);
        removed++;
      } else {
        console.warn('[pushManager] sendNotification 실패 (' + (e.statusCode || '?') + '):', e.body || e.message);
      }
    }
  }));
  return { sent, removed };
}

// 서버 기동 시 한 번
loadOrGenerateVapid();
loadSubscriptions();

module.exports = {
  getVapidPublicKey,
  addSubscription,
  removeSubscription,
  notifyUser,
};
