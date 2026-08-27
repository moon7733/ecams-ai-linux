<!-- AS-IS 버블 스타일 및 소스 인용 칩, 복사 버튼을 지원하는 메시지 컴포넌트 -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { marked } from 'marked';
import SvgIcon from '@/components/SvgIcon.vue';
import type { ChatMessage } from '@/types';

const props = defineProps<{
  message: ChatMessage;
}>();

const emit = defineEmits<{
  (e: 'selectCandidate', q: string): void;
  (e: 'openSource', filePath: string, line?: number): void;
}>();

const isCopied = ref(false);

marked.setOptions({
  breaks: true,
  gfm: true,
});

const parsedHtml = computed(() => {
  if (!props.message.content) return '';
  let raw = props.message.content;

  // Render markdown
  let html = marked.parse(raw) as string;

  // Replace file citations with clickable pills
  html = html.replace(/<a\s+href="file:\/\/\/([^"#]+)(?:#L(\d+))?"[^>]*>(.*?)<\/a>/gi, (match, path, line, text) => {
    const lineNum = line || '1';
    return `<span class="file-chip clickable" data-path="${path}" data-line="${lineNum}">📄 ${text || path}</span>`;
  });

  return html;
});

function handleContentClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('.file-chip.clickable') as HTMLElement;
  if (target) {
    const path = target.getAttribute('data-path') || '';
    const line = parseInt(target.getAttribute('data-line') || '1', 10);
    emit('openSource', path, line);
  }
}

function handleCopy() {
  if (!props.message.content) return;
  navigator.clipboard.writeText(props.message.content).then(() => {
    isCopied.value = true;
    setTimeout(() => { isCopied.value = false; }, 2000);
  });
}
</script>

<template>
  <div class="message" :class="message.role">
    <div class="avatar" :class="message.role === 'assistant' ? 'ai' : 'user'">
      <SvgIcon v-if="message.role === 'assistant'" name="search" size="14" />
      <span v-else>👤</span>
    </div>

    <div class="bubble">
      <button class="copy-btn" :class="{ copied: isCopied }" @click="handleCopy">
        {{ isCopied ? '복사됨 ✓' : '복사' }}
      </button>

      <div v-if="message.statusText" style="font-size:12px; color:var(--accent); font-weight:600; margin-bottom:6px;">
        {{ message.statusText }}
      </div>

      <div class="message-body" v-html="parsedHtml" @click="handleContentClick"></div>

      <!-- 추천 질문 후보 칩 -->
      <div v-if="message.candidates && message.candidates.length > 0" class="candidates-container">
        <div class="cand-label">💡 추천 질문 / 세부 항목 선택</div>
        <div class="cand-list">
          <button
            v-for="(c, idx) in message.candidates"
            :key="idx"
            type="button"
            class="cand-btn"
            @click="emit('selectCandidate', c.question)"
          >
            {{ c.question }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.candidates-container {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.cand-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text3);
  margin-bottom: 6px;
}
.cand-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cand-btn {
  text-align: left;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.1s ease;
}
.cand-btn:hover {
  background: var(--accent-light);
  border-color: var(--accent-border);
  color: var(--accent);
}
</style>
