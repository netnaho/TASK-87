import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type User } from '../api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const userRole = computed(() => user.value?.role || '');

  function init() {
    const savedToken = localStorage.getItem('harborops_token');
    const savedUser = localStorage.getItem('harborops_user');
    if (savedToken && savedUser) {
      token.value = savedToken;
      try {
        user.value = JSON.parse(savedUser);
      } catch {
        logout();
      }
    }
  }

  async function login(username: string, password: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await authApi.login({ username, password });
      const data = res.data.data;
      token.value = data.token;
      user.value = data.user;
      localStorage.setItem('harborops_token', data.token);
      localStorage.setItem('harborops_user', JSON.stringify(data.user));
      return true;
    } catch (err: any) {
      error.value = err.response?.data?.error?.message || 'Login failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCurrentUser() {
    try {
      const res = await authApi.me();
      user.value = res.data.data;
      localStorage.setItem('harborops_user', JSON.stringify(res.data.data));
    } catch {
      logout();
    }
  }

  function logout() {
    user.value = null;
    token.value = null;
    localStorage.removeItem('harborops_token');
    localStorage.removeItem('harborops_user');
  }

  function hasRole(...roles: string[]): boolean {
    return roles.includes(user.value?.role || '');
  }

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    userRole,
    init,
    login,
    fetchCurrentUser,
    logout,
    hasRole,
  };
});
