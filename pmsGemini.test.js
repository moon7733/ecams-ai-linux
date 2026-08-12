// pmsGemini의 Gemini 응답 수신부가 청크 경계에서 UTF-8 문자를 깨뜨리지 않는지 검증한다.
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const https = require('node:https');
const { EventEmitter } = require('node:events');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
const { callGemini } = require('./pmsGemini');

// 3바이트 한글과 ASCII를 섞어 경계가 문자 중간에 떨어지도록 만든다.
const KOREAN = '광주은행 형상관리 서버 IP는 192.168.0.21이고, 담당자는 이용문 과장이다. 배포는 SVN 체크아웃 후 진행한다.';
const ENVELOPE = Buffer.from(JSON.stringify({
  candidates: [{ content: { parts: [{ text: KOREAN }] } }]
}), 'utf8');

/** 응답 본문을 주어진 조각들로 흘려보내는 https.request 스텁을 건다. URL은 API 키를 담으므로 쓰지 않는다. */
function stubHttps(parts) {
  https.request = (_url, _opts, cb) => {
    const res = new EventEmitter();
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {};
    req.destroy = () => {};
    cb(res);
    // callGemini가 req.write/end를 부른 뒤에 흘러야 실제 순서와 같다.
    process.nextTick(() => {
      for (const p of parts) res.emit('data', p);
      res.emit('end');
    });
    return req;
  };
}

function splitAt(buf, cut) {
  return [buf.subarray(0, cut), buf.subarray(cut)];
}

const original = https.request;
test.after(() => { https.request = original; });

test('응답을 어느 바이트 경계에서 쪼개도 한글 원문이 유지된다', async () => {
  for (let cut = 1; cut < ENVELOPE.length; cut++) {
    stubHttps(splitAt(ENVELOPE, cut));
    const r = await callGemini([{ text: 'x' }], { model: 'test-model' });
    assert.equal(r.err, undefined, `cut=${cut}에서 오류가 났다`);
    assert.equal(r.text, KOREAN, `cut=${cut}에서 본문이 달라졌다`);
  }
});

test('1바이트씩 흘려보내도 한글 원문이 유지된다', async () => {
  stubHttps(Array.from(ENVELOPE, (b) => Buffer.from([b])));
  const r = await callGemini([{ text: 'x' }], { model: 'test-model' });
  assert.equal(r.text, KOREAN);
});

test('한 덩어리로 오는 응답도 그대로 파싱한다', async () => {
  stubHttps([ENVELOPE]);
  const r = await callGemini([{ text: 'x' }], { model: 'test-model' });
  assert.equal(r.text, KOREAN);
});

test('오류 응답의 메시지는 그대로 전달한다', async () => {
  const err = Buffer.from(JSON.stringify({ error: { message: '할당량이 초과되었습니다' } }), 'utf8');
  stubHttps(splitAt(err, err.length - 2));
  const r = await callGemini([{ text: 'x' }], { model: 'test-model' });
  assert.equal(r.text, undefined);
  assert.equal(r.err, '할당량이 초과되었습니다');
});
