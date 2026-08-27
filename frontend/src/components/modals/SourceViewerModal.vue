<!-- AS-IS 정본 소스 뷰어 모달 (전체화면, 파일트리, 검색, 인코딩, AI 분석 분할창, 모바일 대응) -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
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
const searchKeyword = ref('');
const currentPath = ref('');
const fileItems = ref<Array<{ name: string; isDir: boolean; path: string }>>([]);
const searchResults = ref<Array<{ file: string; line: number; text: string }>>([]);

const currentFilePath = ref('');
const fileContent = ref('');
const encoding = ref<'utf-8' | 'euc-kr'>('utf-8');
const isUnicodeDecode = ref(true);
const isLineNumbers = ref(true);

const isMobileContentVisible = ref(false);
const isAnalyzing = ref(false);
const analysisResult = ref('');
const loading = ref(false);
const error = ref('');

watch(() => props.isOpen, async (open) => {
  if (open) {
    const data = await fetchRepos();
    repos.value = Object.keys(data.repos || {});

    if (props.filePath) {
      const parts = props.filePath.split('/');
      if (repos.value.includes(parts[0])) {
        selectedRepo.value = parts[0];
        const subPath = parts.slice(1).join('/');
        await loadRepo();
        await openFile(subPath);
      } else {
        selectedRepo.value = repos.value[0] || '';
        await loadRepo();
        await openFile(props.filePath);
      }
    } else if (repos.value.length > 0 && !selectedRepo.value) {
      selectedRepo.value = repos.value[0];
      await loadRepo();
    }
  } else {
    analysisResult.value = '';
    isMobileContentVisible.value = false;
  }
});

async function loadRepo() {
  if (!selectedRepo.value) return;
  currentPath.value = '';
  searchKeyword.value = '';
  searchResults.value = [];
  await fetchDirectory('');
}

async function fetchDirectory(dirPath: string) {
  loading.value = true;
  currentPath.value = dirPath;
  try {
    const res = await client.get(`/fs/list?repo=${encodeURIComponent(selectedRepo.value)}&dirPath=${encodeURIComponent(dirPath)}`);
    fileItems.value = res.data.files || [];
  } catch (err: any) {
    fileItems.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleSearch() {
  const q = searchKeyword.value.trim();
  if (!q || !selectedRepo.value) {
    searchResults.value = [];
    return;
  }
  try {
    const res = await client.get(`/fs/search?repo=${encodeURIComponent(selectedRepo.value)}&q=${encodeURIComponent(q)}`);
    searchResults.value = res.data.matches || [];
  } catch {
    searchResults.value = [];
  }
}

async function openFile(path: string) {
  if (!selectedRepo.value || !path) return;
  currentFilePath.value = path;
  isMobileContentVisible.value = true;
  loading.value = true;
  error.value = '';
  try {
    const res = await client.get(`/fs/read?repo=${encodeURIComponent(selectedRepo.value)}&filePath=${encodeURIComponent(path)}&encoding=${encoding.value}`);
    let text = res.data.content || '';
    if (isUnicodeDecode.value) {
      text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
    fileContent.value = text;
  } catch (err: any) {
    error.value = err.response?.data?.error || '파일 내용을 불러오지 못했습니다.';
    fileContent.value = '';
  } finally {
    loading.value = false;
  }
}

function handleBackToList() {
  isMobileContentVisible.value = false;
}

async function analyzeCurrentFile() {
  if (!fileContent.value || isAnalyzing.value) return;
  isAnalyzing.value = true;
  try {
    const filename = currentFilePath.value.split('/').pop() || currentFilePath.value;
    const res = await client.post('/fs/analyze', {
      text: fileContent.value,
      filename,
    });
    analysisResult.value = res.data.analysis;
  } catch (err: any) {
    alert(err.response?.data?.error || '소스 분석에 실패했습니다.');
  } finally {
    isAnalyzing.value = false;
  }
}

function downloadCurrentFile() {
  if (!fileContent.value) return;
  const blob = new Blob([fileContent.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFilePath.value.split('/').pop() || 'download.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function handleAsk() {
  const filename = currentFilePath.value.split('/').pop() || currentFilePath.value;
  emit('askAboutCode', fileContent.value.slice(0, 3000), filename);
  emit('close');
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" style="display:flex;">
    <div class="modal-card sv-modal">
      <!-- 헤더 -->
      <div class="sv-header">
        <h2><SvgIcon name="code" size="18" /> 소스 뷰어</h2>
        <button class="sv-analyze-btn" :disabled="isAnalyzing || !fileContent" @click="analyzeCurrentFile">
          {{ isAnalyzing ? '분석 중...' : '🤖 소스분석' }}
        </button>
        <button class="sv-download-btn" :disabled="!fileContent" @click="downloadCurrentFile">
          <SvgIcon name="download" size="13" /> 소스 다운로드
        </button>
        <button class="sv-close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- 본문 -->
      <div class="sv-body" :class="{ 'show-content': isMobileContentVisible }">
        <!-- 좌측 사이드바: 레포 선택 & 파일트리/검색 -->
        <div class="sv-sidebar">
          <div class="sv-toolbar">
            <select v-model="selectedRepo" @change="loadRepo">
              <option value="">레포지토리 선택...</option>
              <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
            </select>
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="파일·폴더·내용 검색..."
              @input="handleSearch"
            />
          </div>

          <div class="sv-filelist">
            <!-- 검색 결과가 있을 때 -->
            <div v-if="searchKeyword.trim() && searchResults.length > 0">
              <div v-for="(m, idx) in searchResults" :key="idx" class="sv-cline" @click="openFile(m.file)">
                <span class="sv-lno">{{ m.line }}</span>
                <span class="sv-path">{{ m.file }}: {{ m.text }}</span>
              </div>
            </div>

            <!-- 디렉토리 탐색 트리 -->
            <div v-else>
              <div v-if="currentPath" class="sv-item" @click="fetchDirectory(currentPath.split('/').slice(0, -1).join('/'))">
                📁 .. (상위 폴더)
              </div>
              <div
                v-for="item in fileItems"
                :key="item.path"
                class="sv-item"
                :class="{ active: currentFilePath === item.path }"
                @click="item.isDir ? fetchDirectory(item.path) : openFile(item.path)"
              >
                <span>{{ item.isDir ? '📁' : '📄' }}</span>
                <span>{{ item.name }}</span>
              </div>
              <div v-if="fileItems.length === 0" style="padding:16px; text-align:center; color:var(--text3); font-size:12px;">
                파일이 없습니다.
              </div>
            </div>
          </div>
        </div>

        <!-- 우측 소스코드 뷰어 및 AI 분석창 -->
        <div class="sv-content" :class="{ 'sv-split': !!analysisResult }">
          <div class="sv-content-topbar">
            <button class="sv-mobile-back" @click="handleBackToList">
              <SvgIcon name="arrowLeft" size="18" />
            </button>
            <div class="sv-filepath">{{ currentFilePath || '파일을 선택해주세요.' }}</div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
              <button
                v-if="fileContent"
                style="background:var(--accent); color:#fff; border:none; border-radius:4px; font-size:11px; padding:2px 8px; cursor:pointer;"
                @click="handleAsk"
              >
                💬 질문에 첨부
              </button>
              <select v-model="encoding" class="sv-encoding-select" @change="openFile(currentFilePath)">
                <option value="utf-8">UTF-8</option>
                <option value="euc-kr">EUC-KR</option>
              </select>
              <label style="display:flex; align-items:center; gap:4px; font-size:11px; color:#aaa; cursor:pointer;">
                <input v-model="isUnicodeDecode" type="checkbox" @change="openFile(currentFilePath)" /> 유니코드변환
              </label>
            </div>
          </div>

          <!-- 코드 영역 -->
          <div class="sv-cm-host">
            <div v-if="loading" style="padding:20px; color:#aaa;">파일을 읽어오는 중...</div>
            <div v-else-if="error" style="padding:20px; color:#f87171;">{{ error }}</div>
            <pre v-else style="margin:0; padding:12px; font-family:'DM Mono', monospace; font-size:12.5px; line-height:1.5; color:#d4d4d4; overflow:auto; height:100%;"><code>{{ fileContent }}</code></pre>
          </div>

          <!-- AI 분석 분할 패널 -->
          <div v-if="analysisResult" class="sv-analysis-pane">
            <div class="sv-analysis-head">
              <span>🤖 AI 분석 결과</span>
              <button @click="analysisResult = ''">✕</button>
            </div>
            <div class="sv-analysis-body">
              <pre>{{ analysisResult }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Scoped overrides if needed */
</style>
