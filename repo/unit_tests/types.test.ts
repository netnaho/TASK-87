import { describe, it, expect } from 'vitest';
import { paginate, successResponse, errorResponse } from '../backend/src/types';

describe('Pagination', () => {
  it('should return defaults for undefined inputs', () => {
    const result = paginate();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.skip).toBe(0);
    expect(result.take).toBe(20);
  });

  it('should parse page and pageSize from strings', () => {
    const result = paginate('3', '50');
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
    expect(result.skip).toBe(100);
    expect(result.take).toBe(50);
  });

  it('should clamp page to minimum 1', () => {
    const result = paginate('-5');
    expect(result.page).toBe(1);
  });

  it('should clamp pageSize to max 100', () => {
    const result = paginate('1', '500');
    expect(result.pageSize).toBe(100);
  });
});

describe('API Response Helpers', () => {
  it('should format success response', () => {
    const res = successResponse({ name: 'test' });
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ name: 'test' });
  });

  it('should format error response', () => {
    const res = errorResponse('NOT_FOUND', 'Item not found');
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('NOT_FOUND');
    expect(res.error?.message).toBe('Item not found');
  });
});
