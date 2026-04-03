<template>
  <div>
    <PageHeader :title="`Stock Count #${countId}`" back-route="StockCounts">
      <template #actions>
        <n-tag :type="statusTagType[stockCount?.status ?? 'DRAFT']" size="medium">
          {{ statusLabel[stockCount?.status ?? 'DRAFT'] }}
        </n-tag>
      </template>
    </PageHeader>

    <n-spin :show="loading">
      <template v-if="stockCount">
        <!-- Info bar -->
        <n-card style="margin-bottom: 16px;">
          <n-descriptions :column="3" size="small">
            <n-descriptions-item label="Location">
              {{ stockCount.location?.name ?? '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="Started By">
              {{ stockCount.initiator?.displayName ?? '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="Created">
              {{ formatDate(stockCount.createdAt) }}
            </n-descriptions-item>
            <n-descriptions-item v-if="stockCount.completedAt" label="Completed">
              {{ formatDate(stockCount.completedAt) }}
            </n-descriptions-item>
            <n-descriptions-item v-if="stockCount.variancePct !== null && stockCount.variancePct !== undefined" label="Variance %">
              {{ stockCount.variancePct.toFixed(2) }}%
            </n-descriptions-item>
            <n-descriptions-item v-if="stockCount.varianceUsd !== null && stockCount.varianceUsd !== undefined" label="Variance USD">
              ${{ stockCount.varianceUsd.toFixed(2) }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- Pending Approval alert + actions -->
        <n-alert
          v-if="stockCount.status === 'PENDING_APPROVAL'"
          type="info"
          :bordered="false"
          style="margin-bottom: 12px;"
        >
          <template #header>This stock count is pending approval.</template>
          Review the variance data below and approve or reject as needed.
        </n-alert>
        <n-space v-if="stockCount.status === 'PENDING_APPROVAL' && isManagerOrAdmin" style="margin-bottom: 16px;">
          <n-button
            type="success"
            size="small"
            :loading="approvingCount"
            @click="approveCount"
          >
            <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
            Approve
          </n-button>
          <n-button
            type="error"
            size="small"
            ghost
            :loading="rejectingCount"
            @click="rejectCount"
          >
            <template #icon><n-icon><CloseOutline /></n-icon></template>
            Reject
          </n-button>
        </n-space>

        <n-alert
          v-if="stockCount.status === 'APPROVED'"
          type="success"
          :bordered="false"
          style="margin-bottom: 16px;"
        >
          This stock count has been approved and inventory adjustments have been applied.
        </n-alert>

        <n-alert
          v-if="stockCount.status === 'REJECTED'"
          type="error"
          :bordered="false"
          style="margin-bottom: 16px;"
        >
          This stock count was rejected. Please start a new count.
        </n-alert>

        <!-- Lines table -->
        <n-card>
          <template #header>
            <n-space align="center" justify="space-between">
              <span>Count Lines</span>
              <n-space v-if="stockCount.status === 'DRAFT'">
                <n-button
                  :loading="savingLines"
                  :disabled="Object.keys(changedLines).length === 0"
                  @click="saveLines"
                >
                  <template #icon><n-icon><SaveOutline /></n-icon></template>
                  Save Lines
                </n-button>
                <n-button
                  type="primary"
                  :loading="finalizing"
                  @click="confirmFinalize = true"
                >
                  <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
                  Finalize Count
                </n-button>
              </n-space>
            </n-space>
          </template>

          <n-data-table
            :columns="lineColumns"
            :data="stockCount.lines ?? []"
            :row-key="(row: StockCountLine) => row.id"
            striped
          />

          <EmptyState
            v-if="(stockCount.lines ?? []).length === 0"
            message="No count lines"
            description="Lines will appear here once the count is initiated."
          />
        </n-card>
      </template>

      <EmptyState
        v-else-if="!loading"
        message="Stock count not found"
        description="The requested stock count could not be found."
      />
    </n-spin>

    <!-- Finalize confirmation -->
    <ConfirmModal
      v-model:show="confirmFinalize"
      title="Finalize Stock Count"
      message="Finalizing will submit this count for approval. You will no longer be able to edit line quantities. Continue?"
      type="warning"
      @confirm="finalizeCount"
      @cancel="confirmFinalize = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useRoute } from 'vue-router'
import {
  NCard, NButton, NDataTable, NSpace, NIcon, NSpin,
  NTag, NAlert, NDescriptions, NDescriptionsItem, NInputNumber,
} from 'naive-ui'
import type { DataTableColumn } from 'naive-ui'
import { CheckmarkOutline, CloseOutline, SaveOutline } from '@vicons/ionicons5'
import type { StockCount, StockCountLine, StockCountStatus } from '../../types'
import { inventoryApi } from '../../api/inventory'
import { useAppMessage } from '../../composables/useAppMessage'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/shared/PageHeader.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import ConfirmModal from '../../components/shared/ConfirmModal.vue'

const route = useRoute()
const { successMsg, errorMsg } = useAppMessage()
const authStore = useAuthStore()

const countId = Number(route.params.id)
const loading = ref(false)
const stockCount = ref<StockCount | null>(null)
const savingLines = ref(false)
const finalizing = ref(false)
const approvingCount = ref(false)
const rejectingCount = ref(false)
const confirmFinalize = ref(false)

// lineId → new countedQty
const changedLines = reactive<Record<number, number>>({})

const isManagerOrAdmin = computed(() => authStore.hasRole('ADMIN', 'MANAGER'))

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

const lineColumns = computed<DataTableColumn<StockCountLine>[]>(() => {
  const isDraft = stockCount.value?.status === 'DRAFT'
  return [
    {
      title: 'Item',
      key: 'item',
      render: row => row.item?.name ?? '-',
    },
    {
      title: 'Lot',
      key: 'lot',
      render: row => row.lot?.lotNumber ?? '-',
    },
    {
      title: 'System Qty',
      key: 'systemQty',
    },
    {
      title: 'Counted Qty',
      key: 'countedQty',
      render: row => {
        if (!isDraft) return String(row.countedQty)
        return h(NInputNumber, {
          value: changedLines[row.id] ?? row.countedQty,
          min: 0,
          precision: 0,
          size: 'small',
          style: 'width: 100px;',
          'onUpdate:value': (v: number | null) => {
            if (v !== null) changedLines[row.id] = v
          },
        })
      },
    },
    {
      title: 'Variance Qty',
      key: 'varianceQty',
      render: row => {
        const counted = changedLines[row.id] ?? row.countedQty
        const variance = isDraft ? counted - row.systemQty : row.varianceQty
        const color = variance < 0 ? '#d03050' : variance > 0 ? '#2080f0' : '#333'
        return h('span', { style: `color: ${color}; font-weight: 500;` }, String(variance))
      },
    },
    {
      title: 'Variance %',
      key: 'variancePct',
      render: row => {
        if (row.variancePct !== null && row.variancePct !== undefined) {
          return `${row.variancePct.toFixed(1)}%`
        }
        if (isDraft && row.systemQty > 0) {
          const counted = changedLines[row.id] ?? row.countedQty
          const pct = ((counted - row.systemQty) / row.systemQty) * 100
          return `${pct.toFixed(1)}%`
        }
        return '-'
      },
    },
    {
      title: 'Variance USD',
      key: 'varianceUsd',
      render: row =>
        row.varianceUsd !== null && row.varianceUsd !== undefined
          ? `$${row.varianceUsd.toFixed(2)}`
          : '-',
    },
  ]
})

async function loadStockCount() {
  try {
    loading.value = true
    const res = await inventoryApi.listStockCounts({ page: 1, pageSize: 200 })
    const found = res.items.find(c => c.id === countId)
    stockCount.value = found ?? null
  } catch (err: any) {
    errorMsg(err)
  } finally {
    loading.value = false
  }
}

async function saveLines() {
  const lines = Object.entries(changedLines).map(([lineId, countedQty]) => ({
    lineId: Number(lineId),
    countedQty,
  }))
  if (lines.length === 0) return
  try {
    savingLines.value = true
    const updated = await inventoryApi.updateStockCountLines(countId, { lines })
    stockCount.value = updated
    // clear dirty state
    Object.keys(changedLines).forEach(k => delete changedLines[Number(k)])
    successMsg('Lines saved successfully')
  } catch (err: any) {
    errorMsg(err)
  } finally {
    savingLines.value = false
  }
}

async function finalizeCount() {
  confirmFinalize.value = false
  try {
    finalizing.value = true
    const updated = await inventoryApi.finalizeStockCount(countId)
    stockCount.value = updated
    successMsg('Stock count finalized and submitted for approval')
  } catch (err: any) {
    errorMsg(err)
  } finally {
    finalizing.value = false
  }
}

async function approveCount() {
  try {
    approvingCount.value = true
    const updated = await inventoryApi.approveStockCount(countId)
    stockCount.value = updated
    successMsg('Stock count approved')
  } catch (err: any) {
    errorMsg(err)
  } finally {
    approvingCount.value = false
  }
}

async function rejectCount() {
  try {
    rejectingCount.value = true
    const updated = await inventoryApi.rejectStockCount(countId)
    stockCount.value = updated
    successMsg('Stock count rejected')
  } catch (err: any) {
    errorMsg(err)
  } finally {
    rejectingCount.value = false
  }
}

onMounted(() => {
  loadStockCount()
})
</script>
