<template>
  <div class="p-6">
    <PageHeader title="Moderation Queue" />

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ─── Tab 1: Reports Queue ─────────────────────────────────────────── -->
      <n-tab-pane name="reports" tab="Reports Queue">
        <n-card class="mb-4">
          <n-space>
            <n-select
              v-model:value="reportStatus"
              placeholder="Filter by status"
              clearable
              :options="reportStatusOptions"
              style="width: 200px"
              @update:value="onReportStatusChange"
            />
          </n-space>
        </n-card>

        <n-spin :show="reportsLoading">
          <n-data-table
            v-if="reports.length > 0"
            :columns="reportColumns"
            :data="reports"
            :pagination="reportsPage.paginationConfig.value"
            :row-key="(r: ModerationReport) => r.id"
          />
          <EmptyState
            v-else-if="!reportsLoading"
            message="No reports found"
            description="The queue is clear."
          />
        </n-spin>
      </n-tab-pane>

      <!-- ─── Tab 2: Appeals ──────────────────────────────────────────────── -->
      <n-tab-pane name="appeals" tab="Appeals">
        <n-card class="mb-4">
          <n-space>
            <n-select
              v-model:value="appealStatus"
              placeholder="Filter by status"
              clearable
              :options="appealStatusOptions"
              style="width: 200px"
              @update:value="onAppealStatusChange"
            />
          </n-space>
        </n-card>

        <n-spin :show="appealsLoading">
          <n-data-table
            v-if="appeals.length > 0"
            :columns="appealColumns"
            :data="appeals"
            :pagination="appealsPage.paginationConfig.value"
            :row-key="(r: Appeal) => r.id"
          />
          <EmptyState v-else-if="!appealsLoading" message="No appeals found" />
        </n-spin>
      </n-tab-pane>

      <!-- ─── Tab 3: Audit Trail ──────────────────────────────────────────── -->
      <n-tab-pane name="audit" tab="Audit Trail">
        <template v-if="authStore.hasRole('ADMIN')">
          <n-spin :show="auditLoading">
            <n-data-table
              v-if="auditActions.length > 0"
              :columns="auditColumns"
              :data="auditActions"
              :pagination="auditPage.paginationConfig.value"
              :row-key="(r: ModerationAction) => r.id"
            />
            <EmptyState v-else-if="!auditLoading" message="No audit entries found" />
          </n-spin>
        </template>
        <template v-else>
          <n-empty description="This section is restricted to ADMIN users only." />
        </template>
      </n-tab-pane>

      <!-- ─── Tab 4: Sensitive Words ──────────────────────────────────────── -->
      <n-tab-pane name="words" tab="Sensitive Words">
        <template v-if="authStore.hasRole('ADMIN')">
          <n-card class="mb-4" title="Add Sensitive Word">
            <n-space align="center">
              <n-input
                v-model:value="newWord.word"
                placeholder="Word"
                style="width: 200px"
              />
              <n-input
                v-model:value="newWord.category"
                placeholder="Category (optional)"
                style="width: 200px"
              />
              <n-button type="primary" :loading="addingWord" @click="addWord">
                Add Word
              </n-button>
            </n-space>
          </n-card>

          <n-spin :show="wordsLoading">
            <n-data-table
              v-if="sensitiveWords.length > 0"
              :columns="wordColumns"
              :data="sensitiveWords"
              :pagination="wordsPage.paginationConfig.value"
              :row-key="(r: SensitiveWord) => r.id"
            />
            <EmptyState v-else-if="!wordsLoading" message="No sensitive words configured" />
          </n-spin>
        </template>
        <template v-else>
          <n-empty description="This section is restricted to ADMIN users only." />
        </template>
      </n-tab-pane>
    </n-tabs>

    <!-- Action Modal -->
    <n-modal
      v-model:show="showActionModal"
      preset="card"
      title="Take Moderation Action"
      style="width: 480px"
    >
      <n-form
        ref="actionFormRef"
        :model="actionForm"
        :rules="actionRules"
        label-placement="top"
      >
        <n-form-item label="Action" path="action">
          <n-select
            v-model:value="actionForm.action"
            :options="actionTypeOptions"
            placeholder="Select action"
          />
        </n-form-item>
        <n-form-item label="Notes (optional)" path="notes">
          <n-input
            v-model:value="actionForm.notes"
            type="textarea"
            placeholder="Add notes..."
            :rows="3"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showActionModal = false">Cancel</n-button>
          <n-button type="primary" :loading="actionSubmitting" @click="submitAction">
            Submit
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Resolve Appeal Modal -->
    <n-modal
      v-model:show="showResolveModal"
      preset="card"
      title="Resolve Appeal"
      style="width: 520px"
    >
      <n-form
        ref="resolveFormRef"
        :model="resolveForm"
        :rules="resolveRules"
        label-placement="top"
      >
        <n-form-item label="Status" path="status">
          <n-select
            v-model:value="resolveForm.status"
            :options="resolveStatusOptions"
            placeholder="Select status"
          />
        </n-form-item>
        <n-form-item label="Arbitration Notes" path="arbitrationNotes">
          <n-input
            v-model:value="resolveForm.arbitrationNotes"
            type="textarea"
            placeholder="Internal arbitration notes..."
            :rows="3"
          />
        </n-form-item>
        <n-form-item label="Outcome" path="outcome">
          <n-input
            v-model:value="resolveForm.outcome"
            type="textarea"
            placeholder="Outcome description..."
            :rows="3"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showResolveModal = false">Cancel</n-button>
          <n-button type="primary" :loading="resolveSubmitting" @click="submitResolve">
            Resolve
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Delete Word Confirm -->
    <ConfirmModal
      v-model:show="showDeleteWordModal"
      title="Delete Sensitive Word"
      message="Are you sure you want to delete this sensitive word?"
      type="error"
      @confirm="confirmDeleteWord"
      @cancel="showDeleteWordModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, h, type VNode } from 'vue';
import {
  NTabs,
  NTabPane,
  NCard,
  NButton,
  NSelect,
  NInput,
  NForm,
  NFormItem,
  NSpace,
  NTag,
  NModal,
  NSpin,
  NDataTable,
  NEmpty,
  NTooltip,
} from 'naive-ui';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { moderationApi } from '../../api/moderation';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import { useAuthStore } from '../../stores/auth';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmModal from '../../components/shared/ConfirmModal.vue';
import type { ModerationReport, ModerationAction, Appeal, SensitiveWord } from '../../types';

const authStore = useAuthStore();
const { successMsg, errorMsg } = useAppMessage();

const activeTab = ref('reports');

// ─── Reports ──────────────────────────────────────────────────────────────────
const reports = ref<ModerationReport[]>([]);
const reportsLoading = ref(false);
const reportStatus = ref<string | null>(null);
const reportsPage = usePagination(20);

const reportStatusOptions = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'In Review', value: 'IN_REVIEW' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Dismissed', value: 'DISMISSED' },
];

async function loadReports() {
  reportsLoading.value = true;
  try {
    const res = await moderationApi.getQueue({
      status: reportStatus.value || undefined,
      page: reportsPage.page.value,
      pageSize: reportsPage.pageSize.value,
    });
    reports.value = res.items;
    reportsPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    reportsLoading.value = false;
  }
}

function onReportStatusChange() {
  reportsPage.page.value = 1;
  loadReports();
}

watch([() => reportsPage.page.value, () => reportsPage.pageSize.value], loadReports);

// ─── Action Modal ─────────────────────────────────────────────────────────────
const showActionModal = ref(false);
const actionFormRef = ref<FormInst | null>(null);
const actionSubmitting = ref(false);
const selectedReportId = ref<number | null>(null);
const actionForm = reactive<{ action: string | null; notes: string }>({
  action: null,
  notes: '',
});

const actionRules: FormRules = {
  action: [{ required: true, message: 'Please select an action', trigger: 'change' }],
};

const actionTypeOptions = [
  { label: 'Warn', value: 'WARN' },
  { label: 'Hide', value: 'HIDE' },
  { label: 'Remove', value: 'REMOVE' },
  { label: 'Restore', value: 'RESTORE' },
];

function openActionModal(id: number) {
  selectedReportId.value = id;
  actionForm.action = null;
  actionForm.notes = '';
  showActionModal.value = true;
}

async function submitAction() {
  if (!selectedReportId.value) return;
  try {
    await actionFormRef.value?.validate();
  } catch {
    return;
  }
  actionSubmitting.value = true;
  try {
    await moderationApi.takeAction(selectedReportId.value, {
      action: actionForm.action!,
      notes: actionForm.notes || undefined,
    });
    successMsg('Action taken successfully');
    showActionModal.value = false;
    await loadReports();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    actionSubmitting.value = false;
  }
}

async function assignReport(id: number) {
  try {
    await moderationApi.assignReport(id);
    successMsg('Report assigned to you');
    await loadReports();
  } catch (err: any) {
    errorMsg(err);
  }
}

function reportStatusTagType(status: string): 'warning' | 'info' | 'success' | 'default' {
  const map: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
    PENDING: 'warning',
    IN_REVIEW: 'info',
    RESOLVED: 'success',
    DISMISSED: 'default',
  };
  return map[status] ?? 'default';
}

const reportColumns: DataTableColumn<ModerationReport>[] = [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: 'Content Type',
    key: 'contentType',
    render: (row) =>
      h(NTag, { size: 'small' }, { default: () => row.contentType }),
  },
  { title: 'Content ID', key: 'contentId', width: 100 },
  {
    title: 'Reporter',
    key: 'reporter',
    render: (row) => row.reporter?.displayName ?? `#${row.reporterId}`,
  },
  {
    title: 'Reason',
    key: 'reason',
    render: (row) => {
      const text = row.reason;
      if (text.length <= 60) return h('span', text);
      return h(
        NTooltip,
        {},
        {
          trigger: () => h('span', text.slice(0, 60) + '…'),
          default: () => text,
        }
      );
    },
  },
  {
    title: 'Status',
    key: 'status',
    render: (row) =>
      h(
        NTag,
        { type: reportStatusTagType(row.status), size: 'small' },
        { default: () => row.status }
      ),
  },
  {
    title: 'Assigned',
    key: 'assigned',
    render: (row) => row.assignee?.displayName ?? 'Unassigned',
  },
  {
    title: 'Date',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (row) => {
      const buttons: VNode[] = [];
      if (row.status === 'PENDING' || row.status === 'IN_REVIEW') {
        buttons.push(
          h(
            NButton,
            { size: 'small', onClick: () => assignReport(row.id) },
            { default: () => 'Assign to Me' }
          )
        );
      }
      buttons.push(
        h(
          NButton,
          { size: 'small', type: 'primary', onClick: () => openActionModal(row.id) },
          { default: () => 'Take Action' }
        )
      );
      return h(NSpace, {}, { default: () => buttons });
    },
  },
];

// ─── Appeals ──────────────────────────────────────────────────────────────────
const appeals = ref<Appeal[]>([]);
const appealsLoading = ref(false);
const appealStatus = ref<string | null>(null);
const appealsPage = usePagination(20);

const appealStatusOptions = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'In Review', value: 'IN_REVIEW' },
  { label: 'Upheld', value: 'UPHELD' },
  { label: 'Overturned', value: 'OVERTURNED' },
];

async function loadAppeals() {
  appealsLoading.value = true;
  try {
    const res = await moderationApi.listAppeals({
      status: appealStatus.value || undefined,
      page: appealsPage.page.value,
      pageSize: appealsPage.pageSize.value,
    });
    appeals.value = res.items;
    appealsPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    appealsLoading.value = false;
  }
}

function onAppealStatusChange() {
  appealsPage.page.value = 1;
  loadAppeals();
}

watch([() => appealsPage.page.value, () => appealsPage.pageSize.value], loadAppeals);

function appealStatusTagType(
  status: string
): 'warning' | 'info' | 'success' | 'error' | 'default' {
  const map: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
    PENDING: 'warning',
    IN_REVIEW: 'info',
    UPHELD: 'success',
    OVERTURNED: 'error',
  };
  return map[status] ?? 'default';
}

// ─── Resolve Appeal Modal ─────────────────────────────────────────────────────
const showResolveModal = ref(false);
const resolveFormRef = ref<FormInst | null>(null);
const resolveSubmitting = ref(false);
const selectedAppealId = ref<number | null>(null);
const resolveForm = reactive<{
  status: string | null;
  arbitrationNotes: string;
  outcome: string;
}>({
  status: null,
  arbitrationNotes: '',
  outcome: '',
});

const resolveRules: FormRules = {
  status: [{ required: true, message: 'Please select a status', trigger: 'change' }],
};

const resolveStatusOptions = [
  { label: 'In Review', value: 'IN_REVIEW' },
  { label: 'Upheld', value: 'UPHELD' },
  { label: 'Overturned', value: 'OVERTURNED' },
];

function openResolveModal(id: number) {
  selectedAppealId.value = id;
  resolveForm.status = null;
  resolveForm.arbitrationNotes = '';
  resolveForm.outcome = '';
  showResolveModal.value = true;
}

async function submitResolve() {
  if (!selectedAppealId.value) return;
  try {
    await resolveFormRef.value?.validate();
  } catch {
    return;
  }
  resolveSubmitting.value = true;
  try {
    await moderationApi.resolveAppeal(selectedAppealId.value, {
      status: resolveForm.status!,
      arbitrationNotes: resolveForm.arbitrationNotes || undefined,
      outcome: resolveForm.outcome || undefined,
    });
    successMsg('Appeal resolved');
    showResolveModal.value = false;
    await loadAppeals();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    resolveSubmitting.value = false;
  }
}

const appealColumns: DataTableColumn<Appeal>[] = [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: 'User',
    key: 'user',
    render: (row) => row.user?.displayName ?? `#${row.userId}`,
  },
  {
    title: 'Statement',
    key: 'userStatement',
    render: (row) => {
      const text = row.userStatement;
      if (text.length <= 80) return h('span', text);
      return h(
        NTooltip,
        {},
        {
          trigger: () => h('span', text.slice(0, 80) + '…'),
          default: () => text,
        }
      );
    },
  },
  {
    title: 'Status',
    key: 'status',
    render: (row) =>
      h(
        NTag,
        { type: appealStatusTagType(row.status), size: 'small' },
        { default: () => row.status }
      ),
  },
  { title: 'Action ID', key: 'moderationActionId', width: 100 },
  {
    title: 'Date',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (row) => {
      if (!authStore.hasRole('ADMIN')) return null;
      return h(
        NButton,
        { size: 'small', type: 'primary', onClick: () => openResolveModal(row.id) },
        { default: () => 'Resolve' }
      );
    },
  },
];

// ─── Audit Trail ──────────────────────────────────────────────────────────────
const auditActions = ref<ModerationAction[]>([]);
const auditLoading = ref(false);
const auditPage = usePagination(20);

async function loadAudit() {
  if (!authStore.hasRole('ADMIN')) return;
  auditLoading.value = true;
  try {
    const res = await moderationApi.getAudit({
      page: auditPage.page.value,
      pageSize: auditPage.pageSize.value,
    });
    auditActions.value = res.items;
    auditPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    auditLoading.value = false;
  }
}

watch([() => auditPage.page.value, () => auditPage.pageSize.value], loadAudit);

function auditActionTagType(action: string): 'warning' | 'info' | 'error' | 'success' {
  const map: Record<string, 'warning' | 'info' | 'error' | 'success'> = {
    WARN: 'warning',
    HIDE: 'info',
    REMOVE: 'error',
    RESTORE: 'success',
  };
  return map[action] ?? 'warning';
}

const auditColumns: DataTableColumn<ModerationAction>[] = [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: 'Action',
    key: 'action',
    render: (row) =>
      h(
        NTag,
        { type: auditActionTagType(row.action), size: 'small' },
        { default: () => row.action }
      ),
  },
  {
    title: 'Moderator',
    key: 'moderator',
    render: (row) => row.moderator?.displayName ?? `#${row.moderatorId}`,
  },
  { title: 'Report ID', key: 'reportId', width: 100 },
  {
    title: 'Notes',
    key: 'notes',
    render: (row) => {
      if (!row.notes) return '—';
      const text = row.notes;
      if (text.length <= 60) return h('span', text);
      return h(
        NTooltip,
        {},
        {
          trigger: () => h('span', text.slice(0, 60) + '…'),
          default: () => text,
        }
      );
    },
  },
  {
    title: 'Date',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
];

// ─── Sensitive Words ──────────────────────────────────────────────────────────
const sensitiveWords = ref<SensitiveWord[]>([]);
const wordsLoading = ref(false);
const wordsPage = usePagination(20);
const newWord = reactive({ word: '', category: '' });
const addingWord = ref(false);
const showDeleteWordModal = ref(false);
const wordToDelete = ref<number | null>(null);

async function loadWords() {
  if (!authStore.hasRole('ADMIN')) return;
  wordsLoading.value = true;
  try {
    const res = await moderationApi.listSensitiveWords({
      page: wordsPage.page.value,
      pageSize: wordsPage.pageSize.value,
    });
    sensitiveWords.value = res.items;
    wordsPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    wordsLoading.value = false;
  }
}

watch([() => wordsPage.page.value, () => wordsPage.pageSize.value], loadWords);

async function addWord() {
  if (!newWord.word.trim()) return;
  addingWord.value = true;
  try {
    await moderationApi.addSensitiveWord({
      word: newWord.word.trim(),
      category: newWord.category.trim() || undefined,
    });
    successMsg('Word added');
    newWord.word = '';
    newWord.category = '';
    await loadWords();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    addingWord.value = false;
  }
}

function openDeleteWord(id: number) {
  wordToDelete.value = id;
  showDeleteWordModal.value = true;
}

async function confirmDeleteWord() {
  if (!wordToDelete.value) return;
  try {
    await moderationApi.deleteSensitiveWord(wordToDelete.value);
    successMsg('Word deleted');
    showDeleteWordModal.value = false;
    await loadWords();
  } catch (err: any) {
    errorMsg(err);
  }
}

const wordColumns: DataTableColumn<SensitiveWord>[] = [
  { title: 'ID', key: 'id', width: 70 },
  { title: 'Word', key: 'word' },
  {
    title: 'Category',
    key: 'category',
    render: (row) => row.category ?? '—',
  },
  {
    title: 'Date Added',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (row) =>
      h(
        NButton,
        { size: 'small', type: 'error', onClick: () => openDeleteWord(row.id) },
        { default: () => 'Delete' }
      ),
  },
];

// ─── Tab change loader ────────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'appeals' && appeals.value.length === 0) loadAppeals();
  if (tab === 'audit' && auditActions.value.length === 0) loadAudit();
  if (tab === 'words' && sensitiveWords.value.length === 0) loadWords();
});

onMounted(() => {
  loadReports();
});
</script>
