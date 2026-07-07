<!-- Azbrain API 연결 상태를 확인하는 첫 Vue 화면 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchCompanies, fetchRepos, login, type Company, type LoginResponse, type ReposResponse } from './api';

const companies = ref<Company[]>([]);
const companiesLoading = ref(false);
const companiesError = ref('');
const loginId = ref('ymlee');
const password = ref('');
const loginResult = ref<LoginResponse | null>(null);
const reposResult = ref<ReposResponse | null>(null);
const authError = ref('');
const authLoading = ref(false);

const repoRows = computed(() => {
  if (!reposResult.value) return [];
  return Object.entries(reposResult.value.repos).map(([id, level]) => ({
    id,
    level,
    meta: reposResult.value?.repoMeta[id],
  }));
});

async function loadCompanies() {
  companiesLoading.value = true;
  companiesError.value = '';
  try {
    companies.value = (await fetchCompanies()).companies;
  } catch (err) {
    companiesError.value = err instanceof Error ? err.message : '고객사 목록 조회 실패';
  } finally {
    companiesLoading.value = false;
  }
}

async function runLogin() {
  authLoading.value = true;
  authError.value = '';
  reposResult.value = null;
  try {
    const currentLogin = await login(loginId.value, password.value);
    loginResult.value = currentLogin;
    reposResult.value = await fetchRepos(currentLogin.token);
  } catch (err) {
    loginResult.value = null;
    authError.value = err instanceof Error ? err.message : '로그인 실패';
  } finally {
    authLoading.value = false;
  }
}

onMounted(loadCompanies);
</script>

<template>
  <main class="shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">Azbrain Migration</p>
        <h1>Spring API 연결 확인</h1>
      </div>
      <button class="secondary" type="button" @click="loadCompanies">새로고침</button>
    </section>

    <section class="status-grid">
      <article class="status-panel">
        <span class="label">고객사 API</span>
        <strong>{{ companiesLoading ? '확인 중' : `${companies.length}건` }}</strong>
        <p v-if="companiesError" class="error">{{ companiesError }}</p>
        <p v-else>GET /api/companies</p>
      </article>

      <article class="status-panel">
        <span class="label">로그인 API</span>
        <strong>{{ loginResult ? loginResult.id : '대기' }}</strong>
        <p v-if="authError" class="error">{{ authError }}</p>
        <p v-else>POST /api/login</p>
      </article>

      <article class="status-panel">
        <span class="label">저장소 권한</span>
        <strong>{{ repoRows.length }}건</strong>
        <p>GET /api/repos</p>
      </article>
    </section>

    <section class="workspace">
      <div class="pane">
        <div class="pane-head">
          <h2>고객사 목록</h2>
          <span>{{ companies.length }}</span>
        </div>
        <div class="list">
          <div v-for="company in companies" :key="company.id" class="row">
            <div>
              <strong>{{ company.name }}</strong>
              <p>{{ company.manager || '담당자 미정' }}</p>
            </div>
            <code>{{ company.id }}</code>
          </div>
        </div>
      </div>

      <div class="pane">
        <div class="pane-head">
          <h2>로그인 및 권한 확인</h2>
          <span>{{ loginResult?.isAdmin ? 'admin' : 'user' }}</span>
        </div>
        <form class="login-form" @submit.prevent="runLogin">
          <label>
            아이디
            <input v-model="loginId" autocomplete="username" />
          </label>
          <label>
            비밀번호
            <input v-model="password" autocomplete="current-password" type="password" />
          </label>
          <button type="submit" :disabled="authLoading">
            {{ authLoading ? '확인 중' : '로그인 확인' }}
          </button>
        </form>

        <div v-if="repoRows.length" class="list">
          <div v-for="repo in repoRows" :key="repo.id" class="row">
            <div>
              <strong>{{ repo.id }}</strong>
              <p>{{ repo.meta?.type || 'type 없음' }}</p>
            </div>
            <span class="badge">{{ repo.level }}</span>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
