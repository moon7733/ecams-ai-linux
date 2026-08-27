<!-- 사용자 관리 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { fetchUsers, grantCompanyAuth, revokeCompanyAuth, deleteUser } from '@/api/admin';
import { fetchCompanies } from '@/api/chat';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const users = ref<any[]>([]);
const companies = ref<any[]>([]);
const search = ref('');
const selectedCompany = ref('');
const selectedLevel = ref('read');
const activeUserId = ref('');
const loading = ref(false);

watch(() => props.isOpen, async (open) => {
  if (open) {
    loading.value = true;
    try {
      const [uData, cData] = await Promise.all([fetchUsers(), fetchCompanies()]);
      users.value = uData.users || [];
      companies.value = cData.companies || [];
      if (companies.value.length > 0) {
        selectedCompany.value = companies.value[0].id;
      }
    } finally {
      loading.value = false;
    }
  }
});

const filteredUsers = computed(() => {
  const q = search.value.toLowerCase().trim();
  if (!q) return users.value;
  return users.value.filter(u =>
    (u.id && u.id.toLowerCase().includes(q)) ||
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.email && u.email.toLowerCase().includes(q))
  );
});

async function handleGrant(userId: string) {
  if (!selectedCompany.value) return;
  try {
    await grantCompanyAuth(userId, selectedCompany.value, selectedLevel.value);
    const uData = await fetchUsers();
    users.value = uData.users || [];
  } catch (err: any) {
    alert(err.response?.data?.error || '권한 부여에 실패했습니다.');
  }
}

async function handleRevoke(userId: string, companyId: string) {
  try {
    await revokeCompanyAuth(userId, companyId);
    const uData = await fetchUsers();
    users.value = uData.users || [];
  } catch (err: any) {
    alert(err.response?.data?.error || '권한 회수에 실패했습니다.');
  }
}

async function handleDelete(userId: string) {
  if (!confirm(`정말 사용자 '${userId}'를 삭제하시겠습니까?`)) return;
  try {
    await deleteUser(userId);
    const uData = await fetchUsers();
    users.value = uData.users || [];
  } catch (err: any) {
    alert(err.response?.data?.error || '사용자 삭제에 실패했습니다.');
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 580px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="users" size="20" /> 사용자 관리 (관리자)</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <input v-model="search" type="text" placeholder="사용자 ID, 이름, 이메일 검색..." style="margin-bottom:12px;" />

      <div v-if="loading" style="text-align:center; padding:20px; color:var(--text3); font-size:13px;">
        불러오는 중...
      </div>

      <div v-else style="display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto;">
        <div v-for="u in filteredUsers" :key="u.id" class="list-item" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="color:var(--text);">{{ u.name || u.id }}</strong>
              <span style="font-size:11px; color:var(--text3); margin-left:4px;">({{ u.id }})</span>
              <span v-if="u.isAdmin" class="badge" style="font-size:9px; margin-left:6px;">Admin</span>
            </div>
            <button
              v-if="!u.isAdmin"
              style="width:auto; padding:2px 8px; font-size:11px; background:var(--danger); margin:0;"
              @click="handleDelete(u.id)"
            >
              삭제
            </button>
          </div>

          <!-- 권한 목록 -->
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
            <span v-for="(lvl, cid) in u.companies" :key="cid" class="badge" style="display:flex; align-items:center; gap:4px; font-size:11px;">
              {{ cid }}: {{ lvl }}
              <span style="cursor:pointer; color:var(--danger); font-weight:bold;" @click="handleRevoke(u.id, String(cid))">✕</span>
            </span>
          </div>

          <!-- 권한 추가 바 -->
          <div style="display:flex; gap:6px; margin-top:6px; align-items:center;">
            <select v-model="selectedCompany" style="flex:1; margin:0; padding:6px; font-size:12px;">
              <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <select v-model="selectedLevel" style="width:80px; margin:0; padding:6px; font-size:12px;">
              <option value="read">Read</option>
              <option value="edit">Edit</option>
            </select>
            <button
              style="width:auto; padding:6px 12px; margin:0; font-size:12px; background:var(--accent);"
              @click="handleGrant(u.id)"
            >
              부여
            </button>
          </div>
        </div>
      </div>

      <button class="outline" style="margin-top:16px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
