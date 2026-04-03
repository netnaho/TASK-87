import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { promotionsController } from './promotions.controller';

const router = Router();

// GET /promotions
router.get('/', authenticate, promotionsController.listPromotions);

// POST /promotions/checkout — BEFORE POST / to be explicit; static path before dynamic
router.post('/checkout', authenticate, promotionsController.checkout);

// POST /promotions  (ADMIN, MANAGER)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), promotionsController.createPromotion);

// PATCH /promotions/:id  (ADMIN, MANAGER)
router.patch('/:id', authenticate, authorize('ADMIN', 'MANAGER'), promotionsController.updatePromotion);

export default router;
