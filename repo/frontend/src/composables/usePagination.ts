import { ref, computed } from 'vue';

export function usePagination(defaultPageSize = 20) {
  const page = ref(1);
  const pageSize = ref(defaultPageSize);
  const itemCount = ref(0);

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(itemCount.value / pageSize.value))
  );

  const paginationConfig = computed(() => ({
    page: page.value,
    pageSize: pageSize.value,
    itemCount: itemCount.value,
    showSizePicker: true,
    pageSizes: [10, 20, 50],
    onUpdatePage: (p: number) => { page.value = p; },
    onUpdatePageSize: (ps: number) => { pageSize.value = ps; page.value = 1; },
  }));

  function handlePageChange(loadFn: () => void) {
    return (p: number) => {
      page.value = p;
      loadFn();
    };
  }

  function reset() {
    page.value = 1;
    itemCount.value = 0;
  }

  return { page, pageSize, itemCount, totalPages, paginationConfig, handlePageChange, reset };
}
