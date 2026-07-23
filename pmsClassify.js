#!/usr/bin/env node
/**
 * pmsClassify.js — PMS 인수인계 덤프 분류기 (독립 실행, azbrain RAG 파이프라인과 무관).
 *
 * 표준입력(또는 파일 인자)으로 받은 텍스트를 claude -p(print 모드, 파이프)로 분류해
 * JSON 배열만 표준출력한다. 도구·MCP·repo 컨텍스트 없음(분류엔 불필요).
 *
 * 사용:
 *   node pmsClassify.js < blob.txt
 *   node pmsClassify.js blob.txt
 *   PMS_CLASSIFY_MODEL=claude-sonnet-4-6 node pmsClassify.js < blob.txt   # 모델 교체
 *
 * 성공: stdout = JSON 배열, exit 0.
 * 실패: stderr = 사유(PMSCLASSIFY_ERROR: ...), exit 1. (호출측[PMS]은 실패 시 규칙기반으로 폴백)
 *
 * 주의: 비밀번호·경로 같은 민감정보는 호출측(PMS)이 먼저 걸러서 보내지 않는다.
 *       이 스크립트는 받은 텍스트를 그대로 클라우드(Anthropic)로 보낸다.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');

const MODEL = process.env.PMS_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = Number(process.env.PMS_CLASSIFY_TIMEOUT_MS || 55000);

const INSTRUCTION = [
  '당신은 SI 프로젝트 인수인계 메모 분류기다. 아래 <DUMP>의 각 정보 조각을 분류해 JSON 배열로만 출력한다.',
  '각 원소 형식: {"target","key","title","body","tag"}',
  '- target 은 "info" | "knowledge" | "credential" 중 하나.',
  '- "info": 값이 아래 정형 필드 중 하나에 정확히 해당할 때만. key 는 반드시 다음 중 하나여야 한다:',
  '  "DB","WAS","SCM","SERVER_IP","LOGIN_STEPS". body 는 그 필드의 값만(부연설명 제외). title 은 필드명.',
  '- "credential": 비밀번호 등 민감정보(보통 호출측이 미리 걸러 보내지만 발견되면 이것으로). tag="접속 정보".',
  '- 그 외 운영절차·특이사항·하우툴 등은 "knowledge". key=null, title=짧은 제목, body=내용 전문, tag=짧은 분류어(예: 운영절차, 특이사항).',
  '- 확실치 않으면 "knowledge"로 둔다. 조각을 억지로 쪼개지 말 것.',
  '오직 JSON 배열만 출력. 마크다운 코드펜스(```)·설명 문장 절대 금지.'
].join('\n');

function readInput() {
  const fileArg = process.argv[2];
  if (fileArg) return fs.readFileSync(fileArg, 'utf8');
  return fs.readFileSync(0, 'utf8'); // stdin
}

function extractJsonArray(text) {
  // ```json ... ``` 펜스나 앞뒤 잡담이 있어도 첫 배열을 뽑아낸다.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const m = candidate.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function main() {
  let dump;
  try {
    dump = readInput().trim();
  } catch (e) {
    process.stderr.write(`PMSCLASSIFY_ERROR: input read failed: ${e.message}\n`);
    process.exit(1);
  }
  if (!dump) {
    process.stderr.write('PMSCLASSIFY_ERROR: empty input\n');
    process.exit(1);
  }

  const prompt = `${INSTRUCTION}\n<DUMP>\n${dump}\n</DUMP>`;
  const args = ['-p', '--max-turns', '1', '--model', MODEL, '--dangerously-skip-permissions'];
  // 윈도우는 claude 가 .cmd 라 shell 필요, 리눅스(프로덕션)는 shell 불필요(경고·리스크 회피).
  const useShell = process.platform === 'win32';
  const proc = spawn('claude', args, { shell: useShell, windowsHide: true, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });

  let out = '';
  let err = '';
  const timer = setTimeout(() => {
    try { proc.kill(); } catch {}
    process.stderr.write(`PMSCLASSIFY_ERROR: timeout after ${TIMEOUT_MS}ms\n`);
    process.exit(1);
  }, TIMEOUT_MS);

  proc.stdout.on('data', (d) => { out += d.toString(); });
  proc.stderr.on('data', (d) => { err += d.toString(); });
  proc.on('error', (e) => {
    clearTimeout(timer);
    process.stderr.write(`PMSCLASSIFY_ERROR: spawn failed (claude 설치·인증 확인): ${e.message}\n`);
    process.exit(1);
  });
  proc.on('close', (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      process.stderr.write(`PMSCLASSIFY_ERROR: claude exit ${code}: ${err.slice(0, 300)}\n`);
      process.exit(1);
    }
    const arr = extractJsonArray(out);
    if (!arr || !Array.isArray(arr)) {
      process.stderr.write(`PMSCLASSIFY_ERROR: no JSON array in output. raw head: ${out.slice(0, 300)}\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(arr));
    process.exit(0);
  });

  proc.stdin.write(prompt, 'utf8');
  proc.stdin.end();
}

main();
