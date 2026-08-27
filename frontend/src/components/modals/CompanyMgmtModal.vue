<!-- 고객사 관리 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { addCompany, deleteCompany } from '@/api/admin';
import { fetchCompanies } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const companies = ref<any[]>([]);
const newName = ref('');
const newAddress = ref('');
const newManager = ref('');
const loading = ref(false);

watch(() => props.isOpen, (open) => {
  if (open) loadCompanies();
});

async function loadCompanies() {
  loading.value = true;
  try {
    const res = await fetchCompanies();
    companies.value = res.companies || [];
  } catch (err: any) {
    alert('고객사 목록을 불러오지 못했습니다.');
  } finally {
    loading.value = false;
  }
}

async function handleAdd() {
  if (!newName.value.trim()) {
    alert('고객사명을 입력하세요.');
    return;
  }
  try {
    await addCompany({
      name: newName.value.trim(),
      address: newAddress.value.trim(),
      manager: newManager.value.trim(),
    });
    newName.value = '';
    newAddress.value = '';
    newManager.value = '';
    await loadCompanies();
  } catch (err: any) {
    alert(err.response?.data?.error || '고객사 등록에 실패했습니다.');
  }
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`고객사 '${name}'을(를) 삭제하시겠습니까?`)) return;
  try {
    await deleteCompany(id);
    await loadCompanies();
  } catch (err: any) {
    alert(err.response?.data?.error || '고객사 삭제에 실패했습니다.');
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>🏢 고객사 관리</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- 추가 폼 -->
        <div class="add-box">
          <span class="box-title">고객사 추가</span>
          <div class="form-grid">
            <input v-model="newName" type="text" placeholder="고객사명 *" />
            <input v-model="newAddress" type="text" placeholder="주소" />
            <input v-model="newManager" type="text" placeholder="사이트 담당자" />
            <button class="btn-add" @click="handleAdd">추가</button>
          </div>
        </div>

        <!-- 목록 -->
        <div class="comp-list">
          <table class="table">
            <thead>
              <tr>
                <th>고객사명</th>
                <th>주소</th>
                <th>담당자</th>
                <th style="width: 60px;">관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in companies" :key="c.id">
                <td><strong>{{ c.name }}</strong></td>
                <td>{{ c.address || '-' }}</td>
                <td>{{ c.manager || '-' }}</td>
                <td>
                  <button class="btn-del" @click="handleDelete(c.id, c.name)">삭제</button>
                </td>
              </tr>
            </tbody>
          </table>
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
.modal-card { width: 90%; max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; max-height: 85vh; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
.modal-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.add-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
.box-title { font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 8px; }
.form-grid { display: flex; flex-direction: column; gap: 6px; }
.form-grid input { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
.btn-add { background: #3b82f6; color: #fff; border: none; padding: 8px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
.comp-list { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; text-align: left; }
.table th { background: #f8fafc; color: #475569; font-weight: 600; }
.btn-del { background: #fee2e2; color: #b91c1c; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
