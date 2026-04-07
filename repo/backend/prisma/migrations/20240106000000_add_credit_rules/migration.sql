-- Add credit_rules table for durable, admin-configurable rating→delta mappings.
-- An empty table is valid and means "use application-level defaults" — fully
-- backward-compatible with existing deployments that have no rows.
CREATE TABLE `credit_rules` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `rating`     TINYINT      NOT NULL,
  `delta`      SMALLINT     NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `credit_rules_rating_key` (`rating`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
