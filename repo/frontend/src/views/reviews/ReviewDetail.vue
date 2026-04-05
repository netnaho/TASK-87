<template>
  <div>
    <PageHeader :title="`Review #${reviewId}`" back-route="Reviews" />

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center py-16">
      <n-spin size="large" />
    </div>

    <template v-else-if="review">
      <!-- Main Review Card -->
      <n-card class="mb-4">
        <!-- Header row -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <span class="font-semibold text-lg">{{ review.reviewer?.displayName ?? 'Anonymous' }}</span>
          <n-tag :type="targetTypeColor[review.targetType] ?? 'default'" size="small">
            {{ review.targetType }}
          </n-tag>
          <n-tag :type="statusColor[review.status] ?? 'default'" size="small">
            {{ review.status }}
          </n-tag>
          <span class="text-sm text-gray-400 ml-auto">
            {{ new Date(review.createdAt).toLocaleDateString() }}
          </span>
        </div>

        <!-- Ratings -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium w-32">🧹 Cleanliness</span>
            <n-rate :value="review.ratingCleanliness" :count="5" readonly :allow-half="false" size="small" />
            <span class="text-sm text-gray-500">({{ review.ratingCleanliness }})</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium w-36">💬 Communication</span>
            <n-rate :value="review.ratingCommunication" :count="5" readonly :allow-half="false" size="small" />
            <span class="text-sm text-gray-500">({{ review.ratingCommunication }})</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium w-24">🎯 Accuracy</span>
            <n-rate :value="review.ratingAccuracy" :count="5" readonly :allow-half="false" size="small" />
            <span class="text-sm text-gray-500">({{ review.ratingAccuracy }})</span>
          </div>
        </div>

        <!-- Overall -->
        <div class="mb-4">
          <span class="text-gray-500 text-sm">Overall Rating: </span>
          <span class="text-2xl font-bold text-yellow-500">⭐ {{ Number(review.overallRating).toFixed(2) }}</span>
          <span class="text-gray-400 text-sm"> / 5.00</span>
        </div>

        <n-divider v-if="review.text || (review.tags && review.tags.length > 0) || (review.images && review.images.length > 0)" />

        <!-- Review text -->
        <p v-if="review.text" class="text-gray-700 whitespace-pre-wrap mb-4">{{ review.text }}</p>

        <!-- Tags -->
        <div v-if="review.tags && review.tags.length > 0" class="flex flex-wrap gap-2 mb-4">
          <n-tag
            v-for="t in review.tags"
            :key="t.id"
            size="small"
          >
            {{ t.tag.name }}
          </n-tag>
        </div>

        <!-- Images -->
        <div v-if="review.images && review.images.length > 0" class="mb-4">
          <p class="text-sm text-gray-500 mb-2 font-medium">Photos</p>
          <n-image-group>
            <n-space>
              <n-image
                v-for="img in review.images"
                :key="img.id"
                :src="`/uploads/${img.filePath}`"
                width="100"
                height="100"
                object-fit="cover"
                style="border-radius: 6px; overflow: hidden"
              />
            </n-space>
          </n-image-group>
        </div>

        <!-- Actions bar -->
        <n-divider />
        <n-space>
          <n-button
            secondary
            @click="reportModalVisible = true"
          >
            <template #icon><n-icon><FlagOutline /></n-icon></template>
            Report
          </n-button>
          <n-button
            v-if="authStore.hasRole('HOST', 'ADMIN', 'MANAGER') && !review.hostReply"
            type="primary"
            secondary
            @click="replyModalVisible = true"
          >
            <template #icon><n-icon><ChatbubbleOutline /></n-icon></template>
            Reply
          </n-button>
        </n-space>
      </n-card>

      <!-- Host Reply Card -->
      <n-card
        v-if="review.hostReply"
        class="mb-4"
        style="background-color: #eff6ff; border-color: #bfdbfe"
      >
        <template #header>
          <span class="font-semibold text-blue-700">Host Response</span>
        </template>
        <div class="flex items-center gap-2 mb-2">
          <span class="font-medium">{{ review.hostReply.host?.displayName ?? 'Host' }}</span>
          <span class="text-sm text-gray-400">
            {{ new Date(review.hostReply.createdAt).toLocaleDateString() }}
          </span>
        </div>
        <p class="text-gray-700 whitespace-pre-wrap">{{ review.hostReply.text }}</p>
      </n-card>

      <!-- Add Reply button if no reply yet, shown outside card too -->
      <div
        v-if="!review.hostReply && authStore.hasRole('HOST', 'ADMIN', 'MANAGER')"
        class="mb-4"
      >
        <n-button type="primary" dashed @click="replyModalVisible = true">
          <template #icon><n-icon><ChatbubbleOutline /></n-icon></template>
          Add Reply
        </n-button>
      </div>

      <!-- Follow-Up Reviews -->
      <template v-if="review.followUps && review.followUps.length > 0">
        <n-card
          v-for="fu in review.followUps"
          :key="fu.id"
          class="mb-4"
        >
          <template #header>
            <n-tag size="small" type="info">Follow-up Review</n-tag>
            <span class="ml-2 text-sm text-gray-400">
              {{ new Date(fu.createdAt).toLocaleDateString() }}
            </span>
          </template>
          <div class="flex flex-wrap gap-3 mb-2">
            <span class="text-sm">🧹 {{ fu.ratingCleanliness }}</span>
            <span class="text-sm">💬 {{ fu.ratingCommunication }}</span>
            <span class="text-sm">🎯 {{ fu.ratingAccuracy }}</span>
            <span class="text-sm font-semibold">⭐ {{ Number(fu.overallRating).toFixed(2) }}</span>
          </div>
          <p v-if="fu.text" class="text-gray-700 whitespace-pre-wrap">{{ fu.text }}</p>
        </n-card>
      </template>

      <!-- Add Follow-Up -->
      <div
        v-if="canAddFollowUp"
        class="mb-4"
      >
        <n-alert type="info" class="mb-2">
          You can add a follow-up review within 7 days of your original review.
        </n-alert>
        <n-button @click="router.push({ name: 'FollowUpForm', params: { id: reviewId } })">
          Add Follow-Up
        </n-button>
      </div>
    </template>

    <!-- Not found -->
    <EmptyState v-else-if="!loading" message="Review not found." />

    <!-- Report Modal -->
    <n-modal
      v-model:show="reportModalVisible"
      preset="card"
      title="Report Review"
      style="width: 480px"
      :mask-closable="false"
    >
      <n-form
        ref="reportFormRef"
        :model="reportForm"
        label-placement="top"
      >
        <n-form-item
          label="Reason"
          path="reason"
          :rule="{ required: true, min: 10, message: 'Please provide at least 10 characters', trigger: ['input', 'blur'] }"
        >
          <n-input
            v-model:value="reportForm.reason"
            type="textarea"
            :rows="4"
            placeholder="Describe why you are reporting this review (min 10 characters)..."
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="reportModalVisible = false">Cancel</n-button>
          <n-button
            type="error"
            :loading="reportSubmitting"
            :disabled="reportSubmitting"
            @click="submitReport"
          >
            Submit Report
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Reply Modal -->
    <n-modal
      v-model:show="replyModalVisible"
      preset="card"
      title="Host Reply"
      style="width: 480px"
      :mask-closable="false"
    >
      <n-form
        ref="replyFormRef"
        :model="replyForm"
        label-placement="top"
      >
        <n-form-item
          label="Reply"
          path="text"
          :rule="{ required: true, min: 1, message: 'Reply text is required', trigger: ['input', 'blur'] }"
        >
          <n-input
            v-model:value="replyForm.text"
            type="textarea"
            :rows="4"
            placeholder="Write your response to this review..."
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="replyModalVisible = false">Cancel</n-button>
          <n-button
            type="primary"
            :loading="replySubmitting"
            :disabled="replySubmitting"
            @click="submitReply"
          >
            Submit Reply
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import type { FormInst } from 'naive-ui';
import {
  NCard,
  NButton,
  NTag,
  NSpace,
  NIcon,
  NSpin,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NRate,
  NImageGroup,
  NImage,
  NAlert,
  NDivider,
} from 'naive-ui';
import { FlagOutline, ChatbubbleOutline } from '@vicons/ionicons5';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { reviewsApi } from '../../api/reviews';
import { moderationApi } from '../../api/moderation';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { Review } from '../../types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { successMsg, errorMsg } = useAppMessage();

const reviewId = computed(() => Number(route.params.id));
const loading = ref(false);
const review = ref<Review | null>(null);

const reportModalVisible = ref(false);
const replyModalVisible = ref(false);
const reportSubmitting = ref(false);
const replySubmitting = ref(false);

const reportFormRef = ref<FormInst | null>(null);
const replyFormRef = ref<FormInst | null>(null);

const reportForm = reactive({ reason: '' });
const replyForm = reactive({ text: '' });

const statusColor: Record<string, 'success' | 'warning' | 'default' | 'error'> = {
  ACTIVE: 'success',
  FLAGGED: 'warning',
  HIDDEN: 'default',
  REMOVED: 'error',
};

const targetTypeColor: Record<string, 'info' | 'warning'> = {
  STAY: 'info',
  TASK: 'warning',
};

const canAddFollowUp = computed(() => {
  if (!review.value) return false;
  if (review.value.followUps && review.value.followUps.length > 0) return false;
  if (!authStore.user) return false;
  if (review.value.reviewerId !== authStore.user.id) return false;
  const created = new Date(review.value.createdAt).getTime();
  const now = Date.now();
  const daysDiff = (now - created) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7;
});

async function fetchReview() {
  loading.value = true;
  try {
    review.value = await reviewsApi.getReview(reviewId.value);
  } catch (err: any) {
    errorMsg(err);
  } finally {
    loading.value = false;
  }
}

async function submitReport() {
  try {
    await reportFormRef.value?.validate();
  } catch {
    return;
  }
  if (!review.value) return;

  reportSubmitting.value = true;
  try {
    await moderationApi.fileReport({
      contentType: 'REVIEW',
      contentId: review.value.id,
      reviewId: review.value.id,
      reason: reportForm.reason,
    });
    successMsg('Report submitted');
    reportModalVisible.value = false;
    reportForm.reason = '';
  } catch (err: any) {
    errorMsg(err);
  } finally {
    reportSubmitting.value = false;
  }
}

async function submitReply() {
  try {
    await replyFormRef.value?.validate();
  } catch {
    return;
  }
  if (!review.value) return;

  replySubmitting.value = true;
  try {
    await reviewsApi.createHostReply(review.value.id, { text: replyForm.text });
    successMsg('Reply posted');
    replyModalVisible.value = false;
    replyForm.text = '';
    await fetchReview();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    replySubmitting.value = false;
  }
}

onMounted(() => {
  fetchReview();
});
</script>
