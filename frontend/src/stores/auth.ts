// 사용자 인증 및 세션 상태를 관리하는 Pinia Store
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthUser } from '@/types';
import { getMe, logout as apiLogout } from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('ecams_token'));
  const user = ref<AuthUser | null>(null);
  const loading = ref<boolean>(false);

  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.isAdmin ?? false);

  function setToken(newToken: string, userId?: string): void {
    token.value = newToken;
    localStorage.setItem('ecams_token', newToken);
    if (userId) localStorage.setItem('ecams_user', userId);
  }

  async function fetchUser(): Promise<void> {
    if (!token.value) return;
    loading.value = true;
    try {
      const data = await getMe();
      user.value = data.user;
    } catch (err) {
      clearAuth();
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiLogout();
    } catch {}
    clearAuth();
  }

  function clearAuth(): void {
    token.value = null;
    user.value = null;
    localStorage.removeItem('ecams_token');
    localStorage.removeItem('ecams_user');
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    isAdmin,
    setToken,
    fetchUser,
    logout,
    clearAuth,
  };
});
