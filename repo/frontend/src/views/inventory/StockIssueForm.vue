<template>
  <div>
    <PageHeader title="Issue Stock" back-route="Inventory" />

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

        <n-form-item label="Location" path="locationId">
          <n-select
            v-model:value="form.locationId"
            :options="locationOptions"
            placeholder="Select location"
            filterable
            clearable
            @update:value="onLocationChange"
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
            <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
            Issue Stock
          </n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NCard, NForm, NFormItem, NInput, NInputNumber, NSelect,
  NButton, NSpace, NIcon,
} from 'naive-ui'
import type { FormInst, FormRules } from 'naive-ui'
import { CheckmarkOutline } from '@vicons/ionicons5'
import type { Lot } from '../../types'
import { inventoryApi } from '../../api/inventory'
import { useInventoryItems } from '../../composables/useInventoryItems'
import { useLocations } from '../../composables/useLocations'
import { useAppMessage } from '../../composables/useAppMessage'
import PageHeader from '../../components/shared/PageHeader.vue'

const router = useRouter()
const route = useRoute()
const { successMsg, errorMsg } = useAppMessage()
const { items, itemOptions, loadItems } = useInventoryItems()
const { locationOptions, loadLocations } = useLocations()

const formRef = ref<FormInst | null>(null)
const submitting = ref(false)
const isLotControlled = ref(false)
const availableQty = ref<number | null>(null)
const lots = ref<Lot[]>([])
const loadingLots = ref(false)

const form = reactive<{
  itemId: number | null
  locationId: number | null
  quantity: number | null
  lotId: number | null
  notes: string
}>({
  itemId: null,
  locationId: null,
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
  locationId: [
    { required: true, type: 'number', message: 'Location is required', trigger: ['blur', 'change'] },
  ],
  quantity: [
    { required: true, type: 'number', message: 'Quantity is required', trigger: ['blur', 'change'] },
    { type: 'number', min: 1, message: 'Quantity must be at least 1', trigger: ['blur', 'change'] },
  ],
}

async function fetchAvailableQty() {
  if (form.itemId === null || form.locationId === null) {
    availableQty.value = null
    return
  }
  try {
    const res = await inventoryApi.listStockLevels({
      itemId: form.itemId,
      locationId: form.locationId,
    })
    availableQty.value = res.items.reduce((sum, sl) => sum + sl.onHand, 0)
  } catch {
    availableQty.value = null
  }
}

async function fetchLots(itemId: number) {
  try {
    loadingLots.value = true
    lots.value = await inventoryApi.listLots({ itemId })
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
  if (isLotControlled.value) fetchLots(id)
  fetchAvailableQty()
}

function onLocationChange() {
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
    const payload: Parameters<typeof inventoryApi.issue>[0] = {
      itemId: form.itemId!,
      locationId: form.locationId!,
      quantity: form.quantity!,
    }
    if (form.lotId !== null) payload.lotId = form.lotId
    if (form.notes) payload.notes = form.notes
    await inventoryApi.issue(payload)
    successMsg('Stock issued successfully')
    router.push({ name: 'Inventory' })
  } catch (err: any) {
    errorMsg(err)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadItems(), loadLocations()])

  const qItemId = route.query.itemId
  const qLocationId = route.query.locationId

  if (qItemId) {
    const id = Number(qItemId)
    if (!isNaN(id)) {
      form.itemId = id
      const selectedItem = items.value.find(i => i.id === id)
      isLotControlled.value = selectedItem?.isLotControlled ?? false
      if (isLotControlled.value) fetchLots(id)
    }
  }

  if (qLocationId) {
    const id = Number(qLocationId)
    if (!isNaN(id)) form.locationId = id
  }

  if (form.itemId !== null && form.locationId !== null) {
    fetchAvailableQty()
  }
})
</script>

<style scoped>
.available-info {
  font-size: 13px;
  color: #2080f0;
}
</style>
