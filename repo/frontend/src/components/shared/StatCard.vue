<template>
  <n-card class="stat-card" :bordered="false" style="border-radius: 12px;">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{{ title }}</p>
        <p class="text-3xl font-bold text-gray-900">{{ value }}</p>
        <div v-if="trend !== undefined" class="flex items-center gap-1 mt-1">
          <span
            class="text-xs font-medium"
            :class="trend >= 0 ? 'text-green-600' : 'text-red-500'"
          >
            {{ trend >= 0 ? '↑' : '↓' }} {{ Math.abs(trend) }}%
          </span>
          <span class="text-xs text-gray-400">{{ trendLabel }}</span>
        </div>
      </div>
      <div
        class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        :style="{ backgroundColor: bgColor || '#eff6ff' }"
      >
        <n-icon :size="24" :color="iconColor || '#3b82f6'">
          <component :is="icon" />
        </n-icon>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { NCard, NIcon } from 'naive-ui';
import type { Component } from 'vue';

defineProps<{
  title: string;
  value: string | number;
  icon: Component;
  bgColor?: string;
  iconColor?: string;
  trend?: number;
  trendLabel?: string;
}>();
</script>

<style scoped>
.stat-card {
  box-shadow: 0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06);
  transition: box-shadow 0.2s;
}
.stat-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.08);
}
</style>
