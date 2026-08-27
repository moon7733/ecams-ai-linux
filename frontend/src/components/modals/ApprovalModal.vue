<!-- 결재함 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { fetchApprovals, approveRequest, rejectRequest } from '@/api/admin';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const requests = ref<any[]>([]);
const loading = ref(false);
const error = ref('');

watch(() => props.isOpen, (open) => {
  if (open) loadRequests();
});

async function loadRequests() {
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchApprovals();
    requests.value = data.requests || [];
  } catch (err: any) {
    error.value = err.response?.data?.error || '결재 목록을 불러오지 못했습니다.';
  } finally {
    loading.value = false;
  }
}

async function handleApprove(id: string) {
  try {
    await approveRequest(id);
    await loadRequests();
  } catch (err: any) {
    alert(err.response?.data?.error || '승인 처리에 실패했습니다.');
  }
}

async function handleReject(id: string) {
  try {
    await rejectRequest(id);
    await loadRequests();
  } catch (err: any) {
    alert(err.response?.data?.error || '반려 처리에 실패했습니다.');
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 540px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="shield" size="20" /> 결재함 (관리자)</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <div v-if="loading" style="text-align:center; padding:20px; color:var(--text3); font-size:13px;">
        불러오는 중...
      </div>
      <div v-else-if="error" class="modal-error">{{ error }}</div>

      <div v-else class="approval-list">
        <div v-if="requests.length === 0" style="text-align:center; padding:30px 0; color:var(--text3); font-size:13px;">
          대기 중인 결재 요청이 없습니다.
        </div>

        <div v-for="req in requests" :key="req.id" class="list-item" style="display:flex; flex-direction:column; gap:6px; align-items:stretch;">
          <div style="display:flex; justify-content:space-between; font-size:13px;">
            <strong style="color:var(--text);">{{ req.name || req.userId }} ({{ req.userId }})</strong>
            <span class="badge" style="font-size:10px;">{{ req.type === 'company' ? '고객사 권한' : req.type }}</span>
          </div>

          <div style="font-size:12px; color:var(--text2);">
            <div v-if="req.type === 'company'">고객사: <strong>{{ req.companyId }}</strong> ({{ req.level || 'read' }})</div>
            <div v-if="req.affiliation">소속: {{ req.affiliation }}</div>
            <div v-if="req.phone">연락처: {{ req.phone }}</div>
            <div style="color:var(--text3); font-size:11px; margin-top:2px;">{{ new Date(req.timestamp).toLocaleString('ko-KR') }}</div>
          </div>

          <div style="display:flex; gap:6px; margin-top:6px;">
            <button style="flex:1; padding:6px 0; font-size:12px; background:var(--accent);" @click="handleApprove(req.id)">승인</button>
            <button class="outline" style="flex:1; padding:6px 0; font-size:12px; color:var(--danger);" @click="handleReject(req.id)">반려</button>
          </div>
        </div>
      </div>

      <button class="outline" style="margin-top:16px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
