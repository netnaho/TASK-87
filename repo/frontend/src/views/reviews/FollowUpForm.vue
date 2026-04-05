<template>
  <div>
    <PageHeader :title="`Follow-Up for Review #${parentId}`" back-route="Reviews" />

    <n-card style="max-width: 720px; margin: 0 auto">
      <n-alert v-if="invalidId" type="error" class="mb-4">
        Invalid review ID. Please go back and try again.
      </n-alert>

      <n-form
        v-else
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <!-- Ratings row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <n-form-item label="🧹 Cleanliness" path="ratingCleanliness">
            <n-rate
              v-model:value="form.ratingCleanliness"
              :count="5"
              :allow-half="false"
            />
          </n-form-item>

          <n-form-item label="💬 Communication" path="ratingCommunication">
            <n-rate
              v-model:value="form.ratingCommunication"
              :count="5"
              :allow-half="false"
            />
          </n-form-item>

          <n-form-item label="🎯 Accuracy" path="ratingAccuracy">
            <n-rate
              v-model:value="form.ratingAccuracy"
              :count="5"
              :allow-half="false"
            />
          </n-form-item>
        </div>

        <!-- Overall preview -->
        <n-form-item label="Overall Rating (average)">
          <n-text :depth="overallAverage > 0 ? 1 : 3" style="font-size: 16px; font-weight: 600">
            {{ overallAverage > 0 ? `⭐ ${overallAverage.toFixed(2)} / 5.00` : 'Rate all three categories above' }}
          </n-text>
        </n-form-item>

        <n-divider />

        <!-- Review text -->
        <n-form-item label="Follow-Up Text (optional)" path="text">
          <div style="width: 100%">
            <n-input
              v-model:value="form.text"
              type="textarea"
              :rows="4"
              :maxlength="5000"
              show-count
              placeholder="What changed since your original review?"
            />
          </div>
        </n-form-item>

        <!-- Tags -->
        <n-form-item label="Tags (optional)">
          <n-select
            v-model:value="form.tagIds"
            :options="tagOptions"
            multiple
            clearable
            filterable
            placeholder="Select tags"
          />
        </n-form-item>

        <!-- Images -->
        <n-form-item label="Images (optional, max 6)">
          <ImageUpload :max-count="6" @update:files="handleFilesUpdate" />
        </n-form-item>

        <!-- Submit -->
        <n-form-item>
          <n-space>
            <n-button
              type="primary"
              :loading="submitting"
              :disabled="submitting"
              @click="handleSubmit"
            >
              Submit Follow-Up
            </n-button>
            <n-button @click="goBack">Cancel</n-button>
          </n-space>
        </n-form-item>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import type { FormInst, FormRules } from 'naive-ui';
import {
  NCard,
  NForm,
  NFormItem,
  NButton,
  NInput,
  NSelect,
  NRate,
  NSpace,
  NDivider,
  NText,
  NAlert,
} from 'naive-ui';
import { useRouter, useRoute } from 'vue-router';
import { reviewsApi } from '../../api/reviews';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import ImageUpload from '../../components/shared/ImageUpload.vue';
import type { ReviewTag } from '../../types';

const router = useRouter();
const route = useRoute();
const { successMsg, errorMsg } = useAppMessage();

const rawId = Number(route.params.id);
const parentId = computed(() => rawId);
const invalidId = computed(() => !Number.isFinite(rawId) || rawId <= 0);

const formRef = ref<FormInst | null>(null);
const submitting = ref(false);
const imageFiles = ref<File[]>([]);
const availableTags = ref<ReviewTag[]>([]);

const form = reactive({
  ratingCleanliness: 0,
  ratingCommunication: 0,
  ratingAccuracy: 0,
  text: '',
  tagIds: [] as number[],
});

const tagOptions = computed(() =>
  availableTags.value.map((t) => ({ label: t.name, value: t.id }))
);

const overallAverage = computed(() => {
  const c = form.ratingCleanliness;
  const co = form.ratingCommunication;
  const a = form.ratingAccuracy;
  if (c === 0 && co === 0 && a === 0) return 0;
  return (c + co + a) / 3;
});

const rules: FormRules = {
  ratingCleanliness: [
    { required: true, type: 'number', min: 1, message: 'Cleanliness rating is required (1-5)', trigger: ['change'] },
  ],
  ratingCommunication: [
    { required: true, type: 'number', min: 1, message: 'Communication rating is required (1-5)', trigger: ['change'] },
  ],
  ratingAccuracy: [
    { required: true, type: 'number', min: 1, message: 'Accuracy rating is required (1-5)', trigger: ['change'] },
  ],
};

function handleFilesUpdate(files: File[]) {
  imageFiles.value = files;
}

function goBack() {
  router.push({ name: 'ReviewDetail', params: { id: rawId } });
}

async function handleSubmit() {
  if (invalidId.value) return;

  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const fd = new FormData();
    fd.append('ratingCleanliness', String(form.ratingCleanliness));
    fd.append('ratingCommunication', String(form.ratingCommunication));
    fd.append('ratingAccuracy', String(form.ratingAccuracy));
    if (form.text) fd.append('text', form.text);
    form.tagIds.forEach((id) => fd.append('tagIds[]', String(id)));
    imageFiles.value.forEach((f) => fd.append('images', f));

    await reviewsApi.createFollowUp(rawId, fd);
    successMsg('Follow-up submitted successfully');
    router.push({ name: 'ReviewDetail', params: { id: rawId } });
  } catch (err: any) {
    const code = err?.response?.data?.error?.code;
    if (code === 'DUPLICATE') {
      errorMsg('You have already submitted a follow-up for this review.');
    } else if (code === 'FORBIDDEN') {
      errorMsg('You can only add a follow-up to your own review.');
    } else if (code === 'WINDOW_EXPIRED') {
      errorMsg('The 7-day follow-up window for this review has passed.');
    } else {
      errorMsg(err);
    }
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (invalidId.value) return;
  try {
    availableTags.value = await reviewsApi.listTags();
  } catch {
    // non-critical; leave empty
  }
});
</script>
