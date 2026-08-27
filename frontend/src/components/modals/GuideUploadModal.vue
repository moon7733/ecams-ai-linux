<!-- 가이드 문서 업로드 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { uploadGuideDoc } from '@/api/admin';
import { fetchRepos } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const repos = ref<string[]>([]);
const selectedRepo = ref('');
const file = ref<File | null>(null);
const uploading = ref(false);

watch(() => props.isOpen, async (open) => {
  if (open) {
    const data = await fetchRepos();
    repos.value = Object.keys(data.repos || {});
    if (repos.value.length > 0 && !selectedRepo.value) {
      selectedRepo.value = repos.value[0];
    }
  }
});

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    file.value = target.files[0];
  }
}

async function handleUpload() {
  if (!selectedRepo.value || !file.value) {
    alert('레포지토리와 가이드 문서 파일을 모두 선택하세요.');
    return;
  }
  uploading.value = true;
  const formData = new FormData();
  formData.append('repoId', selectedRepo.value);
  formData.append('guideFile', file.value);

  try {
    const res = await uploadGuideDoc(formData);
    alert(res.message || '가이드 업로드 완료! 백그라운드에서 분석 및 인덱싱이 진행됩니다.');
    emit('close');
  } catch (err: any) {
    alert(err.response?.data?.error || '가이드 업로드에 실패했습니다.');
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>📄 가이드 문서 업로드</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <p class="desc">고객사 직원(엔드유저)의 질문에 답변할 때 사용할 사용자/운영자 가이드를 업로드합니다. (PDF, DOCX, PPTX 지원)</p>

        <div class="form-group">
          <label>사이트(레포지토리) 선택</label>
          <select v-model="selectedRepo">
            <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>가이드 파일 (PDF / DOCX / PPTX)</label>
          <input type="file" accept=".pdf,.docx,.pptx" @change="handleFileChange" />
        </div>

        <button class="btn-upload" :disabled="uploading" @click="handleUpload">
          {{ uploading ? '업로드 및 분석 중...' : '업로드 + 분석 시작' }}
        </button>
      </div>

      <div class="modal-foot">
        <button class="btn-close" @click="emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal-card { width: 90%; max-width: 500px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
.modal-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.desc { font-size: 12.5px; color: #64748b; margin: 0; line-height: 1.5; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: #475569; }
.form-group select, .form-group input { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
.btn-upload { background: #3b82f6; color: #fff; border: none; padding: 10px; border-radius: 6px; font-size: 13.5px; font-weight: 700; cursor: pointer; margin-top: 4px; }
.btn-upload:disabled { opacity: 0.6; cursor: not-allowed; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
