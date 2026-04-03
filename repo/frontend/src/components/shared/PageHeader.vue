<template>
  <div class="flex items-start justify-between mb-6">
    <div>
      <div v-if="backRoute" class="mb-1">
        <n-button text size="small" @click="router.push({ name: backRoute })" class="text-gray-500 hover:text-gray-800">
          <template #icon><n-icon><ArrowBackOutline /></n-icon></template>
          Back
        </n-button>
      </div>
      <h1 class="text-2xl font-bold text-gray-900 leading-tight">{{ title }}</h1>
      <p v-if="subtitle" class="text-sm text-gray-500 mt-0.5">{{ subtitle }}</p>
    </div>
    <div class="flex items-center gap-2 flex-shrink-0 ml-4">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { NButton, NIcon } from 'naive-ui';
import { ArrowBackOutline } from '@vicons/ionicons5';

defineProps<{
  title: string;
  subtitle?: string;
  backRoute?: string;
}>();

const router = useRouter();
</script>
