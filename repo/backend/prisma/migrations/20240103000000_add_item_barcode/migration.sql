-- AlterTable
ALTER TABLE `items` ADD COLUMN `barcode` VARCHAR(100) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `items_barcode_key` ON `items`(`barcode`);
