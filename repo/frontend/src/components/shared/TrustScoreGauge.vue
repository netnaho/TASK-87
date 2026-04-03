<template>
  <div class="flex flex-col items-center gap-2">
    <n-progress
      type="circle"
      :percentage="percentage"
      :color="color"
      :rail-color="railColor"
      :stroke-width="size === 'large' ? 8 : 6"
      :style="size === 'large' ? 'width:140px' : 'width:80px'"
    >
      <span :class="size === 'large' ? 'text-2xl font-bold' : 'text-base font-semibold'" :style="{ color }">
        {{ score.toFixed(0) }}
      </span>
    </n-progress>
    <n-tag :type="tagType" size="small" round>{{ tier }}</n-tag>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NProgress, NTag } from 'naive-ui';

const props = defineProps<{ score: number; size?: 'small' | 'large' }>();

const percentage = computed(() => Math.min(100, Math.max(0, props.score)));

const color = computed(() => {
  if (props.score >= 75) return '#22c55e';
  if (props.score >= 50) return '#f59e0b';
  return '#ef4444';
});

const railColor = computed(() => {
  if (props.score >= 75) return '#dcfce7';
  if (props.score >= 50) return '#fef3c7';
  return '#fee2e2';
});

const tier = computed(() => {
  if (props.score >= 75) return 'Excellent';
  if (props.score >= 50) return 'Fair';
  return 'At Risk';
});

const tagType = computed((): 'success' | 'warning' | 'error' => {
  if (props.score >= 75) return 'success';
  if (props.score >= 50) return 'warning';
  return 'error';
});
</script>
