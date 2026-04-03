import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { moderationController } from './moderation.controller';

const router = Router();

// Reports
router.post('/reports', authenticate, moderationController.fileReport);
router.get('/reports/queue', authenticate, authorize('MODERATOR', 'ADMIN'), moderationController.getQueue);
// Alias: /queue → /reports/queue (shorter path used by some clients)
router.get('/queue', authenticate, authorize('MODERATOR', 'ADMIN'), moderationController.getQueue);
router.post('/reports/:id/assign', authenticate, authorize('MODERATOR', 'ADMIN'), moderationController.assignReport);
router.post('/reports/:id/action', authenticate, authorize('MODERATOR', 'ADMIN'), moderationController.takeAction);

// Audit trail (ADMIN only)
router.get('/audit', authenticate, authorize('ADMIN'), moderationController.getAudit);

// Appeals
router.post('/appeals', authenticate, moderationController.fileAppeal);
router.get('/appeals', authenticate, authorize('MODERATOR', 'ADMIN'), moderationController.listAppeals);
router.post('/appeals/:id/resolve', authenticate, authorize('ADMIN'), moderationController.resolveAppeal);

// Sensitive words (ADMIN only)
router.get('/sensitive-words', authenticate, authorize('ADMIN'), moderationController.listSensitiveWords);
router.post('/sensitive-words', authenticate, authorize('ADMIN'), moderationController.addSensitiveWord);
router.delete('/sensitive-words/:id', authenticate, authorize('ADMIN'), moderationController.deleteSensitiveWord);

export default router;
