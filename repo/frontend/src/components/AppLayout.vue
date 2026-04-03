<template>
  <n-layout has-sider class="h-screen">
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="collapsed"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
      class="bg-harbor-900"
    >
      <div class="p-4 flex items-center gap-3 border-b border-gray-700">
        <div class="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          H
        </div>
        <span v-if="!collapsed" class="text-white font-semibold text-lg">HarborOps</span>
      </div>

      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="mt-2"
      />

      <div v-if="!collapsed" class="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
        <div class="flex items-center gap-3">
          <n-avatar :size="32" round class="bg-blue-500">
            {{ userInitial }}
          </n-avatar>
          <div class="flex-1 min-w-0">
            <div class="text-white text-sm font-medium truncate">{{ authStore.user?.displayName }}</div>
            <div class="text-gray-400 text-xs">{{ roleName }}</div>
          </div>
          <n-button text @click="handleLogout" class="text-gray-400 hover:text-white">
            <template #icon>
              <n-icon :size="18">
                <LogOutOutline />
              </n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </n-layout-sider>

    <n-layout>
      <n-layout-header bordered class="h-14 flex items-center px-6 bg-white">
        <n-breadcrumb>
          <n-breadcrumb-item>
            <router-link to="/">Home</router-link>
          </n-breadcrumb-item>
          <n-breadcrumb-item v-if="$route.name !== 'Dashboard'">
            {{ $route.name }}
          </n-breadcrumb-item>
        </n-breadcrumb>
      </n-layout-header>

      <n-layout-content class="p-6" content-style="background: #f5f7fa;">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { NIcon } from 'naive-ui';
import type { MenuOption } from 'naive-ui';
import { useAuthStore } from '../stores/auth';
import {
  HomeOutline,
  CubeOutline,
  StarOutline,
  ShieldCheckmarkOutline,
  PricetagsOutline,
  SearchOutline,
  StatsChartOutline,
  AlertCircleOutline,
  PeopleOutline,
  LogOutOutline,
  ReceiptOutline,
  SwapHorizontalOutline,
  BookOutline,
  ArrowDownOutline,
  ListOutline,
  BarChartOutline,
  ShieldOutline,
  PersonOutline,
} from '@vicons/ionicons5';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const collapsed = ref(false);

const userInitial = computed(() => (authStore.user?.displayName?.[0] || 'U').toUpperCase());

const roleNames: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  INVENTORY_CLERK: 'Inventory Clerk',
  FRONT_DESK: 'Front Desk',
  HOST: 'Host',
  GUEST: 'Guest',
  MODERATOR: 'Moderator',
};
const roleName = computed(() => roleNames[authStore.userRole] || authStore.userRole);

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const menuOptions = computed<MenuOption[]>(() => {
  const items: MenuOption[] = [
    { label: 'Dashboard', key: 'Dashboard', icon: renderIcon(HomeOutline) },
  ];

  if (authStore.hasRole('ADMIN', 'MANAGER', 'INVENTORY_CLERK')) {
    const inventoryChildren: MenuOption[] = [
      { label: 'Stock Overview', key: 'Inventory', icon: renderIcon(CubeOutline) },
      { label: 'Receive Stock', key: 'Receiving', icon: renderIcon(ReceiptOutline) },
      { label: 'Issue Stock', key: 'StockIssue', icon: renderIcon(ArrowDownOutline) },
      { label: 'Transfer Stock', key: 'Transfer', icon: renderIcon(SwapHorizontalOutline) },
      { label: 'Stock Counts', key: 'StockCounts', icon: renderIcon(ListOutline) },
      { label: 'Item Master', key: 'ItemMaster', icon: renderIcon(BarChartOutline) },
    ];
    if (authStore.hasRole('ADMIN', 'MANAGER')) {
      inventoryChildren.push({ label: 'Ledger / Query Center', key: 'Ledger', icon: renderIcon(BookOutline) });
    }
    items.push({
      label: 'Inventory',
      key: 'inventory-group',
      icon: renderIcon(CubeOutline),
      children: inventoryChildren,
    });
  }

  if (authStore.hasRole('ADMIN', 'MANAGER', 'FRONT_DESK', 'HOST', 'GUEST', 'MODERATOR')) {
    items.push({ label: 'Reviews', key: 'Reviews', icon: renderIcon(StarOutline) });
  }

  const trustChildren: MenuOption[] = [
    { label: 'My Score & History', key: 'Trust', icon: renderIcon(ShieldCheckmarkOutline) },
  ];
  if (authStore.hasRole('ADMIN', 'MANAGER')) {
    trustChildren.push({ label: 'Admin Panel', key: 'AdminTrust', icon: renderIcon(PersonOutline) });
  }
  items.push({
    label: 'Trust & Credit',
    key: 'trust-group',
    icon: renderIcon(ShieldCheckmarkOutline),
    children: trustChildren,
  });

  if (authStore.hasRole('ADMIN', 'MANAGER')) {
    items.push({ label: 'Promotions', key: 'Promotions', icon: renderIcon(PricetagsOutline) });
  }

  items.push({ label: 'Product Search', key: 'Search', icon: renderIcon(SearchOutline) });

  if (authStore.hasRole('ADMIN', 'MANAGER')) {
    items.push({ label: 'Reports & KPIs', key: 'Reports', icon: renderIcon(StatsChartOutline) });
  }

  if (authStore.hasRole('ADMIN', 'MODERATOR')) {
    items.push({ label: 'Moderation', key: 'Moderation', icon: renderIcon(AlertCircleOutline) });
  }

  if (authStore.hasRole('ADMIN')) {
    items.push({ label: 'User Management', key: 'UserManagement', icon: renderIcon(PeopleOutline) });
  }

  return items;
});

const activeKey = computed(() => route.name as string);

const groupKeys = new Set(['inventory-group', 'trust-group']);

function handleMenuSelect(key: string) {
  if (key && !groupKeys.has(key)) {
    router.push({ name: key });
  }
}

function handleLogout() {
  authStore.logout();
  router.push({ name: 'Login' });
}
</script>

<style scoped>
:deep(.n-layout-sider) {
  background: #0d1b2b !important;
}
:deep(.n-menu) {
  background: transparent !important;
}
:deep(.n-menu-item-content) {
  color: #94a3b8 !important;
}
:deep(.n-menu-item-content:hover) {
  color: #ffffff !important;
}
:deep(.n-menu-item-content--selected) {
  color: #60a5fa !important;
}
</style>
