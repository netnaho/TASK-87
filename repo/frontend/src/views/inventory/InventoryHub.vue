<template>
  <div>
    <PageHeader title="Inventory">
      <template #actions>
        <n-button type="primary" @click="router.push({ name: 'Receiving' })">
          <template #icon><n-icon><ReceiptOutline /></n-icon></template>
          New Receiving
        </n-button>
        <n-button @click="router.push({ name: 'StockIssue' })">
          <template #icon><n-icon><DocumentTextOutline /></n-icon></template>
          Issue Stock
        </n-button>
        <n-button @click="router.push({ name: 'Transfer' })">
          <template #icon><n-icon><SwapHorizontalOutline /></n-icon></template>
          Transfer
        </n-button>
        <n-button @click="router.push({ name: 'StockCounts' })">
          <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
          Stock Counts
        </n-button>
        <n-button v-if="authStore.hasRole('ADMIN', 'MANAGER')" @click="router.push({ name: 'ItemMaster' })">
          Item Master
        </n-button>
      </template>
    </PageHeader>

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- Tab 1: Stock Levels -->
      <n-tab-pane name="stock" tab="Stock Levels">
        <n-card>
          <n-space style="margin-bottom: 16px;" align="center">
            <n-select
              v-model:value="filters.locationId"
              :options="locationOptions"
              placeholder="Filter by location"
              clearable
              filterable
              style="width: 200px;"
              @update:value="onFilterChange"
            />
            <n-select
              v-model:value="filters.itemId"
              :options="itemOptions"
              placeholder="Filter by item"
              clearable
              filterable
              style="width: 220px;"
              @update:value="onFilterChange"
            />
            <n-select
              v-model:value="filters.category"
              :options="categoryOptions"
              placeholder="Filter by category"
              clearable
              style="width: 180px;"
              @update:value="onFilterChange"
            />
          </n-space>

          <n-data-table
            :columns="stockColumns"
            :data="stockData"
            :loading="loadingStock"
            :pagination="paginationConfig"
            :row-key="(row: any) => row.id"
            striped
          />
          <EmptyState
            v-if="!loadingStock && stockData.length === 0"
            message="No stock levels found"
            description="Adjust your filters or receive some stock to get started."
          />
        </n-card>
      </n-tab-pane>

      <!-- Tab 2: Low-Stock Alerts -->
      <n-tab-pane name="alerts" display-directive="show">
        <template #tab>
          <n-badge :value="alertData.length" :max="99" type="error">
            Low-Stock Alerts
          </n-badge>
        </template>
        <n-card>
          <n-spin :show="loadingAlerts">
            <n-data-table
              :columns="alertColumns"
              :data="alertData"
              :row-key="(row: any) => row.id"
              striped
            />
            <EmptyState
              v-if="!loadingAlerts && alertData.length === 0"
              message="No low-stock items"
              description="All items are above their safety thresholds."
            />
          </n-spin>
        </n-card>
      </n-tab-pane>

      <!-- Tab 3: Stock Counts link -->
      <n-tab-pane name="counts" tab="Stock Counts">
        <n-card>
          <div style="max-width: 480px; margin: 32px auto; text-align: center;">
            <n-icon :size="56" style="color: #d0d0d0; margin-bottom: 16px;">
              <DocumentTextOutline />
            </n-icon>
            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #333;">
              Manage Stock Counts
            </h3>
            <p style="color: #666; margin-bottom: 24px;">
              Perform physical inventory counts, review variances, and approve adjustments.
            </p>
            <n-button type="primary" size="large" @click="router.push({ name: 'StockCounts' })">
              Go to Stock Counts
            </n-button>
          </div>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <!-- Inline threshold edit modal (per row) -->
    <ConfirmModal
      v-model:show="showThresholdConfirm"
      title="Update Safety Threshold"
      :message="`Set safety threshold to ${pendingThreshold} for this item?`"
      type="info"
      @confirm="saveThreshold"
      @cancel="showThresholdConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard, NButton, NSelect, NInputNumber, NDataTable,
  NSpace, NTag, NTabs, NTabPane, NIcon, NBadge,
  NSpin, NTooltip,
} from 'naive-ui'
import type { DataTableColumn } from 'naive-ui'
import {
  ReceiptOutline, DocumentTextOutline, SwapHorizontalOutline,
  CheckmarkOutline, SaveOutline,
} from '@vicons/ionicons5'
import type { StockLevel } from '../../types'
import { inventoryApi } from '../../api/inventory'
import { useInventoryItems } from '../../composables/useInventoryItems'
import { useLocations } from '../../composables/useLocations'
import { usePagination } from '../../composables/usePagination'
import { useAppMessage } from '../../composables/useAppMessage'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/shared/PageHeader.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import ConfirmModal from '../../components/shared/ConfirmModal.vue'

const router = useRouter()
const authStore = useAuthStore()
const { successMsg, errorMsg } = useAppMessage()
const { itemOptions, categoryOptions, loadItems, loadCategories } = useInventoryItems()
const { locationOptions, loadLocations } = useLocations()
const { page, pageSize, itemCount, paginationConfig } = usePagination(20)

const activeTab = ref('stock')
const loadingStock = ref(false)
const loadingAlerts = ref(false)
const stockData = ref<StockLevel[]>([])
const alertData = ref<StockLevel[]>([])

const filters = reactive<{
  locationId: number | null
  itemId: number | null
  category: string | null
}>({
  locationId: null,
  itemId: null,
  category: null,
})

// Threshold editing state
const thresholdEdits = reactive<Record<number, number>>({})
const savingThreshold = reactive<Record<number, boolean>>({})
const showThresholdConfirm = ref(false)
const pendingThresholdRowId = ref<number | null>(null)
const pendingThreshold = ref<number>(0)

const isManagerOrAdmin = computed(() => authStore.hasRole('ADMIN', 'MANAGER'))

function getStockThreshold(row: StockLevel): number {
  return Math.max(row.safetyThreshold, row.avgDailyUsage * 7)
}

function isLowStock(row: StockLevel): boolean {
  return row.onHand < getStockThreshold(row)
}

function openThresholdConfirm(row: StockLevel) {
  const val = thresholdEdits[row.id] ?? row.safetyThreshold
  pendingThresholdRowId.value = row.id
  pendingThreshold.value = val
  showThresholdConfirm.value = true
}

async function saveThreshold() {
  const id = pendingThresholdRowId.value
  if (id === null) return
  showThresholdConfirm.value = false
  try {
    savingThreshold[id] = true
    await inventoryApi.updateThreshold(id, { safetyThreshold: pendingThreshold.value })
    successMsg('Safety threshold updated')
    await loadStockLevels()
  } catch (err: any) {
    errorMsg(err)
  } finally {
    savingThreshold[id] = false
  }
}

const stockColumns = computed<DataTableColumn<StockLevel>[]>(() => {
  const cols: DataTableColumn<StockLevel>[] = [
    {
      title: 'Item',
      key: 'item.name',
      render: row => row.item?.name ?? '-',
    },
    {
      title: 'SKU',
      key: 'item.sku',
      render: row => row.item?.sku ?? '-',
    },
    {
      title: 'Category',
      key: 'item.category',
      render: row => row.item?.category ?? '-',
    },
    {
      title: 'Location',
      key: 'location.name',
      render: row => row.location?.name ?? '-',
    },
    {
      title: 'Lot',
      key: 'lot',
      render: row => row.lot?.lotNumber ?? '-',
    },
    {
      title: 'On Hand',
      key: 'onHand',
    },
    {
      title: 'Safety Threshold',
      key: 'safetyThreshold',
      render: row => {
        if (!isManagerOrAdmin.value) return String(row.safetyThreshold)
        return h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
          h(NInputNumber, {
            value: thresholdEdits[row.id] ?? row.safetyThreshold,
            min: 0,
            precision: 0,
            size: 'small',
            style: 'width:90px;',
            'onUpdate:value': (v: number | null) => {
              if (v !== null) thresholdEdits[row.id] = v
            },
          }),
          h(
            NTooltip,
            {},
            {
              trigger: () =>
                h(
                  NButton,
                  {
                    size: 'small',
                    type: 'primary',
                    ghost: true,
                    loading: savingThreshold[row.id] ?? false,
                    onClick: () => openThresholdConfirm(row),
                  },
                  { icon: () => h(NIcon, {}, { default: () => h(SaveOutline) }) }
                ),
              default: () => 'Save threshold',
            }
          ),
        ])
      },
    },
    {
      title: 'Avg Daily',
      key: 'avgDailyUsage',
      render: row => row.avgDailyUsage.toFixed(1),
    },
    {
      title: 'Status',
      key: 'status',
      render: row =>
        h(NTag, { type: isLowStock(row) ? 'error' : 'success', size: 'small' }, {
          default: () => isLowStock(row) ? 'Low' : 'OK',
        }),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: row =>
        h(
          NButton,
          {
            size: 'small',
            type: 'warning',
            ghost: true,
            onClick: () =>
              router.push({
                name: 'StockIssue',
                query: { itemId: row.itemId, locationId: row.locationId },
              }),
          },
          { default: () => 'Issue' }
        ),
    },
  ]
  return cols
})

const alertColumns: DataTableColumn<StockLevel>[] = [
  {
    title: 'Item',
    key: 'item.name',
    render: row => row.item?.name ?? '-',
  },
  {
    title: 'Location',
    key: 'location.name',
    render: row => row.location?.name ?? '-',
  },
  {
    title: 'On Hand',
    key: 'onHand',
  },
  {
    title: 'Threshold',
    key: 'threshold',
    render: row => String(getStockThreshold(row).toFixed(0)),
  },
  {
    title: 'Shortage',
    key: 'shortage',
    render: row => {
      const shortage = getStockThreshold(row) - row.onHand
      return h(NTag, { type: 'error', size: 'small' }, { default: () => `${shortage.toFixed(0)}` })
    },
  },
]

async function loadStockLevels() {
  try {
    loadingStock.value = true
    const params: Parameters<typeof inventoryApi.listStockLevels>[0] = {
      page: page.value,
      pageSize: pageSize.value,
    }
    if (filters.locationId !== null) params.locationId = filters.locationId
    if (filters.itemId !== null) params.itemId = filters.itemId
    const res = await inventoryApi.listStockLevels(params)

    let data = res.items
    if (filters.category) {
      data = data.filter(sl => sl.item?.category === filters.category)
    }
    stockData.value = data
    itemCount.value = res.total
  } catch (err: any) {
    errorMsg(err)
  } finally {
    loadingStock.value = false
  }
}

async function loadAlerts() {
  try {
    loadingAlerts.value = true
    alertData.value = await inventoryApi.getLowStock()
  } catch (err: any) {
    errorMsg(err)
  } finally {
    loadingAlerts.value = false
  }
}

function onFilterChange() {
  page.value = 1
  loadStockLevels()
}

watch([page, pageSize], () => {
  loadStockLevels()
})

watch(activeTab, tab => {
  if (tab === 'alerts' && alertData.value.length === 0) loadAlerts()
})

onMounted(async () => {
  await Promise.all([loadLocations(), loadItems(), loadCategories()])
  await Promise.all([loadStockLevels(), loadAlerts()])
})
</script>
