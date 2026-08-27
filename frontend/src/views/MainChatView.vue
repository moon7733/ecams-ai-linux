<!-- eCAMS AI 메인 채팅 및 분석 작업 공간 뷰 (기존 모든 모달 및 사이드바 기능 통합) -->
<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import ChatMessage from '@/components/ChatMessage.vue';
import SourceViewerModal from '@/components/modals/SourceViewerModal.vue';
import ApprovalModal from '@/components/modals/ApprovalModal.vue';
import UserMgmtModal from '@/components/modals/UserMgmtModal.vue';
import CompanyMgmtModal from '@/components/modals/CompanyMgmtModal.vue';
import IndexMgmtModal from '@/components/modals/IndexMgmtModal.vue';
import GuideUploadModal from '@/components/modals/GuideUploadModal.vue';
import WikiModal from '@/components/modals/WikiModal.vue';
import AuthRequestModal from '@/components/modals/AuthRequestModal.vue';
import RepoMgmtModal from '@/components/modals/RepoMgmtModal.vue';
import client from '@/api/client';
import { saveChatHistory } from '@/api/chat';

const authStore = useAuthStore();
const chatStore = useChatStore();

const inputText = ref('');
const messageContainer = ref<HTMLElement | null>(null);
const imgUploadInput = ref<HTMLInputElement | null>(null);
const repoSearch = ref('');

function triggerImageUpload() {
  imgUploadInput.value?.click();
}
const isFastMode = ref(true);
const isConciseMode = ref(true);
const attachedImages = ref<Array<{ data: string; mime: string; name: string }>>([]);

// Modals State
const showApprovalModal = ref(false);
const showUserMgmtModal = ref(false);
const showCompanyMgmtModal = ref(false);
const showIndexMgmtModal = ref(false);
const showGuideUploadModal = ref(false);
const showWikiModal = ref(false);
const showAuthModal = ref(false);
const showRepoModal = ref(false);
const showSourceModal = ref(false);
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

// Repositories filtering & selection
const regularRepos = computed(() => {
  const q = repoSearch.value.toLowerCase().trim();
  return Object.keys(chatStore.repos).filter((r) => {
    const isDb = r.includes('_db') || chatStore.repoMeta[r]?.type === 'db';
    if (isDb) return false;
    return !q || r.toLowerCase().includes(q);
  });
});

const dbRepos = computed(() => {
  const q = repoSearch.value.toLowerCase().trim();
  return Object.keys(chatStore.repos).filter((r) => {
    const isDb = r.includes('_db') || chatStore.repoMeta[r]?.type === 'db';
    if (!isDb) return false;
    return !q || r.toLowerCase().includes(q);
  });
});

const isAllSelected = computed(() => {
  const all = [...regularRepos.value, ...dbRepos.value];
  return all.length > 0 && all.every((r) => chatStore.selectedRepos.includes(r));
});

function toggleSelectAll() {
  const all = [...regularRepos.value, ...dbRepos.value];
  if (isAllSelected.value) {
    chatStore.selectedRepos = [];
  } else {
    chatStore.selectedRepos = [...all];
  }
}

function toggleRepo(repoId: string) {
  const idx = chatStore.selectedRepos.indexOf(repoId);
  if (idx > -1) {
    chatStore.selectedRepos.splice(idx, 1);
  } else {
    chatStore.selectedRepos.push(repoId);
  }
}

// Image handling
function handleImageAttach(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files) return;
  for (let i = 0; i < target.files.length; i++) {
    const file = target.files[i];
    const reader = new FileReader();
    reader.onload = (re) => {
      const result = re.target?.result as string;
      const base64 = result.split(',')[1];
      attachedImages.value.push({
        data: base64,
        mime: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }
}

function removeImage(idx: number) {
  attachedImages.value.splice(idx, 1);
}

// Source Viewer Open
function handleOpenSource(filePath: string, line?: number) {
  sourceModalPath.value = filePath;
  sourceModalLine.value = line || 1;
  showSourceModal.value = true;
}

function handleAskAboutCode(codeSnippet: string, filename: string) {
  inputText.value = `파일명: ${filename}\n\`\`\`\n${codeSnippet}\n\`\`\`\n\n위 소스 코드의 핵심 로직을 설명해줘.`;
}

// Send Message
async function handleSendMessage(customPrompt?: string) {
  const textToSend = customPrompt || inputText.value.trim();
  if (!textToSend || chatStore.isStreaming) return;

  inputText.value = '';
  const currentImgs = [...attachedImages.value];
  attachedImages.value = [];

  // User message
  chatStore.currentMessages.push({
    role: 'user',
    content: textToSend,
    createdAt: Date.now(),
  });

  // Bot message
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
    const res = await client.post('/chat', {
      message: textToSend,
      repos: chatStore.selectedRepos,
      model: chatStore.selectedModel,
      images: currentImgs,
      fastMode: isFastMode.value,
      concise: isConciseMode.value,
    });

    const data = res.data;
    if (data.answer || data.text) {
      chatStore.currentMessages[botMessageIndex].content = data.answer || data.text;
      chatStore.currentMessages[botMessageIndex].statusText = '';
      chatStore.currentMessages[botMessageIndex].candidates = data.candidates;
    } else if (data.jobId) {
      await pollChatJob(data.jobId, botMessageIndex);
    } else if (data.candidates) {
      chatStore.currentMessages[botMessageIndex].content = '질문 범위를 구체화해 주세요.';
      chatStore.currentMessages[botMessageIndex].candidates = data.candidates;
      chatStore.currentMessages[botMessageIndex].statusText = '';
    }

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
    chatStore.currentMessages[botMessageIndex].content = `오류: ${err.response?.data?.error || err.message || '요청 실패'}`;
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
    <!-- 좌측 메인 사이드바 -->
    <aside class="sidebar">
      <!-- 1. 사이드바 헤더 및 로고 -->
      <div class="sidebar-header">
        <div class="brand">
          <span class="logo-ico">🔍</span>
          <strong>eCAMS AI</strong>
        </div>
        <button class="logout-btn" title="로그아웃" @click="authStore.logout()">🚪</button>
      </div>

      <!-- 2. 상단 액션 버튼들 -->
      <div class="action-btn-group">
        <a href="/" class="btn-switch-classic">🔙 클래식 화면 전환</a>
        <button class="btn-new-chat" @click="chatStore.startNewChat()">📝 새 대화</button>

        <!-- Admin 전용 메뉴 그룹 -->
        <div v-if="authStore.isAdmin" class="admin-menu-group">
          <button class="btn-menu admin" @click="showApprovalModal = true">🛡️ 결재함 (Admin)</button>
          <button class="btn-menu admin" @click="showUserMgmtModal = true">👥 사용자 관리</button>
          <button class="btn-menu admin" @click="showCompanyMgmtModal = true">🏢 고객사 관리</button>
          <button class="btn-menu admin" @click="showIndexMgmtModal = true">🗄️ 인덱스 관리</button>
          <button class="btn-menu admin" @click="showGuideUploadModal = true">📄 가이드 업로드</button>
        </div>

        <!-- 공통 액션 메뉴 -->
        <button class="btn-menu" @click="showSourceModal = true">💻 소스 뷰어</button>
        <button class="btn-menu wiki" @click="showWikiModal = true">📖 LLM Wiki</button>
        <button class="btn-menu" @click="showRepoModal = true">📁 새 레포지토리</button>
        <button class="btn-menu" @click="showAuthModal = true">🔑 권한 신청</button>
      </div>

      <!-- 3. 고객사 선택 드롭다운 -->
      <div class="company-section">
        <label>고객사 선택</label>
        <select v-model="chatStore.selectedCompany" @change="chatStore.selectCompany(chatStore.selectedCompany)">
          <option v-for="c in chatStore.companies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <!-- 4. 내 레포지토리 섹션 (체크박스 및 전체선택) -->
      <div class="repo-section">
        <div class="section-head">
          <span>내 레포지토리</span>
          <label class="select-all-label">
            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" /> 전체선택
          </label>
        </div>
        <input v-model="repoSearch" type="text" placeholder="레포 검색..." class="repo-search-input" />
        
        <div class="repo-list">
          <label v-for="r in regularRepos" :key="r" class="repo-check-item">
            <input
              type="checkbox"
              :checked="chatStore.selectedRepos.includes(r)"
              @change="toggleRepo(r)"
            />
            <span class="repo-name">{{ r }}</span>
          </label>
        </div>

        <!-- 데이터베이스 (DB) 섹션 -->
        <div v-if="dbRepos.length > 0" class="db-section">
          <span class="db-title">📂 데이터베이스 (DB)</span>
          <div class="repo-list">
            <label v-for="r in dbRepos" :key="r" class="repo-check-item">
              <input
                type="checkbox"
                :checked="chatStore.selectedRepos.includes(r)"
                @change="toggleRepo(r)"
              />
              <span class="repo-name">{{ r }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 5. 대화 기록 -->
      <div class="history-section">
        <span class="section-title">대화 기록</span>
        <div class="history-list">
          <div
            v-for="s in chatStore.chatHistory"
            :key="s.id"
            class="history-item"
            :class="{ active: chatStore.currentChatId === s.id }"
            @click="chatStore.loadChat(s.id)"
          >
            <span class="chat-title">{{ s.title || '새 대화' }}</span>
            <button class="btn-del-history" @click.stop="chatStore.deleteChat(s.id)">✕</button>
          </div>
        </div>
      </div>

      <!-- 6. 사이드바 하단 (사용자 프로필) -->
      <div class="sidebar-footer">
        <div class="user-profile">
          <strong>👤 {{ authStore.user?.name || authStore.user?.id || '사용자' }}</strong>
          <span v-if="authStore.isAdmin" class="admin-badge">Admin</span>
        </div>
      </div>
    </aside>

    <!-- 우측 메인 대화 영역 -->
    <main class="chat-main">
      <!-- 상단 헤더 -->
      <header class="main-header">
        <div class="header-left">
          <span class="company-chip">
            🏢 {{ chatStore.companies.find(c => c.id === chatStore.selectedCompany)?.name || '고객사' }}
          </span>
          <span class="repo-count">{{ chatStore.selectedRepos.length }}개 저장소 선택됨</span>
        </div>

        <div class="header-right">
          <label class="toggle-opt"><input v-model="isFastMode" type="checkbox" /> ⚡ 빠른모드</label>
          <label class="toggle-opt"><input v-model="isConciseMode" type="checkbox" /> 📝 간결</label>
          <select v-model="chatStore.selectedModel" class="model-select">
            <option value="agy">🌌 Antigravity flash 3.7</option>
            <option value="sonnet">⚡ Claude Sonnet</option>
          </select>
        </div>
      </header>

      <!-- 메시지 목록 스크롤 -->
      <div ref="messageContainer" class="messages-container">
        <div v-if="chatStore.currentMessages.length === 0" class="welcome-card">
          <div class="welcome-icon">💡</div>
          <h2>eCAMS 코드 분석 AI</h2>
          <p>코드 흐름, DB 조회, 화면 분석 등 무엇이든 한국어로 질문해보세요.</p>
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
      <div class="input-container">
        <!-- 이미지 첨부 미리보기 -->
        <div v-if="attachedImages.length > 0" class="preview-bar">
          <div v-for="(img, idx) in attachedImages" :key="idx" class="preview-chip">
            <span>📷 {{ img.name }}</span>
            <button @click="removeImage(idx)">✕</button>
          </div>
        </div>

        <div class="input-card">
          <textarea
            v-model="inputText"
            rows="2"
            placeholder="코드나 화면에 대해 질문해보세요... (사진 첨부 가능, Enter 전송, Shift+Enter 줄바꿈)"
            :disabled="chatStore.isStreaming"
            @keydown="handleKeyDown"
          />
          <div class="input-footer">
            <input ref="imgUploadInput" type="file" accept="image/*" multiple style="display:none;" @change="handleImageAttach" />
            <button class="btn-attach" title="사진 첨부" @click="triggerImageUpload">📎</button>
            <button
              class="btn-send"
              :disabled="(!inputText.trim() && attachedImages.length === 0) || chatStore.isStreaming"
              @click="handleSendMessage()"
            >
              {{ chatStore.isStreaming ? '분석 중...' : '전송 ➔' }}
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- 모든 모달 컴포넌트 마운트 -->
    <SourceViewerModal
      :is-open="showSourceModal"
      :file-path="sourceModalPath"
      :target-line="sourceModalLine"
      @close="showSourceModal = false"
      @ask-about-code="handleAskAboutCode"
    />
    <ApprovalModal :is-open="showApprovalModal" @close="showApprovalModal = false" />
    <UserMgmtModal :is-open="showUserMgmtModal" @close="showUserMgmtModal = false" />
    <CompanyMgmtModal :is-open="showCompanyMgmtModal" @close="showCompanyMgmtModal = false" />
    <IndexMgmtModal :is-open="showIndexMgmtModal" @close="showIndexMgmtModal = false" />
    <GuideUploadModal :is-open="showGuideUploadModal" @close="showGuideUploadModal = false" />
    <WikiModal :is-open="showWikiModal" @close="showWikiModal = false" />
    <AuthRequestModal :is-open="showAuthModal" @close="showAuthModal = false" />
    <RepoMgmtModal :is-open="showRepoModal" @close="showRepoModal = false" @repo-created="chatStore.loadInitialData" />
  </div>
</template>

<style scoped>
.workspace-layout { display: flex; height: 100vh; width: 100vw; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif; overflow: hidden; }

/* 사이드바 */
.sidebar { width: 280px; background: #ffffff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; height: 100vh; }
.sidebar-header { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 16px; color: #0f172a; }
.logout-btn { background: none; border: none; font-size: 16px; cursor: pointer; }
.action-btn-group { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid #f1f5f9; }
.btn-switch-classic { text-align: center; text-decoration: none; padding: 6px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; font-weight: 700; color: #334155; }
.btn-new-chat { background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; padding: 7px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; text-align: left; }
.admin-menu-group { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-top: 1px dashed #e2e8f0; border-bottom: 1px dashed #e2e8f0; }
.btn-menu { background: #ffffff; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; font-size: 12.5px; text-align: left; cursor: pointer; color: #334155; }
.btn-menu:hover { background: #f8fafc; }
.btn-menu.admin { color: #dc2626; font-weight: 600; }
.btn-menu.wiki { color: #16a34a; font-weight: 600; }

.company-section { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
.company-section label { display: block; font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
.company-section select { width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12.5px; }

.repo-section { padding: 10px 14px; flex: 1; min-height: 0; display: flex; flex-direction: column; border-bottom: 1px solid #f1f5f9; }
.section-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; }
.select-all-label { font-size: 11px; font-weight: 500; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.repo-search-input { padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; margin-bottom: 6px; }
.repo-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.repo-check-item { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #334155; cursor: pointer; padding: 2px 0; }
.repo-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
.db-title { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px; display: block; }

.history-section { height: 160px; padding: 10px 14px; display: flex; flex-direction: column; border-bottom: 1px solid #f1f5f9; }
.section-title { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
.history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.history-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; }
.history-item:hover { background: #f1f5f9; }
.history-item.active { background: #e0f2fe; color: #0284c7; font-weight: 600; }
.chat-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.btn-del-history { background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; padding: 2px; }
.btn-del-history:hover { color: #ef4444; }

.sidebar-footer { padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
.user-profile { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #1e293b; }
.admin-badge { background: #dbeafe; color: #1d4ed8; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; }

/* 메인 채팅 */
.chat-main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.main-header { height: 52px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; }
.header-left { display: flex; align-items: center; gap: 10px; }
.company-chip { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 700; }
.repo-count { font-size: 12px; color: #64748b; }
.header-right { display: flex; align-items: center; gap: 14px; }
.toggle-opt { font-size: 12px; color: #475569; display: flex; align-items: center; gap: 4px; cursor: pointer; }
.model-select { padding: 5px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px; }

.messages-container { flex: 1; overflow-y: auto; padding: 24px; max-width: 960px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.welcome-card { text-align: center; padding: 80px 20px; }
.welcome-icon { font-size: 40px; margin-bottom: 10px; }
.welcome-card h2 { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; }
.welcome-card p { font-size: 14px; color: #64748b; margin: 0; }

.input-container { padding: 14px 20px 20px 20px; max-width: 960px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.preview-bar { display: flex; gap: 6px; margin-bottom: 6px; }
.preview-chip { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 3px 8px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.preview-chip button { background: none; border: none; color: #94a3b8; cursor: pointer; }
.input-card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.04); }
.input-card textarea { width: 100%; border: none; outline: none; resize: none; font-family: inherit; font-size: 14px; color: #1e293b; box-sizing: border-box; }
.input-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.btn-attach { background: none; border: none; font-size: 18px; cursor: pointer; color: #64748b; padding: 4px; }
.btn-send { background: #3b82f6; color: #ffffff; border: none; padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
