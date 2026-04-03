<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-harbor-900 to-harbor-700">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-400 rounded-2xl mb-4">
          <span class="text-white text-3xl font-bold">H</span>
        </div>
        <h1 class="text-3xl font-bold text-white">HarborOps</h1>
        <p class="text-blue-200 mt-2">Lodging & Supply Management System</p>
      </div>

      <n-card class="shadow-2xl">
        <h2 class="text-xl font-semibold text-gray-800 mb-6">Sign In</h2>

        <n-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
          <n-form-item label="Username" path="username">
            <n-input
              v-model:value="form.username"
              placeholder="Enter your username"
              size="large"
              @keyup.enter="handleLogin"
            />
          </n-form-item>

          <n-form-item label="Password" path="password">
            <n-input
              v-model:value="form.password"
              type="password"
              placeholder="Enter your password"
              show-password-on="click"
              size="large"
              @keyup.enter="handleLogin"
            />
          </n-form-item>

          <n-alert v-if="authStore.error" type="error" class="mb-4" closable @close="authStore.error = null">
            {{ authStore.error }}
          </n-alert>

          <n-button
            type="primary"
            block
            size="large"
            :loading="authStore.loading"
            @click="handleLogin"
            class="mt-2"
          >
            Sign In
          </n-button>
        </n-form>

        <n-divider>Demo Accounts</n-divider>

        <div class="grid grid-cols-2 gap-2">
          <n-button
            v-for="account in demoAccounts"
            :key="account.username"
            size="small"
            secondary
            @click="quickLogin(account)"
            class="text-xs"
          >
            {{ account.label }}
          </n-button>
        </div>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const form = reactive({ username: '', password: '' });
const rules = {
  username: { required: true, message: 'Username is required', trigger: 'blur' },
  password: { required: true, message: 'Password is required', trigger: 'blur' },
};

const demoAccounts = [
  { username: 'admin', password: 'admin123!', label: 'Admin' },
  { username: 'manager', password: 'manager123!', label: 'Manager' },
  { username: 'clerk', password: 'clerk123!', label: 'Clerk' },
  { username: 'frontdesk', password: 'frontdesk123!', label: 'Front Desk' },
  { username: 'host', password: 'host123!', label: 'Host' },
  { username: 'guest', password: 'guest123!', label: 'Guest' },
  { username: 'moderator', password: 'moderator123!', label: 'Moderator' },
];

async function handleLogin() {
  if (!form.username || !form.password) return;
  const success = await authStore.login(form.username, form.password);
  if (success) {
    router.push({ name: 'Dashboard' });
  }
}

function quickLogin(account: { username: string; password: string }) {
  form.username = account.username;
  form.password = account.password;
  handleLogin();
}
</script>
