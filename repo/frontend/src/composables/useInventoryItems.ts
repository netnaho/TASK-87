import { ref, computed } from 'vue';
import { inventoryApi } from '../api/inventory';
import type { InventoryItem } from '../types';

export function useInventoryItems() {
  const items = ref<InventoryItem[]>([]);
  const categories = ref<string[]>([]);

  const itemOptions = computed(() =>
    items.value.map((i) => ({
      label: `${i.name} (${i.sku})`,
      value: i.id,
    }))
  );

  const categoryOptions = computed(() =>
    categories.value.map((c) => ({ label: c, value: c }))
  );

  async function loadItems(params?: { search?: string; isActive?: string }) {
    try {
      const res = await inventoryApi.listItems({ ...params, pageSize: 200 });
      items.value = res.items;
    } catch {
      // non-critical
    }
  }

  async function loadCategories() {
    try {
      categories.value = await inventoryApi.listCategories();
    } catch {
      // non-critical
    }
  }

  return { items, itemOptions, categories, categoryOptions, loadItems, loadCategories };
}
