import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';
import { Response, NextFunction } from 'express';
import { searchService } from './search.service';

const router = Router();

// GET /search/products
router.get('/products', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) ?? '20', 10)));

    const q = req.query.q as string | undefined;
    if (!q || q.trim().length === 0) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Search query parameter "q" is required'));
      return;
    }

    const result = await searchService.searchProducts({
      q,
      category: req.query.category as string | undefined,
      attributeName: req.query.attributeName as string | undefined,
      attributeValue: req.query.attributeValue as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortDir: req.query.sortDir as string | undefined,
      page,
      pageSize,
      userId: req.user?.userId,
    });

    res.json(successResponse(result));
  } catch (err: any) {
    if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
    next(err);
  }
});

// GET /search/categories
router.get('/categories', authenticate, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await searchService.getCategories();
    res.json(successResponse(categories));
  } catch (err) {
    next(err);
  }
});

// GET /search/suggestions
router.get('/suggestions', authenticate, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const terms = await searchService.getSuggestions();
    res.json(successResponse(terms));
  } catch (err) {
    next(err);
  }
});

// GET /search/trending  (MANAGER, ADMIN)
router.get('/trending', authenticate, authorize('MANAGER', 'ADMIN'), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const terms = await searchService.getTrending();
    res.json(successResponse(terms));
  } catch (err) {
    next(err);
  }
});

// PATCH /search/trending/:term  (ADMIN)
router.patch('/trending/:term', authenticate, authorize('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const term = decodeURIComponent(req.params.term as string);
    const isTrending = req.body.isTrending === true || req.body.isTrending === 'true';
    const result = await searchService.markTrending(term, isTrending);
    res.json(successResponse(result));
  } catch (err: any) {
    if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
    next(err);
  }
});

export default router;
