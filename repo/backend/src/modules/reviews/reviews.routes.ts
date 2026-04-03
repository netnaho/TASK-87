import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { upload } from '../../middleware/upload';
import { reviewsController } from './reviews.controller';

const router = Router();

// GET /reviews/tags  ← BEFORE /:id
router.get('/tags', authenticate, reviewsController.listTags);

// GET /reviews
router.get('/', authenticate, reviewsController.listReviews);

// POST /reviews  (authenticated users; images optional, max 6)
router.post('/', authenticate, upload.array('images', 6), reviewsController.createReview);

// GET /reviews/:id
router.get('/:id', authenticate, reviewsController.getReview);

// POST /reviews/:id/follow-up
router.post('/:id/follow-up', authenticate, upload.array('images', 6), reviewsController.createFollowUp);

// POST /reviews/:id/reply  (HOST only)
router.post('/:id/reply', authenticate, authorize('HOST', 'ADMIN', 'MANAGER'), reviewsController.createHostReply);

export default router;
