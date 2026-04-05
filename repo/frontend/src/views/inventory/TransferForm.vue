<template>
  <div>
    <PageHeader title="Transfer Stock" back-route="Inventory" />

    <n-card style="max-width: 720px; margin: 0 auto;">
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="Barcode (scan or type)">
          <n-input
            v-model:value="barcodeInput"
            placeholder="Scan or enter barcode"
            clearable
            @keyup.enter="lookupBarcode"
            @clear="barcodeInput = ''"
          />
        </n-form-item>

        <n-form-item label="Item" path="itemId">
          <n-select
            v-model:value="form.itemId"
            :options="itemOptions"
            placeholder="Select item"
            filterable
            clearable
            @update:value="onItemChange"
          />
        </n-form-item>

        <n-form-item label="From Location" path="fromLocationId">
          <n-select
            v-model:value="form.fromLocationId"
            :options="locationOptions"
            placeholder="Select source location"
            filterable
            clearable
            @update:value="onSourceLocationChange"
          />
        </n-form-item>

        <n-form-item label="To Location" path="toLocationId">
          <n-select
            v-model:value="form.toLocationId"
            :options="locationOptions"
            placeholder="Select destination location"
            filterable
            clearable
          />
        </n-form-item>

        <n-form-item label="Quantity" path="quantity">
          <n-input-number
            v-model:value="form.quantity"
            :min="1"
            :precision="0"
            placeholder="Enter quantity"
            style="width: 100%;"
          />
          <template #feedback>
            <span v-if="availableQty !== null" class="available-info">
              Available: {{ availableQty }} units
            </span>
          </template>
        </n-form-item>

        <n-form-item v-if="isLotControlled" label="Lot" path="lotId">
          <n-select
            v-model:value="form.lotId"
            :options="lotOptions"
            placeholder="Select lot"
            filterable
            clearable
            :loading="loadingLots"
          />
        </n-form-item>

        <n-form-item label="Notes" path="notes">
          <n-input
            v-model:value="form.notes"
            type="textarea"
            placeholder="Optional notes"
            :autosize="{ minRows: 2, maxRows: 5 }"
          />
        </n-form-item>

        <n-space justify="end" style="margin-top: 8px;">
          <n-button @click="router.push({ name: 'Inventory' })">Cancel</n-button>
          <n-button type="primary" :loading="submitting" @click="submit">
            <template #icon><n-icon><SwapHorizontalOutline /></n-icon></template>
            Transfer Stock
          </n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard, NForm, NFormItem, NInput, NInputNumber, NSelect,
  NButton, NSpace, NIcon,
} from 'naive-ui'
import type { FormInst, FormRules } from 'naive-ui'
import { SwapHorizontalOutline } from '@vicons/ionicons5'
import type { Lot } from '../../types'
import { inventoryApi } from '../../api/inventory'
import { useInventoryItems } from '../../composables/useInventoryItems'
import { useLocations } from '../../composables/useLocations'
import { useAppMessage } from '../../composables/useAppMessage'
import PageHeader from '../../components/shared/PageHeader.vue'

const router = useRouter()
const { successMsg, errorMsg } = useAppMessage()
const { items, itemOptions, loadItems } = useInventoryItems()
const { locationOptions, loadLocations } = useLocations()

const formRef = ref<FormInst | null>(null)
const submitting = ref(false)
const isLotControlled = ref(false)
const availableQty = ref<number | null>(null)
const lots = ref<Lot[]>([])
const loadingLots = ref(false)
const loadingAvail = ref(false)

const form = reactive<{
  itemId: number | null
  fromLocationId: number | null
  toLocationId: number | null
  quantity: number | null
  lotId: number | null
  notes: string
}>({
  itemId: null,
  fromLocationId: null,
  toLocationId: null,
  quantity: null,
  lotId: null,
  notes: '',
})

const lotOptions = computed(() =>
  lots.value.map(l => ({ label: l.lotNumber, value: l.id }))
)

const rules: FormRules = {
  itemId: [
    { required: true, type: 'number', message: 'Item is required', trigger: ['blur', 'change'] },
  ],
  fromLocationId: [
    { required: true, type: 'number', message: 'Source location is required', trigger: ['blur', 'change'] },
  ],
  toLocationId: [
    { required: true, type: 'number', message: 'Destination location is required', trigger: ['blur', 'change'] },
    {
      validator(_rule: unknown, value: number | null) {
        if (value !== null && value === form.fromLocationId) {
          return new Error('Source and destination must differ')
        }
        return true
      },
      trigger: ['blur', 'change'],
    },
  ],
  quantity: [
    { required: true, type: 'number', message: 'Quantity is required', trigger: ['blur', 'change'] },
    { type: 'number', min: 1, message: 'Quantity must be at least 1', trigger: ['blur', 'change'] },
  ],
}

async function fetchAvailableQty() {
  if (form.itemId === null || form.fromLocationId === null) {
    availableQty.value = null
    return
  }
  try {
    loadingAvail.value = true
    const res = await inventoryApi.listStockLevels({
      itemId: form.itemId,
      locationId: form.fromLocationId,
    })
    const total = res.items.reduce((sum, sl) => sum + sl.onHand, 0)
    availableQty.value = total
  } catch {
    availableQty.value = null
  } finally {
    loadingAvail.value = false
  }
}

async function fetchLots() {
  if (form.itemId === null) {
    lots.value = []
    return
  }
  try {
    loadingLots.value = true
    lots.value = await inventoryApi.listLots({ itemId: form.itemId })
  } catch {
    lots.value = []
  } finally {
    loadingLots.value = false
  }
}

const barcodeInput = ref('')

async function lookupBarcode() {
  if (!barcodeInput.value.trim()) return
  try {
    const item = await inventoryApi.getItemByBarcode(barcodeInput.value.trim())
    form.itemId = item.id
    onItemChange(item.id)
    successMsg(`Item found: ${item.name}`)
  } catch (err: any) {
    errorMsg(err)
  }
}

function onItemChange(id: number | null) {
  form.lotId = null
  lots.value = []
  availableQty.value = null
  if (id === null) {
    isLotControlled.value = false
    return
  }
  const selectedItem = items.value.find(i => i.id === id)
  isLotControlled.value = selectedItem?.isLotControlled ?? false
  if (isLotControlled.value) fetchLots()
  fetchAvailableQty()
}

function onSourceLocationChange() {
  availableQty.value = null
  fetchAvailableQty()
}

function submit() {
  formRef.value?.validate(async errors => {
    if (!errors) await doSubmit()
  })
}

async function doSubmit() {
  try {
    submitting.value = true
    const payload: Parameters<typeof inventoryApi.transfer>[0] = {
      itemId: form.itemId!,
      fromLocationId: form.fromLocationId!,
      toLocationId: form.toLocationId!,
      quantity: form.quantity!,
    }
    if (form.lotId !== null) payload.lotId = form.lotId
    if (form.notes) payload.notes = form.notes
    await inventoryApi.transfer(payload)
    successMsg('Stock transferred successfully')
    router.push({ name: 'Inventory' })
  } catch (err: any) {
    errorMsg(err)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadItems(), loadLocations()])
})
</script>

<style scoped>
.available-info {
  font-size: 13px;
  color: #2080f0;
}
</style>
