<template>
  <div class="p-6">
    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ─── Tab 1: Promotions ────────────────────────────────────────────── -->
      <n-tab-pane name="promotions" tab="Promotions">
        <PageHeader title="Promotions">
          <template #actions>
            <n-button type="primary" @click="openCreate">Create Promotion</n-button>
          </template>
        </PageHeader>

        <n-card class="mb-4">
          <n-space>
            <n-select
              v-model:value="activeFilter"
              placeholder="Filter by status"
              clearable
              :options="activeFilterOptions"
              style="width: 200px"
              @update:value="onFilterChange"
            />
          </n-space>
        </n-card>

        <n-spin :show="loading">
          <n-data-table
            v-if="promotions.length > 0"
            :columns="promoColumns"
            :data="promotions"
            :pagination="promoPage.paginationConfig.value"
            :row-key="(r: Promotion) => r.id"
          />
          <EmptyState v-else-if="!loading" message="No promotions found" description="Create your first promotion." />
        </n-spin>
      </n-tab-pane>

      <!-- ─── Tab 2: Checkout Simulator ──────────────────────────────────── -->
      <n-tab-pane name="simulator" tab="Checkout Simulator">
        <PageHeader title="Checkout Simulator" subtitle="Simulate promotion discounts on items to test your rules." />

        <n-card class="mb-4" title="Add Items">
          <n-space align="end">
            <n-form-item label="Item" style="margin-bottom:0">
              <n-select
                v-model:value="checkoutItemId"
                :options="inventoryOptions"
                placeholder="Select item"
                filterable
                style="width: 280px"
              />
            </n-form-item>
            <n-form-item label="Quantity" style="margin-bottom:0">
              <n-input-number
                v-model:value="checkoutQty"
                :min="1"
                style="width: 120px"
              />
            </n-form-item>
            <n-button type="primary" @click="addCheckoutItem">Add</n-button>
          </n-space>
        </n-card>

        <n-card v-if="checkoutItems.length > 0" class="mb-4" title="Items to Check Out">
          <n-data-table
            :columns="checkoutItemCols"
            :data="checkoutItems"
            :pagination="false"
            :row-key="(r: CheckoutItem) => r.itemId"
          />
          <n-space class="mt-4" justify="end">
            <n-button
              type="primary"
              :loading="checkoutLoading"
              @click="runCheckout"
            >
              Calculate Promotions
            </n-button>
          </n-space>
        </n-card>

        <n-card v-if="checkoutResult" title="Checkout Result">
          <div class="space-y-3">
            <div
              v-for="line in checkoutResult.lines"
              :key="line.itemId"
              class="p-3 rounded border border-gray-200"
            >
              <div class="flex justify-between items-start">
                <div>
                  <p class="font-semibold text-gray-800">{{ getItemName(line.itemId) }}</p>
                  <p v-if="line.promotionName" class="text-xs text-green-600 mt-0.5">
                    Promo: {{ line.promotionName }}
                  </p>
                  <p v-if="line.discountExplanation" class="text-xs text-gray-400 mt-0.5">
                    {{ line.discountExplanation }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm text-gray-500 line-through">${{ line.originalTotal.toFixed(2) }}</p>
                  <p v-if="line.discountAmount > 0" class="text-sm text-green-600 font-medium">
                    -${{ line.discountAmount.toFixed(2) }}
                  </p>
                  <p class="text-base font-bold text-gray-900">${{ line.finalTotal.toFixed(2) }}</p>
                </div>
              </div>
            </div>
          </div>
          <n-divider />
          <div class="flex flex-col items-end gap-1">
            <div class="flex gap-8 text-sm text-gray-600">
              <span>Original Total:</span>
              <span>${{ checkoutResult.originalOrderTotal.toFixed(2) }}</span>
            </div>
            <div class="flex gap-8 text-sm text-green-600 font-medium">
              <span>Total Savings:</span>
              <span>-${{ checkoutResult.totalDiscount.toFixed(2) }}</span>
            </div>
            <div class="flex gap-8 text-lg font-bold text-gray-900 mt-1">
              <span>Order Total:</span>
              <span>${{ checkoutResult.orderTotal.toFixed(2) }}</span>
            </div>
          </div>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <!-- Create/Edit Drawer -->
    <n-drawer
      v-model:show="showDrawer"
      :width="520"
      placement="right"
    >
      <n-drawer-content :title="editingId ? 'Edit Promotion' : 'Create Promotion'" closable>
        <n-form
          ref="promoFormRef"
          :model="promoForm"
          :rules="promoRules"
          label-placement="top"
        >
          <n-form-item label="Name" path="name">
            <n-input v-model:value="promoForm.name" placeholder="Promotion name" />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="promoForm.description"
              type="textarea"
              placeholder="Optional description"
              :rows="2"
            />
          </n-form-item>
          <n-form-item label="Discount Type" path="discountType">
            <n-radio-group v-model:value="promoForm.discountType">
              <n-space>
                <n-radio value="PERCENTAGE">Percentage (%)</n-radio>
                <n-radio value="FIXED_AMOUNT">Fixed Amount ($)</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>
          <n-form-item label="Discount Value" path="discountValue">
            <n-input-number
              v-model:value="promoForm.discountValue"
              :min="0"
              placeholder="Value"
              style="width: 100%"
            />
          </n-form-item>
          <n-form-item label="Effective Start" path="effectiveStart">
            <n-date-picker
              v-model:value="promoForm.effectiveStart"
              type="datetime"
              clearable
              style="width: 100%"
            />
          </n-form-item>
          <n-form-item label="Effective End" path="effectiveEnd">
            <n-date-picker
              v-model:value="promoForm.effectiveEnd"
              type="datetime"
              clearable
              style="width: 100%"
            />
          </n-form-item>
          <n-form-item label="Priority" path="priority">
            <n-input-number
              v-model:value="promoForm.priority"
              :default-value="0"
              style="width: 100%"
            />
          </n-form-item>
          <n-form-item label="Active">
            <n-switch v-model:value="promoForm.isActive" />
          </n-form-item>
          <n-form-item label="Applies to Items (leave empty for all)">
            <n-select
              v-model:value="promoForm.itemIds"
              :options="inventoryOptions"
              multiple
              filterable
              clearable
              placeholder="All items"
              style="width: 100%"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showDrawer = false">Cancel</n-button>
            <n-button type="primary" :loading="saveSubmitting" @click="savePromotion">
              {{ editingId ? 'Update' : 'Create' }}
            </n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
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
  NInputNumber,
  NForm,
  NFormItem,
  NSpace,
  NTag,
  NSpin,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NDatePicker,
  NSwitch,
  NDivider,
  NRadioGroup,
  NRadio,
} from 'naive-ui';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { promotionsApi } from '../../api/promotions';
import { inventoryApi } from '../../api/inventory';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { Promotion, CheckoutResult, InventoryItem } from '../../types';

const { successMsg, errorMsg } = useAppMessage();

const activeTab = ref('promotions');

// ─── Promotions List ──────────────────────────────────────────────────────────
const promotions = ref<Promotion[]>([]);
const loading = ref(false);
const activeFilter = ref<string | null>(null);
const promoPage = usePagination(20);

const activeFilterOptions = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

async function loadPromotions() {
  loading.value = true;
  try {
    const res = await promotionsApi.listPromotions({
      isActive: activeFilter.value || undefined,
      page: promoPage.page.value,
      pageSize: promoPage.pageSize.value,
    });
    promotions.value = res.items;
    promoPage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    loading.value = false;
  }
}

function onFilterChange() {
  promoPage.page.value = 1;
  loadPromotions();
}

watch([() => promoPage.page.value, () => promoPage.pageSize.value], loadPromotions);

async function toggleActive(row: Promotion) {
  try {
    await promotionsApi.updatePromotion(row.id, { isActive: !row.isActive });
    successMsg('Promotion updated');
    await loadPromotions();
  } catch (err: any) {
    errorMsg(err);
  }
}

const promoColumns: DataTableColumn<Promotion>[] = [
  { title: 'Name', key: 'name' },
  {
    title: 'Type',
    key: 'discountType',
    render: (row) =>
      h(
        NTag,
        { type: row.discountType === 'PERCENTAGE' ? 'info' : 'success', size: 'small' },
        { default: () => row.discountType === 'PERCENTAGE' ? 'Percentage' : 'Fixed' }
      ),
  },
  {
    title: 'Discount',
    key: 'discountValue',
    render: (row) =>
      row.discountType === 'PERCENTAGE'
        ? `${row.discountValue}%`
        : `$${row.discountValue.toFixed(2)}`,
  },
  {
    title: 'Priority',
    key: 'priority',
    render: (row) =>
      h(NTag, { size: 'small' }, { default: () => String(row.priority) }),
  },
  {
    title: 'Active',
    key: 'isActive',
    render: (row) =>
      h(NSwitch, {
        value: row.isActive,
        onUpdateValue: () => toggleActive(row),
      }),
  },
  {
    title: 'Effective Dates',
    key: 'dates',
    render: (row) => {
      const start = new Date(row.effectiveStart).toLocaleDateString();
      const end = new Date(row.effectiveEnd).toLocaleDateString();
      return `${start} → ${end}`;
    },
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (row) =>
      h(
        NButton,
        { size: 'small', onClick: () => openEdit(row) },
        { default: () => 'Edit' }
      ),
  },
];

// ─── Create/Edit Drawer ───────────────────────────────────────────────────────
const showDrawer = ref(false);
const editingId = ref<number | null>(null);
const promoFormRef = ref<FormInst | null>(null);
const saveSubmitting = ref(false);

const promoForm = reactive<{
  name: string;
  description: string;
  discountType: string;
  discountValue: number | null;
  effectiveStart: number | null;
  effectiveEnd: number | null;
  priority: number;
  isActive: boolean;
  itemIds: number[];
}>({
  name: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: null,
  effectiveStart: null,
  effectiveEnd: null,
  priority: 0,
  isActive: true,
  itemIds: [],
});

const promoRules: FormRules = {
  name: [{ required: true, message: 'Name is required', trigger: 'blur' }],
  discountType: [{ required: true, message: 'Select a discount type', trigger: 'change' }],
  discountValue: [
    { required: true, type: 'number', message: 'Discount value is required', trigger: 'change' },
  ],
  effectiveStart: [
    { required: true, type: 'number', message: 'Start date is required', trigger: 'change' },
  ],
  effectiveEnd: [
    { required: true, type: 'number', message: 'End date is required', trigger: 'change' },
  ],
};

function resetForm() {
  promoForm.name = '';
  promoForm.description = '';
  promoForm.discountType = 'PERCENTAGE';
  promoForm.discountValue = null;
  promoForm.effectiveStart = null;
  promoForm.effectiveEnd = null;
  promoForm.priority = 0;
  promoForm.isActive = true;
  promoForm.itemIds = [];
}

function openCreate() {
  editingId.value = null;
  resetForm();
  showDrawer.value = true;
}

function openEdit(row: Promotion) {
  editingId.value = row.id;
  promoForm.name = row.name;
  promoForm.description = row.description ?? '';
  promoForm.discountType = row.discountType;
  promoForm.discountValue = row.discountValue;
  promoForm.effectiveStart = new Date(row.effectiveStart).getTime();
  promoForm.effectiveEnd = new Date(row.effectiveEnd).getTime();
  promoForm.priority = row.priority;
  promoForm.isActive = row.isActive;
  promoForm.itemIds = row.items?.map((i) => i.itemId) ?? [];
  showDrawer.value = true;
}

async function savePromotion() {
  try {
    await promoFormRef.value?.validate();
  } catch {
    return;
  }
  saveSubmitting.value = true;
  try {
    const payload = {
      name: promoForm.name,
      description: promoForm.description || undefined,
      discountType: promoForm.discountType,
      discountValue: promoForm.discountValue!,
      effectiveStart: new Date(promoForm.effectiveStart!).toISOString(),
      effectiveEnd: new Date(promoForm.effectiveEnd!).toISOString(),
      priority: promoForm.priority,
      isActive: promoForm.isActive,
      itemIds: promoForm.itemIds.length > 0 ? promoForm.itemIds : undefined,
    };

    if (editingId.value) {
      await promotionsApi.updatePromotion(editingId.value, payload);
      successMsg('Promotion updated');
    } else {
      await promotionsApi.createPromotion(payload);
      successMsg('Promotion created');
    }
    showDrawer.value = false;
    await loadPromotions();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    saveSubmitting.value = false;
  }
}

// ─── Inventory Options ────────────────────────────────────────────────────────
const inventoryItems = ref<InventoryItem[]>([]);
const inventoryOptions = computed(() =>
  inventoryItems.value.map((item) => ({
    label: `${item.name} (${item.sku})`,
    value: item.id,
  }))
);

async function loadInventoryItems() {
  try {
    const res = await inventoryApi.listItems({ pageSize: 200 });
    inventoryItems.value = res.items;
  } catch (err: any) {
    errorMsg(err);
  }
}

function getItemName(itemId: number): string {
  const item = inventoryItems.value.find((i) => i.id === itemId);
  return item ? item.name : `Item #${itemId}`;
}

// ─── Checkout Simulator ───────────────────────────────────────────────────────
interface CheckoutItem {
  itemId: number;
  quantity: number;
}

const checkoutItemId = ref<number | null>(null);
const checkoutQty = ref<number>(1);
const checkoutItems = ref<CheckoutItem[]>([]);
const checkoutResult = ref<CheckoutResult | null>(null);
const checkoutLoading = ref(false);

function addCheckoutItem() {
  if (!checkoutItemId.value || !checkoutQty.value || checkoutQty.value < 1) return;
  const existing = checkoutItems.value.find((i) => i.itemId === checkoutItemId.value);
  if (existing) {
    existing.quantity += checkoutQty.value;
  } else {
    checkoutItems.value.push({ itemId: checkoutItemId.value, quantity: checkoutQty.value });
  }
  checkoutItemId.value = null;
  checkoutQty.value = 1;
}

function removeCheckoutItem(itemId: number) {
  checkoutItems.value = checkoutItems.value.filter((i) => i.itemId !== itemId);
  if (checkoutItems.value.length === 0) checkoutResult.value = null;
}

async function runCheckout() {
  if (checkoutItems.value.length === 0) return;
  checkoutLoading.value = true;
  try {
    checkoutResult.value = await promotionsApi.checkout(
      checkoutItems.value.map((i) => ({ itemId: i.itemId, quantity: i.quantity }))
    );
  } catch (err: any) {
    errorMsg(err);
  } finally {
    checkoutLoading.value = false;
  }
}

const checkoutItemCols: DataTableColumn<CheckoutItem>[] = [
  { title: 'Item ID', key: 'itemId', width: 80 },
  {
    title: 'Item Name',
    key: 'itemName',
    render: (row) => getItemName(row.itemId),
  },
  { title: 'Quantity', key: 'quantity' },
  {
    title: 'Actions',
    key: 'actions',
    render: (row) =>
      h(
        NButton,
        { size: 'small', type: 'error', onClick: () => removeCheckoutItem(row.itemId) },
        { default: () => 'Remove' }
      ),
  },
];

onMounted(() => {
  loadPromotions();
  loadInventoryItems();
});
</script>
