-- Add requires_expiration column to items table.
-- DEFAULT 0 ensures all existing items are backward-compatible (no expiration enforcement unless explicitly set).
ALTER TABLE `items`
  ADD COLUMN `requires_expiration` TINYINT(1) NOT NULL DEFAULT 0;
