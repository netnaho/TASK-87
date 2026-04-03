<template>
  <n-tag :type="roleType" size="small" round>{{ roleLabel }}</n-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NTag } from 'naive-ui';
import type { Role } from '../../types';

const props = defineProps<{ role: Role }>();

const roleMap: Record<Role, { type: 'default' | 'info' | 'success' | 'warning' | 'error'; label: string }> = {
  ADMIN: { type: 'error', label: 'Admin' },
  MANAGER: { type: 'warning', label: 'Manager' },
  INVENTORY_CLERK: { type: 'info', label: 'Clerk' },
  FRONT_DESK: { type: 'info', label: 'Front Desk' },
  HOST: { type: 'success', label: 'Host' },
  GUEST: { type: 'default', label: 'Guest' },
  MODERATOR: { type: 'warning', label: 'Moderator' },
};

const roleType = computed(() => roleMap[props.role]?.type ?? 'default');
const roleLabel = computed(() => roleMap[props.role]?.label ?? props.role);
</script>
