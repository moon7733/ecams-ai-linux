<!-- 새 레포지토리 등록 (ZIP / Git Clone) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { createRepoZip, createRepoGit } from '@/api/admin';
import { fetchCompanies } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'repoCreated'): void;
}>();

const activeTab = ref<'zip' | 'git'>('zip');
const companies = ref<any[]>([]);
const selectedCompany = ref('');

// ZIP form
const repoNameZip = ref('');
const zipFile = ref<File | null>(null);

// Git form
const repoNameGit = ref('');
const gitUrl = ref('');
const gitToken = ref('');

const submitting = ref(false);

watch(() => props.isOpen, async (open) => {
  if (open) {
    const data = await fetchCompanies();
    companies.value = data.companies || [];
    if (companies.value.length > 0 && !selectedCompany.value) {
      selectedCompany.value = companies.value[0].id;
    }
  }
});

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    zipFile.value = target.files[0];
    if (!repoNameZip.value) {
      repoNameZip.value = target.files[0].name.replace(/\.zip$/i, '');
    }
  }
}

async function handleZipSubmit() {
  if (!repoNameZip.value || !zipFile.value) {
    alert('레포지토리 이름과 ZIP 파일을 모두 입력하세요.');
    return;
  }
  submitting.value = true;
  const formData = new FormData();
  formData.append('repoName', repoNameZip.value);
  formData.append('companyId', selectedCompany.value);
  formData.append('zipFile', zipFile.value);

  try {
    await createRepoZip(formData);
    alert('레포지토리 ZIP 업로드 및 인덱스 생성이 완료되었습니다.');
    emit('repoCreated');
    emit('close');
  } catch (err: any) {
    alert(err.response?.data?.error || '레포지토리 생성에 실패했습니다.');
  } finally {
    submitting.value = false;
  }
}

async function handleGitSubmit() {
  if (!repoNameGit.value || !gitUrl.value) {
    alert('레포지토리 이름과 Git URL을 모두 입력하세요.');
    return;
  }
  submitting.value = true;
  try {
    await createRepoGit({
      name: repoNameGit.value,
      url: gitUrl.value,
      token: gitToken.value,
      companyId: selectedCompany.value,
    });
    alert('Git Clone 및 인덱스 생성이 완료되었습니다.');
    emit('repoCreated');
    emit('close');
  } catch (err: any) {
    alert(err.response?.data?.error || 'Git Clone에 실패했습니다.');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 480px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="folderPlus" size="20" /> 레포지토리 관리</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <div class="tab-buttons">
        <div class="tab-btn" :class="{ active: activeTab === 'zip' }" @click="activeTab = 'zip'">ZIP 파일 업로드</div>
        <div class="tab-btn" :class="{ active: activeTab === 'git' }" @click="activeTab = 'git'">Git Clone</div>
      </div>

      <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">소속 고객사</label>
      <select v-model="selectedCompany">
        <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <!-- ZIP Form -->
      <div v-if="activeTab === 'zip'">
        <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">레포지토리 이름</label>
        <input v-model="repoNameZip" type="text" placeholder="예: kjbank_html5" />

        <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">ZIP 파일</label>
        <input type="file" accept=".zip" @change="handleFileSelect" />

        <button :disabled="submitting" style="margin-top:8px; background:var(--accent);" @click="handleZipSubmit">
          {{ submitting ? '업로드 및 분석 중...' : '업로드 및 저장' }}
        </button>
      </div>

      <!-- Git Form -->
      <div v-if="activeTab === 'git'">
        <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">레포지토리 이름</label>
        <input v-model="repoNameGit" type="text" placeholder="예: kjbank_server" />

        <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">Git URL</label>
        <input v-model="gitUrl" type="text" placeholder="https://github.com/..." />

        <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">Access Token (선택)</label>
        <input v-model="gitToken" type="password" placeholder="비공개 레포지토리 토큰" />

        <button :disabled="submitting" style="margin-top:8px; background:var(--accent);" @click="handleGitSubmit">
          {{ submitting ? 'Git Clone 진행 중...' : 'Git Clone 및 저장' }}
        </button>
      </div>

      <button class="outline" style="margin-top:6px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
