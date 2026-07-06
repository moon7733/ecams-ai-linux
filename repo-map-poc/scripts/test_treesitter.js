// tree-sitter Java/JavaScript 파싱 동작 검증 (PoC Week 1 Day 1)
const fs = require('fs');
const Parser = require('tree-sitter');
const Java = require('tree-sitter-java');
const JavaScript = require('tree-sitter-javascript');

console.log('▶ tree-sitter 설치 검증\n');

// Java 파싱
const javaParser = new Parser();
javaParser.setLanguage(Java);
const javaCode = `
package app.eCmm;

public class Cmm0300 {
    public Object confInfo_Updt(HashMap<String,String> etcData) {
        String sql = "DELETE FROM cmm0060 WHERE cm_reqcd=?";
        executeUpdate(sql, etcData.get("ReqCD"));
        return "OK";
    }

    public Object getConfInfo_List(String SysCd, String ReqCd) {
        return queryList("SELECT * FROM cmm0060 WHERE cm_syscd=?", SysCd);
    }
}
`;
const javaTree = javaParser.parse(javaCode);
console.log('Java AST root:', javaTree.rootNode.type);
console.log('Java 함수 추출:');
function walkJava(node, depth = 0) {
  if (node.type === 'method_declaration') {
    const name = node.children.find(c => c.type === 'identifier');
    console.log('  - method:', name?.text, '(line', node.startPosition.row + 1, ')');
  } else if (node.type === 'class_declaration') {
    const name = node.children.find(c => c.type === 'identifier');
    console.log('  - class:', name?.text);
  }
  for (const child of node.children) walkJava(child, depth + 1);
}
walkJava(javaTree.rootNode);

// JavaScript 파싱 (PopApprovalInfo.js 같은 패턴)
const jsParser = new Parser();
jsParser.setLanguage(JavaScript);
const jsCode = `
var approvalGrid = new ax5.ui.grid();

function updateProc() {
    var selItem = approvalGrid.list[0];
    if (selItem.teamcd2 !== '3' && selItem.teamcd2 !== '4') return;
    ajaxAsync('/webPage/ecmr/Cmr6000Servlet', {
        requestType: 'updtConfirm',
        UserId: pUserId,
    }, 'json', successUpdateConfirm);
}

function clickApprovalGrid(index) {
    showModiDiv(selItem.teamcd2);
}
`;
const jsTree = jsParser.parse(jsCode);
console.log('\nJS AST root:', jsTree.rootNode.type);
console.log('JS 함수 추출:');
function walkJs(node) {
  if (node.type === 'function_declaration') {
    const name = node.children.find(c => c.type === 'identifier');
    console.log('  - function:', name?.text, '(line', node.startPosition.row + 1, ')');
  } else if (node.type === 'call_expression') {
    const callee = node.children[0];
    if (callee && callee.text) {
      console.log('  - call:', callee.text.split('\n')[0].slice(0, 60), '(line', node.startPosition.row + 1, ')');
    }
  }
  for (const child of node.children) walkJs(child);
}
walkJs(jsTree.rootNode);

// 실제 eCAMS 파일 파싱 시험
console.log('\n▶ 실제 eCAMS 파일 파싱 시험');
const realFile = 'c:/ecams-ai/workspace/광주은행/kjbank_html5/WebContent/js/ecams/winpop/PopApprovalInfo.js';
if (fs.existsSync(realFile)) {
  const content = fs.readFileSync(realFile, 'utf8');
  console.log('  파일 크기:', content.length, 'chars');
  const t0 = Date.now();
  const tree = jsParser.parse(content);
  console.log('  parsing:', Date.now() - t0, 'ms');

  let funcCount = 0;
  let callCount = 0;
  function count(node) {
    if (node.type === 'function_declaration') funcCount++;
    if (node.type === 'call_expression') callCount++;
    for (const child of node.children) count(child);
  }
  count(tree.rootNode);
  console.log('  추출:', funcCount, 'functions,', callCount, 'calls');
}

console.log('\n✓ tree-sitter 설치 + 파싱 검증 완료');
