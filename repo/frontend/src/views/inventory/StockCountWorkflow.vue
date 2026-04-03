<template>
  <div>
    <PageHeader title="Stock Counts">
      <template #actions>
        <n-button type="primary" @click="openNewCountModal">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          Start New Count
        </n-button>
      </template>
    </PageHeader>

    <n-tabs v-model:value="activeTab" type="line" animated @update:value="onTabChange">
      <n-tab-pane
        v-for="tab in statusTabs"
        :key="tab.value"
        :name="tab.value"
        :tab="tab.label"
      >
        <n-card>
          <n-spin :show="loading">
            <n-data-table
              :columns="columns"
              :data="tableData"
              :row-key="(row: StockCount) => row.id"
              :pagination="paginationConfig"
              :row-props="rowProps"
              striped
            />
            <EmptyState
              v-if="!loading && tableData.length === 0"
              message="No stock counts found"
              :description="`No ${tab.label.toLowerCase()} stock counts.`"
            />
          </n-spin>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <!-- New Count Modal -->
    <n-modal
      v-model:show="showNewCountModal"
      preset="card"
      title="Start New Stock Count"
      style="width: 420px;"
      :mask-closable="false"
    >
      <n-form
        ref="newCountFormRef"
        :model="newCountForm"
        :rules="newCountRules"
        label-placement="top"
      >
        <n-form-item label="Location" path="locationId">
          <n-select
            v-model:value="newCountForm.locationId"
            :options="locationOptions"
            placeholder="Select location"
            filterable
            clearable
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showNewCountModal = false">Cancel</n-button>
          <n-button type="primary" :loading="creatingCount" @click="submitNewCount">
            Start Count
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard, NButton, NDataTable, NTabs, NTabPane, NModal,
  NForm, NFormItem, NSelect, NSpace, NIcon, NSpin, NTag,
} from 'naive-ui'
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import type { StockCount, StockCountStatus } from '../../types'
import { inventoryApi } from '../../api/inventory'
import { useLocations } from '../../composables/useLocations'
import { usePagination } from '../../composables/usePagination'
import { useAppMessage } from '../../composables/useAppMessage'
import PageHeader from '../../components/shared/PageHeader.vue'
import EmptyState from '../../components/shared/EmptyState.vue'

const router = useRouter()
const { successMsg, errorMsg } = useAppMessage()
const { locationOptions, loadLocations } = useLocations()
const { page, pageSize, itemCount, paginationConfig } = usePagination(20)

const activeTab = ref<StockCountStatus>('DRAFT')
const loading = ref(false)
const tableData = ref<StockCount[]>([])
const showNewCountModal = ref(false)
const creatingCount = ref(false)
const newCountFormRef = ref<FormInst | null>(null)

const newCountForm = reactive<{ locationId: number | null }>({ locationId: null })

const newCountRules: FormRules = {
  locationId: [
    { required: true, type: 'number', message: 'Location is required', trigger: ['blur', 'change'] },
  ],
}

const statusTabs: { label: string; value: StockCountStatus }[] = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
]

const statusTagType: Record<StockCountStatus, 'default' | 'info' | 'success' | 'error'> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'info',
  APPROVED: 'success',
  REJECTED: 'error',
}

const statusLabel: Record<StockCountStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

const columns: DataTableColumn<StockCount>[] = [
  {
    title: '#',
    key: 'id',
    width: 60,
    render: row => `#${row.id}`,
  },
  {
    title: 'Location',
    key: 'location',
    render: row => row.location?.name ?? '-',
  },
  {
    title: 'Started',
    key: 'createdAt',
    render: row => formatDate(row.createdAt),
  },
  {
    title: 'Started By',
    key: 'initiator',
    render: row => row.initiator?.displayName ?? '-',
  },
  {
    title: 'Lines',
    key: 'lines',
    render: row => String(row.lines?.length ?? '-'),
  },
  {
    title: 'Variance %',
    key: 'variancePct',
    render: row =>
      row.variancePct !== null && row.variancePct !== undefined
        ? `${row.variancePct.toFixed(1)}%`
        : '-',
  },
  {
    title: 'Status',
    key: 'status',
    render: row =>
      h(
        NTag,
        { type: statusTagType[row.status], size: 'small' },
        { default: () => statusLabel[row.status] }
      ),
  },
]

function rowProps(row: StockCount) {
  return {
    style: 'cursor: pointer;',
    onClick: () => router.push({ name: 'StockCountDetail', params: { id: row.id } }),
  }
}

async function loadCounts() {
  try {
    loading.value = true
    const res = await inventoryApi.listStockCounts({
      status: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    tableData.value = res.items
    itemCount.value = res.total
  } catch (err: any) {
    errorMsg(err)
  } finally {
    loading.value = false
  }
}

function onTabChange() {
  page.value = 1
  loadCounts()
}

function openNewCountModal() {
  newCountForm.locationId = null
  showNewCountModal.value = true
}

function submitNewCount() {
  newCountFormRef.value?.validate(async errors => {
    if (!errors) {
      try {
        creatingCount.value = true
        const count = await inventoryApi.createStockCount({ locationId: newCountForm.locationId! })
        successMsg('Stock count created')
        showNewCountModal.value = false
        router.push({ name: 'StockCountDetail', params: { id: count.id } })
      } catch (err: any) {
        errorMsg(err)
      } finally {
        creatingCount.value = false
      }
    }
  })
}

onMounted(async () => {
  await loadLocations()
  await loadCounts()
})
</script>
