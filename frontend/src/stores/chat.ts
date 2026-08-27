// 대화 세션, 메시지 스트리밍, 저장소 선택 상태를 관리하는 Pinia Store
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Company, ChatSession, ChatMessage, ReposResponse } from '@/types';
import { fetchCompanies, fetchRepos, fetchChatHistory, saveChatHistory, deleteChatHistory } from '@/api/chat';

export const useChatStore = defineStore('chat', () => {
  const companies = ref<Company[]>([]);
  const repos = ref<Record<string, string>>({});
  const repoMeta = ref<Record<string, any>>({});
  const selectedRepos = ref<string[]>([]);
  const selectedCompany = ref<string>('');

  const chatHistory = ref<ChatSession[]>([]);
  const currentChatId = ref<string>('');
  const currentMessages = ref<ChatMessage[]>([]);
  const streamingText = ref<string>('');
  const statusMessage = ref<string>('');
  const isStreaming = ref<boolean>(false);
  const selectedModel = ref<string>('agy'); // 'agy' | 'sonnet' | 'haiku' | 'codex'

  async function loadInitialData(): Promise<void> {
    try {
      const [compRes, repoRes] = await Promise.all([fetchCompanies(), fetchRepos()]);
      companies.value = compRes.companies || [];
      repos.value = repoRes.repos || {};
      repoMeta.value = repoRes.repoMeta || {};

      // 기본 고객사/레포 선택
      if (companies.value.length > 0 && !selectedCompany.value) {
        selectedCompany.value = companies.value[0].id;
      }
      autoSelectReposForCompany();
      await loadHistory();
    } catch (err) {
      console.error('[ChatStore] Init failed:', err);
    }
  }

  function selectCompany(companyId: string): void {
    selectedCompany.value = companyId;
    autoSelectReposForCompany();
  }

  function autoSelectReposForCompany(): void {
    if (!selectedCompany.value) return;
    const matched = Object.keys(repos.value).filter(
      (r) => repoMeta.value[r]?.companyId === selectedCompany.value
    );
    selectedRepos.value = matched.length > 0 ? matched : Object.keys(repos.value).slice(0, 1);
  }

  async function loadHistory(): Promise<void> {
    try {
      const res = await fetchChatHistory();
      chatHistory.value = (res.chats || []).filter((c) => !c.deleted);
    } catch (err) {
      console.error('[ChatStore] Load history failed:', err);
    }
  }

  function startNewChat(): void {
    currentChatId.value = `chat_${Date.now()}`;
    currentMessages.value = [];
    streamingText.value = '';
    statusMessage.value = '';
    isStreaming.value = false;
  }

  function loadChat(chatId: string): void {
    const session = chatHistory.value.find((c) => c.id === chatId);
    if (session) {
      currentChatId.value = session.id;
      currentMessages.value = JSON.parse(JSON.stringify(session.messages || []));
      if (session.meta?.company) selectedCompany.value = session.meta.company;
      if (session.meta?.model) selectedModel.value = session.meta.model;
    }
  }

  async function deleteChat(chatId: string): Promise<void> {
    chatHistory.value = chatHistory.value.filter((c) => c.id !== chatId);
    if (currentChatId.value === chatId) {
      startNewChat();
    }
    try {
      await deleteChatHistory(chatId);
    } catch (err) {
      console.error('[ChatStore] Delete chat failed:', err);
    }
  }

  return {
    companies,
    repos,
    repoMeta,
    selectedRepos,
    selectedCompany,
    chatHistory,
    currentChatId,
    currentMessages,
    streamingText,
    statusMessage,
    isStreaming,
    selectedModel,
    loadInitialData,
    selectCompany,
    loadHistory,
    startNewChat,
    loadChat,
    deleteChat,
  };
});
