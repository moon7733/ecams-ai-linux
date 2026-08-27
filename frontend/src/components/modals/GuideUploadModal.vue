<!-- 가이드 문서 업로드 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
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
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 460px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="file" size="20" /> 가이드 업로드 (관리자)</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <p style="font-size:12.5px; color:var(--text2); margin-bottom:14px; line-height:1.5;">
        사용자/운영자 가이드(PDF, DOCX, PPTX)를 업로드하면 AI가 엔드유저 질문에 가이드 내용을 참고하여 답변합니다.
      </p>

      <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">레포지토리 선택</label>
      <select v-model="selectedRepo">
        <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
      </select>

      <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">가이드 파일 (PDF / DOCX / PPTX)</label>
      <input type="file" accept=".pdf,.docx,.pptx" @change="handleFileChange" />

      <button :disabled="uploading" style="margin-top:8px; background:var(--accent);" @click="handleUpload">
        {{ uploading ? '업로드 및 분석 중...' : '업로드 및 분석 시작' }}
      </button>
      <button class="outline" style="margin-top:6px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
