<template>
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <n-icon :size="48" class="text-gray-300 mb-4">
      <component :is="icon || InboxOutline" />
    </n-icon>
    <p class="text-gray-500 font-medium mb-1">{{ message }}</p>
    <p v-if="description" class="text-sm text-gray-400 mb-4">{{ description }}</p>
    <n-button v-if="actionLabel" type="primary" ghost size="small" @click="$emit('action')">
      {{ actionLabel }}
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { NIcon, NButton } from 'naive-ui';
import { AlbumsOutline as InboxOutline } from '@vicons/ionicons5';
import type { Component } from 'vue';

defineProps<{
  message: string;
  description?: string;
  icon?: Component;
  actionLabel?: string;
}>();

defineEmits<{ action: [] }>();
</script>
