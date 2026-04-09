-- Remove duplicate domain rows, keeping one row per domain (the earliest inserted)
DELETE FROM `custom_domains`
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM `custom_domains`
  GROUP BY `domain`
);

CREATE UNIQUE INDEX `custom_domains_domain_unique` ON `custom_domains` (`domain`);
