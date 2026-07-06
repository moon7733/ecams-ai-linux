const fs = require('fs');
const path = require('path');
const { decodeBuffer } = require('./encoding');

/**
 * 디렉토리 내의 모든 SQL 파일을 찾아 분할 저장하고 AI 요약본(MD)을 생성합니다.
 * @param {string} repoPath 레포지토리 루트 경로
 */
async function generateSqlSummary(repoPath) {
    try {
        const tables = {};
        const sqlFiles = findSqlFiles(repoPath);
        if (sqlFiles.length === 0) return null;

        console.log(`[SqlParser] Processing ${sqlFiles.length} files in ${repoPath}`);

        for (const filePath of sqlFiles) {
            const fileName = path.basename(filePath).toLowerCase();
            // 인코딩 감지는 공용 encoding.js 로 위임 (UTF-8/EUC-KR 자동)
            const content = decodeBuffer(fs.readFileSync(filePath));

            // 1. 요약본을 위한 테이블 파싱
            parseSqlForSummary(content, tables);

            // 2. 파일 분할 처리 (bulk 파일인 경우)
            if (fileName === 'procedure.sql' || fileName === 'procedures.sql') {
                splitAndSave(content, repoPath, 'procedures', 'PROCEDURE');
            } else if (fileName === 'function.sql' || fileName === 'functions.sql') {
                splitAndSave(content, repoPath, 'functions', 'FUNCTION');
            } else if (fileName === 'trigger.sql' || fileName === 'triggers.sql' || fileName === 'tiggers.sql') {
                splitAndSave(content, repoPath, 'triggers', 'TRIGGER');
            } else if (fileName === 'view.sql' || fileName === 'views.sql') {
                splitAndSave(content, repoPath, 'views', 'VIEW');
            } else if (fileName === 'table.sql' || fileName === 'tables.sql') {
                splitTables(content, repoPath);
            }
        }

        // 3. 요약 마크다운 생성
        const tableNames = Object.keys(tables).sort();
        if (tableNames.length > 0) {
            let md = '# eCAMS Database Schema Summary (AI Optimized)\n\n';
            md += '> 이 파일은 AI 분석 효율을 위해 원본 SQL에서 추출한 요약본입니다.\n\n';

            for (const tbName of tableNames) {
                const tb = tables[tbName];
                if (Object.keys(tb.columns).length === 0 && !tb.comment) continue;
                
                md += `## Table: ${tbName} ${tb.comment ? `(${tb.comment})` : ''}\n`;
                md += '| Column | Comment |\n';
                md += '|---|---|\n';
                for (const colName in tb.columns) {
                    md += `| ${colName} | ${tb.columns[colName] || ''} |\n`;
                }
                md += '\n';
            }
            const outputPath = path.join(repoPath, 'AI_Schema_Summary.md');
            fs.writeFileSync(outputPath, md, 'utf8');
            console.log(`[SqlParser] Summary Generated: ${outputPath}`);
        }

        return true;
    } catch (err) {
        console.error('[SqlParser] Error:', err.message);
        return null;
    }
}

function findSqlFiles(dir, files = []) {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
        const res = path.resolve(dir, item.name);
        if (item.isDirectory()) {
            if (['procedures', 'functions', 'triggers', 'tables', 'data'].includes(item.name.toLowerCase())) continue; // 이미 쪼개진 폴더는 패스
            findSqlFiles(res, files);
        } else if (item.name.toLowerCase().endsWith('.sql')) {
            files.push(res);
        }
    }
    return files;
}

function splitAndSave(content, repoPath, destFolder, keyword) {
    const targetDir = path.join(repoPath, destFolder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const namePattern = new RegExp(
        `CREATE OR REPLACE ${keyword}\\s+(?:"?\\w+"?\\s*\\.\\s*)?["]?(\\w+)["]?`,
        'i'
    );
    const splitPattern = new RegExp(`(?=CREATE OR REPLACE ${keyword}\\s)`, 'gi');
    const blocks = content.split(splitPattern).filter(b => b.trim().length > 0);

    let saved = 0;
    for (const block of blocks) {
        const match = block.match(namePattern);
        if (!match) continue;
        const name = match[1].toUpperCase();
        fs.writeFileSync(path.join(targetDir, `${name}.sql`), block.trimEnd() + '\n', 'utf8');
        saved++;
    }
    console.log(`[SqlParser] Split ${keyword}: ${saved} files`);
}

function splitTables(content, repoPath) {
    const targetDir = path.join(repoPath, 'tables');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // -- ECAMS.NAME definition 또는 CREATE TABLE 기준으로 분할
    const blocks = content.split(/(?=(?:--\s*\w+\.\w+\s+definition\n\n)?CREATE\s+TABLE)/i).filter(b => b.trim().length > 0);
    let saved = 0;
    for (const block of blocks) {
        const match = block.match(/CREATE\s+TABLE\s+(?:"?\w+"?\s*\.\s*)?"?(\w+)"?/i);
        if (!match) continue;
        const name = match[1].toUpperCase();
        fs.writeFileSync(path.join(targetDir, `${name}.sql`), block.trimEnd() + '\n', 'utf8');
        saved++;
    }
    console.log(`[SqlParser] Split TABLE: ${saved} files`);
}

function parseSqlForSummary(sqlContent, tables) {
    const lines = sqlContent.split('\n');
    let currentTable = null;

    for (const line of lines) {
        const trimmed = line.trim();
        const createMatch = trimmed.match(/CREATE\s+TABLE\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)/i);
        if (createMatch) {
            currentTable = createMatch[1].toUpperCase();
            if (!tables[currentTable]) tables[currentTable] = { columns: {}, comment: '' };
            continue;
        }
        const tableCommentMatch = trimmed.match(/COMMENT\s+ON\s+TABLE\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)\s+IS\s+'(.*?)'/i);
        if (tableCommentMatch) {
            const tbName = tableCommentMatch[1].toUpperCase();
            if (!tables[tbName]) tables[tbName] = { columns: {}, comment: '' };
            tables[tbName].comment = tableCommentMatch[2];
            continue;
        }
        const colCommentMatch = trimmed.match(/COMMENT\s+ON\s+COLUMN\s+(?:[A-Z0-9_]+\.)?([A-Z0-9_]+)\.([A-Z0-9_]+)\s+IS\s+'(.*?)'/i);
        if (colCommentMatch) {
            const tbName = colCommentMatch[1].toUpperCase();
            const colName = colCommentMatch[2].toUpperCase();
            if (!tables[tbName]) tables[tbName] = { columns: {}, comment: '' };
            tables[tbName].columns[colName] = colCommentMatch[3];
        }
    }
}

module.exports = { generateSqlSummary };
