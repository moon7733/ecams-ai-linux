<!-- 새 레포지토리 등록 (ZIP / Git Clone) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
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
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>📁 새 레포지토리 등록</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="tab-bar">
          <button class="tab-btn" :class="{ active: activeTab === 'zip' }" @click="activeTab = 'zip'">ZIP 파일 업로드</button>
          <button class="tab-btn" :class="{ active: activeTab === 'git' }" @click="activeTab = 'git'">Git Clone</button>
        </div>

        <div class="form-group">
          <label>소속 고객사</label>
          <select v-model="selectedCompany">
            <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- ZIP Form -->
        <div v-if="activeTab === 'zip'" class="tab-form">
          <div class="form-group">
            <label>레포지토리 이름</label>
            <input v-model="repoNameZip" type="text" placeholder="예: kjbank_html5" />
          </div>
          <div class="form-group">
            <label>ZIP 파일 선택</label>
            <input type="file" accept=".zip" @change="handleFileSelect" />
          </div>
          <button class="btn-submit" :disabled="submitting" @click="handleZipSubmit">
            {{ submitting ? '업로드 및 분석 중...' : '업로드 및 저장' }}
          </button>
        </div>

        <!-- Git Form -->
        <div v-if="activeTab === 'git'" class="tab-form">
          <div class="form-group">
            <label>레포지토리 이름</label>
            <input v-model="repoNameGit" type="text" placeholder="예: kjbank_server" />
          </div>
          <div class="form-group">
            <label>Git URL</label>
            <input v-model="gitUrl" type="text" placeholder="https://github.com/..." />
          </div>
          <div class="form-group">
            <label>Access Token (선택)</label>
            <input v-model="gitToken" type="password" placeholder="비공개 레포지토리 토큰" />
          </div>
          <button class="btn-submit" :disabled="submitting" @click="handleGitSubmit">
            {{ submitting ? 'Git Clone 진행 중...' : 'Git Clone 및 저장' }}
          </button>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn-close" @click="emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal-card { width: 90%; max-width: 480px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
.modal-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.tab-bar { display: flex; border-bottom: 1px solid #e2e8f0; margin-bottom: 4px; }
.tab-btn { flex: 1; padding: 8px; border: none; background: none; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; }
.tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; }
.tab-form { display: flex; flex-direction: column; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: #475569; }
.form-group input, .form-group select { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
.btn-submit { background: #3b82f6; color: #fff; border: none; padding: 10px; border-radius: 6px; font-size: 13.5px; font-weight: 700; cursor: pointer; margin-top: 6px; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
