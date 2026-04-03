<template>
  <div class="p-6">
    <PageHeader title="User Management">
      <template #actions>
        <n-button type="primary" @click="openCreate">Create User</n-button>
      </template>
    </PageHeader>

    <!-- Search -->
    <n-card class="mb-4">
      <n-input
        v-model:value="searchQuery"
        placeholder="Search by username or display name..."
        clearable
        style="max-width: 400px"
      >
        <template #prefix>
          <n-icon><SearchOutline /></n-icon>
        </template>
      </n-input>
    </n-card>

    <n-spin :show="loading">
      <n-data-table
        v-if="filteredUsers.length > 0"
        :columns="userColumns"
        :data="filteredUsers"
        :pagination="{ pageSize: 20, showSizePicker: true, pageSizes: [20, 50, 100] }"
        :row-key="(r: User) => r.id"
      />
      <EmptyState
        v-else-if="!loading"
        message="No users found"
        description="Try adjusting your search query."
      />
    </n-spin>

    <!-- Create User Drawer -->
    <n-drawer v-model:show="showCreateDrawer" :width="440" placement="right">
      <n-drawer-content title="Create User" closable>
        <n-form
          ref="createFormRef"
          :model="createForm"
          :rules="createRules"
          label-placement="top"
        >
          <n-form-item label="Username" path="username">
            <n-input v-model:value="createForm.username" placeholder="username" />
          </n-form-item>
          <n-form-item label="Display Name" path="displayName">
            <n-input v-model:value="createForm.displayName" placeholder="Display name" />
          </n-form-item>
          <n-form-item label="Password" path="password">
            <n-input
              v-model:value="createForm.password"
              type="password"
              placeholder="Password"
              show-password-on="click"
            />
          </n-form-item>
          <n-form-item label="Role" path="role">
            <n-select
              v-model:value="createForm.role"
              :options="roleOptions"
              placeholder="Select role"
              style="width: 100%"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showCreateDrawer = false">Cancel</n-button>
            <n-button type="primary" :loading="createSubmitting" @click="submitCreate">
              Create
            </n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- Role Change Confirm -->
    <ConfirmModal
      v-model:show="showRoleConfirm"
      title="Change User Role"
      :message="`Change ${pendingRoleChange?.username}'s role to ${pendingRoleChange?.newRole}?`"
      type="warning"
      @confirm="confirmRoleChange"
      @cancel="cancelRoleChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import {
  NCard,
  NButton,
  NSelect,
  NInput,
  NForm,
  NFormItem,
  NSpace,
  NTag,
  NSpin,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NIcon,
} from 'naive-ui';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { SearchOutline } from '@vicons/ionicons5';
import { usersApi } from '../../api/users';
import apiClient from '../../api/client';
import { useAppMessage } from '../../composables/useAppMessage';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmModal from '../../components/shared/ConfirmModal.vue';
import RoleBadge from '../../components/shared/RoleBadge.vue';
import type { User, Role } from '../../types';

const { successMsg, errorMsg } = useAppMessage();

const loading = ref(false);
const users = ref<User[]>([]);
const searchQuery = ref('');

const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) =>
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q)
  );
});

async function loadUsers() {
  loading.value = true;
  try {
    const res = await usersApi.listUsers({ pageSize: 200 });
    users.value = res.items;
  } catch (err: any) {
    errorMsg(err);
  } finally {
    loading.value = false;
  }
}

// ─── Role Change ──────────────────────────────────────────────────────────────
const showRoleConfirm = ref(false);
const pendingRoleChange = ref<{ id: number; username: string; newRole: Role } | null>(null);
const roleSelectValues = reactive<Record<number, Role>>({});

function onRoleSelectChange(userId: number, username: string, newRole: Role) {
  pendingRoleChange.value = { id: userId, username, newRole };
  showRoleConfirm.value = true;
}

async function confirmRoleChange() {
  if (!pendingRoleChange.value) return;
  try {
    await usersApi.changeRole(pendingRoleChange.value.id, pendingRoleChange.value.newRole);
    successMsg('Role updated successfully');
    showRoleConfirm.value = false;
    pendingRoleChange.value = null;
    await loadUsers();
  } catch (err: any) {
    errorMsg(err);
    showRoleConfirm.value = false;
    pendingRoleChange.value = null;
    await loadUsers();
  }
}

function cancelRoleChange() {
  showRoleConfirm.value = false;
  pendingRoleChange.value = null;
  // re-render to reset select value
  loadUsers();
}

const roleOptions: { label: string; value: Role }[] = [
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Manager', value: 'MANAGER' },
  { label: 'Inventory Clerk', value: 'INVENTORY_CLERK' },
  { label: 'Front Desk', value: 'FRONT_DESK' },
  { label: 'Host', value: 'HOST' },
  { label: 'Guest', value: 'GUEST' },
  { label: 'Moderator', value: 'MODERATOR' },
];

const userColumns: DataTableColumn<User>[] = [
  { title: 'ID', key: 'id', width: 70 },
  { title: 'Display Name', key: 'displayName' },
  { title: 'Username', key: 'username' },
  {
    title: 'Role',
    key: 'role',
    width: 220,
    render: (row) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h(RoleBadge, { role: row.role }),
        h(NSelect, {
          value: row.role,
          options: roleOptions,
          size: 'small',
          style: 'width: 140px',
          onUpdateValue: (val: Role) => onRoleSelectChange(row.id, row.username, val),
        }),
      ]),
  },
  {
    title: 'Phone',
    key: 'phoneMasked',
    render: (row) => row.phoneMasked ?? '—',
  },
  {
    title: 'Active',
    key: 'isActive',
    render: (row) =>
      h(
        NTag,
        { type: row.isActive ? 'success' : 'error', size: 'small' },
        { default: () => (row.isActive ? 'Active' : 'Inactive') }
      ),
  },
  {
    title: 'Created',
    key: 'createdAt',
    render: (row) =>
      row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—',
  },
];

// ─── Create User Drawer ───────────────────────────────────────────────────────
const showCreateDrawer = ref(false);
const createFormRef = ref<FormInst | null>(null);
const createSubmitting = ref(false);

const createForm = reactive<{
  username: string;
  displayName: string;
  password: string;
  role: Role | null;
}>({
  username: '',
  displayName: '',
  password: '',
  role: null,
});

const createRules: FormRules = {
  username: [{ required: true, message: 'Username is required', trigger: 'blur' }],
  displayName: [{ required: true, message: 'Display name is required', trigger: 'blur' }],
  password: [
    { required: true, message: 'Password is required', trigger: 'blur' },
    { min: 6, message: 'Password must be at least 6 characters', trigger: 'blur' },
  ],
  role: [{ required: true, message: 'Role is required', trigger: 'change' }],
};

function openCreate() {
  createForm.username = '';
  createForm.displayName = '';
  createForm.password = '';
  createForm.role = null;
  showCreateDrawer.value = true;
}

async function submitCreate() {
  try {
    await createFormRef.value?.validate();
  } catch {
    return;
  }
  createSubmitting.value = true;
  try {
    await apiClient.post('/auth/register', {
      username: createForm.username,
      displayName: createForm.displayName,
      password: createForm.password,
      role: createForm.role,
    });
    successMsg('User created successfully');
    showCreateDrawer.value = false;
    await loadUsers();
  } catch (err: any) {
    errorMsg(err);
  } finally {
    createSubmitting.value = false;
  }
}

onMounted(() => {
  loadUsers();
});
</script>
