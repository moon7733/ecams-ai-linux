// 사용자 인증 및 구글 OAuth 관련 API 함수
import client from './client';
import type { AuthUser } from '@/types';

export async function getGoogleAuthUrl(): Promise<string> {
  const res = await client.get<{ url: string }>('/auth/google/url');
  return res.data.url;
}

export function loginWithGoogle(): void {
  getGoogleAuthUrl().then((url) => {
    window.location.href = url;
  }).catch((err) => {
    alert(err.response?.data?.error || 'Google 로그인 연결에 실패했습니다.');
  });
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const res = await client.get<{ user: AuthUser }>('/auth/me');
  return res.data;
}

export async function loginWithIdPw(id: string, password: string): Promise<{ token: string; id: string; isAdmin: boolean }> {
  const res = await client.post('/login', { id, password });
  return res.data;
}

export async function logout(): Promise<void> {
  try {
    await client.post('/logout');
  } finally {
    localStorage.removeItem('ecams_token');
    localStorage.removeItem('ecams_user');
  }
}
