<template>
  <div>
    <PageHeader title="Ledger / Query Center">
      <template #actions>
        <n-button
          :loading="exporting"
          :disabled="exporting"
          @click="exportLedger('csv')"
        >
          <template #icon><n-icon><DownloadOutline /></n-icon></template>
          Export CSV
        </n-button>
        <n-button
          type="primary"
          :loading="exporting"
          :disabled="exporting"
          @click="exportLedger('excel')"
        >
          <template #icon><n-icon><DownloadOutline /></n-icon></template>
          Export Excel
        </n-button>
      </template>
    </PageHeader>

    <n-card class="mb-4">
      <!-- ─── Filters grid ──────────────────────────────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <n-date-picker
          v-model:value="dateRange"
          type="daterange"
          clearable
          placeholder="Date range"
          class="w-full"
        />
        <n-select
          v-model:value="filters.movementType"
          :options="movementTypeOptions"
          placeholder="Movement Type"
          clearable
        />
        <n-select
          v-model:value="filters.itemId"
          :options="itemOptions"
          placeholder="Item"
          clearable
          filterable
        />
        <n-select
          v-model:value="filters.locationId"
          :options="locationOptions"
          placeholder="Location"
          clearable
          filterable
        />
        <n-select
          v-model:value="filters.vendorId"
          :options="vendorOptions"
          placeholder="Vendor"
          clearable
          filterable
        />
        <!-- Lot filter — drives lotId query param -->
        <n-select
          v-model:value="filters.lotId"
          :options="lotOptions"
          placeholder="Lot"
          clearable
          filterable
        />
        <n-select
          v-model:value="filters.sortField"
          :options="sortFieldOptions"
          placeholder="Sort Field"
          clearable
        />
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500 whitespace-nowrap">Sort:</span>
          <n-radio-group v-model:value="filters.sortDir" size="small">
            <n-radio value="asc">Asc</n-radio>
            <n-radio value="desc">Desc</n-radio>
          </n-radio-group>
        </div>
      </div>

      <!-- ─── Column visibility selector ──────────────────────────── -->
      <div class="flex items-center gap-3 mt-3">
        <span class="text-sm text-gray-500 whitespace-nowrap">Columns:</span>
        <n-select
          v-model:value="visibleColumnKeys"
          :options="columnOptions"
          multiple
          placeholder="Select visible columns"
          style="min-width: 280px"
        />
      </div>

      <div class="flex justify-end gap-2 mt-3">
        <n-button @click="resetFilters">Reset</n-button>
        <n-button type="primary" @click="applyFilters">
          <template #icon><n-icon><FilterOutline /></n-icon></template>
          Apply Filters
        </n-button>
      </div>
    </n-card>

    <n-card>
      <n-data-table
        :columns="visibleColumns"
        :data="ledgerData"
        :loading="loading"
        :pagination="paginationConfig"
        :row-key="(row: LedgerEntry) => row.id"
        striped
        scroll-x="1400"
      />
      <EmptyState v-if="!loading && ledgerData.length === 0" message="No ledger entries found." />
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
  NDatePicker,
  NDataTable,
  NIcon,
  NTag,
  NRadioGroup,
  NRadio,
  NTooltip,
  NText,
} from 'naive-ui';
import {
  DownloadOutline,
  FilterOutline,
} from '@vicons/ionicons5';
import apiClient from '../../api/client';
import { inventoryApi } from '../../api/inventory';
import { useLocations } from '../../composables/useLocations';
import { useInventoryItems } from '../../composables/useInventoryItems';
import { useVendors } from '../../composables/useVendors';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { LedgerEntry, Lot } from '../../types';

const { successMsg, errorMsg } = useAppMessage();
const { locationOptions, loadLocations } = useLocations();
const { itemOptions, loadItems } = useInventoryItems();
const { vendorOptions, loadVendors } = useVendors();
const { page, pageSize, itemCount, paginationConfig } = usePagination(20);

const loading = ref(false);
const exporting = ref(false);
const ledgerData = ref<LedgerEntry[]>([]);
const dateRange = ref<[number, number] | null>(null);

// ─── Lot data ─────────────────────────────────────────────────────
const lots = ref<Lot[]>([]);
const lotOptions = computed(() =>
  lots.value.map((l) => ({
    label: l.item?.name ? `${l.lotNumber} — ${l.item.name}` : l.lotNumber,
    value: l.id,
  }))
);

async function loadLots() {
  try {
    lots.value = await inventoryApi.listLots();
  } catch {
    // non-critical; lot filter just shows empty if this fails
  }
}

// ─── Filters ──────────────────────────────────────────────────────
const filters = reactive({
  movementType: null as string | null,
  itemId: null as number | null,
  locationId: null as number | null,
  vendorId: null as number | null,
  lotId: null as number | null,
  sortField: null as string | null,
  sortDir: 'desc' as 'asc' | 'desc',
  startDate: undefined as string | undefined,
  endDate: undefined as string | undefined,
});

const movementTypeOptions = [
  { label: 'Receiving', value: 'RECEIVING' },
  { label: 'Issue', value: 'ISSUE' },
  { label: 'Transfer', value: 'TRANSFER' },
  { label: 'Stock Count', value: 'STOCK_COUNT' },
  { label: 'Adjustment', value: 'ADJUSTMENT' },
];

const sortFieldOptions = [
  { label: 'Date', value: 'createdAt' },
  { label: 'Quantity', value: 'quantity' },
  { label: 'Reference #', value: 'referenceNumber' },
];

const movementTypeColor: Record<string, 'success' | 'warning' | 'info' | 'default' | 'error'> = {
  RECEIVING: 'success',
  ISSUE: 'warning',
  TRANSFER: 'info',
  STOCK_COUNT: 'default',
  ADJUSTMENT: 'error',
};

// ─── Column visibility ────────────────────────────────────────────
const STORAGE_KEY = 'harborops:ledger:visibleColumns';

type ColumnKey =
  | 'referenceNumber'
  | 'createdAt'
  | 'movementType'
  | 'item'
  | 'fromLocation'
  | 'toLocation'
  | 'quantity'
  | 'unitCostUsd'
  | 'vendor'
  | 'lot'
  | 'performer'
  | 'notes';

const ALL_COLUMN_KEYS: ColumnKey[] = [
  'referenceNumber',
  'createdAt',
  'movementType',
  'item',
  'fromLocation',
  'toLocation',
  'quantity',
  'unitCostUsd',
  'vendor',
  'lot',
  'performer',
  'notes',
];

const columnLabels: Record<ColumnKey, string> = {
  referenceNumber: 'Reference #',
  createdAt: 'Date',
  movementType: 'Type',
  item: 'Item',
  fromLocation: 'From Location',
  toLocation: 'To Location',
  quantity: 'Qty',
  unitCostUsd: 'Unit Cost',
  vendor: 'Vendor',
  lot: 'Lot',
  performer: 'Performed By',
  notes: 'Notes',
};

/** Load from localStorage, falling back to all columns. */
function loadColumnPrefs(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((k): k is ColumnKey => ALL_COLUMN_KEYS.includes(k as ColumnKey));
        if (valid.length > 0) return valid;
      }
    }
  } catch { /* ignore parse errors */ }
  return [...ALL_COLUMN_KEYS];
}

const visibleColumnKeys = ref<ColumnKey[]>(loadColumnPrefs());

// Persist whenever the selection changes.
watch(visibleColumnKeys, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
});

const columnOptions = ALL_COLUMN_KEYS.map((k) => ({
  label: columnLabels[k],
  value: k,
}));

// ─── All column definitions ──────────────────────────────────────
const allColumnDefs: DataTableColumn<LedgerEntry>[] = [
  {
    title: 'Reference #',
    key: 'referenceNumber',
    width: 130,
    render: (row) => row.referenceNumber,
  },
  {
    title: 'Date',
    key: 'createdAt',
    width: 110,
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'Type',
    key: 'movementType',
    width: 130,
    render: (row) =>
      h(
        NTag,
        { type: movementTypeColor[row.movementType] ?? 'default', size: 'small' },
        { default: () => row.movementType }
      ),
  },
  {
    title: 'Item',
    key: 'item',
    width: 160,
    render: (row) => row.item?.name ?? '-',
  },
  {
    title: 'From Location',
    key: 'fromLocation',
    width: 140,
    render: (row) => row.fromLocation?.name ?? '-',
  },
  {
    title: 'To Location',
    key: 'toLocation',
    width: 140,
    render: (row) => row.toLocation?.name ?? '-',
  },
  {
    title: 'Qty',
    key: 'quantity',
    width: 80,
    render: (row) => String(row.quantity),
  },
  {
    title: 'Unit Cost',
    key: 'unitCostUsd',
    width: 100,
    render: (row) =>
      row.unitCostUsd != null ? `$${Number(row.unitCostUsd).toFixed(2)}` : '-',
  },
  {
    title: 'Vendor',
    key: 'vendor',
    width: 130,
    render: (row) => row.vendor?.name ?? '-',
  },
  {
    title: 'Lot',
    key: 'lot',
    width: 110,
    render: (row) => row.lot?.lotNumber ?? '-',
  },
  {
    title: 'Performed By',
    key: 'performer',
    width: 130,
    render: (row) => row.performer?.displayName ?? '-',
  },
  {
    title: 'Notes',
    key: 'notes',
    width: 160,
    render: (row) => {
      const notes = row.notes ?? '-';
      if (notes.length <= 40) return notes;
      return h(
        NTooltip,
        {},
        {
          trigger: () =>
            h(NText, { style: 'cursor: default' }, { default: () => notes.slice(0, 40) + '…' }),
          default: () => notes,
        }
      );
    },
  },
];

/** Columns visible to the user based on their current preference. */
const visibleColumns = computed(() =>
  allColumnDefs.filter((col) => visibleColumnKeys.value.includes((col as { key?: ColumnKey }).key as ColumnKey))
);

// ─── Watchers ─────────────────────────────────────────────────────
watch([page, pageSize], () => {
  loadLedger();
});

watch(dateRange, (val) => {
  if (val) {
    filters.startDate = new Date(val[0]).toISOString();
    filters.endDate = new Date(val[1]).toISOString();
  } else {
    filters.startDate = undefined;
    filters.endDate = undefined;
  }
});

// ─── Data loading ─────────────────────────────────────────────────
async function loadLedger() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filters.movementType) params.movementType = filters.movementType;
    if (filters.itemId != null) params.itemId = filters.itemId;
    if (filters.locationId != null) params.locationId = filters.locationId;
    if (filters.vendorId != null) params.vendorId = filters.vendorId;
    if (filters.lotId != null) params.lotId = filters.lotId;
    if (filters.sortField) params.sortField = filters.sortField;
    if (filters.sortDir) params.sortDir = filters.sortDir;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;

    const result = await inventoryApi.getLedger(params as Parameters<typeof inventoryApi.getLedger>[0]);
    ledgerData.value = result.items;
    itemCount.value = result.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  page.value = 1;
  loadLedger();
}

function resetFilters() {
  dateRange.value = null;
  filters.movementType = null;
  filters.itemId = null;
  filters.locationId = null;
  filters.vendorId = null;
  filters.lotId = null;
  filters.sortField = null;
  filters.sortDir = 'desc';
  filters.startDate = undefined;
  filters.endDate = undefined;
  page.value = 1;
  loadLedger();
}

async function exportLedger(format: 'csv' | 'excel') {
  exporting.value = true;
  try {
    const params: Record<string, unknown> = { format };
    if (filters.movementType) params.movementType = filters.movementType;
    if (filters.itemId != null) params.itemId = filters.itemId;
    if (filters.locationId != null) params.locationId = filters.locationId;
    if (filters.vendorId != null) params.vendorId = filters.vendorId;
    if (filters.lotId != null) params.lotId = filters.lotId;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;

    const res = await apiClient.get('/inventory/ledger/export', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'csv' ? 'csv' : 'xlsx';
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    errorMsg(err);
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadLocations(), loadItems(), loadVendors(), loadLots()]);
  await loadLedger();
});
</script>
