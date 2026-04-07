<template>
  <div class="p-6">
    <PageHeader
      title="My Appeals"
      subtitle="View and manage appeals for moderation actions taken on your content."
    />

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ─── Tab 1: My Filed Appeals ──────────────────────────────────────── -->
      <n-tab-pane name="appeals" tab="My Appeals">
        <n-card class="mb-4">
          <n-space align="center">
            <span class="text-sm text-gray-500">Filter by status:</span>
            <n-select
              v-model:value="appealStatusFilter"
              :options="appealStatusOptions"
              clearable
              placeholder="All statuses"
              style="width: 180px"
              @update:value="onAppealFilterChange"
            />
          </n-space>
        </n-card>

        <n-spin :show="appealsLoading">
          <n-data-table
            v-if="myAppeals.length > 0"
            :columns="appealColumns"
            :data="myAppeals"
            :pagination="appealPage.paginationConfig.value"
            :row-key="(r: Appeal) => r.id"
          />
          <EmptyState
            v-else-if="!appealsLoading"
            message="No appeals filed yet"
            description="If a moderation action was taken on your content, you can appeal it from the 'Appealable Actions' tab."
          />
        </n-spin>
      </n-tab-pane>

      <!-- ─── Tab 2: Appealable Actions ────────────────────────────────────── -->
      <n-tab-pane name="actions" tab="Appealable Actions">
        <n-alert type="info" class="mb-4">
          These are moderation actions taken on your content. You may file one appeal per action.
        </n-alert>

        <n-spin :show="actionsLoading">
          <n-data-table
            v-if="myActions.length > 0"
            :columns="actionColumns"
            :data="myActions"
            :pagination="actionPage.paginationConfig.value"
            :row-key="(r: ModerationAction) => r.id"
          />
          <EmptyState
            v-else-if="!actionsLoading"
            message="No moderation actions on your content"
            description="You have no moderation actions to appeal."
          />
        </n-spin>
      </n-tab-pane>
    </n-tabs>

    <!-- File Appeal Drawer -->
    <n-drawer v-model:show="showAppealDrawer" :width="520" placement="right">
      <n-drawer-content title="File an Appeal" closable>
        <div v-if="selectedAction" class="mb-6">
          <n-card class="mb-4" size="small" style="background: #f8fafc">
            <div class="space-y-2 text-sm">
              <div class="flex gap-2 items-center">
                <span class="text-gray-500 w-28">Action Taken:</span>
                <n-tag :type="actionTypeColor[selectedAction.action]" size="small">
                  {{ selectedAction.action }}
                </n-tag>
              </div>
              <div class="flex gap-2">
                <span class="text-gray-500 w-28">Content Type:</span>
                <span>{{ selectedAction.report?.contentType ?? '—' }}</span>
              </div>
              <div class="flex gap-2">
                <span class="text-gray-500 w-28">Content ID:</span>
                <span>#{{ selectedAction.report?.contentId ?? '—' }}</span>
              </div>
              <div v-if="selectedAction.notes" class="flex gap-2">
                <span class="text-gray-500 w-28">Moderator Note:</span>
                <span class="italic text-gray-600">{{ selectedAction.notes }}</span>
              </div>
              <div class="flex gap-2">
                <span class="text-gray-500 w-28">Date:</span>
                <span>{{ new Date(selectedAction.createdAt).toLocaleString() }}</span>
              </div>
            </div>
          </n-card>

          <n-form
            ref="appealFormRef"
            :model="appealForm"
            label-placement="top"
          >
            <n-form-item
              label="Your Statement"
              path="userStatement"
              :rule="{
                required: true,
                min: 10,
                message: 'Please provide at least 10 characters explaining your appeal',
                trigger: ['input', 'blur'],
              }"
            >
              <n-input
                v-model:value="appealForm.userStatement"
                type="textarea"
                :rows="6"
                placeholder="Explain why you believe this moderation action was incorrect or unfair. Be specific and factual (min 10 characters)."
                :maxlength="5000"
                show-count
              />
            </n-form-item>
          </n-form>
        </div>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showAppealDrawer = false">Cancel</n-button>
            <n-button
              type="primary"
              :loading="appealSubmitting"
              @click="submitAppeal"
            >
              Submit Appeal
            </n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- Appeal Detail Modal -->
    <n-modal
      v-model:show="showDetailModal"
      preset="card"
      title="Appeal Details"
      style="width: 560px"
    >
      <div v-if="selectedAppeal" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="text-gray-500 text-sm">Status:</span>
          <n-tag :type="appealStatusColor[selectedAppeal.status]" size="medium">
            {{ selectedAppeal.status }}
          </n-tag>
        </div>

        <n-divider title-placement="left">Your Statement</n-divider>
        <p class="text-gray-700 whitespace-pre-wrap text-sm">{{ selectedAppeal.userStatement }}</p>

        <template v-if="selectedAppeal.status !== 'PENDING'">
          <n-divider title-placement="left">Arbitration</n-divider>
          <div class="space-y-2 text-sm">
            <div v-if="selectedAppeal.arbitrationNotes">
              <span class="font-medium text-gray-600">Notes: </span>
              <span class="text-gray-700">{{ selectedAppeal.arbitrationNotes }}</span>
            </div>
            <div v-if="selectedAppeal.outcome">
              <span class="font-medium text-gray-600">Outcome: </span>
              <span class="text-gray-700">{{ selectedAppeal.outcome }}</span>
            </div>
            <div v-if="selectedAppeal.resolvedAt">
              <span class="font-medium text-gray-600">Resolved: </span>
              <span class="text-gray-500">{{ new Date(selectedAppeal.resolvedAt).toLocaleString() }}</span>
            </div>
          </div>
        </template>

        <n-divider title-placement="left">Moderation Action</n-divider>
        <div class="text-sm space-y-1">
          <div>
            <span class="text-gray-500">Action: </span>
            <n-tag :type="actionTypeColor[selectedAppeal.moderationAction?.action ?? '']" size="small">
              {{ selectedAppeal.moderationAction?.action ?? '—' }}
            </n-tag>
          </div>
          <div v-if="selectedAppeal.moderationAction?.notes">
            <span class="text-gray-500">Note: </span>
            <span class="italic">{{ selectedAppeal.moderationAction.notes }}</span>
          </div>
          <div>
            <span class="text-gray-500">Filed on: </span>
            <span>{{ new Date(selectedAppeal.createdAt).toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, h } from 'vue';
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
  NSpin,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NModal,
  NAlert,
  NDivider,
} from 'naive-ui';
import type { DataTableColumn, FormInst } from 'naive-ui';
import { moderationApi } from '../../api/moderation';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { Appeal, ModerationAction } from '../../types';

const { successMsg, errorMsg } = useAppMessage();
const activeTab = ref('appeals');

// ─── My Appeals tab ───────────────────────────────────────────────────────────

const myAppeals = ref<Appeal[]>([]);
const appealsLoading = ref(false);
const appealStatusFilter = ref<string | null>(null);
const appealPage = usePagination(20);

const appealStatusOptions = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'In Review', value: 'IN_REVIEW' },
  { label: 'Upheld', value: 'UPHELD' },
  { label: 'Overturned', value: 'OVERTURNED' },
];

const appealStatusColor: Record<string, 'default' | 'warning' | 'error' | 'success'> = {
  PENDING: 'default',
  IN_REVIEW: 'warning',
  UPHELD: 'error',
  OVERTURNED: 'success',
};

async function loadMyAppeals() {
  appealsLoading.value = true;
  try {
    const res = await moderationApi.listMyAppeals({
      status: appealStatusFilter.value || undefined,
      page: appealPage.page.value,
      pageSize: appealPage.pageSize.value,
    });
    myAppeals.value = res.items;
    appealPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    appealsLoading.value = false;
  }
}

function onAppealFilterChange() {
  appealPage.page.value = 1;
  loadMyAppeals();
}

watch([() => appealPage.page.value, () => appealPage.pageSize.value], loadMyAppeals);

// ─── Appealable Actions tab ───────────────────────────────────────────────────

const myActions = ref<ModerationAction[]>([]);
const actionsLoading = ref(false);
const actionPage = usePagination(20);

const actionTypeColor: Record<string, 'default' | 'warning' | 'error' | 'success'> = {
  WARN: 'warning',
  HIDE: 'warning',
  REMOVE: 'error',
  RESTORE: 'success',
};

async function loadMyActions() {
  actionsLoading.value = true;
  try {
    const res = await moderationApi.listMyModerationActions({
      page: actionPage.page.value,
      pageSize: actionPage.pageSize.value,
    });
    myActions.value = res.items;
    actionPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    actionsLoading.value = false;
  }
}

watch([() => actionPage.page.value, () => actionPage.pageSize.value], loadMyActions);

// ─── File Appeal drawer ───────────────────────────────────────────────────────

const showAppealDrawer = ref(false);
const selectedAction = ref<ModerationAction | null>(null);
const appealFormRef = ref<FormInst | null>(null);
const appealSubmitting = ref(false);
const appealForm = reactive({ userStatement: '' });

function openAppealDrawer(action: ModerationAction) {
  selectedAction.value = action;
  appealForm.userStatement = '';
  showAppealDrawer.value = true;
}

async function submitAppeal() {
  try {
    await appealFormRef.value?.validate();
  } catch {
    return;
  }
  if (!selectedAction.value) return;

  appealSubmitting.value = true;
  try {
    await moderationApi.fileAppeal({
      moderationActionId: selectedAction.value.id,
      userStatement: appealForm.userStatement,
    });
    successMsg('Appeal filed successfully. An administrator will review your case.');
    showAppealDrawer.value = false;
    // Refresh both lists — the action now has an appeal, the appeals list grows
    await Promise.all([loadMyAppeals(), loadMyActions()]);
    // Switch to appeals tab so user can see their new appeal
    activeTab.value = 'appeals';
  } catch (err: any) {
    errorMsg(err);
  } finally {
    appealSubmitting.value = false;
  }
}

// ─── Appeal Detail modal ──────────────────────────────────────────────────────

const showDetailModal = ref(false);
const selectedAppeal = ref<Appeal | null>(null);

function openDetail(appeal: Appeal) {
  selectedAppeal.value = appeal;
  showDetailModal.value = true;
}

// ─── Table columns ────────────────────────────────────────────────────────────

const appealColumns = computed<DataTableColumn<Appeal>[]>(() => [
  { title: '#', key: 'id', width: 60 },
  {
    title: 'Status',
    key: 'status',
    render: (row) =>
      h(NTag, { type: appealStatusColor[row.status], size: 'small' }, { default: () => row.status }),
  },
  {
    title: 'Action',
    key: 'action',
    render: (row) =>
      h(
        NTag,
        { type: actionTypeColor[row.moderationAction?.action ?? ''] ?? 'default', size: 'small' },
        { default: () => row.moderationAction?.action ?? '—' }
      ),
  },
  {
    title: 'Content',
    key: 'content',
    render: (row) => {
      const r = row.moderationAction?.report;
      return r ? `${r.contentType} #${r.contentId}` : '—';
    },
  },
  {
    title: 'Filed',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Outcome',
    key: 'outcome',
    render: (row) => row.outcome ?? (row.status === 'PENDING' || row.status === 'IN_REVIEW' ? 'Pending…' : '—'),
  },
  {
    title: 'Details',
    key: 'details',
    render: (row) =>
      h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => 'View' }),
  },
]);

const actionColumns = computed<DataTableColumn<ModerationAction>[]>(() => [
  { title: '#', key: 'id', width: 60 },
  {
    title: 'Action',
    key: 'action',
    render: (row) =>
      h(NTag, { type: actionTypeColor[row.action], size: 'small' }, { default: () => row.action }),
  },
  {
    title: 'Content',
    key: 'content',
    render: (row) => (row.report ? `${row.report.contentType} #${row.report.contentId}` : '—'),
  },
  {
    title: 'Note',
    key: 'notes',
    render: (row) => {
      const note = row.notes ?? '—';
      return note.length > 60 ? note.slice(0, 60) + '…' : note;
    },
  },
  {
    title: 'Date',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Appeal',
    key: 'appeal',
    render: (row) => {
      // appeals filtered to current user is returned by the backend
      const existingAppeal = (row.appeals as any[])?.[0];
      if (existingAppeal) {
        return h(
          NTag,
          { type: appealStatusColor[existingAppeal.status] ?? 'default', size: 'small' },
          { default: () => `Appealed: ${existingAppeal.status}` }
        );
      }
      return h(
        NButton,
        {
          size: 'small',
          type: 'primary',
          secondary: true,
          onClick: () => openAppealDrawer(row),
        },
        { default: () => 'Appeal' }
      );
    },
  },
]);

onMounted(() => {
  loadMyAppeals();
  loadMyActions();
});
</script>
