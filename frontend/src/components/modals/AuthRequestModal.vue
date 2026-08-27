<!-- 권한 신청 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
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
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 420px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="key" size="20" /> 권한 신청</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <p style="font-size:12.5px; color:var(--text2); margin-bottom:14px; line-height:1.5;">
        권한을 신청할 고객사를 선택하세요. 관리자 승인 시 해당 고객사의 모든 레포지토리에 접근할 수 있습니다.
      </p>

      <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">고객사 선택</label>
      <select v-model="selectedCompany">
        <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <label style="font-size:12px; font-weight:600; color:var(--text2); display:block; margin-bottom:4px;">권한 레벨</label>
      <select v-model="selectedLevel">
        <option value="read">읽기 (Read) - 수정 불가</option>
        <option value="edit">수정 (Edit) - 코드 수정 가능</option>
      </select>

      <button :disabled="submitting" style="margin-top:8px; background:var(--accent);" @click="handleSubmit">
        {{ submitting ? '신청 중...' : '신청하기' }}
      </button>
      <button class="outline" style="margin-top:6px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
