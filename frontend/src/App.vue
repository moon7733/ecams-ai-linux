<!-- Azbrain 2단계 핵심 업무 흐름을 확인하는 Vue 화면. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  fetchChatJob,
  fetchCompanies,
  fetchRepos,
  loginSpring,
  loginWorker,
  startChat,
  type Company,
  type LoginResponse,
  type ReposResponse,
} from './api';

const companies = ref<Company[]>([]);
const companiesLoading = ref(false);
const companiesError = ref('');
const loginId = ref('ymlee');
const password = ref('');
const springLogin = ref<LoginResponse | null>(null);
const workerLogin = ref<LoginResponse | null>(null);
const reposResult = ref<ReposResponse | null>(null);
const selectedRepos = ref<string[]>([]);
const authError = ref('');
const authLoading = ref(false);
const question = ref('결재 오류 원인을 요약해줘.');
const answer = ref('');
const jobStatus = ref('대기');
const chatLoading = ref(false);
const chatError = ref('');

const repoRows = computed(() => {
  if (!reposResult.value) return [];
  return Object.entries(reposResult.value.repos).map(([id, level]) => ({
    id,
    level,
    meta: reposResult.value?.repoMeta[id],
  }));
});

const canAsk = computed(() => !!workerLogin.value?.token && selectedRepos.value.length > 0 && question.value.trim().length > 0);

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
  selectedRepos.value = [];
  try {
    const [spring, worker] = await Promise.all([
      loginSpring(loginId.value, password.value),
      loginWorker(loginId.value, password.value),
    ]);
    springLogin.value = spring;
    workerLogin.value = worker;
    reposResult.value = await fetchRepos(spring.token);
    selectedRepos.value = Object.keys(reposResult.value.repos).slice(0, 1);
  } catch (err) {
    springLogin.value = null;
    workerLogin.value = null;
    authError.value = err instanceof Error ? err.message : '로그인 실패';
  } finally {
    authLoading.value = false;
  }
}

async function askWorker() {
  if (!workerLogin.value || !canAsk.value) return;
  chatLoading.value = true;
  chatError.value = '';
  answer.value = '';
  jobStatus.value = '요청 중';
  try {
    const started = await startChat(workerLogin.value.token, {
      message: question.value,
      repos: selectedRepos.value,
    });

    if (started.answer || started.text) {
      answer.value = started.answer || started.text || '';
      jobStatus.value = started.type;
      return;
    }
    if (!started.jobId) {
      answer.value = started.candidates?.map(item => item.question).join('\n') || '응답 후보가 없습니다.';
      jobStatus.value = started.type;
      return;
    }

    jobStatus.value = `작업 ${started.jobId}`;
    for (let i = 0; i < 90; i += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 2000));
      const job = await fetchChatJob(workerLogin.value.token, started.jobId);
      jobStatus.value = `${job.status} · chunk ${job.chunkCount}`;
      if (job.status === 'completed') {
        answer.value = job.finalAnswer || '';
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.finalAnswer || `작업 상태 ${job.status}`);
      }
    }
    throw new Error('작업 완료 대기 시간이 초과되었습니다.');
  } catch (err) {
    chatError.value = err instanceof Error ? err.message : '분석 요청 실패';
  } finally {
    chatLoading.value = false;
  }
}

function toggleRepo(repoId: string) {
  selectedRepos.value = selectedRepos.value.includes(repoId)
    ? selectedRepos.value.filter(id => id !== repoId)
    : [...selectedRepos.value, repoId];
}

onMounted(loadCompanies);
</script>

<template>
  <main class="shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">Azbrain Migration</p>
        <h1>Spring 정문과 Node 분석 worker 연결 확인</h1>
      </div>
      <button class="secondary" type="button" @click="loadCompanies">새로고침</button>
    </section>

    <section class="status-grid">
      <article class="status-panel">
        <span class="label">고객사 API</span>
        <strong>{{ companiesLoading ? '확인 중' : `${companies.length}건` }}</strong>
        <p v-if="companiesError" class="error">{{ companiesError }}</p>
        <p v-else>Spring GET /api/companies</p>
      </article>

      <article class="status-panel">
        <span class="label">인증 API</span>
        <strong>{{ springLogin ? springLogin.id : '대기' }}</strong>
        <p v-if="authError" class="error">{{ authError }}</p>
        <p v-else>Spring + Node 동시 로그인</p>
      </article>

      <article class="status-panel">
        <span class="label">분석 worker</span>
        <strong>{{ jobStatus }}</strong>
        <p v-if="chatError" class="error">{{ chatError }}</p>
        <p v-else>Node /api/chat job polling</p>
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
          <h2>로그인과 저장소 권한</h2>
          <span>{{ springLogin?.isAdmin ? 'admin' : 'user' }}</span>
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

        <div v-if="repoRows.length" class="list compact-list">
          <label v-for="repo in repoRows" :key="repo.id" class="row check-row">
            <span>
              <input type="checkbox" :checked="selectedRepos.includes(repo.id)" @change="toggleRepo(repo.id)" />
              <strong>{{ repo.id }}</strong>
              <small>{{ repo.meta?.type || 'type 없음' }}</small>
            </span>
            <span class="badge">{{ repo.level }}</span>
          </label>
        </div>
      </div>
    </section>

    <section class="analysis-panel">
      <div class="pane-head">
        <h2>분석 질문</h2>
        <span>{{ selectedRepos.length }}개 저장소 선택</span>
      </div>
      <textarea v-model="question" rows="4" placeholder="분석할 질문을 입력하세요." />
      <div class="actions">
        <button type="button" :disabled="!canAsk || chatLoading" @click="askWorker">
          {{ chatLoading ? '분석 중' : 'Node worker 분석 요청' }}
        </button>
      </div>
      <pre v-if="answer" class="answer">{{ answer }}</pre>
    </section>
  </main>
</template>
