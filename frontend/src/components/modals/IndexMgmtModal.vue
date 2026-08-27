<!-- 코드 인덱스 관리 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchIndexStatus, triggerReindex } from '@/api/admin';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const indexes = ref<any[]>([]);
const loading = ref(false);
const reindexingRepo = ref<string | null>(null);

watch(() => props.isOpen, (open) => {
  if (open) loadStatus();
});

async function loadStatus() {
  loading.value = true;
  try {
    const data = await fetchIndexStatus();
    indexes.value = data.indexes || [];
  } catch (err: any) {
    alert('인덱스 현황을 불러오지 못했습니다.');
  } finally {
    loading.value = false;
  }
}

async function handleReindex(repoId: string) {
  reindexingRepo.value = repoId;
  try {
    await triggerReindex(repoId);
    alert(`'${repoId}' 인덱스 생성을 백그라운드에서 시작했습니다.`);
    await loadStatus();
  } catch (err: any) {
    alert(err.response?.data?.error || '인덱스 재생성에 실패했습니다.');
  } finally {
    reindexingRepo.value = null;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <h3>🗄️ 코드 인덱스 관리</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <p class="desc">인덱스를 생성하면 AI가 파일을 탐색하지 않고 즉시 관련 파일로 이동하여 응답 속도가 향상됩니다.</p>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>레포지토리</th>
                <th style="text-align:center;">상태</th>
                <th style="text-align:center; width: 100px;">작업</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in indexes" :key="item.repoId">
                <td><strong>{{ item.repoId }}</strong></td>
                <td style="text-align:center;">
                  <span class="status-pill" :class="{ ready: item.status === 'ready' }">
                    {{ item.status === 'ready' ? '✅ 준비완료' : '⏳ 미생성' }}
                  </span>
                </td>
                <td style="text-align:center;">
                  <button
                    class="btn-action"
                    :disabled="reindexingRepo === item.repoId"
                    @click="handleReindex(item.repoId)"
                  >
                    {{ reindexingRepo === item.repoId ? '생성 중...' : '재생성' }}
                  </button>
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
.modal-body { padding: 20px; overflow-y: auto; }
.desc { font-size: 12.5px; color: #64748b; margin: 0 0 14px 0; }
.table-wrap { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; text-align: left; }
.table th { background: #f8fafc; color: #475569; font-weight: 600; }
.status-pill { font-size: 12px; font-weight: 600; color: #64748b; }
.status-pill.ready { color: #16a34a; }
.btn-action { background: #3b82f6; color: #fff; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600; }
.btn-action:disabled { opacity: 0.6; cursor: not-allowed; }
.modal-foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.btn-close { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
