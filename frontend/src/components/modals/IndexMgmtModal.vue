<!-- 인덱스 관리 (Admin) 모달 컴포넌트 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { fetchIndexStatus, rebuildIndex } from '@/api/admin';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const indexes = ref<any[]>([]);
const loading = ref(false);
const rebuilding = ref<Record<string, boolean>>({});

watch(() => props.isOpen, (open) => {
  if (open) loadIndexes();
});

async function loadIndexes() {
  loading.value = true;
  try {
    const data = await fetchIndexStatus();
    indexes.value = data.indexes || [];
  } finally {
    loading.value = false;
  }
}

async function handleRebuild(repoId: string) {
  rebuilding.value[repoId] = true;
  try {
    await rebuildIndex(repoId);
    alert(`'${repoId}' 인덱스 재생성이 백그라운드에서 시작되었습니다.`);
    await loadIndexes();
  } catch (err: any) {
    alert(err.response?.data?.error || '인덱스 재생성 요청 실패');
  } finally {
    rebuilding.value[repoId] = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="emit('close')">
    <div class="modal-card" style="max-width: 580px;" @click.stop>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><SvgIcon name="database" size="20" /> 인덱스 관리 (관리자)</h2>
        <button class="logout-btn" style="font-size:18px;" @click="emit('close')">✕</button>
      </div>

      <p style="font-size:12.5px; color:var(--text2); margin-bottom:12px;">
        레포지토리별 인덱스 준비 상태를 확인하고 RAG 검색 인덱스를 수동으로 재생성할 수 있습니다.
      </p>

      <div v-if="loading" style="text-align:center; padding:20px; color:var(--text3); font-size:13px;">
        불러오는 중...
      </div>

      <div v-else style="display:flex; flex-direction:column; gap:6px; max-height:360px; overflow-y:auto;">
        <div v-for="idx in indexes" :key="idx.repoId" class="list-item" style="padding:10px 12px;">
          <div>
            <div style="font-weight:700; color:var(--text); font-size:13px;">{{ idx.repoId }}</div>
            <div style="font-size:11px; color:var(--text3); margin-top:2px;">
              상태: <span :style="{ color: idx.ready ? 'var(--green)' : 'var(--danger)' }">{{ idx.ready ? '준비 완료' : '미생성 / 진행 중' }}</span>
              <span v-if="idx.docCount"> | 문서 수: {{ idx.docCount }}</span>
            </div>
          </div>
          <button
            style="width:auto; padding:4px 10px; font-size:11.5px; background:var(--accent); margin:0;"
            :disabled="rebuilding[idx.repoId]"
            @click="handleRebuild(idx.repoId)"
          >
            {{ rebuilding[idx.repoId] ? '재생성 중...' : '재생성' }}
          </button>
        </div>
      </div>

      <button class="outline" style="margin-top:16px;" @click="emit('close')">닫기</button>
    </div>
  </div>
</template>
