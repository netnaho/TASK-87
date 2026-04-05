-- CreateEnum
-- Note: MySQL enums are inline in column definitions, not separate types

-- CreateTable
CREATE TABLE `service_interactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requester_id` INTEGER NOT NULL,
    `provider_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `description` TEXT NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_interactions` ADD CONSTRAINT `service_interactions_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_interactions` ADD CONSTRAINT `service_interactions_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
