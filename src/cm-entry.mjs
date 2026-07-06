// CodeMirror 6 소스뷰어 번들 엔트리 — 확장자→언어 매핑 + read-only 뷰 API (window.CMView)
// esbuild 로 IIFE 번들(public/cm.bundle.js)로 빌드. @codemirror/state 싱글톤은 단일 번들이라 보장됨.
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap, codeFolding } from "@codemirror/language";
import { defaultKeymap } from "@codemirror/commands";
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { cpp } from "@codemirror/lang-cpp";
import { xml } from "@codemirror/lang-xml";
import { json } from "@codemirror/lang-json";

// 확장자 → CodeMirror 언어 확장. .pc/.c/.h 는 cpp()(C/C++ Lezer 문법)로 처리.
function langFor(ext) {
  ext = (ext || '').toLowerCase();
  if (['js', 'mjs', 'cjs', 'jsx', 'json'].includes(ext)) return ext === 'json' ? json() : javascript({ jsx: true });
  if (['ts', 'tsx'].includes(ext)) return javascript({ typescript: true, jsx: ext === 'tsx' });
  if (['java', 'jsp'].includes(ext)) return java();
  if (['c', 'h', 'pc', 'cpp', 'cc', 'cxx', 'hpp', 'hxx'].includes(ext)) return cpp();
  if (['html', 'htm'].includes(ext)) return html();
  if (ext === 'xml') return xml();
  if (['css', 'less', 'scss'].includes(ext)) return css();
  if (ext === 'sql') return sql();
  return [];
}

const lnComp = new Compartment();   // 라인번호+폴드거터 토글용
const langComp = new Compartment();
let view = null;

// 라인번호 ON 이면 번호+활성거터+폴드화살표 묶음, OFF 면 거터 없음.
function gutterExt(showLN) {
  return showLN ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : [];
}

function baseExtensions(showLN) {
  return [
    lnComp.of(gutterExt(showLN)),
    highlightSpecialChars(),
    drawSelection(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    codeFolding(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([...defaultKeymap, ...searchKeymap, ...foldKeymap]),
    // editable:false 는 포커스를 막아 Ctrl+F 키맵이 안 걸린다. read-only 는 readOnly 만으로 — 편집은 막되 포커스/검색/선택은 허용.
    EditorState.readOnly.of(true),
    // 모바일: 편집 불가인데 터치 시 가상키보드가 뜨는 불편 제거. inputmode=none 은 포커스/검색/선택은 유지하면서 키보드만 억제.
    EditorView.contentAttributes.of({ inputmode: 'none' }),
    EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: "'DM Mono', monospace", fontSize: '13px' } }),
    oneDark,
  ];
}

// 뷰 생성/교체. parent 안의 이전 뷰는 파기.
function render(parent, doc, ext, showLN) {
  if (view) { view.destroy(); view = null; }
  parent.innerHTML = '';
  const state = EditorState.create({ doc: doc || '', extensions: [langComp.of(langFor(ext)), ...baseExtensions(!!showLN)] });
  view = new EditorView({ state, parent });
  return view;
}

// 라인번호 토글 — 뷰 재생성 없이 Compartment 재구성(스크롤 유지).
function setLineNumbers(showLN) {
  if (view) view.dispatch({ effects: lnComp.reconfigure(gutterExt(!!showLN)) });
}

function openSearch() { if (view) openSearchPanel(view); }

// 특정 라인으로 스크롤 + 선택 (내용검색 결과 클릭 시). 호스트가 보이는 상태에서 호출해야 측정/스크롤이 먹는다.
function gotoLine(n) {
  if (!view || !n) return;
  const ln = Math.max(1, Math.min(n, view.state.doc.lines));
  const line = view.state.doc.line(ln);
  view.dispatch({
    selection: { anchor: line.from, head: line.to },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
  view.focus();
}

// 라인 범위(from~to)로 스크롤 + 선택. AI 답변 칩의 #L155-L172 클릭 시. 선택만으로는 read-only 에서 티가 약해 호출측에서 배경 하이라이트 병행.
function gotoLineRange(from, to) {
  if (!view || !from) return;
  const lastLine = view.state.doc.lines;
  const a = Math.max(1, Math.min(from, lastLine));
  const b = Math.max(a, Math.min(to || from, lastLine));
  const lineA = view.state.doc.line(a);
  const lineB = view.state.doc.line(b);
  view.dispatch({
    selection: { anchor: lineA.from, head: lineB.to },
    effects: EditorView.scrollIntoView(lineA.from, { y: 'center' }),
  });
  view.focus();
}

// 현재 선택된 텍스트 반환 (드래그 영역 질문용). 선택 없으면 빈 문자열.
function getSelection() {
  if (!view) return '';
  const { from, to } = view.state.selection.main;
  return from === to ? '' : view.state.sliceDoc(from, to);
}

export { render, setLineNumbers, openSearch, gotoLine, gotoLineRange, getSelection };

