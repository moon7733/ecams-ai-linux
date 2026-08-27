<!-- LLM Wiki 열람 및 검색 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
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
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 800px; width: 90vw; height: 85vh; display:flex; flex-direction:column; padding:24px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <h2 style="margin:0;"><SvgIcon name="book" size="20" /> LLM Wiki</h2>
          <select v-model="selectedRepo" style="margin:0; width:160px; padding:4px 8px; font-size:12px;" @change="loadDoc('index.md')">
            <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface2); padding:6px 12px; border-radius:6px; font-size:12px; margin-bottom:12px;">
        <span style="color:var(--text2); font-family:monospace;">📂 {{ selectedRepo }} / {{ currentPath }}</span>
        <button v-if="currentPath !== 'index.md'" style="width:auto; padding:2px 8px; font-size:11px; margin:0; background:var(--accent);" @click="loadDoc('index.md')">🏠 메인</button>
      </div>

      <div id="wikiRender" style="flex:1; overflow-y:auto; padding:8px;" v-html="renderedHtml" @click="handleContentClick"></div>

      <button class="outline" style="margin-top:12px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
