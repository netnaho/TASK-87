<template>
  <div>
    <PageHeader title="Receive Stock" back-route="Inventory" />

    <n-card style="max-width: 720px; margin: 0 auto;">
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="Vendor" path="vendorId">
          <n-select
            v-model:value="form.vendorId"
            :options="vendorOptions"
            placeholder="Select vendor"
            filterable
            clearable
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
        </n-form-item>

        <template v-if="isLotControlled">
          <n-form-item label="Lot Number" path="lotNumber">
            <n-input
              v-model:value="form.lotNumber"
              placeholder="Enter lot number"
              clearable
            />
          </n-form-item>

          <n-form-item label="Expiration Date" path="expirationDate">
            <n-date-picker
              v-model:value="expirationDateTs"
              type="date"
              placeholder="Select expiration date (optional)"
              clearable
              style="width: 100%;"
              @update:value="onExpirationChange"
            />
          </n-form-item>
        </template>

        <n-form-item label="Unit Cost (USD)" path="unitCostUsd">
          <n-input-number
            v-model:value="form.unitCostUsd"
            :min="0"
            :precision="2"
            placeholder="Optional"
            style="width: 100%;"
          >
            <template #prefix>$</template>
          </n-input-number>
        </n-form-item>

        <n-form-item label="Pack Size" path="packSize">
          <n-input-number
            v-model:value="form.packSize"
            :min="1"
            :precision="0"
            placeholder="Optional"
            style="width: 100%;"
          />
        </n-form-item>

        <n-form-item label="Delivery Date / Time" path="deliveryDatetime">
          <n-date-picker
            v-model:value="deliveryDateTs"
            type="datetime"
            placeholder="Select delivery date and time (optional)"
            clearable
            style="width: 100%;"
            @update:value="onDeliveryDateChange"
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
            <template #icon><n-icon><SaveOutline /></n-icon></template>
            Receive Stock
          </n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard, NForm, NFormItem, NInput, NInputNumber, NSelect,
  NDatePicker, NButton, NSpace, NIcon,
} from 'naive-ui'
import type { FormInst, FormRules } from 'naive-ui'
import { SaveOutline } from '@vicons/ionicons5'
import { inventoryApi } from '../../api/inventory'
import { useVendors } from '../../composables/useVendors'
import { useInventoryItems } from '../../composables/useInventoryItems'
import { useLocations } from '../../composables/useLocations'
import { useAppMessage } from '../../composables/useAppMessage'
import PageHeader from '../../components/shared/PageHeader.vue'

const router = useRouter()
const { successMsg, errorMsg } = useAppMessage()
const { vendorOptions, loadVendors } = useVendors()
const { items, itemOptions, loadItems } = useInventoryItems()
const { locationOptions, loadLocations } = useLocations()

const formRef = ref<FormInst | null>(null)
const submitting = ref(false)
const isLotControlled = ref(false)
const expirationDateTs = ref<number | null>(null)
const deliveryDateTs = ref<number | null>(null)

const form = reactive<{
  vendorId: number | null
  itemId: number | null
  locationId: number | null
  quantity: number | null
  lotNumber: string
  expirationDate: string
  unitCostUsd: number | null
  packSize: number | null
  deliveryDatetime: string
  notes: string
}>({
  vendorId: null,
  itemId: null,
  locationId: null,
  quantity: null,
  lotNumber: '',
  expirationDate: '',
  unitCostUsd: null,
  packSize: null,
  deliveryDatetime: '',
  notes: '',
})

const rules: FormRules = {
  vendorId: [
    { required: true, type: 'number', message: 'Vendor is required', trigger: ['blur', 'change'] },
  ],
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
  lotNumber: [
    {
      validator(_rule: unknown, value: string) {
        if (isLotControlled.value && !value?.trim()) {
          return new Error('Lot number is required for lot-controlled items')
        }
        return true
      },
      trigger: ['blur', 'input'],
    },
  ],
}

function onItemChange(id: number | null) {
  if (id === null) {
    isLotControlled.value = false
    form.lotNumber = ''
    form.expirationDate = ''
    expirationDateTs.value = null
    return
  }
  const selectedItem = items.value.find(i => i.id === id)
  isLotControlled.value = selectedItem?.isLotControlled ?? false
  if (!isLotControlled.value) {
    form.lotNumber = ''
    form.expirationDate = ''
    expirationDateTs.value = null
  }
}

function onExpirationChange(ts: number | null) {
  form.expirationDate = ts ? new Date(ts).toISOString().split('T')[0] : ''
}

function onDeliveryDateChange(ts: number | null) {
  form.deliveryDatetime = ts ? new Date(ts).toISOString() : ''
}

function submit() {
  formRef.value?.validate(async errors => {
    if (!errors) await doSubmit()
  })
}

async function doSubmit() {
  try {
    submitting.value = true
    const payload: Parameters<typeof inventoryApi.receive>[0] = {
      vendorId: form.vendorId!,
      itemId: form.itemId!,
      locationId: form.locationId!,
      quantity: form.quantity!,
    }
    if (form.unitCostUsd !== null) payload.unitCostUsd = form.unitCostUsd
    if (form.packSize !== null) payload.packSize = form.packSize
    if (form.deliveryDatetime) payload.deliveryDatetime = form.deliveryDatetime
    if (form.notes) payload.notes = form.notes
    if (isLotControlled.value) {
      payload.lotNumber = form.lotNumber
      if (form.expirationDate) payload.expirationDate = form.expirationDate
    }
    await inventoryApi.receive(payload)
    successMsg('Stock received successfully')
    router.push({ name: 'Inventory' })
  } catch (err: any) {
    errorMsg(err)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadVendors(), loadItems(), loadLocations()])
})
</script>
