// Spring Boot API 호출을 감싸는 얇은 클라이언트
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

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
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
  return request<{ companies: Company[] }>('/api/companies');
}

export function login(id: string, password: string) {
  return request<LoginResponse>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ id, password }),
  });
}

export function fetchRepos(token: string) {
  return request<ReposResponse>('/api/repos', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
