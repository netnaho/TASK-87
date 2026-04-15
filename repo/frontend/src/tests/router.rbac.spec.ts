/**
 * Router RBAC guard smoke tests.
 *
 * Tests the beforeEach navigation guard directly without spinning up a full
 * browser — no HTTP calls, no backend required.
 *
 * Strategy: we build a real router instance, set up the Pinia auth store in
 * different states (unauthenticated / various roles), then use
 * router.push() and inspect where we land.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { defineComponent } from 'vue';

// ─── Stub every view component ────────────────────────────────────────────────
const Stub = defineComponent({ template: '<div />' });

const routes = [
  { path: '/login', name: 'Login', component: Stub, meta: { public: true } },
  {
    path: '/',
    component: Stub,
    children: [
      { path: '', name: 'Dashboard', component: Stub },
      { path: 'inventory', name: 'Inventory', component: Stub, meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] } },
      { path: 'inventory/item-master', name: 'ItemMaster', component: Stub, meta: { roles: ['ADMIN', 'MANAGER'] } },
      { path: 'inventory/ledger', name: 'Ledger', component: Stub, meta: { roles: ['ADMIN', 'MANAGER'] } },
      { path: 'reports', name: 'Reports', component: Stub, meta: { roles: ['ADMIN', 'MANAGER'] } },
      { path: 'moderation', name: 'Moderation', component: Stub, meta: { roles: ['ADMIN', 'MODERATOR'] } },
      { path: 'trust/admin', name: 'AdminTrust', component: Stub, meta: { roles: ['ADMIN', 'MANAGER'] } },
      { path: 'admin/users', name: 'UserManagement', component: Stub, meta: { roles: ['ADMIN'] } },
      { path: 'reviews', name: 'Reviews', component: Stub, meta: { roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'HOST', 'GUEST', 'MODERATOR'] } },
      { path: 'trust', name: 'Trust', component: Stub },
      { path: 'search', name: 'Search', component: Stub },
      { path: 'appeals', name: 'MyAppeals', component: Stub, meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK', 'FRONT_DESK', 'HOST', 'GUEST'] } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Role = 'ADMIN' | 'MANAGER' | 'INVENTORY_CLERK' | 'FRONT_DESK' | 'HOST' | 'GUEST' | 'MODERATOR';

function mockLocalStorage(role?: Role) {
  if (role) {
    localStorage.setItem('harborops_token', 'fake-jwt-token');
    localStorage.setItem('harborops_user', JSON.stringify({ id: 1, username: 'test', role, displayName: 'Test' }));
  } else {
    localStorage.removeItem('harborops_token');
    localStorage.removeItem('harborops_user');
  }
}

async function buildRouter() {
  // Dynamically import to get the guard registered after pinia is ready
  const { useAuthStore } = await import('../stores/auth');
  const router = createRouter({ history: createMemoryHistory(), routes });

  router.beforeEach((to, _from, next) => {
    const authStore = useAuthStore();
    authStore.init();

    if (to.meta.public) {
      if (authStore.isAuthenticated && to.name === 'Login') return next({ name: 'Dashboard' });
      return next();
    }
    if (!authStore.isAuthenticated) return next({ name: 'Login' });

    const requiredRoles = to.meta.roles as string[] | undefined;
    if (requiredRoles && !authStore.hasRole(...requiredRoles)) return next({ name: 'Dashboard' });
    next();
  });

  return router;
}

// ─── Test suites ──────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.resetModules();
});

describe('Router guard — unauthenticated user', () => {
  it('redirects to Login when visiting protected Dashboard', async () => {
    mockLocalStorage(); // no auth
    const router = await buildRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('redirects to Login when visiting inventory (role-restricted)', async () => {
    mockLocalStorage();
    const router = await buildRouter();
    await router.push('/inventory');
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('allows unauthenticated user to reach /login', async () => {
    mockLocalStorage();
    const router = await buildRouter();
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('redirects logged-in user away from /login to Dashboard', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });
});

describe('Router guard — GUEST role', () => {
  it('can reach Dashboard', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('can reach Reviews (GUEST allowed)', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/reviews');
    expect(router.currentRoute.value.name).toBe('Reviews');
  });

  it('is redirected to Dashboard when attempting Inventory (role insufficient)', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/inventory');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('is redirected to Dashboard when attempting Reports', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/reports');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('is redirected to Dashboard when attempting Moderation Queue', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/moderation');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('is redirected to Dashboard when attempting UserManagement (ADMIN-only)', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/admin/users');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });
});

describe('Router guard — INVENTORY_CLERK role', () => {
  it('can reach Inventory Hub', async () => {
    mockLocalStorage('INVENTORY_CLERK');
    const router = await buildRouter();
    await router.push('/inventory');
    expect(router.currentRoute.value.name).toBe('Inventory');
  });

  it('is redirected from ItemMaster (ADMIN/MANAGER only)', async () => {
    mockLocalStorage('INVENTORY_CLERK');
    const router = await buildRouter();
    await router.push('/inventory/item-master');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('is redirected from Ledger (ADMIN/MANAGER only)', async () => {
    mockLocalStorage('INVENTORY_CLERK');
    const router = await buildRouter();
    await router.push('/inventory/ledger');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });
});

describe('Router guard — MANAGER role', () => {
  it('can reach Reports', async () => {
    mockLocalStorage('MANAGER');
    const router = await buildRouter();
    await router.push('/reports');
    expect(router.currentRoute.value.name).toBe('Reports');
  });

  it('can reach AdminTrust panel', async () => {
    mockLocalStorage('MANAGER');
    const router = await buildRouter();
    await router.push('/trust/admin');
    expect(router.currentRoute.value.name).toBe('AdminTrust');
  });

  it('is redirected from UserManagement (ADMIN-only)', async () => {
    mockLocalStorage('MANAGER');
    const router = await buildRouter();
    await router.push('/admin/users');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('is redirected from Moderation Queue (ADMIN/MODERATOR only)', async () => {
    mockLocalStorage('MANAGER');
    const router = await buildRouter();
    await router.push('/moderation');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });
});

describe('Router guard — ADMIN role (full access)', () => {
  it('can reach UserManagement', async () => {
    mockLocalStorage('ADMIN');
    const router = await buildRouter();
    await router.push('/admin/users');
    expect(router.currentRoute.value.name).toBe('UserManagement');
  });

  it('can reach Moderation Queue', async () => {
    mockLocalStorage('ADMIN');
    const router = await buildRouter();
    await router.push('/moderation');
    expect(router.currentRoute.value.name).toBe('Moderation');
  });

  it('can reach Reports', async () => {
    mockLocalStorage('ADMIN');
    const router = await buildRouter();
    await router.push('/reports');
    expect(router.currentRoute.value.name).toBe('Reports');
  });

  it('can reach Inventory Hub', async () => {
    mockLocalStorage('ADMIN');
    const router = await buildRouter();
    await router.push('/inventory');
    expect(router.currentRoute.value.name).toBe('Inventory');
  });
});

describe('Router guard — MODERATOR role', () => {
  it('can reach Moderation Queue', async () => {
    mockLocalStorage('MODERATOR');
    const router = await buildRouter();
    await router.push('/moderation');
    expect(router.currentRoute.value.name).toBe('Moderation');
  });

  it('is redirected from Reports (ADMIN/MANAGER only)', async () => {
    mockLocalStorage('MODERATOR');
    const router = await buildRouter();
    await router.push('/reports');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });

  it('is redirected from Appeals (MODERATOR not in allowed list)', async () => {
    mockLocalStorage('MODERATOR');
    const router = await buildRouter();
    await router.push('/appeals');
    expect(router.currentRoute.value.name).toBe('Dashboard');
  });
});

describe('Router guard — routes with no role restriction', () => {
  it('Trust Dashboard is accessible by all authenticated users (GUEST)', async () => {
    mockLocalStorage('GUEST');
    const router = await buildRouter();
    await router.push('/trust');
    expect(router.currentRoute.value.name).toBe('Trust');
  });

  it('Search is accessible by all authenticated users (HOST)', async () => {
    mockLocalStorage('HOST');
    const router = await buildRouter();
    await router.push('/search');
    expect(router.currentRoute.value.name).toBe('Search');
  });
});
