const fs = require('fs');

const codeMapPath = 'c:/ecams-ai/wiki/sample_db/CodeMap.json';
if (!fs.existsSync(codeMapPath)) {
    console.log('No CodeMap.json');
    process.exit(0);
}
const codeMap = JSON.parse(fs.readFileSync(codeMapPath, 'utf8'));

// Test prompt
const prompt = `PopApprovalInfo.js에서 reqSta 값과 teamcd2 값을 확인합니다. cr_qrycd도 봅니다.`;

const promptUpper = prompt.toUpperCase();
const extracted = {};

const alwaysInclude = ['REQSTA', 'TEAMCD2', 'CR_QRYCD', 'CR_STATUS'];

for (const col of alwaysInclude) {
    if (codeMap[col]) extracted[col] = codeMap[col];
}

for (const [col, mapping] of Object.entries(codeMap)) {
    if (col.length < 3) continue; // Skip very short column names to prevent false positives
    const regex = new RegExp(`\\b${col}\\b`, 'i');
    if (regex.test(prompt)) {
        extracted[col] = mapping;
    }
}

console.log('Extracted Dictionaries:');
console.log(JSON.stringify(extracted, null, 2));
