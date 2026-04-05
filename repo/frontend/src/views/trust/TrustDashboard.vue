<template>
  <div class="p-6">
    <PageHeader title="Trust & Credit" />

    <!-- Score Section -->
    <n-grid :cols="3" :x-gap="16" :y-gap="16" class="mb-6" responsive="screen" :collapsed-rows="1">
      <n-grid-item :span="1">
        <n-card title="Your Trust Score">
          <n-spin :show="scoreLoading">
            <div class="flex flex-col items-center gap-4 py-4">
              <TrustScoreGauge
                v-if="myScore"
                :score="myScore.score"
                size="large"
              />
              <div v-if="myScore" class="text-center">
                <p class="text-3xl font-bold text-gray-900">{{ myScore.score.toFixed(0) }}</p>
                <p class="text-sm text-gray-500 mt-1">
                  Last updated: {{ myScore.lastUpdated ? new Date(myScore.lastUpdated).toLocaleDateString() : '—' }}
                </p>
              </div>
            </div>
          </n-spin>
        </n-card>
      </n-grid-item>

      <!-- View Another User (ADMIN/MANAGER) -->
      <n-grid-item
        v-if="authStore.hasRole('ADMIN', 'MANAGER')"
        :span="2"
      >
        <n-card title="View Another User's Score">
          <n-space vertical>
            <n-select
              v-model:value="selectedUserId"
              :options="userOptions"
              placeholder="Select a user..."
              filterable
              clearable
              style="width: 100%"
              @update:value="loadUserScore"
            />
            <div v-if="viewedScore" class="flex flex-col items-center gap-3 py-4">
              <TrustScoreGauge :score="viewedScore.score" size="large" />
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">{{ viewedScore.score.toFixed(0) }}</p>
                <p class="text-sm text-gray-500 mt-1">
                  Last updated: {{ viewedScore.lastUpdated ? new Date(viewedScore.lastUpdated).toLocaleDateString() : '—' }}
                </p>
              </div>
            </div>
            <n-spin v-if="userScoreLoading" :show="true" class="py-8" />
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>

    <!-- Rate Completed Task -->
    <n-card title="Rate a Completed Task" class="mb-6">
      <n-form
        ref="rateFormRef"
        :model="rateForm"
        :rules="rateRules"
        label-placement="top"
      >
        <n-grid :cols="2" :x-gap="16">
          <n-grid-item>
            <n-form-item label="Interaction ID (Task ID)" path="taskId">
              <n-input-number
                v-model:value="rateForm.taskId"
                placeholder="Enter the interaction ID"
                :min="1"
                style="width: 100%"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="Ratee User ID" path="rateeId">
              <n-input-number
                v-model:value="rateForm.rateeId"
                placeholder="ID of the user you are rating"
                :min="1"
                style="width: 100%"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>

        <n-form-item label="Rating" path="rating">
          <n-rate
            v-model:value="rateForm.rating"
            :count="5"
            :allow-half="false"
            size="large"
          />
          <n-text v-if="rateForm.rating > 0" depth="3" class="ml-3">
            {{ ratingLabels[rateForm.rating - 1] }}
          </n-text>
        </n-form-item>

        <n-form-item label="Comment (optional)" path="comment">
          <n-input
            v-model:value="rateForm.comment"
            type="textarea"
            :rows="2"
            :maxlength="500"
            show-count
            placeholder="Optional comment about this interaction..."
          />
        </n-form-item>

        <n-button
          type="primary"
          :loading="rateSubmitting"
          :disabled="rateSubmitting"
          @click="submitRate"
        >
          Submit Rating
        </n-button>
      </n-form>

      <!-- Success impact panel -->
      <n-alert
        v-if="rateResult"
        type="success"
        class="mt-4"
        :title="rateResult.delta > 0 ? `+${rateResult.delta} trust credit awarded` : rateResult.delta < 0 ? `${rateResult.delta} trust credit deducted` : 'Rating recorded — no credit change'"
      >
        <p class="text-sm mt-1">{{ rateResult.explanation }}</p>
      </n-alert>
    </n-card>

    <!-- ADMIN Manual Adjustment -->
    <n-card
      v-if="authStore.hasRole('ADMIN')"
      title="Manual Trust Adjustment"
      class="mb-6"
    >
      <n-form
        ref="adjustFormRef"
        :model="adjustForm"
        :rules="adjustRules"
        label-placement="top"
      >
        <n-grid :cols="3" :x-gap="16">
          <n-grid-item>
            <n-form-item label="User ID" path="userId">
              <n-input-number
                v-model:value="adjustForm.userId"
                placeholder="User ID"
                style="width: 100%"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="Change Amount" path="changeAmount">
              <n-input-number
                v-model:value="adjustForm.changeAmount"
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
        <n-button
          type="primary"
          :loading="adjustSubmitting"
          @click="submitAdjust"
        >
          Apply Adjustment
        </n-button>
      </n-form>
    </n-card>

    <!-- Credit History -->
    <n-card title="Credit History">
      <n-spin :show="historyLoading">
        <n-data-table
          v-if="creditHistory.length > 0"
          :columns="historyColumns"
          :data="creditHistory"
          :pagination="historyPage.paginationConfig.value"
          :row-key="(r: CreditHistory) => r.id"
        />
        <EmptyState v-else-if="!historyLoading" message="No credit history yet" />
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, h } from 'vue';
import {
  NCard,
  NGrid,
  NGridItem,
  NButton,
  NSelect,
  NInput,
  NInputNumber,
  NForm,
  NFormItem,
  NSpace,
  NSpin,
  NDataTable,
  NText,
  NRate,
  NAlert,
} from 'naive-ui';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { trustApi } from '../../api/trust';
import { usersApi } from '../../api/users';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import { useAuthStore } from '../../stores/auth';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TrustScoreGauge from '../../components/shared/TrustScoreGauge.vue';
import type { TrustScore, CreditHistory, User } from '../../types';

const authStore = useAuthStore();
const { successMsg, errorMsg } = useAppMessage();

// ─── My Score ─────────────────────────────────────────────────────────────────
const myScore = ref<TrustScore | null>(null);
const scoreLoading = ref(false);

async function loadMyScore() {
  scoreLoading.value = true;
  try {
    myScore.value = await trustApi.getMyScore();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    scoreLoading.value = false;
  }
}

// ─── View Another User ────────────────────────────────────────────────────────
const userOptions = ref<{ label: string; value: number }[]>([]);
const selectedUserId = ref<number | null>(null);
const viewedScore = ref<TrustScore | null>(null);
const userScoreLoading = ref(false);

async function loadUserOptions() {
  if (!authStore.hasRole('ADMIN', 'MANAGER')) return;
  try {
    const res = await usersApi.listUsers({ pageSize: 200 });
    userOptions.value = res.items.map((u: User) => ({
      label: u.displayName,
      value: u.id,
    }));
  } catch (err: any) {
    errorMsg(err);
  }
}

async function loadUserScore(userId: number | null) {
  if (!userId) {
    viewedScore.value = null;
    return;
  }
  userScoreLoading.value = true;
  try {
    viewedScore.value = await trustApi.getUserScore(userId);
  } catch (err: any) {
    errorMsg(err);
  } finally {
    userScoreLoading.value = false;
  }
}

// ─── Rate Task ────────────────────────────────────────────────────────────────
const rateFormRef = ref<FormInst | null>(null);
const rateSubmitting = ref(false);
const rateResult = ref<{ delta: number; explanation: string } | null>(null);
const ratingLabels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

const rateForm = reactive<{
  taskId: number | null;
  rateeId: number | null;
  rating: number;
  comment: string;
}>({
  taskId: null,
  rateeId: null,
  rating: 0,
  comment: '',
});

const rateRules: FormRules = {
  taskId: [{ required: true, type: 'number', min: 1, message: 'Interaction ID is required', trigger: 'change' }],
  rateeId: [{ required: true, type: 'number', min: 1, message: 'Ratee user ID is required', trigger: 'change' }],
  rating: [{ required: true, type: 'number', min: 1, message: 'A rating of 1–5 is required', trigger: 'change' }],
};

async function submitRate() {
  try {
    await rateFormRef.value?.validate();
  } catch {
    return;
  }
  rateSubmitting.value = true;
  rateResult.value = null;
  try {
    const res = await trustApi.rateTask({
      taskId: rateForm.taskId!,
      rateeId: rateForm.rateeId!,
      rating: rateForm.rating,
      comment: rateForm.comment || undefined,
    });
    rateResult.value = { delta: res.delta, explanation: res.explanation };
    rateForm.taskId = null;
    rateForm.rateeId = null;
    rateForm.rating = 0;
    rateForm.comment = '';
    await loadMyScore();
    await loadHistory();
  } catch (err: any) {
    const code = err?.response?.data?.error?.code;
    if (code === 'DUPLICATE') {
      errorMsg('You have already rated this interaction.');
    } else if (code === 'NOT_PARTICIPANT') {
      errorMsg('You must be a participant of this interaction to rate it.');
    } else if (code === 'INTERACTION_NOT_COMPLETED') {
      errorMsg('Only completed interactions can be rated.');
    } else if (code === 'INTERACTION_NOT_FOUND') {
      errorMsg('Interaction not found. Please check the ID.');
    } else if (code === 'SELF_RATING') {
      errorMsg('You cannot rate yourself.');
    } else {
      errorMsg(err);
    }
  } finally {
    rateSubmitting.value = false;
  }
}

// ─── Manual Adjustment ────────────────────────────────────────────────────────
const adjustFormRef = ref<FormInst | null>(null);
const adjustSubmitting = ref(false);
const adjustForm = reactive<{
  userId: number | null;
  changeAmount: number | null;
  reason: string;
}>({
  userId: null,
  changeAmount: null,
  reason: '',
});

const adjustRules: FormRules = {
  userId: [{ required: true, type: 'number', message: 'User ID is required', trigger: 'change' }],
  changeAmount: [
    { required: true, type: 'number', message: 'Change amount is required', trigger: 'change' },
  ],
  reason: [{ required: true, message: 'Reason is required', trigger: 'blur' }],
};

async function submitAdjust() {
  try {
    await adjustFormRef.value?.validate();
  } catch {
    return;
  }
  adjustSubmitting.value = true;
  try {
    const result = await trustApi.adminAdjust({
      userId: adjustForm.userId!,
      changeAmount: adjustForm.changeAmount!,
      reason: adjustForm.reason,
    });
    successMsg(
      `Score adjusted: ${result.previousScore} → ${result.newScore}`
    );
    adjustForm.userId = null;
    adjustForm.changeAmount = null;
    adjustForm.reason = '';
    await loadMyScore();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    adjustSubmitting.value = false;
  }
}

// ─── Credit History ───────────────────────────────────────────────────────────
const creditHistory = ref<CreditHistory[]>([]);
const historyLoading = ref(false);
const historyPage = usePagination(10);

async function loadHistory() {
  historyLoading.value = true;
  try {
    const res = await trustApi.getMyHistory({
      page: historyPage.page.value,
      pageSize: historyPage.pageSize.value,
    });
    creditHistory.value = res.items;
    historyPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    historyLoading.value = false;
  }
}

watch([() => historyPage.page.value, () => historyPage.pageSize.value], loadHistory);

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
        { class: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700' },
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
  { title: 'Reason', key: 'reason' },
];

onMounted(() => {
  loadMyScore();
  loadHistory();
  loadUserOptions();
});
</script>
