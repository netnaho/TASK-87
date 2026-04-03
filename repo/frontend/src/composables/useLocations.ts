import { ref, computed } from 'vue';
import { locationsApi } from '../api/locations';
import type { Location } from '../types';

export function useLocations() {
  const locations = ref<Location[]>([]);

  const locationOptions = computed(() =>
    locations.value.map((l) => ({ label: l.name, value: l.id }))
  );

  async function loadLocations() {
    try {
      locations.value = await locationsApi.listLocations();
    } catch {
      // non-critical; leave empty
    }
  }

  return { locations, locationOptions, loadLocations };
}
