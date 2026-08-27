// 대화, 레포지토리, 고객사 데이터 통신 API 모듈
import client from './client';
import type { Company, ReposResponse, ChatSession } from '@/types';

export async function fetchCompanies(): Promise<{ companies: Company[] }> {
  const res = await client.get<{ companies: Company[] }>('/companies');
  return res.data;
}

export async function fetchRepos(): Promise<ReposResponse> {
  const res = await client.get<ReposResponse>('/repos');
  return res.data;
}

export async function fetchChatHistory(): Promise<{ chats: ChatSession[] }> {
  const res = await client.get<{ chats: ChatSession[] }>('/chat/history');
  return res.data;
}

export async function saveChatHistory(id: string, chat: Partial<ChatSession>): Promise<void> {
  await client.put(`/chat/history/${id}`, { chat });
}

export async function deleteChatHistory(id: string): Promise<void> {
  await client.delete(`/chat/history/${id}`);
}
