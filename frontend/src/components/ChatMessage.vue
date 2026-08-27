<!-- 마크다운 파싱 및 소스 인용 칩, 코드 블록 복사를 지원하는 메시지 컴포넌트 -->
<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import type { ChatMessage } from '@/types';

const props = defineProps<{
  message: ChatMessage;
}>();

const emit = defineEmits<{
  (e: 'selectCandidate', q: string): void;
  (e: 'openSource', filePath: string, line?: number): void;
}>();

// Configure marked with highlight.js
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
  // e.g. [Cmr0250.java](file:///...) or file:///...
  html = html.replace(/<a\s+href="file:\/\/\/([^"#]+)(?:#L(\d+))?"[^>]*>(.*?)<\/a>/gi, (match, path, line, text) => {
    const lineNum = line || '1';
    return `<button type="button" class="source-cite-pill" data-path="${path}" data-line="${lineNum}">📄 ${text || path}</button>`;
  });

  return html;
});

function handleContentClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('.source-cite-pill') as HTMLElement;
  if (target) {
    const path = target.getAttribute('data-path') || '';
    const line = parseInt(target.getAttribute('data-line') || '1', 10);
    emit('openSource', path, line);
  }
}
</script>

<template>
  <div class="message-row" :class="message.role">
    <div class="message-bubble">
      <div v-if="message.role === 'assistant'" class="bot-badge">
        <span class="bot-icon">🌌</span>
        <span class="bot-name">eCAMS AI</span>
        <span v-if="message.statusText" class="status-badge">{{ message.statusText }}</span>
      </div>

      <div class="message-content" v-html="parsedHtml" @click="handleContentClick"></div>

      <!-- 추천 질문 / 후속 질문 후보 칩 -->
      <div v-if="message.candidates && message.candidates.length > 0" class="candidates-box">
        <p class="candidate-label">💡 추천 질문</p>
        <div class="candidate-chips">
          <button
            v-for="(c, idx) in message.candidates"
            :key="idx"
            type="button"
            class="chip-btn"
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
.message-row {
  display: flex;
  margin-bottom: 20px;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 85%;
  padding: 16px 20px;
  border-radius: 12px;
  font-size: 14.5px;
  line-height: 1.65;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.message-row.user .message-bubble {
  background: #3b82f6;
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.message-row.assistant .message-bubble {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #1e293b;
  border-bottom-left-radius: 4px;
  width: 100%;
}

.bot-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  background: #eff6ff;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 6px;
}

.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3) {
  margin: 16px 0 8px 0;
  color: #0f172a;
  font-weight: 700;
}

.message-content :deep(h2) {
  font-size: 16px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 4px;
}

.message-content :deep(h3) {
  font-size: 15px;
}

.message-content :deep(p) {
  margin: 8px 0;
}

.message-content :deep(pre) {
  background: #0f172a;
  color: #f8fafc;
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'Fira Code', Consolas, Monaco, monospace;
  font-size: 13px;
  margin: 12px 0;
}

.message-content :deep(code) {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.92em;
}

.message-row.user .message-content :deep(code) {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.message-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 13.5px;
}

.message-content :deep(th),
.message-content :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 8px 12px;
  text-align: left;
}

.message-content :deep(th) {
  background: #f8fafc;
  font-weight: 600;
}

.message-content :deep(.source-cite-pill) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin: 0 2px;
  vertical-align: middle;
}

.message-content :deep(.source-cite-pill:hover) {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.candidates-box {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}

.candidate-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  margin: 0 0 8px 0;
}

.candidate-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-btn {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip-btn:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #2563eb;
}
</style>
