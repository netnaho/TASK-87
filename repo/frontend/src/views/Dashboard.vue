<template>
  <div class="p-6">
    <!-- Greeting -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">
        {{ greeting }}, {{ authStore.user?.displayName ?? 'there' }}!
      </h1>
      <p class="text-gray-500 mt-1">{{ roleDescription }}</p>
    </div>

    <!-- Stat Cards -->
    <n-grid :cols="4" :x-gap="16" :y-gap="16" class="mb-8" responsive="screen">
      <template v-if="statsLoading">
        <n-grid-item v-for="n in 4" :key="n">
          <n-skeleton height="100px" :sharp="false" />
        </n-grid-item>
      </template>

      <template v-else>
        <!-- Low Stock Alerts — all inventory roles -->
        <n-grid-item
          v-if="authStore.hasRole('ADMIN', 'MANAGER', 'INVENTORY_CLERK')"
        >
          <StatCard
            title="Low Stock Alerts"
            :value="String(lowStockCount)"
            :icon="AlertCircleOutline"
            bg-color="#fef2f2"
            icon-color="#ef4444"
          />
        </n-grid-item>

        <!-- Pending Stock Counts — inventory roles -->
        <n-grid-item
          v-if="authStore.hasRole('ADMIN', 'MANAGER', 'INVENTORY_CLERK')"
        >
          <StatCard
            title="Pending Counts"
            :value="String(pendingCountsCount)"
            :icon="ClipboardOutline"
            bg-color="#eff6ff"
            icon-color="#3b82f6"
          />
        </n-grid-item>

        <!-- Pending Reports — moderation roles -->
        <n-grid-item
          v-if="authStore.hasRole('ADMIN', 'MANAGER', 'MODERATOR')"
        >
          <StatCard
            title="Pending Reports"
            :value="String(pendingReportsCount)"
            :icon="FlagOutline"
            bg-color="#fff7ed"
            icon-color="#f97316"
          />
        </n-grid-item>

        <!-- Active Promotions — ADMIN/MANAGER -->
        <n-grid-item
          v-if="authStore.hasRole('ADMIN', 'MANAGER')"
        >
          <StatCard
            title="Active Promotions"
            :value="String(activePromosCount)"
            :icon="PricetagOutline"
            bg-color="#f0fdf4"
            icon-color="#22c55e"
          />
        </n-grid-item>
      </template>
    </n-grid>

    <!-- Quick Actions -->
    <h2 class="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
    <n-grid :cols="3" :x-gap="16" :y-gap="16" responsive="screen">
      <n-grid-item
        v-for="action in visibleActions"
        :key="action.title"
      >
        <n-card
          hoverable
          class="cursor-pointer transition-shadow"
          @click="router.push({ name: action.route })"
        >
          <div class="flex items-start gap-4">
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              :style="{ backgroundColor: action.bgColor }"
            >
              <n-icon :size="24" :color="action.iconColor">
                <component :is="action.icon" />
              </n-icon>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-gray-900">{{ action.title }}</p>
              <p class="text-sm text-gray-500 mt-0.5 leading-snug">{{ action.description }}</p>
            </div>
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  NGrid,
  NGridItem,
  NCard,
  NIcon,
  NSkeleton,
} from 'naive-ui';
import type { Component } from 'vue';
import {
  AlertCircleOutline,
  ClipboardOutline,
  FlagOutline,
  PricetagOutline,
  CubeOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  SwapHorizontalOutline,
  ListOutline,
  StarOutline,
  ShieldCheckmarkOutline,
  StatsChartOutline,
  PricetagsOutline,
  PeopleOutline,
  SearchOutline,
} from '@vicons/ionicons5';
import { inventoryApi } from '../api/inventory';
import { moderationApi } from '../api/moderation';
import { promotionsApi } from '../api/promotions';
import { useAuthStore } from '../stores/auth';
import StatCard from '../components/shared/StatCard.vue';

const router = useRouter();
const authStore = useAuthStore();

// ─── Greeting ─────────────────────────────────────────────────────────────────
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
});

const roleDescriptions: Record<string, string> = {
  ADMIN: 'Full system access — manage all operations, users, and configuration.',
  MANAGER: 'Oversee inventory, promotions, reports, and team operations.',
  INVENTORY_CLERK: 'Manage receiving, issues, transfers, and stock counts.',
  FRONT_DESK: 'Handle guest reviews and front-desk operations.',
  HOST: 'Manage property listings and respond to guest reviews.',
  GUEST: 'Submit reviews and browse available services.',
  MODERATOR: 'Review flagged content and manage the moderation queue.',
};

const roleDescription = computed(
  () => roleDescriptions[authStore.userRole] ?? 'Welcome to HarborOps.'
);

// ─── Stats ────────────────────────────────────────────────────────────────────
const statsLoading = ref(true);
const lowStockCount = ref(0);
const pendingCountsCount = ref(0);
const pendingReportsCount = ref(0);
const activePromosCount = ref(0);

async function loadStats() {
  statsLoading.value = true;
  try {
    const tasks: Promise<void>[] = [];

    if (authStore.hasRole('ADMIN', 'MANAGER', 'INVENTORY_CLERK')) {
      tasks.push(
        inventoryApi
          .getLowStock()
          .then((data) => { lowStockCount.value = data.length; })
          .catch(() => {})
      );
      tasks.push(
        inventoryApi
          .listStockCounts({ status: 'PENDING_APPROVAL', pageSize: 1 })
          .then((res) => { pendingCountsCount.value = res.total; })
          .catch(() => {})
      );
    }

    if (authStore.hasRole('ADMIN', 'MANAGER', 'MODERATOR')) {
      tasks.push(
        moderationApi
          .getQueue({ status: 'PENDING', pageSize: 1 })
          .then((res) => { pendingReportsCount.value = res.total; })
          .catch(() => {})
      );
    }

    if (authStore.hasRole('ADMIN', 'MANAGER')) {
      tasks.push(
        promotionsApi
          .listPromotions({ isActive: 'true', pageSize: 1 })
          .then((res) => { activePromosCount.value = res.total; })
          .catch(() => {})
      );
    }

    await Promise.all(tasks);
  } finally {
    statsLoading.value = false;
  }
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
interface QuickAction {
  title: string;
  description: string;
  route: string;
  icon: Component;
  bgColor: string;
  iconColor: string;
  roles: string[];
}

const allActions: QuickAction[] = [
  {
    title: 'New Receiving',
    description: 'Record incoming inventory from a vendor.',
    route: 'Receiving',
    icon: ArrowDownOutline,
    bgColor: '#eff6ff',
    iconColor: '#3b82f6',
    roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'],
  },
  {
    title: 'Issue Stock',
    description: 'Issue items out of inventory for use.',
    route: 'StockIssue',
    icon: ArrowUpOutline,
    bgColor: '#fef3c7',
    iconColor: '#f59e0b',
    roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'],
  },
  {
    title: 'Transfer Stock',
    description: 'Move inventory between locations.',
    route: 'Transfer',
    icon: SwapHorizontalOutline,
    bgColor: '#f0fdf4',
    iconColor: '#22c55e',
    roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'],
  },
  {
    title: 'Stock Counts',
    description: 'Initiate and review stock count workflows.',
    route: 'StockCounts',
    icon: ListOutline,
    bgColor: '#faf5ff',
    iconColor: '#a855f7',
    roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'],
  },
  {
    title: 'Write a Review',
    description: 'Share your experience with a stay or task.',
    route: 'ReviewForm',
    icon: StarOutline,
    bgColor: '#fff7ed',
    iconColor: '#f97316',
    roles: ['GUEST', 'HOST'],
  },
  {
    title: 'Moderation Queue',
    description: 'Triage reported content and take moderation actions.',
    route: 'Moderation',
    icon: ShieldCheckmarkOutline,
    bgColor: '#fef2f2',
    iconColor: '#ef4444',
    roles: ['ADMIN', 'MODERATOR'],
  },
  {
    title: 'Reports & KPIs',
    description: 'View daily KPI trends and review efficiency metrics.',
    route: 'Reports',
    icon: StatsChartOutline,
    bgColor: '#eff6ff',
    iconColor: '#3b82f6',
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Manage Promotions',
    description: 'Create and manage discount promotions.',
    route: 'Promotions',
    icon: PricetagsOutline,
    bgColor: '#f0fdf4',
    iconColor: '#22c55e',
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Product Search',
    description: 'Search and explore the product catalog.',
    route: 'Search',
    icon: SearchOutline,
    bgColor: '#faf5ff',
    iconColor: '#a855f7',
    roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK', 'FRONT_DESK', 'HOST', 'GUEST'],
  },
  {
    title: 'User Management',
    description: 'Manage users and their roles in the system.',
    route: 'UserManagement',
    icon: PeopleOutline,
    bgColor: '#fff7ed',
    iconColor: '#f97316',
    roles: ['ADMIN'],
  },
];

const visibleActions = computed(() =>
  allActions.filter((a) => a.roles.includes(authStore.userRole))
);

onMounted(() => {
  loadStats();
});
</script>
