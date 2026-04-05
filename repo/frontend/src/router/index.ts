import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
      },
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('../views/inventory/InventoryHub.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] },
      },
      {
        path: 'inventory/receive',
        name: 'Receiving',
        component: () => import('../views/inventory/ReceivingForm.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] },
      },
      {
        path: 'inventory/transfer',
        name: 'Transfer',
        component: () => import('../views/inventory/TransferForm.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] },
      },
      {
        path: 'inventory/issue',
        name: 'StockIssue',
        component: () => import('../views/inventory/StockIssueForm.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] },
      },
      {
        path: 'inventory/stock-counts',
        name: 'StockCounts',
        component: () => import('../views/inventory/StockCountWorkflow.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] },
      },
      {
        path: 'inventory/stock-counts/:id',
        name: 'StockCountDetail',
        component: () => import('../views/inventory/StockCountDetail.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'INVENTORY_CLERK'] },
      },
      {
        path: 'inventory/item-master',
        name: 'ItemMaster',
        component: () => import('../views/inventory/ItemMaster.vue'),
        meta: { roles: ['ADMIN', 'MANAGER'] },
      },
      {
        path: 'inventory/ledger',
        name: 'Ledger',
        component: () => import('../views/inventory/LedgerView.vue'),
        meta: { roles: ['ADMIN', 'MANAGER'] },
      },
      {
        path: 'reviews',
        name: 'Reviews',
        component: () => import('../views/reviews/ReviewsList.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'HOST', 'GUEST', 'MODERATOR'] },
      },
      // IMPORTANT: static segments must come BEFORE reviews/:id
      {
        path: 'reviews/new',
        name: 'ReviewForm',
        component: () => import('../views/reviews/ReviewForm.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'HOST', 'GUEST'] },
      },
      {
        path: 'reviews/:id/follow-up',
        name: 'FollowUpForm',
        component: () => import('../views/reviews/FollowUpForm.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'HOST', 'GUEST'] },
      },
      {
        path: 'reviews/:id',
        name: 'ReviewDetail',
        component: () => import('../views/reviews/ReviewDetail.vue'),
        meta: { roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'HOST', 'GUEST', 'MODERATOR'] },
      },
      {
        path: 'trust',
        name: 'Trust',
        component: () => import('../views/trust/TrustDashboard.vue'),
      },
      {
        path: 'trust/admin',
        name: 'AdminTrust',
        component: () => import('../views/trust/AdminTrustPanel.vue'),
        meta: { roles: ['ADMIN', 'MANAGER'] },
      },
      {
        path: 'promotions',
        name: 'Promotions',
        component: () => import('../views/promotions/PromotionsManager.vue'),
        meta: { roles: ['ADMIN', 'MANAGER'] },
      },
      {
        path: 'search',
        name: 'Search',
        component: () => import('../views/search/ProductSearch.vue'),
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('../views/reports/ReportsCenter.vue'),
        meta: { roles: ['ADMIN', 'MANAGER'] },
      },
      {
        path: 'moderation',
        name: 'Moderation',
        component: () => import('../views/moderation/ModerationQueue.vue'),
        meta: { roles: ['ADMIN', 'MODERATOR'] },
      },
      {
        path: 'admin/users',
        name: 'UserManagement',
        component: () => import('../views/admin/UserManagement.vue'),
        meta: { roles: ['ADMIN'] },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  authStore.init();

  if (to.meta.public) {
    if (authStore.isAuthenticated && to.name === 'Login') {
      return next({ name: 'Dashboard' });
    }
    return next();
  }

  if (!authStore.isAuthenticated) {
    return next({ name: 'Login' });
  }

  const requiredRoles = to.meta.roles as string[] | undefined;
  if (requiredRoles && !authStore.hasRole(...requiredRoles)) {
    return next({ name: 'Dashboard' });
  }

  next();
});

export default router;
