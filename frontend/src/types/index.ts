// eCAMS AI 프론트엔드 공통 타입 정의

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  picture?: string;
  isAdmin: boolean;
  userType?: string;
  repos: Record<string, string>;
  companies?: Record<string, string>;
}

export interface Company {
  id: string;
  name: string;
  manager?: string;
  note?: string;
}

export interface RepoMeta {
  type?: string;
  companyId?: string;
  companyName?: string;
}

export interface ReposResponse {
  repos: Record<string, string>;
  repoMeta: Record<string, RepoMeta>;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
  model?: string;
  statusText?: string;
  candidates?: Array<{ question: string; text?: string }>;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  meta?: {
    company?: string;
    repoId?: string;
    model?: string;
  };
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  children?: FileNode[];
}
