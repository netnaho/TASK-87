import { ref, computed } from 'vue';
import { inventoryApi } from '../api/inventory';
import type { Vendor } from '../types';

export function useVendors() {
  const vendors = ref<Vendor[]>([]);

  const vendorOptions = computed(() =>
    vendors.value.map((v) => ({ label: v.name, value: v.id }))
  );

  async function loadVendors() {
    try {
      vendors.value = await inventoryApi.listVendors();
    } catch {
      // non-critical
    }
  }

  return { vendors, vendorOptions, loadVendors };
}
