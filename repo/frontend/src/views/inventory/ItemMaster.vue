<template>
  <div>
    <PageHeader title="Item Master" />

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ── Items Tab ─────────────────────────────────────────── -->
      <n-tab-pane name="items" tab="Items">
        <n-card>
          <n-space style="margin-bottom: 16px;" justify="space-between" align="center">
            <n-input
              v-model:value="itemSearch"
              placeholder="Search items by name or SKU…"
              clearable
              style="width: 300px;"
              @update:value="onItemSearchChange"
            >
              <template #prefix><n-icon><DocumentTextOutline /></n-icon></template>
            </n-input>
            <n-button type="primary" @click="openItemDrawer(null)">
              <template #icon><n-icon><AddOutline /></n-icon></template>
              Add Item
            </n-button>
          </n-space>

          <n-spin :show="loadingItems">
            <n-data-table
              :columns="itemColumns"
              :data="itemsData"
              :row-key="(row: InventoryItem) => row.id"
              :pagination="itemPaginationConfig"
              striped
            />
            <EmptyState
              v-if="!loadingItems && itemsData.length === 0"
              message="No items found"
              description="Add your first item or adjust the search query."
              action-label="Add Item"
              @action="openItemDrawer(null)"
            />
          </n-spin>
        </n-card>
      </n-tab-pane>

      <!-- ── Vendors Tab ───────────────────────────────────────── -->
      <n-tab-pane name="vendors" tab="Vendors">
        <n-card>
          <n-space style="margin-bottom: 16px;" justify="end">
            <n-button type="primary" @click="openVendorDrawer(null)">
              <template #icon><n-icon><AddOutline /></n-icon></template>
              Add Vendor
            </n-button>
          </n-space>

          <n-spin :show="loadingVendors">
            <n-data-table
              :columns="vendorColumns"
              :data="vendorsData"
              :row-key="(row: Vendor) => row.id"
              striped
            />
            <EmptyState
              v-if="!loadingVendors && vendorsData.length === 0"
              message="No vendors found"
              action-label="Add Vendor"
              @action="openVendorDrawer(null)"
            />
          </n-spin>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <!-- ── Item Drawer ──────────────────────────────────────────── -->
    <n-drawer v-model:show="showItemDrawer" :width="480" placement="right">
      <n-drawer-content :title="editingItem ? 'Edit Item' : 'Add Item'" closable>
        <n-form
          ref="itemFormRef"
          :model="itemForm"
          :rules="itemRules"
          label-placement="top"
          require-mark-placement="right-hanging"
        >
          <n-form-item label="Name" path="name">
            <n-input v-model:value="itemForm.name" placeholder="Item name" clearable />
          </n-form-item>

          <n-form-item label="SKU" path="sku">
            <n-input v-model:value="itemForm.sku" placeholder="Stock keeping unit" clearable />
          </n-form-item>

          <n-form-item label="Category" path="category">
            <n-select
              v-model:value="itemForm.category"
              :options="categoryOptions"
              placeholder="Select or type a category"
              filterable
              tag
              clearable
            />
          </n-form-item>

          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="itemForm.description"
              type="textarea"
              placeholder="Optional description"
              :autosize="{ minRows: 2, maxRows: 4 }"
            />
          </n-form-item>

          <n-form-item label="Unit of Measure" path="unitOfMeasure">
            <n-input v-model:value="itemForm.unitOfMeasure" placeholder="e.g. each, box, kg" clearable />
          </n-form-item>

          <n-form-item label="Unit Price (USD)" path="unitPrice">
            <n-input-number
              v-model:value="itemForm.unitPrice"
              :min="0"
              :precision="2"
              placeholder="Optional"
              style="width: 100%;"
            >
              <template #prefix>$</template>
            </n-input-number>
          </n-form-item>

          <n-form-item label="Lot Controlled" path="isLotControlled">
            <n-switch v-model:value="itemForm.isLotControlled">
              <template #checked>Yes</template>
              <template #unchecked>No</template>
            </n-switch>
          </n-form-item>

          <n-form-item label="Active" path="isActive">
            <n-switch v-model:value="itemForm.isActive">
              <template #checked>Active</template>
              <template #unchecked>Inactive</template>
            </n-switch>
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showItemDrawer = false">Cancel</n-button>
            <n-button type="primary" :loading="submittingItem" @click="submitItem">
              <template #icon><n-icon><SaveOutline /></n-icon></template>
              {{ editingItem ? 'Update Item' : 'Create Item' }}
            </n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- ── Vendor Drawer ────────────────────────────────────────── -->
    <n-drawer v-model:show="showVendorDrawer" :width="480" placement="right">
      <n-drawer-content :title="editingVendor ? 'Edit Vendor' : 'Add Vendor'" closable>
        <n-form
          ref="vendorFormRef"
          :model="vendorForm"
          :rules="vendorRules"
          label-placement="top"
          require-mark-placement="right-hanging"
        >
          <n-form-item label="Name" path="name">
            <n-input v-model:value="vendorForm.name" placeholder="Vendor name" clearable />
          </n-form-item>

          <n-form-item label="Contact" path="contact">
            <n-input
              v-model:value="vendorForm.contact"
              type="textarea"
              placeholder="Contact info (optional — stored encrypted)"
              :autosize="{ minRows: 2, maxRows: 4 }"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showVendorDrawer = false">Cancel</n-button>
            <n-button type="primary" :loading="submittingVendor" @click="submitVendor">
              <template #icon><n-icon><SaveOutline /></n-icon></template>
              {{ editingVendor ? 'Update Vendor' : 'Create Vendor' }}
            </n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, h } from 'vue'
import {
  NCard, NButton, NDataTable, NDrawer, NDrawerContent,
  NForm, NFormItem, NInput, NInputNumber, NSelect,
  NSpace, NIcon, NSpin, NTabs, NTabPane, NTag, NSwitch,
} from 'naive-ui'
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui'
import { AddOutline, DocumentTextOutline, SaveOutline } from '@vicons/ionicons5'
import type { InventoryItem, Vendor } from '../../types'
import { inventoryApi } from '../../api/inventory'
import { useInventoryItems } from '../../composables/useInventoryItems'
import { usePagination } from '../../composables/usePagination'
import { useAppMessage } from '../../composables/useAppMessage'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/shared/PageHeader.vue'
import EmptyState from '../../components/shared/EmptyState.vue'

const { successMsg, errorMsg } = useAppMessage()
const { categories, categoryOptions, loadCategories } = useInventoryItems()
const authStore = useAuthStore()
const {
  page: itemPage,
  pageSize: itemPageSize,
  itemCount: itemTotal,
  paginationConfig: itemPaginationConfig,
} = usePagination(20)

const isAdmin = computed(() => authStore.hasRole('ADMIN'))

// ── Tab state ──────────────────────────────────────────────────────────────
const activeTab = ref('items')

// ── Items state ────────────────────────────────────────────────────────────
const loadingItems = ref(false)
const itemsData = ref<InventoryItem[]>([])
const itemSearch = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const showItemDrawer = ref(false)
const editingItem = ref<InventoryItem | null>(null)
const submittingItem = ref(false)
const itemFormRef = ref<FormInst | null>(null)

const itemForm = reactive<{
  name: string
  sku: string
  category: string
  description: string
  unitOfMeasure: string
  unitPrice: number | null
  isLotControlled: boolean
  isActive: boolean
}>({
  name: '',
  sku: '',
  category: '',
  description: '',
  unitOfMeasure: '',
  unitPrice: null,
  isLotControlled: false,
  isActive: true,
})

const itemRules: FormRules = {
  name: [{ required: true, message: 'Name is required', trigger: ['blur', 'input'] }],
  sku: [{ required: true, message: 'SKU is required', trigger: ['blur', 'input'] }],
  category: [{ required: true, message: 'Category is required', trigger: ['blur', 'change'] }],
}

const itemColumns = computed<DataTableColumn<InventoryItem>[]>(() => [
  { title: 'ID', key: 'id', width: 60 },
  { title: 'Name', key: 'name' },
  { title: 'SKU', key: 'sku' },
  { title: 'Category', key: 'category' },
  { title: 'Unit', key: 'unitOfMeasure' },
  {
    title: 'Price',
    key: 'unitPrice',
    render: row => (row.unitPrice !== null && row.unitPrice !== undefined ? `$${row.unitPrice.toFixed(2)}` : '-'),
  },
  {
    title: 'Lot Controlled',
    key: 'isLotControlled',
    render: row =>
      h(NTag, { type: row.isLotControlled ? 'info' : 'default', size: 'small' }, {
        default: () => row.isLotControlled ? 'Yes' : 'No',
      }),
  },
  {
    title: 'Active',
    key: 'isActive',
    render: row =>
      h(NTag, { type: row.isActive ? 'success' : 'default', size: 'small' }, {
        default: () => row.isActive ? 'Active' : 'Inactive',
      }),
  },
  {
    title: 'Actions',
    key: 'actions',
    render: row =>
      h(
        NButton,
        { size: 'small', ghost: true, onClick: () => openItemDrawer(row) },
        { default: () => 'Edit' }
      ),
  },
])

function openItemDrawer(item: InventoryItem | null) {
  editingItem.value = item
  if (item) {
    itemForm.name = item.name
    itemForm.sku = item.sku
    itemForm.category = item.category
    itemForm.description = item.description ?? ''
    itemForm.unitOfMeasure = item.unitOfMeasure
    itemForm.unitPrice = item.unitPrice ?? null
    itemForm.isLotControlled = item.isLotControlled
    itemForm.isActive = item.isActive
  } else {
    itemForm.name = ''
    itemForm.sku = ''
    itemForm.category = ''
    itemForm.description = ''
    itemForm.unitOfMeasure = ''
    itemForm.unitPrice = null
    itemForm.isLotControlled = false
    itemForm.isActive = true
  }
  showItemDrawer.value = true
}

function submitItem() {
  itemFormRef.value?.validate(async errors => {
    if (!errors) await doSubmitItem()
  })
}

async function doSubmitItem() {
  try {
    submittingItem.value = true
    const payload: Partial<InventoryItem> = {
      name: itemForm.name,
      sku: itemForm.sku,
      category: itemForm.category,
      description: itemForm.description || null,
      unitOfMeasure: itemForm.unitOfMeasure,
      unitPrice: itemForm.unitPrice,
      isLotControlled: itemForm.isLotControlled,
      isActive: itemForm.isActive,
    }
    if (editingItem.value) {
      await inventoryApi.updateItem(editingItem.value.id, payload)
      successMsg('Item updated successfully')
    } else {
      await inventoryApi.createItem(payload)
      successMsg('Item created successfully')
    }
    showItemDrawer.value = false
    await loadItems()
  } catch (err: any) {
    errorMsg(err)
  } finally {
    submittingItem.value = false
  }
}

async function loadItems() {
  try {
    loadingItems.value = true
    const res = await inventoryApi.listItems({
      search: itemSearch.value || undefined,
      page: itemPage.value,
      pageSize: itemPageSize.value,
    })
    itemsData.value = res.items
    itemTotal.value = res.total
  } catch (err: any) {
    errorMsg(err)
  } finally {
    loadingItems.value = false
  }
}

function onItemSearchChange() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    itemPage.value = 1
    loadItems()
  }, 400)
}

watch([itemPage, itemPageSize], () => loadItems())

// ── Vendors state ──────────────────────────────────────────────────────────
const loadingVendors = ref(false)
const vendorsData = ref<Vendor[]>([])

const showVendorDrawer = ref(false)
const editingVendor = ref<Vendor | null>(null)
const submittingVendor = ref(false)
const vendorFormRef = ref<FormInst | null>(null)

const vendorForm = reactive<{ name: string; contact: string }>({
  name: '',
  contact: '',
})

const vendorRules: FormRules = {
  name: [{ required: true, message: 'Vendor name is required', trigger: ['blur', 'input'] }],
}

const vendorColumns = computed<DataTableColumn<Vendor>[]>(() => {
  const cols: DataTableColumn<Vendor>[] = [
    { title: 'ID', key: 'id', width: 60 },
    { title: 'Name', key: 'name' },
    {
      title: 'Active',
      key: 'isActive',
      render: row =>
        h(NTag, { type: row.isActive ? 'success' : 'default', size: 'small' }, {
          default: () => row.isActive ? 'Active' : 'Inactive',
        }),
    },
  ]

  if (isAdmin.value) {
    cols.splice(2, 0, {
      title: 'Contact (encrypted)',
      key: 'contactEncrypted',
      render: row => {
        const c = row.contactEncrypted
        if (!c) return '-'
        return c.length > 20 ? `${c.slice(0, 20)}…` : c
      },
    })
  }

  cols.push({
    title: 'Actions',
    key: 'actions',
    render: row =>
      h(
        NButton,
        { size: 'small', ghost: true, onClick: () => openVendorDrawer(row) },
        { default: () => 'Edit' }
      ),
  })

  return cols
})

function openVendorDrawer(vendor: Vendor | null) {
  editingVendor.value = vendor
  vendorForm.name = vendor?.name ?? ''
  vendorForm.contact = ''
  showVendorDrawer.value = true
}

function submitVendor() {
  vendorFormRef.value?.validate(async errors => {
    if (!errors) await doSubmitVendor()
  })
}

async function doSubmitVendor() {
  try {
    submittingVendor.value = true
    const payload: { name: string; contact?: string } = { name: vendorForm.name }
    if (vendorForm.contact) payload.contact = vendorForm.contact
    if (editingVendor.value) {
      await inventoryApi.updateVendor(editingVendor.value.id, payload)
      successMsg('Vendor updated successfully')
    } else {
      await inventoryApi.createVendor(payload)
      successMsg('Vendor created successfully')
    }
    showVendorDrawer.value = false
    await loadVendors()
  } catch (err: any) {
    errorMsg(err)
  } finally {
    submittingVendor.value = false
  }
}

async function loadVendors() {
  try {
    loadingVendors.value = true
    vendorsData.value = await inventoryApi.listVendors()
  } catch (err: any) {
    errorMsg(err)
  } finally {
    loadingVendors.value = false
  }
}

watch(activeTab, tab => {
  if (tab === 'vendors' && vendorsData.value.length === 0) loadVendors()
})

onMounted(async () => {
  await Promise.all([loadItems(), loadCategories()])
})
</script>
