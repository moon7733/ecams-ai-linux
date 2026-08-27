<!-- 고급 소스 뷰어 모달 (파일트리, 검색, 인코딩, AI 소스분석 분할창) -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { fetchFileContent, analyzeSourceCode } from '@/api/source';
import { fetchRepos } from '@/api/chat';
import client from '@/api/client';

const props = defineProps<{
  isOpen: boolean;
  filePath?: string;
  targetLine?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'askAboutCode', code: string, filename: string): void;
}>();

const repos = ref<string[]>([]);
const selectedRepo = ref('');
const fileSearch = ref('');
const fileList = ref<string[]>([]);
const currentFile = ref('');
const content = ref('');
const encoding = ref<'utf-8' | 'euc-kr'>('utf-8');
const showLineNums = ref(true);
const decodeUnicode = ref(true);

const loading = ref(false);
const analyzing = ref(false);
const analysisResult = ref('');
const error = ref('');

watch(() => props.isOpen, async (open) => {
  if (open) {
    const data = await fetchRepos();
    repos.value = Object.keys(data.repos || {});
    if (props.filePath) {
      // e.g. "kjbank_html5/WebContent/..."
      const parts = props.filePath.split('/');
      if (repos.value.includes(parts[0])) {
        selectedRepo.value = parts[0];
        currentFile.value = parts.slice(1).join('/');
      } else {
        selectedRepo.value = repos.value[0] || '';
        currentFile.value = props.filePath;
      }
    } else if (repos.value.length > 0 && !selectedRepo.value) {
      selectedRepo.value = repos.value[0];
    }
    await loadFileList();
    if (currentFile.value) {
      await loadFile();
    }
  }
});

async function loadFileList() {
  if (!selectedRepo.value) return;
  try {
    const res = await client.get(`/fs/files?repo=${encodeURIComponent(selectedRepo.value)}`);
    fileList.value = res.data.files || [];
    if (!currentFile.value && fileList.value.length > 0) {
      currentFile.value = fileList.value[0];
      await loadFile();
    }
  } catch {
    fileList.value = [];
  }
}

const filteredFiles = computed(() => {
  const q = fileSearch.value.toLowerCase().trim();
  if (!q) return fileList.value.slice(0, 100);
  return fileList.value.filter(f => f.toLowerCase().includes(q)).slice(0, 100);
});

async function selectFile(f: string) {
  currentFile.value = f;
  await loadFile();
}

async function loadFile() {
  if (!selectedRepo.value || !currentFile.value) return;
  loading.value = true;
  error.value = '';
  try {
    const fullPath = `${selectedRepo.value}/${currentFile.value}`;
    const data = await fetchFileContent(fullPath);
    let raw = data.content || '';
    if (decodeUnicode.value) {
      raw = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    content.value = raw;
  } catch (err: any) {
    error.value = err.response?.data?.error || '파일 내용을 불러오지 못했습니다.';
    content.value = '';
  } finally {
    loading.value = false;
  }
}

async function handleAnalyze() {
  if (!content.value || analyzing.value) return;
  analyzing.value = true;
  try {
    const res = await analyzeSourceCode(content.value, currentFile.value);
    analysisResult.value = res.analysis;
  } catch (err: any) {
    alert(err.response?.data?.error || '소스 분석에 실패했습니다.');
  } finally {
    analyzing.value = false;
  }
}

function handleDownload() {
  if (!content.value) return;
  const blob = new Blob([content.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFile.value.split('/').pop() || 'source.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function handleAsk() {
  emit('askAboutCode', content.value.slice(0, 3000), currentFile.value);
  emit('close');
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-window" @click.stop>
      <!-- 상단 헤더 -->
      <div class="modal-header">
        <div class="header-left">
          <span class="logo-ico">💻</span>
          <h3>소스 뷰어</h3>
        </div>
        <div class="header-right">
          <button class="btn btn-analyze" :disabled="analyzing || !content" @click="handleAnalyze">
            {{ analyzing ? '분석 중...' : '🤖 소스 분석' }}
          </button>
          <button class="btn btn-download" :disabled="!content" @click="handleDownload">⬇ 다운로드</button>
          <button class="btn btn-ask" :disabled="!content" @click="handleAsk">💬 이 코드로 질문</button>
          <button class="btn-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <!-- 메인 콘텐츠 영역 -->
      <div class="modal-body">
        <!-- 좌측 파일 리스트 사이드바 -->
        <div class="file-sidebar">
          <div class="sidebar-top">
            <select v-model="selectedRepo" class="repo-select" @change="loadFileList">
              <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
            </select>
            <input v-model="fileSearch" type="text" placeholder="파일 검색..." class="search-input" />
          </div>
          <div class="file-list">
            <div
              v-for="f in filteredFiles"
              :key="f"
              class="file-item"
              :class="{ active: currentFile === f }"
              @click="selectFile(f)"
            >
              📄 {{ f }}
            </div>
            <div v-if="filteredFiles.length === 0" class="empty-files">파일이 없습니다.</div>
          </div>
        </div>

        <!-- 중앙/우측 코드 뷰어 & 분석창 -->
        <div class="content-area">
          <div class="content-topbar">
            <span class="file-path">📂 {{ selectedRepo }} / {{ currentFile || '파일 선택' }}</span>
            <div class="view-options">
              <label><input v-model="showLineNums" type="checkbox" /> 라인번호</label>
              <label><input v-model="decodeUnicode" type="checkbox" @change="loadFile" /> 유니코드 변환</label>
            </div>
          </div>

          <div class="viewer-split">
            <div class="code-editor" :class="{ 'with-analysis': !!analysisResult }">
              <div v-if="loading" class="state-text">파일을 불러오는 중...</div>
              <div v-else-if="error" class="error-text">{{ error }}</div>
              <pre v-else class="code-pre"><code>{{ content }}</code></pre>
            </div>

            <!-- AI 분석 결과 패널 -->
            <div v-if="analysisResult" class="analysis-pane">
              <div class="analysis-head">
                <strong>🤖 AI 소스 분석 결과</strong>
                <button class="btn-sm" @click="analysisResult = ''">✕</button>
              </div>
              <div class="analysis-content">
                <pre>{{ analysisResult }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
.modal-window { width: 95vw; max-width: 1300px; height: 88vh; background: #ffffff; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.header-left { display: flex; align-items: center; gap: 8px; }
.header-left h3 { margin: 0; font-size: 15px; color: #1e293b; }
.header-right { display: flex; align-items: center; gap: 8px; }
.btn { padding: 6px 12px; border-radius: 6px; font-size: 12.5px; font-weight: 600; cursor: pointer; border: none; }
.btn-analyze { background: #10b981; color: #fff; }
.btn-download { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
.btn-ask { background: #3b82f6; color: #fff; }
.btn-close { background: none; border: none; font-size: 16px; color: #64748b; cursor: pointer; padding: 4px 8px; }
.modal-body { flex: 1; display: flex; overflow: hidden; }
.file-sidebar { width: 280px; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; background: #f8fafc; }
.sidebar-top { padding: 10px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid #e2e8f0; }
.repo-select, .search-input { width: 100%; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; box-sizing: border-box; }
.file-list { flex: 1; overflow-y: auto; padding: 6px; }
.file-item { padding: 6px 8px; font-size: 12px; color: #334155; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-item:hover { background: #e2e8f0; }
.file-item.active { background: #e0f2fe; color: #0284c7; font-weight: 600; }
.empty-files { padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
.content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.content-topbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569; }
.view-options { display: flex; gap: 12px; font-size: 12px; }
.view-options label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.viewer-split { flex: 1; display: flex; overflow: hidden; }
.code-editor { flex: 1; overflow: auto; background: #0f172a; color: #f8fafc; padding: 14px; font-family: 'Fira Code', Consolas, monospace; font-size: 13px; line-height: 1.5; }
.code-editor.with-analysis { flex: 0 0 55%; border-right: 1px solid #e2e8f0; }
.code-pre { margin: 0; }
.analysis-pane { flex: 0 0 45%; display: flex; flex-direction: column; background: #ffffff; }
.analysis-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
.analysis-content { flex: 1; padding: 14px; overflow: auto; font-size: 13px; line-height: 1.6; color: #334155; }
.analysis-content pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
.state-text, .error-text { padding: 40px; text-align: center; font-size: 14px; }
.error-text { color: #ef4444; }
.btn-sm { background: none; border: none; font-size: 14px; cursor: pointer; }
</style>
