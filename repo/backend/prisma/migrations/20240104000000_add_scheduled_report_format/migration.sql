-- Add format column to scheduled_reports with default 'csv' for backward compatibility
ALTER TABLE `scheduled_reports`
  ADD COLUMN `format` VARCHAR(10) NOT NULL DEFAULT 'csv';
