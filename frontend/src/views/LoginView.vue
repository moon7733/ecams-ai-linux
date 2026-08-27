<!-- 구글 OAuth 및 아이디/비밀번호 로그인을 제공하는 Vue 3 로그인 뷰 -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loginWithGoogle, loginWithIdPw } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const activeTab = ref<'login' | 'idpw'>('login');
const idInput = ref('');
const pwInput = ref('');
const loading = ref(false);
const localError = ref('');

const urlError = computed(() => {
  const err = route.query.error;
  if (typeof err === 'string') return err;
  return null;
});

const displayError = computed(() => localError.value || urlError.value);

onMounted(() => {
  if (authStore.isAuthenticated && !urlError.value) {
    router.replace('/');
  }
});

async function handleIdPwLogin() {
  if (!idInput.value || !pwInput.value) {
    localError.value = '아이디와 비밀번호를 모두 입력하세요.';
    return;
  }
  loading.value = true;
  localError.value = '';
  try {
    const data = await loginWithIdPw(idInput.value, pwInput.value);
    authStore.setToken(data.token, data.id);
    await authStore.fetchUser();
    router.push('/');
  } catch (err: any) {
    localError.value = err.response?.data?.error || '로그인에 실패했습니다.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-wrapper">
    <div class="login-box">
      <div class="brand-header">
        <div class="brand-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h1>eCAMS AI</h1>
        <p class="subtitle">형상관리 AI 어시스턴트 서비스</p>
      </div>

      <div v-if="displayError" class="alert-error">
        {{ displayError }}
      </div>

      <div class="oauth-section">
        <button type="button" class="google-btn" @click="loginWithGoogle">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Google 계정으로 계속 (@azsoft.kr)
        </button>
      </div>

      <div class="divider">
        <span>또는 아이디 로그인</span>
      </div>

      <form class="form-section" @submit.prevent="handleIdPwLogin">
        <div class="input-group">
          <input v-model="idInput" type="text" placeholder="아이디" autocomplete="username" required />
        </div>
        <div class="input-group">
          <input v-model="pwInput" type="password" placeholder="비밀번호" autocomplete="current-password" required />
        </div>
        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? '확인 중...' : '로그인' }}
        </button>
      </form>

      <div class="policy-footer">
        <div class="policy-row">
          <span>허용 도메인</span>
          <strong>@azsoft.kr</strong>
        </div>
        <div class="policy-row">
          <span>권한 체계</span>
          <strong>사전 승인 화이트리스트</strong>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', Roboto, sans-serif;
}

.login-box {
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.brand-header {
  text-align: center;
  margin-bottom: 24px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: #3b82f6;
  color: #ffffff;
  border-radius: 10px;
  margin-bottom: 12px;
}

.brand-header h1 {
  font-size: 20px;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 4px 0;
}

.subtitle {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.alert-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 18px;
  line-height: 1.4;
}

.google-btn {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.google-btn:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}

.divider {
  display: flex;
  align-items: center;
  margin: 20px 0;
  color: #94a3b8;
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.divider span {
  padding: 0 10px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-group input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.input-group input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.submit-btn {
  height: 40px;
  background: #1e293b;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: background 0.15s;
}

.submit-btn:hover:not(:disabled) {
  background: #0f172a;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.policy-footer {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
}

.policy-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
}

.policy-row span {
  color: #64748b;
}

.policy-row strong {
  color: #334155;
  font-weight: 600;
}
</style>
