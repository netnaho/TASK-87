<template>
  <div class="p-6">
    <PageHeader title="Reports & KPI Dashboard" />

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ─── Tab 1: KPI Dashboard ─────────────────────────────────────────── -->
      <n-tab-pane name="kpi" tab="KPI Dashboard">
        <template v-if="kpiLoading">
          <n-grid :cols="4" :x-gap="16" :y-gap="16" class="mb-6">
            <n-grid-item v-for="n in 4" :key="n">
              <n-skeleton height="100px" :sharp="false" />
            </n-grid-item>
          </n-grid>
          <n-skeleton height="320px" :sharp="false" />
        </template>

        <template v-else-if="kpiData.length === 0">
          <EmptyState message="No KPI data available" description="KPI records will appear here once data is collected." />
        </template>

        <template v-else>
          <n-grid :cols="4" :x-gap="16" :y-gap="16" class="mb-6" responsive="screen">
            <n-grid-item>
              <StatCard
                title="Daily Active Users"
                :value="String(latestKpi!.dau)"
                :icon="PeopleOutline"
                bg-color="#eff6ff"
                icon-color="#3b82f6"
              />
            </n-grid-item>
            <n-grid-item>
              <StatCard
                title="Conversion Rate"
                :value="latestKpi!.conversionRate.toFixed(1) + '%'"
                :icon="TrendingUpOutline"
                bg-color="#f0fdf4"
                icon-color="#22c55e"
              />
            </n-grid-item>
            <n-grid-item>
              <StatCard
                title="Avg Order Value"
                :value="'$' + latestKpi!.aov.toFixed(2)"
                :icon="CartOutline"
                bg-color="#faf5ff"
                icon-color="#a855f7"
              />
            </n-grid-item>
            <n-grid-item>
              <StatCard
                title="Repurchase Rate"
                :value="latestKpi!.repurchaseRate.toFixed(1) + '%'"
                :icon="RefreshOutline"
                bg-color="#fff7ed"
                icon-color="#f97316"
              />
            </n-grid-item>
          </n-grid>

          <n-card title="KPI Trend" class="mb-4">
            <div style="position: relative; height: 300px">
              <canvas ref="kpiChartCanvas" />
            </div>
          </n-card>
        </template>
      </n-tab-pane>

      <!-- ─── Tab 2: Review Efficiency ────────────────────────────────────── -->
      <n-tab-pane name="efficiency" tab="Review Efficiency">
        <template v-if="effLoading">
          <n-skeleton height="320px" :sharp="false" class="mb-4" />
          <n-skeleton height="240px" :sharp="false" />
        </template>

        <template v-else-if="efficiencyData.length === 0">
          <EmptyState message="No efficiency data available" />
        </template>

        <template v-else>
          <n-grid :cols="4" :x-gap="16" :y-gap="16" class="mb-6" responsive="screen">
            <n-grid-item>
              <n-card size="small">
                <n-statistic label="Avg Moderation Time">
                  <template #default>{{ avgModerationTime.toFixed(1) }}</template>
                  <template #suffix>hrs</template>
                </n-statistic>
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small">
                <n-statistic label="Total Flagged" :value="totalFlagged" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small">
                <n-statistic label="Total Resolved" :value="totalResolved" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card size="small">
                <n-statistic label="Avg Appeal Rate">
                  <template #default>{{ avgAppealRate.toFixed(1) }}</template>
                  <template #suffix>%</template>
                </n-statistic>
              </n-card>
            </n-grid-item>
          </n-grid>

          <n-card title="Flagged vs Resolved" class="mb-4">
            <div style="position: relative; height: 280px">
              <canvas ref="effChartCanvas" />
            </div>
          </n-card>

          <n-card title="Efficiency Data">
            <n-data-table
              :columns="efficiencyColumns"
              :data="efficiencyData"
              :pagination="{ pageSize: 15 }"
              :row-key="(r: ReviewEfficiencyReport) => r.id"
            />
          </n-card>
        </template>
      </n-tab-pane>

      <!-- ─── Tab 3: Scheduled Reports ────────────────────────────────────── -->
      <n-tab-pane name="scheduled" tab="Scheduled Reports">
        <n-card title="Schedule New Report" class="mb-4">
          <n-space align="center">
            <n-select
              v-model:value="scheduleForm.reportType"
              :options="reportTypeOptions"
              placeholder="Report type"
              style="width: 220px"
            />
            <n-date-picker
              v-model:value="scheduleForm.scheduledFor"
              type="datetime"
              placeholder="Scheduled time"
              style="width: 240px"
            />
            <n-button type="primary" :loading="scheduleSubmitting" @click="submitSchedule">
              Schedule Report
            </n-button>
          </n-space>
        </n-card>

        <n-spin :show="schedLoading">
          <n-data-table
            v-if="scheduledReports.length > 0"
            :columns="scheduledColumns"
            :data="scheduledReports"
            :pagination="{ pageSize: 20 }"
            :row-key="(r: ScheduledReport) => r.id"
          />
          <EmptyState v-else-if="!schedLoading" message="No scheduled reports" />
        </n-spin>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, h, nextTick } from 'vue';
import {
  NTabs,
  NTabPane,
  NCard,
  NSpin,
  NDataTable,
  NGrid,
  NGridItem,
  NTag,
  NSkeleton,
  NStatistic,
  NSelect,
  NDatePicker,
  NButton,
  NSpace,
} from 'naive-ui';
import type { DataTableColumn } from 'naive-ui';
import {
  PeopleOutline,
  TrendingUpOutline,
  CartOutline,
  RefreshOutline,
} from '@vicons/ionicons5';
import { Chart } from 'chart.js/auto';
import { reportsApi } from '../../api/reports';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import StatCard from '../../components/shared/StatCard.vue';
import type { KpiDaily, ReviewEfficiencyReport, ScheduledReport } from '../../types';

const { errorMsg, successMsg } = useAppMessage();

const activeTab = ref('kpi');

// ─── KPI Dashboard ────────────────────────────────────────────────────────────
const kpiData = ref<KpiDaily[]>([]);
const kpiLoading = ref(false);
const kpiChartCanvas = ref<HTMLCanvasElement | null>(null);
let kpiChart: Chart | null = null;

const latestKpi = computed<KpiDaily | null>(() => {
  if (kpiData.value.length === 0) return null;
  return kpiData.value[kpiData.value.length - 1];
});

async function loadKpi() {
  kpiLoading.value = true;
  try {
    const data = await reportsApi.getKpiDashboard();
    kpiData.value = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    await nextTick();
    buildKpiChart();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    kpiLoading.value = false;
  }
}

function buildKpiChart() {
  if (!kpiChartCanvas.value || kpiData.value.length === 0) return;
  try {
    kpiChart?.destroy();
    kpiChart = new Chart(kpiChartCanvas.value, {
      type: 'line',
      data: {
        labels: kpiData.value.map((d) => new Date(d.date).toLocaleDateString()),
        datasets: [
          {
            label: 'DAU',
            data: kpiData.value.map((d) => d.dau),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            yAxisID: 'left',
            tension: 0.3,
          },
          {
            label: 'Conversion Rate (%)',
            data: kpiData.value.map((d) => d.conversionRate),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.08)',
            yAxisID: 'right',
            tension: 0.3,
          },
          {
            label: 'AOV ($)',
            data: kpiData.value.map((d) => d.aov),
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,0.08)',
            yAxisID: 'right',
            tension: 0.3,
          },
          {
            label: 'Repurchase Rate (%)',
            data: kpiData.value.map((d) => d.repurchaseRate),
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.08)',
            yAxisID: 'right',
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          left: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'DAU' },
          },
          right: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Rates / AOV' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  } catch {
    // graceful skip if chart.js fails
  }
}

// ─── Review Efficiency ────────────────────────────────────────────────────────
const efficiencyData = ref<ReviewEfficiencyReport[]>([]);
const effLoading = ref(false);
const effChartCanvas = ref<HTMLCanvasElement | null>(null);
let effChart: Chart | null = null;

const avgModerationTime = computed(() => {
  if (efficiencyData.value.length === 0) return 0;
  return (
    efficiencyData.value.reduce((acc, d) => acc + d.avgModerationTimeHrs, 0) /
    efficiencyData.value.length
  );
});
const totalFlagged = computed(() =>
  efficiencyData.value.reduce((acc, d) => acc + d.flaggedCount, 0)
);
const totalResolved = computed(() =>
  efficiencyData.value.reduce((acc, d) => acc + d.resolvedCount, 0)
);
const avgAppealRate = computed(() => {
  if (efficiencyData.value.length === 0) return 0;
  return (
    efficiencyData.value.reduce((acc, d) => acc + d.appealRate, 0) /
    efficiencyData.value.length
  );
});

async function loadEfficiency() {
  effLoading.value = true;
  try {
    efficiencyData.value = await reportsApi.getReviewEfficiency();
    await nextTick();
    buildEffChart();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    effLoading.value = false;
  }
}

function buildEffChart() {
  if (!effChartCanvas.value || efficiencyData.value.length === 0) return;
  try {
    effChart?.destroy();
    effChart = new Chart(effChartCanvas.value, {
      type: 'bar',
      data: {
        labels: efficiencyData.value.map((d) => new Date(d.date).toLocaleDateString()),
        datasets: [
          {
            label: 'Flagged',
            data: efficiencyData.value.map((d) => d.flaggedCount),
            backgroundColor: 'rgba(239,68,68,0.7)',
          },
          {
            label: 'Resolved',
            data: efficiencyData.value.map((d) => d.resolvedCount),
            backgroundColor: 'rgba(34,197,94,0.7)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true },
        },
      },
    });
  } catch {
    // graceful skip if chart.js fails
  }
}

const efficiencyColumns: DataTableColumn<ReviewEfficiencyReport>[] = [
  {
    title: 'Date',
    key: 'date',
    render: (row) => new Date(row.date).toLocaleDateString(),
  },
  {
    title: 'Avg Time (hrs)',
    key: 'avgModerationTimeHrs',
    render: (row) => row.avgModerationTimeHrs.toFixed(2),
  },
  { title: 'Flagged', key: 'flaggedCount' },
  { title: 'Resolved', key: 'resolvedCount' },
  {
    title: 'Appeal Rate (%)',
    key: 'appealRate',
    render: (row) => row.appealRate.toFixed(1) + '%',
  },
];

// ─── Scheduled Reports ────────────────────────────────────────────────────────
const scheduledReports = ref<ScheduledReport[]>([]);
const schedLoading = ref(false);

async function loadScheduled() {
  schedLoading.value = true;
  try {
    scheduledReports.value = await reportsApi.getScheduledReports();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    schedLoading.value = false;
  }
}

function scheduledStatusTagType(status: string): 'default' | 'info' | 'success' | 'error' | 'warning' {
  const map: Record<string, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
    PENDING: 'warning',
    PROCESSING: 'info',
    READY: 'success',
    FAILED: 'error',
  };
  return map[status] ?? 'default';
}

const scheduledColumns: DataTableColumn<ScheduledReport>[] = [
  { title: 'Report Type', key: 'reportType' },
  {
    title: 'Scheduled Time',
    key: 'scheduledTime',
    render: (row) => new Date(row.scheduledTime).toLocaleString(),
  },
  {
    title: 'Status',
    key: 'status',
    render: (row) =>
      h(
        NTag,
        { type: scheduledStatusTagType(row.status), size: 'small' },
        { default: () => row.status }
      ),
  },
  {
    title: 'Created',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    title: 'File',
    key: 'filePath',
    render: (row) => {
      if (row.status !== 'READY') return '—';
      return h(
        'a',
        {
          href: reportsApi.getDownloadUrl(row.id),
          target: '_blank',
          rel: 'noopener',
          style: 'color: #3b82f6; text-decoration: underline',
        },
        'Download'
      );
    },
  },
];

// ─── Schedule Form ───────────────────────────────────────────────────────────
const reportTypeOptions = [
  { label: 'KPI Summary', value: 'KPI_SUMMARY' },
  { label: 'Review Efficiency', value: 'REVIEW_EFFICIENCY' },
  { label: 'Inventory Snapshot', value: 'INVENTORY_SNAPSHOT' },
];

const scheduleForm = ref<{ reportType: string | null; scheduledFor: number | null }>({
  reportType: null,
  scheduledFor: null,
});
const scheduleSubmitting = ref(false);

async function submitSchedule() {
  if (!scheduleForm.value.reportType || !scheduleForm.value.scheduledFor) return;
  scheduleSubmitting.value = true;
  try {
    await reportsApi.createScheduledReport({
      reportType: scheduleForm.value.reportType,
      scheduledFor: new Date(scheduleForm.value.scheduledFor).toISOString(),
    });
    successMsg('Report scheduled successfully');
    scheduleForm.value = { reportType: null, scheduledFor: null };
    await loadScheduled();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    scheduleSubmitting.value = false;
  }
}

// ─── Tab load ─────────────────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'efficiency' && efficiencyData.value.length === 0) loadEfficiency();
  if (tab === 'scheduled' && scheduledReports.value.length === 0) loadScheduled();
});

onBeforeUnmount(() => {
  kpiChart?.destroy();
  effChart?.destroy();
});

onMounted(() => {
  loadKpi();
});
</script>
