<template>
  <div>
    <n-upload
      multiple
      :max="maxCount"
      list-type="image-card"
      accept="image/jpeg,image/png,image/gif,image/webp"
      :custom-request="handleUpload"
      @remove="handleRemove"
    >
      <n-upload-dragger v-if="files.length < maxCount">
        <div class="flex flex-col items-center gap-2 py-2">
          <n-icon :size="24" class="text-gray-400"><ImageOutline /></n-icon>
          <span class="text-sm text-gray-400">Click or drag images (max {{ maxCount }})</span>
        </div>
      </n-upload-dragger>
    </n-upload>
    <p class="text-xs text-gray-400 mt-1">Max {{ maxCount }} images, 5MB each. JPEG, PNG, GIF, WebP.</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { NUpload, NUploadDragger, NIcon } from 'naive-ui';
import type { UploadCustomRequestOptions, UploadFileInfo } from 'naive-ui';
import { ImageOutline } from '@vicons/ionicons5';

const props = defineProps<{ maxCount?: number }>();
const emit = defineEmits<{ 'update:files': [File[]] }>();

const maxCount = props.maxCount ?? 6;
const files = ref<File[]>([]);

function handleUpload({ file, onFinish }: UploadCustomRequestOptions) {
  files.value.push(file.file as File);
  emit('update:files', [...files.value]);
  onFinish();
}

function handleRemove({ file }: { file: UploadFileInfo }) {
  files.value = files.value.filter((f) => f.name !== file.name);
  emit('update:files', [...files.value]);
}
</script>
