<!-- eCAMS AI 메인 채팅 뷰 (AS-IS 정본 디자인 1:1 완벽 일치 & 반응형 모바일 지원) -->
<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import SvgIcon from '@/components/SvgIcon.vue';
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
const fileInputRef = ref<HTMLInputElement | null>(null);
const isMobileMenuOpen = ref(false);

const isFastMode = ref(true);
const isConciseMode = ref(true);
const attachedImages = ref<Array<{ data: string; mime: string; name: string; url: string }>>([]);

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

// Theme State
const currentTheme = ref(localStorage.getItem('theme') || 'light');

onMounted(async () => {
  document.documentElement.setAttribute('data-theme', currentTheme.value);
  await authStore.fetchUser();
  await chatStore.loadInitialData();
  if (chatStore.currentMessages.length === 0) {
    chatStore.startNewChat();
  }
  scrollToBottom();
});

function toggleTheme() {
  const next = currentTheme.value === 'dark' ? 'light' : 'dark';
  currentTheme.value = next;
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
}

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  });
}

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false;
}

// Company & Repos Grouping (AS-IS renderRepos 로직)
const companyGroups = computed(() => {
  const companyMap: Record<string, string> = {};
  chatStore.companies.forEach(c => companyMap[c.id] = c.name);
  companyMap['none'] = '고객사 없음';

  const groups: Record<string, { id: string; repos: string[]; name: string }> = {};
  Object.keys(chatStore.repos).forEach(repoId => {
    const info = chatStore.repoMeta[repoId] || { companyId: 'none', type: 'server' };
    const cid = info.companyId || 'none';
    if (!groups[cid]) {
      groups[cid] = { id: cid, repos: [], name: companyMap[cid] || cid };
    }
    groups[cid].repos.push(repoId);
  });

  return Object.values(groups).sort((a, b) => {
    if (a.id === 'none') return 1;
    if (b.id === 'none') return -1;
    return a.name.localeCompare(b.name, 'ko');
  });
});

function isGroupSelected(groupRepos: string[]) {
  return groupRepos.length > 0 && groupRepos.every(r => chatStore.selectedRepos.includes(r));
}

function toggleCompanyGroup(group: { id: string; repos: string[]; name: string }) {
  // AS-IS toggleGroup: 단일 고객사 선택
  chatStore.selectedRepos = [];
  const currentlySelected = isGroupSelected(group.repos);
  if (!currentlySelected) {
    chatStore.selectedRepos = [...group.repos];
    chatStore.selectedCompany = group.id;
  }
}

const currentCompanyName = computed(() => {
  const matched = chatStore.companies.find(c => c.id === chatStore.selectedCompany);
  return matched ? matched.name : (chatStore.selectedCompany ? '선택됨' : '');
});

// Image Attachments
function triggerFileInput() {
  fileInputRef.value?.click();
}

function handleFileChange(e: Event) {
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
        url: result,
      });
    };
    reader.readAsDataURL(file);
  }
}

function removeImage(idx: number) {
  attachedImages.value.splice(idx, 1);
}

// Source Viewer
function handleOpenSource(filePath: string, line?: number) {
  sourceModalPath.value = filePath;
  sourceModalLine.value = line || 1;
  showSourceModal.value = true;
  closeMobileMenu();
}

function handleAskAboutCode(codeSnippet: string, filename: string) {
  inputText.value = `파일명: ${filename}\n\`\`\`\n${codeSnippet}\n\`\`\`\n\n위 소스 코드의 핵심 로직과 처리 흐름을 설명해줘.`;
}

// Send Message
async function handleSendMessage(customPrompt?: string) {
  const textToSend = customPrompt || inputText.value.trim();
  if (!textToSend || chatStore.isStreaming) return;

  inputText.value = '';
  const currentImgs = [...attachedImages.value];
  attachedImages.value = [];

  // 1. User message
  chatStore.currentMessages.push({
    role: 'user',
    content: textToSend,
    createdAt: Date.now(),
  });

  // 2. Bot message placeholder
  const botMessageIndex = chatStore.currentMessages.length;
  chatStore.currentMessages.push({
    role: 'assistant',
    content: '',
    statusText: '분석 준비 중...',
    createdAt: Date.now(),
  });

  chatStore.isStreaming = true;
  scrollToBottom();

  try {
    const res = await client.post('/chat', {
      message: textToSend,
      repos: chatStore.selectedRepos,
      model: chatStore.selectedModel,
      images: currentImgs.map(im => ({ data: im.data, mime: im.mime })),
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
    chatStore.currentMessages[botMessageIndex].content = `오류: ${err.response?.data?.error || err.message || '분석 요청 실패'}`;
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
  <div class="app-layout">
    <!-- 모바일 백드롭 -->
    <div class="mobile-backdrop" :class="{ open: isMobileMenuOpen }" @click="closeMobileMenu"></div>

    <!-- 좌측 사이드바 -->
    <aside class="sidebar" :class="{ 'mobile-open': isMobileMenuOpen }">
      <div class="sidebar-header">
        <div class="logo">
          <div class="logo-icon"><SvgIcon name="search" size="14" /></div>
          eCAMS AI
          <button class="logout-btn" title="로그아웃" @click="authStore.logout()">
            <SvgIcon name="logout" size="14" />
          </button>
        </div>

        <a href="/" class="action-btn" style="color:var(--accent); font-weight:600; margin-bottom:6px;">
          <SvgIcon name="arrowLeft" size="14" /> 클래식 화면 전환
        </a>

        <button class="new-chat-btn" @click="chatStore.startNewChat(); closeMobileMenu();">
          <SvgIcon name="edit" size="15" /> 새 대화
        </button>

        <!-- Admin 메뉴 그룹 -->
        <div v-if="authStore.isAdmin" class="admin-menu">
          <button class="action-btn admin" @click="showApprovalModal = true; closeMobileMenu();">
            <SvgIcon name="shield" size="14" /> 결재함 (Admin)
          </button>
          <button class="action-btn admin" @click="showUserMgmtModal = true; closeMobileMenu();">
            <SvgIcon name="users" size="14" /> 사용자 관리
          </button>
          <button class="action-btn admin" @click="showCompanyMgmtModal = true; closeMobileMenu();">
            <SvgIcon name="building" size="14" /> 고객사 관리
          </button>
          <button class="action-btn admin" @click="showIndexMgmtModal = true; closeMobileMenu();">
            <SvgIcon name="database" size="14" /> 인덱스 관리
          </button>
          <button class="action-btn admin" @click="showGuideUploadModal = true; closeMobileMenu();">
            <SvgIcon name="file" size="14" /> 가이드 업로드
          </button>
        </div>

        <!-- 공통 액션 버튼 -->
        <button class="action-btn" @click="showSourceModal = true; closeMobileMenu();">
          <SvgIcon name="code" size="14" /> 소스 뷰어
        </button>
        <button class="action-btn" style="color: var(--green);" @click="showWikiModal = true; closeMobileMenu();">
          <SvgIcon name="book" size="14" /> LLM Wiki
        </button>
        <button class="action-btn" @click="showRepoModal = true; closeMobileMenu();">
          <SvgIcon name="folderPlus" size="14" /> 새 레포지토리
        </button>
        <button class="action-btn" @click="showAuthModal = true; closeMobileMenu();">
          <SvgIcon name="key" size="14" /> 권한 신청
        </button>
      </div>

      <!-- 내 레포지토리 (고객사별 모듈 그룹핑) -->
      <div class="sidebar-section">
        <div class="section-label">
          내 레포지토리
        </div>
        <div class="repo-list">
          <div v-for="g in companyGroups" :key="g.id" class="repo-group" style="margin-bottom:6px;">
            <label class="repo-group-header" style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
              <input
                type="checkbox"
                :checked="isGroupSelected(g.repos)"
                @change="toggleCompanyGroup(g)"
                style="width:14px; height:14px; cursor:pointer;"
              />
              <span style="font-size:12.5px; font-weight:600; color:var(--text);">{{ g.name }}</span>
              <span style="font-size:11px; color:var(--text3);">({{ g.repos.length }}개 모듈)</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 대화 기록 -->
      <div class="history-section">
        <div class="section-label" style="margin-bottom:8px;">대화 기록</div>
        <div class="history-list">
          <div
            v-for="s in chatStore.chatHistory"
            :key="s.id"
            class="history-item-wrap"
          >
            <div
              class="history-item"
              :class="{ active: chatStore.currentChatId === s.id }"
              @click="chatStore.loadChat(s.id); closeMobileMenu();"
            >
              <span class="chat-title">{{ s.title || '새 대화' }}</span>
              <span class="desktop-del-btn" @click.stop="chatStore.deleteChat(s.id)">✕</span>
            </div>
          </div>
          <div v-if="chatStore.chatHistory.length === 0" style="font-size:12px;color:var(--text3);text-align:center;padding:16px 0;">
            대화 기록이 없습니다
          </div>
        </div>
      </div>

      <!-- 사이드바 푸터: 테마 및 알림 -->
      <div class="sidebar-footer" style="padding:10px 12px; border-top:1px solid var(--border); margin-top:auto; display:flex; gap:8px;">
        <button
          type="button"
          style="flex:1; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); font-size:12px; cursor:pointer; text-align:left; display:flex; align-items:center; gap:6px;"
        >
          <SvgIcon name="bell" size="14" /> 알림 켜기
        </button>
        <button
          type="button"
          title="라이트/다크 전환"
          style="width:38px; flex-shrink:0; padding:8px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center;"
          @click="toggleTheme"
        >
          <SvgIcon :name="currentTheme === 'dark' ? 'sun' : 'moon'" size="15" />
        </button>
      </div>
    </aside>

    <!-- 우측 메인 영역 -->
    <main class="main">
      <div class="main-header">
        <button class="mobile-menu-btn" @click="toggleMobileMenu">☰</button>
        <span class="header-title">
          {{ chatStore.chatHistory.find(c => c.id === chatStore.currentChatId)?.title || '새 대화' }}
        </span>
        <div class="header-badges" style="display:flex; align-items:center; gap:10px;">
          <span v-if="currentCompanyName" class="badge">🏢 {{ currentCompanyName }}</span>
          <label style="font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text2);">
            <input v-model="isFastMode" type="checkbox" /> ⚡ 빠른모드
          </label>
          <label style="font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text2);">
            <input v-model="isConciseMode" type="checkbox" /> 📝 간결
          </label>
          <select v-model="chatStore.selectedModel" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface); font-size:12px; color:var(--text);">
            <option value="agy">🌌 Antigravity flash 3.7</option>
            <option value="sonnet">⚡ Claude Sonnet</option>
          </select>
        </div>
      </div>

      <!-- 채팅 대화 영역 -->
      <div ref="messageContainer" class="chat-area">
        <div v-if="chatStore.currentMessages.length === 0" class="empty-state">
          <div class="empty-icon"><SvgIcon name="lightbulb" size="26" /></div>
          <div class="empty-title">eCAMS 코드 분석 AI</div>
          <div class="empty-desc">
            코드 흐름, DB 조회, 화면 분석 등<br>무엇이든 한국어로 질문해보세요
          </div>
        </div>

        <ChatMessage
          v-for="(msg, idx) in chatStore.currentMessages"
          :key="idx"
          :message="msg"
          @select-candidate="handleSendMessage"
          @open-source="handleOpenSource"
        />
      </div>

      <!-- 입력창 -->
      <div class="input-area">
        <div class="input-box">
          <div class="input-top">
            <!-- 이미지 미리보기 -->
            <div v-if="attachedImages.length > 0" class="image-preview" style="display:flex;">
              <div v-for="(img, idx) in attachedImages" :key="idx" class="preview-thumb">
                <img :src="img.url" alt="미리보기" />
                <button class="remove-img" @click="removeImage(idx)">×</button>
              </div>
            </div>

            <textarea
              v-model="inputText"
              id="msgInput"
              placeholder="코드나 화면에 대해 질문해보세요... (사진 첨부 가능)"
              rows="1"
              :disabled="chatStore.isStreaming"
              @keydown="handleKeyDown"
            ></textarea>
          </div>

          <div class="input-bottom">
            <input
              ref="fileInputRef"
              type="file"
              id="fileInput"
              accept="image/*"
              multiple
              style="display:none;"
              @change="handleFileChange"
            />
            <button class="icon-btn" :class="{ 'has-image': attachedImages.length > 0 }" title="사진 첨부" @click="triggerFileInput">
              <SvgIcon name="paperclip" size="18" />
            </button>

            <button
              class="send-btn"
              :disabled="(!inputText.trim() && attachedImages.length === 0) || chatStore.isStreaming"
              title="전송"
              @click="handleSendMessage()"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
        <div class="input-hint">Enter로 전송 · Shift+Enter 줄바꿈 · 사진 첨부 가능</div>
      </div>
    </main>

    <!-- 모든 모달들 -->
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
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
}
</style>
