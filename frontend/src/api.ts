// Spring Boot API와 Node worker API 호출을 감싸는 클라이언트.
export interface Company {
  id: string;
  name: string;
  address: string | null;
  manager: string | null;
}

export interface RepositoryMeta {
  path: string;
  companyId: string | null;
  type: string | null;
}

export interface LoginResponse {
  token: string;
  id: string;
  isAdmin: boolean;
  repos: Record<string, string>;
}

export interface ReposResponse {
  repos: Record<string, string>;
  repoMeta: Record<string, RepositoryMeta>;
  isAdmin: boolean;
}

export interface ChatStartResponse {
  type: 'job' | 'cached' | 'clarify' | 'candidates';
  jobId?: string;
  answer?: string;
  text?: string;
  candidates?: Array<{ id: string; question: string; sim: number }>;
}

export interface ChatJobResponse {
  status: string;
  startedAt?: number;
  completedAt?: number;
  chunkCount: number;
  finalAnswer: string | null;
}

const springBase = import.meta.env.VITE_API_BASE || '/api';
const workerBase = import.meta.env.VITE_NODE_API_BASE || '/node-api';

async function request<T>(base: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data as T;
}

export function fetchCompanies() {
  return request<{ companies: Company[] }>(springBase, '/companies');
}

export function loginSpring(id: string, password: string) {
  return request<LoginResponse>(springBase, '/login', {
    method: 'POST',
    body: JSON.stringify({ id, password }),
  });
}

export function loginWorker(id: string, password: string) {
  return request<LoginResponse>(workerBase, '/login', {
    method: 'POST',
    body: JSON.stringify({ id, password }),
  });
}

export function fetchRepos(token: string) {
  return request<ReposResponse>(springBase, '/repos', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function startChat(token: string, body: { message: string; repos: string[] }) {
  return request<ChatStartResponse>(workerBase, '/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...body,
      history: [],
      model: 'agy',
      fastMode: true,
      concise: true,
    }),
  });
}

export function fetchChatJob(token: string, jobId: string) {
  return request<ChatJobResponse>(workerBase, `/chat/jobs/${encodeURIComponent(jobId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
