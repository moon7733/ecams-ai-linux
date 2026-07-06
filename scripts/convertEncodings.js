// 워크스페이스 기존 소스를 EUC-KR→UTF-8 로 일괄 변환하는 CLI (기본 dry-run, --apply 로 실제 변환)
const fs = require('fs');
const path = require('path');
const { convertRepoToUtf8 } = require('../encoding');

const ROOT = path.join(__dirname, '..');
const WORKSPACE = path.join(ROOT, 'workspace');
const BACKUP_BASE = 'D:\\99. backup';

const apply = process.argv.includes('--apply');

function main() {
  if (!fs.existsSync(WORKSPACE)) {
    console.error('workspace 폴더가 없습니다:', WORKSPACE);
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = apply ? path.join(BACKUP_BASE, 'encoding-convert-' + ts) : null;

  console.log(apply ? `[APPLY] 변환 + 백업 → ${backupRoot}` : '[DRY-RUN] 변환 예정 목록만 출력 (--apply 로 실제 변환)');
  console.log('대상:', WORKSPACE, '\n');

  const r = convertRepoToUtf8(WORKSPACE, {
    backupRoot,
    relativeTo: WORKSPACE,
    dryRun: !apply,
  });

  for (const f of r.converted) {
    console.log((apply ? '변환됨 ' : '변환예정') + ' : ' + path.relative(WORKSPACE, f));
  }
  console.log('\n──────── 요약 ────────');
  console.log(`${apply ? '변환' : '변환예정'} : ${r.converted.length}개`);
  console.log(`이미 UTF-8 (무변경) : ${r.utf8}개`);
  console.log(`소스 외 스킵 : ${r.skipped}개`);
  console.log(`오류 : ${r.errors.length}개`);
  if (r.errors.length) r.errors.forEach(e => console.log('  ! ' + path.relative(WORKSPACE, e)));
  if (apply && r.converted.length) {
    console.log(`\n백업 위치: ${backupRoot}`);
    console.log('인덱스가 깨진 텍스트로 빌드돼 있을 수 있으므로, 변경된 repo는 관리자 화면에서 재인덱싱하세요.');
  }
}

main();
