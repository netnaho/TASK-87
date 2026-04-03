<template>
  <div class="p-6">
    <PageHeader title="Product Search">
      <template #actions>
        <n-space>
          <n-button
            :type="viewMode === 'grid' ? 'primary' : 'default'"
            size="small"
            @click="viewMode = 'grid'"
          >
            Grid
          </n-button>
          <n-button
            :type="viewMode === 'table' ? 'primary' : 'default'"
            size="small"
            @click="viewMode = 'table'"
          >
            Table
          </n-button>
        </n-space>
      </template>
    </PageHeader>

    <!-- Search Bar -->
    <n-card class="mb-4">
      <n-space align="center">
        <n-input
          v-model:value="query"
          placeholder="Search products by name, SKU, or description..."
          size="large"
          clearable
          style="flex: 1; min-width: 300px"
          @keyup.enter="doSearch"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-button type="primary" size="large" :loading="loading" @click="doSearch">
          Search
        </n-button>
      </n-space>

      <!-- Suggestions when no query -->
      <div v-if="!query && suggestions.length > 0" class="mt-3 flex flex-wrap gap-2">
        <n-tag
          v-for="s in suggestions"
          :key="s.term"
          size="small"
          class="cursor-pointer"
          @click="onSuggestionClick(s.term)"
        >
          {{ s.term }}
        </n-tag>
      </div>
    </n-card>

    <!-- Filters -->
    <n-collapse class="mb-4">
      <n-collapse-item title="Filters" name="filters">
        <n-card :bordered="false">
          <n-grid :cols="4" :x-gap="12" :y-gap="8" responsive="screen">
            <n-grid-item>
              <n-form-item label="Category" style="margin-bottom: 0">
                <n-select
                  v-model:value="filters.category"
                  :options="categoryOptions"
                  placeholder="All categories"
                  clearable
                  style="width: 100%"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label="Attribute Name" style="margin-bottom: 0">
                <n-input
                  v-model:value="filters.attributeName"
                  placeholder="e.g. color"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label="Attribute Value" style="margin-bottom: 0">
                <n-input
                  v-model:value="filters.attributeValue"
                  placeholder="e.g. blue"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label="Sort By" style="margin-bottom: 0">
                <n-select
                  v-model:value="filters.sortBy"
                  :options="sortByOptions"
                  style="width: 100%"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label="Sort Direction" style="margin-bottom: 0">
                <n-radio-group v-model:value="filters.sortDir">
                  <n-space>
                    <n-radio value="asc">Asc</n-radio>
                    <n-radio value="desc">Desc</n-radio>
                  </n-space>
                </n-radio-group>
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label=" " style="margin-bottom: 0">
                <n-button @click="clearFilters">Clear Filters</n-button>
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-card>
      </n-collapse-item>
    </n-collapse>

    <!-- Grid View -->
    <template v-if="viewMode === 'grid'">
      <n-spin :show="loading">
        <n-grid
          v-if="results.length > 0"
          :cols="4"
          :x-gap="16"
          :y-gap="16"
          responsive="screen"
          :collapsed-rows="10"
        >
          <n-grid-item v-for="product in results" :key="product.id">
            <n-card size="small" hoverable>
              <template #header>
                <div class="flex items-start justify-between gap-2">
                  <p class="font-semibold text-gray-900 text-sm leading-tight">{{ product.name }}</p>
                  <n-tag size="tiny" type="info" style="flex-shrink: 0">{{ product.sku }}</n-tag>
                </div>
              </template>
              <div class="space-y-1.5">
                <n-tag size="small" type="success">{{ product.category }}</n-tag>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-500">{{ product.unitOfMeasure }}</span>
                  <span class="font-bold text-gray-900">
                    {{ product.unitPrice != null ? '$' + Number(product.unitPrice).toFixed(2) : '—' }}
                  </span>
                </div>
                <div v-if="product.isLotControlled">
                  <n-tag size="tiny" type="warning">Lot Controlled</n-tag>
                </div>
                <div
                  v-if="product.productAttributes && product.productAttributes.length > 0"
                  class="text-xs text-gray-500 space-y-0.5"
                >
                  <template
                    v-for="(attr, idx) in product.productAttributes.slice(0, 3)"
                    :key="attr.id"
                  >
                    <div>{{ attr.attributeName }}: {{ attr.attributeValue }}</div>
                  </template>
                  <div v-if="product.productAttributes.length > 3" class="text-gray-400 italic">
                    +{{ product.productAttributes.length - 3 }} more...
                  </div>
                </div>
              </div>
            </n-card>
          </n-grid-item>
        </n-grid>
        <EmptyState
          v-else-if="!loading"
          message="No products found"
          description="Try adjusting your search or filters."
        />
      </n-spin>

      <!-- Pagination for Grid -->
      <div v-if="results.length > 0" class="mt-4 flex justify-end">
        <n-pagination
          v-bind="gridPaginationProps"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        />
      </div>
    </template>

    <!-- Table View -->
    <template v-else>
      <n-spin :show="loading">
        <n-data-table
          v-if="results.length > 0"
          :columns="tableColumns"
          :data="results"
          :pagination="tablePage.paginationConfig.value"
          :row-key="(r: SearchProduct) => r.id"
        />
        <EmptyState
          v-else-if="!loading"
          message="No products found"
          description="Try adjusting your search or filters."
        />
      </n-spin>
    </template>

    <!-- Trending Panel (MANAGER/ADMIN) -->
    <n-card
      v-if="authStore.hasRole('ADMIN', 'MANAGER')"
      class="mt-6"
      title="Trending Keywords"
    >
      <n-spin :show="trendingLoading">
        <n-data-table
          v-if="trendingTerms.length > 0"
          :columns="trendingColumns"
          :data="trendingTerms"
          :pagination="false"
          :row-key="(r: SuggestedTerm) => r.id"
        />
        <EmptyState v-else-if="!trendingLoading" message="No trending keywords yet" />
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, h } from 'vue';
import {
  NCard,
  NButton,
  NSelect,
  NInput,
  NFormItem,
  NSpace,
  NTag,
  NSpin,
  NDataTable,
  NGrid,
  NGridItem,
  NIcon,
  NSwitch,
  NCollapse,
  NCollapseItem,
  NRadioGroup,
  NRadio,
  NPagination,
} from 'naive-ui';
import type { DataTableColumn } from 'naive-ui';
import { SearchOutline } from '@vicons/ionicons5';
import { searchApi } from '../../api/search';
import { usePagination } from '../../composables/usePagination';
import { useAppMessage } from '../../composables/useAppMessage';
import { useAuthStore } from '../../stores/auth';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { SearchProduct, SuggestedTerm } from '../../types';

const authStore = useAuthStore();
const { errorMsg, successMsg } = useAppMessage();

const viewMode = ref<'grid' | 'table'>('grid');
const query = ref('');
const loading = ref(false);
const results = ref<SearchProduct[]>([]);

const filters = reactive({
  category: null as string | null,
  attributeName: '',
  attributeValue: '',
  sortBy: 'name',
  sortDir: 'asc',
});

const categoryOptions = ref<{ label: string; value: string }[]>([]);
const sortByOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Price', value: 'price' },
  { label: 'Date', value: 'date' },
];

// Grid pagination
const tablePage = usePagination(20);
const gridPage = ref(1);
const gridPageSize = ref(20);
const gridItemCount = ref(0);

const gridPaginationProps = computed(() => ({
  page: gridPage.value,
  pageSize: gridPageSize.value,
  itemCount: gridItemCount.value,
  showSizePicker: true,
  pageSizes: [12, 24, 48],
}));

function onPageChange(p: number) {
  gridPage.value = p;
  tablePage.page.value = p;
  doSearch();
}

function onPageSizeChange(ps: number) {
  gridPageSize.value = ps;
  gridPage.value = 1;
  tablePage.pageSize.value = ps;
  tablePage.page.value = 1;
  doSearch();
}

watch([() => tablePage.page.value, () => tablePage.pageSize.value], () => {
  if (viewMode.value === 'table') doSearch();
});

async function doSearch() {
  loading.value = true;
  try {
    const page = viewMode.value === 'grid' ? gridPage.value : tablePage.page.value;
    const pageSize = viewMode.value === 'grid' ? gridPageSize.value : tablePage.pageSize.value;
    const res = await searchApi.searchProducts({
      q: query.value || undefined,
      category: filters.category || undefined,
      attributeName: filters.attributeName || undefined,
      attributeValue: filters.attributeValue || undefined,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      page,
      pageSize,
    });
    results.value = res.items;
    gridItemCount.value = res.total;
    tablePage.itemCount.value = res.total;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    loading.value = false;
  }
}

function clearFilters() {
  filters.category = null;
  filters.attributeName = '';
  filters.attributeValue = '';
  filters.sortBy = 'name';
  filters.sortDir = 'asc';
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
const suggestions = ref<SuggestedTerm[]>([]);

async function loadSuggestions() {
  try {
    const data = await searchApi.getSuggestions();
    suggestions.value = data.slice(0, 15);
  } catch {
    // silently fail
  }
}

function onSuggestionClick(term: string) {
  query.value = term;
  doSearch();
}

// ─── Table Columns ────────────────────────────────────────────────────────────
const tableColumns: DataTableColumn<SearchProduct>[] = [
  { title: 'Name', key: 'name' },
  {
    title: 'SKU',
    key: 'sku',
    render: (row) =>
      h(
        'span',
        { class: 'font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded' },
        row.sku
      ),
  },
  {
    title: 'Category',
    key: 'category',
    render: (row) =>
      h(NTag, { size: 'small', type: 'success' }, { default: () => row.category }),
  },
  {
    title: 'Price',
    key: 'unitPrice',
    render: (row) =>
      row.unitPrice != null ? `$${Number(row.unitPrice).toFixed(2)}` : '—',
  },
  { title: 'UOM', key: 'unitOfMeasure' },
  {
    title: 'Lot Controlled',
    key: 'isLotControlled',
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.isLotControlled ? 'warning' : 'default' },
        { default: () => (row.isLotControlled ? 'Yes' : 'No') }
      ),
  },
];

// ─── Trending ─────────────────────────────────────────────────────────────────
const trendingTerms = ref<SuggestedTerm[]>([]);
const trendingLoading = ref(false);

async function loadTrending() {
  if (!authStore.hasRole('ADMIN', 'MANAGER')) return;
  trendingLoading.value = true;
  try {
    trendingTerms.value = await searchApi.getTrending();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    trendingLoading.value = false;
  }
}

async function toggleTrending(term: string, currentValue: boolean) {
  try {
    await searchApi.markTrending(term, !currentValue);
    successMsg('Trending status updated');
    await loadTrending();
  } catch (err: any) {
    errorMsg(err);
  }
}

const trendingColumns: DataTableColumn<SuggestedTerm>[] = [
  { title: 'Term', key: 'term' },
  { title: 'Frequency', key: 'frequency' },
  {
    title: 'Is Trending',
    key: 'isTrending',
    render: (row) =>
      h(NSwitch, {
        value: row.isTrending,
        onUpdateValue: () => toggleTrending(row.term, row.isTrending),
      }),
  },
];

// ─── Categories ───────────────────────────────────────────────────────────────
async function loadCategories() {
  try {
    const cats = await searchApi.getCategories();
    categoryOptions.value = cats.map((c) => ({ label: c, value: c }));
  } catch {
    // silently fail
  }
}

onMounted(() => {
  loadCategories();
  loadSuggestions();
  loadTrending();
  doSearch();
});
</script>
