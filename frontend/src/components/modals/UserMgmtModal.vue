<!-- 사용자 관리 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { fetchUsers, grantUserCompany, revokeUserCompany, deleteUser } from '@/api/admin';
import { fetchCompanies } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const users = ref<Record<string, any>>({});
const companies = ref<any[]>([]);
const searchKeyword = ref('');
const selectedUserId = ref<string | null>(null);
const grantCompanyId = ref('');
const grantLevel = ref('read');
const loading = ref(false);

watch(() => props.isOpen, async (open) => {
  if (open) {
    await loadData();
  }
});

async function loadData() {
  loading.value = true;
  try {
    const [uData, cData] = await Promise.all([fetchUsers(), fetchCompanies()]);
    users.value = uData.users || {};
    companies.value = cData.companies || [];
    if (companies.value.length > 0 && !grantCompanyId.value) {
      grantCompanyId.value = companies.value[0].id;
    }
  } catch (err: any) {
    alert('사용자 목록을 불러오지 못했습니다.');
  } finally {
    loading.value = false;
  }
}

const filteredUsers = computed(() => {
  const q = searchKeyword.value.toLowerCase().trim();
  return Object.entries(users.value).filter(([id, u]) => {
    return id.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q));
  });
});

const selectedUser = computed(() => {
  if (!selectedUserId.value) return null;
  return users.value[selectedUserId.value];
});

async function handleGrant() {
  if (!selectedUserId.value || !grantCompanyId.value) return;
  try {
    await grantUserCompany(selectedUserId.value, grantCompanyId.value, grantLevel.value);
    await loadData();
  } catch (err: any) {
    alert(err.response?.data?.error || '권한 부여에 실패했습니다.');
  }
}

async function handleRevoke(companyId: string) {
  if (!selectedUserId.value) return;
  try {
    await revokeUserCompany(selectedUserId.value, companyId);
    await loadData();
  } catch (err: any) {
    alert(err.response?.data?.error || '권한 회수에 실패했습니다.');
  }
}

async function handleDeleteUser() {
  if (!selectedUserId.value) return;
  if (!confirm(`정말로 사용자 '${selectedUserId.value}'를 삭제하시겠습니까?`)) return;
  try {
    await deleteUser(selectedUserId.value);
    selectedUserId.value = null;
    await loadData();
  } catch (err: any) {
    alert(err.response?.data?.error || '사용자 삭제에 실패했습니다.');
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>👥 사용자 관리</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="사용자 ID/이름 검색..."
          class="search-input"
        />

        <div class="user-list">
          <div
            v-for="[id, u] in filteredUsers"
            :key="id"
            class="user-item"
            :class="{ active: selectedUserId === id }"
            @click="selectedUserId = id"
          >
            <strong>👤 {{ u.name || id }}</strong>
            <span class="user-id">({{ id }}) - {{ u.affiliation || '소속없음' }}</span>
          </div>
        </div>

        <div v-if="selectedUser" class="detail-box">
          <div class="detail-head">
            <h4>👤 {{ selectedUser.name || selectedUserId }} ({{ selectedUserId }})</h4>
            <button v-if="selectedUserId !== 'admin'" class="btn-del" @click="handleDeleteUser">사용자 삭제</button>
          </div>

          <div class="auth-section">
            <span class="sec-title">🏢 고객사 권한</span>
            <div v-if="selectedUser.companies && Object.keys(selectedUser.companies).length > 0" class="company-table">
              <div v-for="[cid, lvl] in Object.entries(selectedUser.companies)" :key="cid" class="perm-row">
                <span>{{ companies.find(c => c.id === cid)?.name || cid }}</span>
                <span class="perm-badge">{{ lvl }}</span>
                <button class="btn-sm-del" @click="handleRevoke(cid)">회수</button>
              </div>
            </div>
            <div v-else class="empty-text">부여된 고객사 권한이 없습니다.</div>

            <div class="grant-form">
              <select v-model="grantCompanyId" class="select-comp">
                <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <select v-model="grantLevel" class="select-lvl">
                <option value="read">읽기</option>
                <option value="edit">수정</option>
              </select>
              <button class="btn-grant" @click="handleGrant">권한 추가</button>
            </div>
          </div>
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
.modal-card { width: 90%; max-width: 580px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; max-height: 85vh; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
.modal-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.search-input { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box; }
.user-list { border: 1px solid #e2e8f0; border-radius: 8px; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; }
.user-item { padding: 8px 12px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f1f5f9; }
.user-item:hover { background: #f8fafc; }
.user-item.active { background: #eff6ff; color: #2563eb; }
.user-id { font-size: 12px; color: #64748b; }
.detail-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #f8fafc; display: flex; flex-direction: column; gap: 10px; }
.detail-head { display: flex; justify-content: space-between; align-items: center; }
.detail-head h4 { margin: 0; font-size: 14px; color: #1e293b; }
.btn-del { background: #ef4444; color: #fff; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
.sec-title { font-size: 12px; font-weight: 700; color: #475569; }
.company-table { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.perm-row { display: flex; align-items: center; justify-content: space-between; background: #ffffff; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; font-size: 12.5px; }
.perm-badge { background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.btn-sm-del { background: #fee2e2; color: #b91c1c; border: none; padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }
.empty-text { font-size: 12px; color: #94a3b8; padding: 6px 0; }
.grant-form { display: flex; gap: 6px; margin-top: 8px; }
.select-comp { flex: 2; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; }
.select-lvl { flex: 1; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; }
.btn-grant { background: #3b82f6; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12.5px; cursor: pointer; font-weight: 600; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
