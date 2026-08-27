<!-- 권한 신청 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { submitAuthRequest } from '@/api/admin';
import { fetchCompanies } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const companies = ref<any[]>([]);
const selectedCompany = ref('');
const selectedLevel = ref('read');
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

async function handleSubmit() {
  if (!selectedCompany.value) {
    alert('고객사를 선택하세요.');
    return;
  }
  submitting.value = true;
  try {
    await submitAuthRequest(selectedCompany.value, selectedLevel.value);
    alert('권한 신청이 완료되었습니다. 관리자 승인 후 접근할 수 있습니다.');
    emit('close');
  } catch (err: any) {
    alert(err.response?.data?.error || '권한 신청에 실패했습니다.');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>🔑 권한 신청</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <p class="desc">권한을 신청할 고객사를 선택하세요. 승인 시 해당 고객사의 모든 레포지토리에 접근할 수 있습니다.</p>

        <div class="form-group">
          <label>고객사 선택</label>
          <select v-model="selectedCompany">
            <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>권한 레벨</label>
          <select v-model="selectedLevel">
            <option value="read">읽기 (Read) - 수정 불가</option>
            <option value="edit">수정 (Edit) - 코드 수정 가능</option>
          </select>
        </div>

        <button class="btn-submit" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '신청 중...' : '신청하기' }}
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
.modal-card { width: 90%; max-width: 440px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
.modal-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.desc { font-size: 12.5px; color: #64748b; margin: 0; line-height: 1.5; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: #475569; }
.form-group select { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
.btn-submit { background: #3b82f6; color: #fff; border: none; padding: 10px; border-radius: 6px; font-size: 13.5px; font-weight: 700; cursor: pointer; margin-top: 4px; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
