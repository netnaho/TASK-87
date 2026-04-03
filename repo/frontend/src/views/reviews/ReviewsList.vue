<template>
  <div>
    <PageHeader title="Reviews">
      <template #actions>
        <n-button
          v-if="authStore.hasRole('GUEST', 'HOST', 'FRONT_DESK')"
          type="primary"
          @click="router.push({ name: 'ReviewForm' })"
        >
          <template #icon><n-icon><AddOutline /></n-icon></template>
          Write Review
        </n-button>
      </template>
    </PageHeader>

    <n-card class="mb-4">
      <div class="flex flex-wrap gap-3">
        <n-select
          v-model:value="filters.targetType"
          :options="targetTypeOptions"
          placeholder="Type (STAY / TASK)"
          clearable
          style="width: 200px"
        />
        <n-select
          v-if="authStore.hasRole('ADMIN', 'MANAGER', 'MODERATOR')"
          v-model:value="filters.status"
          :options="statusOptions"
          placeholder="Status"
          clearable
          style="width: 180px"
        />
        <n-button @click="applyFilters">
          <template #icon><n-icon><FilterOutline /></n-icon></template>
          Apply
        </n-button>
        <n-button @click="resetFilters">Reset</n-button>
      </div>
    </n-card>

    <n-card>
      <n-data-table
        :columns="columns"
        :data="reviews"
        :loading="loading"
        :pagination="paginationConfig"
        :row-key="(row: Review) => row.id"
        :row-props="rowProps"
        striped
        scroll-x="1200"
      />
      <EmptyState v-if="!loading && reviews.length === 0" message="No reviews found." />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, h } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import {
  NCard,
  NButton,
  NSelect,
  NDataTable,
  NIcon,
  NTag,
  NText,
} from 'naive-ui';
import { AddOutline, FilterOutline, ImageOutline } from '@vicons/ionicons5';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { reviewsApi } from '../../api/reviews';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { Review } from '../../types';

const router = useRouter();
const authStore = useAuthStore();
const { successMsg, errorMsg } = useAppMessage();
const { page, pageSize, itemCount, paginationConfig } = usePagination(20);

const loading = ref(false);
const reviews = ref<Review[]>([]);

const filters = reactive({
  targetType: null as string | null,
  status: null as string | null,
});

const targetTypeOptions = [
  { label: 'Stay', value: 'STAY' },
  { label: 'Task', value: 'TASK' },
];

const statusOptions = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Flagged', value: 'FLAGGED' },
  { label: 'Hidden', value: 'HIDDEN' },
  { label: 'Removed', value: 'REMOVED' },
];

const statusColor: Record<string, 'success' | 'warning' | 'default' | 'error'> = {
  ACTIVE: 'success',
  FLAGGED: 'warning',
  HIDDEN: 'default',
  REMOVED: 'error',
};

const targetTypeColor: Record<string, 'info' | 'warning'> = {
  STAY: 'info',
  TASK: 'warning',
};

const columns = computed((): DataTableColumn<Review>[] => [
  {
    title: '#',
    key: 'id',
    width: 70,
    render: (row) => String(row.id),
  },
  {
    title: 'Type',
    key: 'targetType',
    width: 90,
    render: (row) =>
      h(
        NTag,
        { type: targetTypeColor[row.targetType] ?? 'default', size: 'small' },
        { default: () => row.targetType }
      ),
  },
  {
    title: 'Target ID',
    key: 'targetId',
    width: 90,
    render: (row) => String(row.targetId),
  },
  {
    title: 'Reviewer',
    key: 'reviewer',
    width: 140,
    render: (row) => row.reviewer?.displayName ?? '-',
  },
  {
    title: 'Overall Rating',
    key: 'overallRating',
    width: 130,
    render: (row) =>
      h(NText, {}, { default: () => `⭐ ${Number(row.overallRating).toFixed(1)}` }),
  },
  {
    title: 'Status',
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { type: statusColor[row.status] ?? 'default', size: 'small' },
        { default: () => row.status }
      ),
  },
  {
    title: 'Tags',
    key: 'tags',
    width: 200,
    render: (row) => {
      const tags = row.tags ?? [];
      if (tags.length === 0) return '-';
      const visible = tags.slice(0, 3);
      const extra = tags.length - 3;
      return h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;align-items:center' }, [
        ...visible.map((t) =>
          h(NTag, { size: 'small', key: t.id }, { default: () => t.tag.name })
        ),
        extra > 0
          ? h(NTag, { size: 'small', type: 'default' }, { default: () => `+${extra} more` })
          : null,
      ]);
    },
  },
  {
    title: 'Images',
    key: 'images',
    width: 90,
    render: (row) => {
      const count = row.images?.length ?? 0;
      if (count === 0) return '—';
      return h(
        'div',
        { style: 'display:flex;align-items:center;gap:4px' },
        [
          h(NIcon, { size: 14, component: ImageOutline }),
          h('span', {}, String(count)),
        ]
      );
    },
  },
  {
    title: 'Date',
    key: 'createdAt',
    width: 110,
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Actions',
    key: 'actions',
    width: 90,
    render: (row) =>
      h(
        NButton,
        {
          size: 'small',
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            router.push({ name: 'ReviewDetail', params: { id: row.id } });
          },
        },
        { default: () => 'View' }
      ),
  },
]);

function rowProps(row: Review) {
  return {
    style: 'cursor: pointer',
    onClick: () => {
      router.push({ name: 'ReviewDetail', params: { id: row.id } });
    },
  };
}

watch([page, pageSize], () => {
  loadReviews();
});

async function loadReviews() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filters.targetType) params.targetType = filters.targetType;
    if (filters.status) params.status = filters.status;

    const result = await reviewsApi.listReviews(params as Parameters<typeof reviewsApi.listReviews>[0]);
    reviews.value = result.items;
    itemCount.value = result.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  page.value = 1;
  loadReviews();
}

function resetFilters() {
  filters.targetType = null;
  filters.status = null;
  page.value = 1;
  loadReviews();
}

onMounted(() => {
  loadReviews();
});
</script>
