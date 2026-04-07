import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { trustController } from './trust.controller';
import { getCreditRules, getCreditRulesWithMeta, setCreditRules, resetCreditRules } from './trust.service';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';

const router = Router();

// GET /trust/score  — own score
router.get('/score', authenticate, trustController.getMyScore);

// GET /trust/history  — own credit history
router.get('/history', authenticate, trustController.getMyHistory);

// GET /trust/leaderboard  — top trust scores
router.get('/leaderboard', authenticate, trustController.getLeaderboard);

// GET /trust/users/:userId/score  — any user's score (ADMIN/MANAGER)
router.get('/users/:userId/score', authenticate, authorize('ADMIN', 'MANAGER'), trustController.getUserScore);

// GET /trust/users/:userId/history  — any user's credit history (ADMIN/MANAGER)
router.get('/users/:userId/history', authenticate, authorize('ADMIN', 'MANAGER'), trustController.getUserHistory);

// GET /trust/admin/scores  — all scores (ADMIN only)
router.get('/admin/scores', authenticate, authorize('ADMIN'), trustController.getAllScores);

// POST /trust/rate  — rate a task
router.post('/rate', authenticate, trustController.rateTask);
router.post('/rate-task', authenticate, trustController.rateTask); // alias

// POST /trust/adjust  — admin adjust (ADMIN only)
router.post('/adjust', authenticate, authorize('ADMIN'), trustController.adminAdjust);
router.post('/admin-adjust', authenticate, authorize('ADMIN'), trustController.adminAdjust); // alias

const creditRulesSchema = z.record(
  z.string().regex(/^[1-5]$/, 'Keys must be star ratings 1–5'),
  z.number().int().min(-10).max(10)
);

// GET /trust/admin/credit-rules — read current credit delta rules with metadata (ADMIN only)
// Response shape: { rules, source: 'db'|'fallback', fallbackEnabled }
// Backward compatible: the `rules` map is always present.
router.get(
  '/admin/credit-rules',
  authenticate,
  authorize('ADMIN'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const meta = await getCreditRulesWithMeta();
      res.json(successResponse(meta));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }
);

// PUT /trust/admin/credit-rules — upsert credit delta rules durably (ADMIN only)
router.put(
  '/admin/credit-rules',
  authenticate,
  authorize('ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = creditRulesSchema.parse(req.body);
      // Convert string keys (from JSON) to numeric keys
      const numericRules: Record<number, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        numericRules[Number(k)] = v as number;
      }
      await setCreditRules(numericRules);
      res.json(successResponse(await getCreditRules()));
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /trust/admin/credit-rules — reset to defaults durably (ADMIN only)
router.delete(
  '/admin/credit-rules',
  authenticate,
  authorize('ADMIN'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await resetCreditRules();
      res.json(successResponse(await getCreditRules()));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
