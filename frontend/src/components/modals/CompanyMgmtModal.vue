<!-- 고객사 관리 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { createCompany, deleteCompany } from '@/api/admin';
import { fetchCompanies } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const companies = ref<any[]>([]);
const newId = ref('');
const newName = ref('');
const loading = ref(false);

watch(() => props.isOpen, (open) => {
  if (open) loadCompanies();
});

async function loadCompanies() {
  loading.value = true;
  try {
    const data = await fetchCompanies();
    companies.value = data.companies || [];
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  if (!newId.value.trim() || !newName.value.trim()) {
    alert('고객사 ID와 이름을 모두 입력하세요.');
    return;
  }
  try {
    await createCompany({ id: newId.value.trim(), name: newName.value.trim() });
    newId.value = '';
    newName.value = '';
    await loadCompanies();
  } catch (err: any) {
    alert(err.response?.data?.error || '고객사 생성에 실패했습니다.');
  }
}

async function handleDelete(id: string) {
  if (!confirm(`고객사 '${id}'를 삭제하시겠습니까?`)) return;
  try {
    await deleteCompany(id);
    await loadCompanies();
  } catch (err: any) {
    alert(err.response?.data?.error || '고객사 삭제에 실패했습니다.');
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 480px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="building" size="20" /> 고객사 관리 (관리자)</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <!-- 고객사 추가 폼 -->
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px; padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--surface2);">
        <strong style="font-size:13px; color:var(--text);">신규 고객사 등록</strong>
        <div style="display:flex; gap:6px; margin-top:4px;">
          <input v-model="newId" placeholder="고객사 ID (예: kjbank)" style="margin:0; flex:1;" />
          <input v-model="newName" placeholder="고객사명 (예: 광주은행)" style="margin:0; flex:1;" />
        </div>
        <button style="margin-top:6px; background:var(--accent);" @click="handleCreate">고객사 추가</button>
      </div>

      <!-- 고객사 목록 -->
      <div style="display:flex; flex-direction:column; gap:6px; max-height:280px; overflow-y:auto;">
        <div v-for="c in companies" :key="c.id" class="list-item" style="padding:8px 12px;">
          <div>
            <strong style="color:var(--text);">{{ c.name }}</strong>
            <span style="font-size:11px; color:var(--text3); margin-left:6px;">({{ c.id }})</span>
          </div>
          <button style="width:auto; padding:3px 8px; font-size:11px; background:var(--danger); margin:0;" @click="handleDelete(c.id)">
            삭제
          </button>
        </div>
      </div>

      <button class="outline" style="margin-top:16px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
