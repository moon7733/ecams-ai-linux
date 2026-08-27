<!-- 소스 코드 뷰어 및 AGY 소스 분석 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchFileContent, analyzeSourceCode } from '@/api/source';

const props = defineProps<{
  isOpen: boolean;
  filePath: string;
  targetLine?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'askAboutCode', code: string, filename: string): void;
}>();

const content = ref('');
const loading = ref(false);
const analyzing = ref(false);
const analysisResult = ref('');
const error = ref('');

watch(
  () => props.isOpen,
  async (open) => {
    if (open && props.filePath) {
      loadFile();
    } else {
      analysisResult.value = '';
      error.value = '';
    }
  }
);

async function loadFile() {
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchFileContent(props.filePath);
    content.value = data.content || '';
  } catch (err: any) {
    error.value = err.response?.data?.error || '파일 내용을 불러오지 못했습니다.';
  } finally {
    loading.value = false;
  }
}

async function handleAnalyze() {
  if (!content.value || analyzing.value) return;
  analyzing.value = true;
  error.value = '';
  try {
    const filename = props.filePath.split('/').pop() || props.filePath;
    const res = await analyzeSourceCode(content.value, filename);
    analysisResult.value = res.analysis;
  } catch (err: any) {
    error.value = err.response?.data?.error || '소스 코드 분석에 실패했습니다.';
  } finally {
    analyzing.value = false;
  }
}

function handleAsk() {
  const filename = props.filePath.split('/').pop() || props.filePath;
  emit('askAboutCode', content.value.slice(0, 3000), filename);
  emit('close');
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-window" @click.stop>
      <div class="modal-header">
        <div class="title-area">
          <span class="file-icon">📄</span>
          <h3>{{ filePath }}</h3>
        </div>
        <div class="header-actions">
          <button type="button" class="btn secondary" :disabled="analyzing" @click="handleAnalyze">
            {{ analyzing ? 'AGY 분석 중...' : '⚡ 소스 분석' }}
          </button>
          <button type="button" class="btn primary" @click="handleAsk">
            💬 이 코드로 질문
          </button>
          <button type="button" class="btn-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading-state">파일을 읽어오는 중...</div>
        <div v-else-if="error" class="error-state">{{ error }}</div>
        
        <div v-else class="content-split">
          <div class="code-container" :class="{ 'with-analysis': !!analysisResult }">
            <pre><code>{{ content }}</code></pre>
          </div>

          <div v-if="analysisResult" class="analysis-panel">
            <div class="analysis-header">
              <h4>🌌 AI 소스 분석 결과</h4>
              <button type="button" class="btn-sm" @click="analysisResult = ''">닫기</button>
            </div>
            <div class="analysis-body">
              <pre>{{ analysisResult }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal-window {
  width: 90vw;
  max-width: 1200px;
  height: 85vh;
  background: #ffffff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.title-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-area h3 {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.btn.primary {
  background: #3b82f6;
  color: #ffffff;
}

.btn.primary:hover {
  background: #2563eb;
}

.btn.secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn.secondary:hover {
  background: #e2e8f0;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 16px;
  color: #64748b;
  cursor: pointer;
  padding: 4px 8px;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content-split {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}

.code-container {
  flex: 1;
  overflow: auto;
  background: #0f172a;
  color: #f8fafc;
  padding: 16px;
  font-family: 'Fira Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}

.code-container.with-analysis {
  flex: 0 0 55%;
  border-right: 1px solid #e2e8f0;
}

.analysis-panel {
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.analysis-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.analysis-body {
  flex: 1;
  padding: 14px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
}

.analysis-body pre {
  white-space: pre-wrap;
  font-family: inherit;
  margin: 0;
}

.loading-state,
.error-state {
  padding: 40px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}

.error-state {
  color: #ef4444;
}
</style>
