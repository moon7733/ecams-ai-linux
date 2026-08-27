<!-- LLM Wiki 열람 및 검색 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { fetchWikiDoc } from '@/api/admin';
import { fetchRepos } from '@/api/chat';
import { marked } from 'marked';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const repos = ref<string[]>([]);
const selectedRepo = ref('');
const currentPath = ref('index.md');
const content = ref('');
const loading = ref(false);

watch(() => props.isOpen, async (open) => {
  if (open) {
    const data = await fetchRepos();
    repos.value = Object.keys(data.repos || {});
    if (repos.value.length > 0 && !selectedRepo.value) {
      selectedRepo.value = repos.value[0];
    }
    await loadDoc();
  }
});

async function loadDoc(path = 'index.md') {
  if (!selectedRepo.value) return;
  loading.value = true;
  currentPath.value = path;
  try {
    const data = await fetchWikiDoc(selectedRepo.value, path);
    content.value = data.content || '# 문서가 존재하지 않습니다.';
  } catch (err: any) {
    content.value = `# 위키 문서를 불러오지 못했습니다.\n\n${err.response?.data?.error || err.message}`;
  } finally {
    loading.value = false;
  }
}

const renderedHtml = computed(() => {
  return marked.parse(content.value || '') as string;
});

function handleContentClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('a') as HTMLAnchorElement;
  if (target && target.getAttribute('href')) {
    const href = target.getAttribute('href')!;
    if (href.endsWith('.md') && !href.startsWith('http')) {
      e.preventDefault();
      loadDoc(href);
    }
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-left">
          <h3>📖 LLM Wiki</h3>
          <select v-model="selectedRepo" class="repo-select" @change="loadDoc('index.md')">
            <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="breadcrumb-bar">
        <span>📂 {{ selectedRepo }} / {{ currentPath }}</span>
        <button v-if="currentPath !== 'index.md'" class="btn-home" @click="loadDoc('index.md')">🏠 메인으로</button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="state-msg">위키 문서를 읽어오는 중...</div>
        <div v-else class="markdown-body" v-html="renderedHtml" @click="handleContentClick"></div>
      </div>

      <div class="modal-foot">
        <button class="btn-close" @click="emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal-card { width: 90%; max-width: 800px; height: 85vh; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #e2e8f0; }
.head-left { display: flex; align-items: center; gap: 12px; }
.head-left h3 { margin: 0; font-size: 16px; color: #1e293b; }
.repo-select { padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.breadcrumb-bar { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 8px 20px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
.btn-home { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }
.modal-body { flex: 1; padding: 20px; overflow-y: auto; }
.state-msg { text-align: center; color: #64748b; padding: 40px; }
.markdown-body :deep(h1) { font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.markdown-body :deep(h2) { font-size: 15px; margin-top: 16px; }
.markdown-body :deep(p) { line-height: 1.6; font-size: 13.5px; color: #334155; }
.markdown-body :deep(a) { color: #2563eb; text-decoration: underline; cursor: pointer; }
.markdown-body :deep(code) { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
.markdown-body :deep(pre) { background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px; overflow-x: auto; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
