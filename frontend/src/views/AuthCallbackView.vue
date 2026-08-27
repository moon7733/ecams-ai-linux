<!-- 구글 OAuth 리디렉션 토큰을 처리하고 홈 화면으로 안내하는 뷰 -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  const token = route.query.token as string;
  const id = route.query.id as string;

  if (token) {
    authStore.setToken(token, id);
    await authStore.fetchUser();
    router.replace('/');
  } else {
    const error = (route.query.error as string) || '인증 토큰이 누락되었습니다.';
    router.replace({ name: 'login', query: { error } });
  }
});
</script>

<template>
  <div class="callback-container">
    <div class="spinner"></div>
    <p>Google 인증 정보를 확인하고 로그인 중입니다...</p>
  </div>
</template>

<style scoped>
.callback-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  color: #475569;
  font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif;
  gap: 16px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
