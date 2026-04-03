import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { trustController } from './trust.controller';

const router = Router();

// GET /trust/score  — own score
router.get('/score', authenticate, trustController.getMyScore);

// GET /trust/history  — own credit history
router.get('/history', authenticate, trustController.getMyHistory);

// GET /trust/leaderboard  — top trust scores
router.get('/leaderboard', authenticate, trustController.getLeaderboard);

// GET /trust/users/:userId/score  — any user's score (ADMIN/MANAGER)
router.get('/users/:userId/score', authenticate, authorize('ADMIN', 'MANAGER'), trustController.getUserScore);

// GET /trust/admin/scores  — all scores (ADMIN only)
router.get('/admin/scores', authenticate, authorize('ADMIN'), trustController.getAllScores);

// POST /trust/rate  — rate a task
router.post('/rate', authenticate, trustController.rateTask);
router.post('/rate-task', authenticate, trustController.rateTask); // alias

// POST /trust/adjust  — admin adjust (ADMIN only)
router.post('/adjust', authenticate, authorize('ADMIN'), trustController.adminAdjust);
router.post('/admin-adjust', authenticate, authorize('ADMIN'), trustController.adminAdjust); // alias

export default router;
