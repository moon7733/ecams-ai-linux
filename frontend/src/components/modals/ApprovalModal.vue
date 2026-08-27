<!-- 결재함 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
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
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>🛡️ 결재함 (Admin)</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="state-msg">목록을 불러오는 중...</div>
        <div v-else-if="error" class="error-msg">{{ error }}</div>
        <div v-else-if="requests.length === 0" class="state-msg">대기 중인 결재 요청이 없습니다.</div>

        <div v-else class="req-list">
          <div v-for="req in requests" :key="req.id" class="req-item">
            <div class="req-info">
              <span class="req-user">👤 {{ req.userId }}</span>
              <span class="req-detail">🏢 {{ req.companyName || req.companyId }} ({{ req.level === 'edit' ? '수정' : '읽기' }})</span>
            </div>
            <div class="req-actions">
              <button class="btn-approve" @click="handleApprove(req.id)">승인</button>
              <button class="btn-reject" @click="handleReject(req.id)">반려</button>
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
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal-card {
  width: 90%;
  max-width: 500px;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}
.modal-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; max-height: 400px; overflow-y: auto; }
.state-msg { text-align: center; color: #64748b; font-size: 13.5px; padding: 20px; }
.error-msg { color: #ef4444; font-size: 13px; }
.req-list { display: flex; flex-direction: column; gap: 10px; }
.req-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.req-info { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.req-user { font-weight: 700; color: #0f172a; }
.req-detail { color: #475569; font-size: 12px; }
.req-actions { display: flex; gap: 6px; }
.btn-approve { background: #3b82f6; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600; }
.btn-reject { background: #ef4444; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
