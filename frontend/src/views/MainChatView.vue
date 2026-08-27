<!-- eCAMS AI 메인 채팅 및 분석 작업 공간 뷰 -->
<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import ChatMessage from '@/components/ChatMessage.vue';
import SourceViewerModal from '@/components/SourceViewerModal.vue';
import client from '@/api/client';
import { saveChatHistory } from '@/api/chat';

const authStore = useAuthStore();
const chatStore = useChatStore();

const inputText = ref('');
const messageContainer = ref<HTMLElement | null>(null);

// Source Viewer Modal State
const isSourceModalOpen = ref(false);
const sourceModalPath = ref('');
const sourceModalLine = ref(1);

onMounted(async () => {
  await authStore.fetchUser();
  await chatStore.loadInitialData();
  if (chatStore.currentMessages.length === 0) {
    chatStore.startNewChat();
  }
  scrollToBottom();
});

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  });
}

function handleOpenSource(filePath: string, line?: number) {
  sourceModalPath.value = filePath;
  sourceModalLine.value = line || 1;
  isSourceModalOpen.value = true;
}

function handleAskAboutCode(codeSnippet: string, filename: string) {
  inputText.value = `파일명: ${filename}\n\`\`\`\n${codeSnippet}\n\`\`\`\n\n위 소스 코드의 핵심 로직과 주의할 점을 분석해줘.`;
}

async function handleSendMessage(customPrompt?: string) {
  const textToSend = customPrompt || inputText.value.trim();
  if (!textToSend || chatStore.isStreaming) return;

  inputText.value = '';

  // 1. Add user message
  chatStore.currentMessages.push({
    role: 'user',
    content: textToSend,
    createdAt: Date.now(),
  });

  // 2. Add empty bot message
  const botMessageIndex = chatStore.currentMessages.length;
  chatStore.currentMessages.push({
    role: 'assistant',
    content: '',
    statusText: '🌌 분석 준비 중...',
    createdAt: Date.now(),
  });

  chatStore.isStreaming = true;
  scrollToBottom();

  try {
    // 3. Post to /api/chat
    const res = await client.post('/chat', {
      message: textToSend,
      repos: chatStore.selectedRepos,
      model: chatStore.selectedModel,
    });

    const data = res.data;
    if (data.answer || data.text) {
      // Sync response
      chatStore.currentMessages[botMessageIndex].content = data.answer || data.text;
      chatStore.currentMessages[botMessageIndex].statusText = '';
      chatStore.currentMessages[botMessageIndex].candidates = data.candidates;
    } else if (data.jobId) {
      // Async SSE / Job Polling
      await pollChatJob(data.jobId, botMessageIndex);
    } else if (data.candidates) {
      chatStore.currentMessages[botMessageIndex].content = '질문 범위를 구체화해 주세요.';
      chatStore.currentMessages[botMessageIndex].candidates = data.candidates;
      chatStore.currentMessages[botMessageIndex].statusText = '';
    }

    // 4. Save chat session
    const title = textToSend.slice(0, 30);
    await saveChatHistory(chatStore.currentChatId, {
      id: chatStore.currentChatId,
      title,
      messages: chatStore.currentMessages,
      meta: {
        company: chatStore.selectedCompany,
        model: chatStore.selectedModel,
      },
      updatedAt: Date.now(),
    });
    await chatStore.loadHistory();
  } catch (err: any) {
    chatStore.currentMessages[botMessageIndex].content = `오류: ${err.response?.data?.error || err.message || '분석 요청에 실패했습니다.'}`;
    chatStore.currentMessages[botMessageIndex].statusText = '';
  } finally {
    chatStore.isStreaming = false;
    scrollToBottom();
  }
}

async function pollChatJob(jobId: string, botIndex: number) {
  chatStore.currentMessages[botIndex].statusText = '⚡ Antigravity 분석 진행 중...';

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await client.get(`/chat/jobs/${jobId}`);
      const job = res.data;

      if (job.status === 'completed') {
        chatStore.currentMessages[botIndex].content = job.finalAnswer || '';
        chatStore.currentMessages[botIndex].statusText = '';
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.finalAnswer || `작업 실패 (${job.status})`);
      }
      chatStore.currentMessages[botIndex].statusText = `⚡ 분석 중 (${i * 2}s)...`;
    } catch (e: any) {
      throw e;
    }
  }
  throw new Error('분석 대기 시간이 초과되었습니다 (3분).');
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}
</script>

<template>
  <div class="workspace-layout">
    <!-- 사이드바: 대화 히스토리 및 설정 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand">
          <span class="logo-icon">🌌</span>
          <strong>eCAMS AI</strong>
        </div>
        <button type="button" class="new-chat-btn" @click="chatStore.startNewChat()">+ 새 대화</button>
      </div>

      <!-- 고객사 선택기 -->
      <div class="company-selector">
        <label>고객사 선택</label>
        <select v-model="chatStore.selectedCompany" @change="chatStore.selectCompany(chatStore.selectedCompany)">
          <option v-for="c in chatStore.companies" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>

      <!-- 대화 히스토리 목록 -->
      <div class="history-list">
        <div
          v-for="s in chatStore.chatHistory"
          :key="s.id"
          class="history-item"
          :class="{ active: chatStore.currentChatId === s.id }"
          @click="chatStore.loadChat(s.id)"
        >
          <span class="chat-title">{{ s.title || '새 대화' }}</span>
          <button type="button" class="del-btn" @click.stop="chatStore.deleteChat(s.id)">✕</button>
        </div>
      </div>

      <!-- 하단 사용자 정보 및 로그아웃 -->
      <div class="sidebar-footer">
        <div class="user-info">
          <span class="user-name">{{ authStore.user?.name || authStore.user?.id || '사용자' }}</span>
          <span v-if="authStore.isAdmin" class="admin-badge">Admin</span>
        </div>
        <button type="button" class="logout-btn" @click="authStore.logout()">로그아웃</button>
      </div>
    </aside>

    <!-- 메인 대화 영역 -->
    <main class="chat-main">
      <!-- 헤더 -->
      <header class="chat-header">
        <div class="header-left">
          <span class="company-chip">
            🏢 {{ chatStore.companies.find(c => c.id === chatStore.selectedCompany)?.name || '고객사' }}
          </span>
          <span class="repo-count-badge">{{ chatStore.selectedRepos.length }}개 저장소 분석</span>
        </div>
        <div class="header-right">
          <select v-model="chatStore.selectedModel" class="model-select">
            <option value="agy">🌌 Antigravity flash 3.7</option>
            <option value="sonnet">⚡ Sonnet</option>
          </select>
        </div>
      </header>

      <!-- 메시지 스크롤 영역 -->
      <div ref="messageContainer" class="messages-container">
        <div v-if="chatStore.currentMessages.length === 0" class="welcome-screen">
          <div class="welcome-badge">🌌</div>
          <h2>형상관리 소스코드 AI 분석</h2>
          <p>궁금한 기능, 버그, 로직 흐름에 대해 자유롭게 질문해 보세요.</p>
        </div>

        <ChatMessage
          v-for="(msg, idx) in chatStore.currentMessages"
          :key="idx"
          :message="msg"
          @select-candidate="handleSendMessage"
          @open-source="handleOpenSource"
        />
      </div>

      <!-- 하단 입력 영역 -->
      <div class="input-area">
        <div class="input-card">
          <textarea
            v-model="inputText"
            rows="2"
            placeholder="질문을 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
            :disabled="chatStore.isStreaming"
            @keydown="handleKeyDown"
          />
          <div class="input-actions">
            <button
              type="button"
              class="send-btn"
              :disabled="!inputText.trim() || chatStore.isStreaming"
              @click="handleSendMessage()"
            >
              {{ chatStore.isStreaming ? '분석 중...' : '전송 ➔' }}
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- 소스 뷰어 모달 -->
    <SourceViewerModal
      :is-open="isSourceModalOpen"
      :file-path="sourceModalPath"
      :target-line="sourceModalLine"
      @close="isSourceModalOpen = false"
      @ask-about-code="handleAskAboutCode"
    />
  </div>
</template>

<style scoped>
.workspace-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #0f172a;
}

.new-chat-btn {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #2563eb;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.company-selector {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.company-selector label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 4px;
}

.company-selector select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  background: #f8fafc;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  transition: all 0.1s;
}

.history-item:hover {
  background: #f1f5f9;
}

.history-item.active {
  background: #e0f2fe;
  color: #0284c7;
  font-weight: 600;
}

.chat-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.del-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  padding: 2px 6px;
}

.history-item:hover .del-btn {
  opacity: 1;
}

.del-btn:hover {
  color: #ef4444;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.admin-badge {
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}

.logout-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.chat-header {
  height: 52px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.company-chip {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.repo-count-badge {
  font-size: 12px;
  color: #64748b;
}

.model-select {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  font-size: 12px;
  background: #f8fafc;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.welcome-screen {
  text-align: center;
  padding: 80px 20px;
}

.welcome-badge {
  font-size: 40px;
  margin-bottom: 12px;
}

.welcome-screen h2 {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.welcome-screen p {
  color: #64748b;
  font-size: 14px;
  margin: 0;
}

.input-area {
  padding: 16px 20px 24px 20px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.input-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.input-card textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 14px;
  color: #1e293b;
  box-sizing: border-box;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.send-btn {
  background: #3b82f6;
  color: #ffffff;
  border: none;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: #2563eb;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
