<template>
  <n-modal v-model:show="visible" preset="dialog" :type="type || 'warning'" :title="title" :content="message"
    positive-text="Confirm" negative-text="Cancel"
    @positive-click="$emit('confirm')"
    @negative-click="visible = false"
    @after-leave="$emit('cancel')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NModal } from 'naive-ui';

const props = defineProps<{
  show: boolean;
  title: string;
  message: string;
  type?: 'error' | 'warning' | 'info' | 'success';
}>();

const emit = defineEmits<{ confirm: []; cancel: []; 'update:show': [boolean] }>();

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
});
</script>
