const fs = require('fs');
const path = require('path');

const SRC = 'D:\\03.source\\05. DB\\engine\\DB';
const DEST = 'C:\\ecams-ai\\workspace\\sample_db';

// 폴더 생성
['procedures', 'functions', 'triggers', 'tables'].forEach(d => {
  fs.mkdirSync(path.join(DEST, d), { recursive: true });
});

// CREATE OR REPLACE 기준으로 개별 파일 분할
function splitAndSave(filePath, destFolder, keyword) {
  const content = fs.readFileSync(filePath, 'utf8');
  // 이름 추출 패턴: CREATE OR REPLACE PROCEDURE/FUNCTION/TRIGGER [schema.]"NAME" 또는 NAME
  const namePattern = new RegExp(
    `CREATE OR REPLACE ${keyword}\\s+(?:"?\\w+"?\\s*\\.\\s*)?["]?(\\w+)["]?`,
    'i'
  );

  // CREATE OR REPLACE KEYWORD 위치 기준으로 분할
  const splitPattern = new RegExp(`(?=CREATE OR REPLACE ${keyword}\\s)`, 'gi');
  const blocks = content.split(splitPattern).filter(b => b.trim().length > 0);

  let saved = 0;
  for (const block of blocks) {
    const match = block.match(namePattern);
    if (!match) continue;
    const name = match[1].toUpperCase();
    const outPath = path.join(DEST, destFolder, `${name}.sql`);
    fs.writeFileSync(outPath, block.trimEnd() + '\n', 'utf8');
    saved++;
  }
  console.log(`  [${keyword}] ${blocks.length}개 블록 → ${saved}개 파일 저장`);
}

console.log('=== sample_db 분할 시작 ===\n');

// 프로시저 분할
console.log('1. procedure.sql 분할 중...');
splitAndSave(path.join(SRC, 'procedure.sql'), 'procedures', 'PROCEDURE');

// 함수 분할
console.log('2. function.sql 분할 중...');
splitAndSave(path.join(SRC, 'function.sql'), 'functions', 'FUNCTION');

// 트리거 분할
console.log('3. tiggers.sql 분할 중...');
splitAndSave(path.join(SRC, 'tiggers.sql'), 'triggers', 'TRIGGER');

// 테이블 분할
console.log('4. table.sql 분할 중...');
{
  const content = fs.readFileSync(path.join(SRC, 'table.sql'), 'utf8');
  const blocks = content.split(/(?=(?:-- ECAMS\.\w+ definition\n\n)?CREATE TABLE)/i).filter(b => b.trim().length > 0);
  let saved = 0;
  for (const block of blocks) {
    const match = block.match(/CREATE TABLE\s+(?:"?\w+"?\s*\.\s*)?"?(\w+)"?/i);
    if (!match) continue;
    const name = match[1].toUpperCase();
    fs.writeFileSync(path.join(DEST, 'tables', `${name}.sql`), block.trimEnd() + '\n', 'utf8');
    saved++;
  }
  console.log(`  [TABLE] ${saved}개 파일 저장`);
}

// package.sql 루트에 복사
if (fs.existsSync(path.join(SRC, 'package.sql'))) {
  fs.copyFileSync(path.join(SRC, 'package.sql'), path.join(DEST, 'package.sql'));
  console.log('5. package.sql 복사 완료');
}

// AI_Schema_Summary.md 복사
console.log('6. AI_Schema_Summary.md 복사...');
fs.copyFileSync(path.join(SRC, 'AI_Schema_Summary.md'), path.join(DEST, 'AI_Schema_Summary.md'));

// data/ 폴더 복사
console.log('7. data/ 폴더 복사...');
const dataSrc = path.join(SRC, 'data');
const dataDest = path.join(DEST, 'data');
if (fs.existsSync(dataSrc)) {
  fs.mkdirSync(dataDest, { recursive: true });
  let dataCount = 0;
  for (const file of fs.readdirSync(dataSrc)) {
    fs.copyFileSync(path.join(dataSrc, file), path.join(dataDest, file));
    dataCount++;
  }
  console.log(`  [DATA] ${dataCount}개 파일 복사`);
}

// 결과 요약
console.log('\n=== 완료 ===');
const summary = {
  procedures: fs.readdirSync(path.join(DEST, 'procedures')).length,
  functions: fs.readdirSync(path.join(DEST, 'functions')).length,
  triggers: fs.readdirSync(path.join(DEST, 'triggers')).length,
};
console.log(`procedures/ : ${summary.procedures}개`);
console.log(`functions/  : ${summary.functions}개`);
console.log(`triggers/   : ${summary.triggers}개`);
console.log(`tables/     : schema.sql`);
console.log(`\n최종 경로: ${DEST}`);
