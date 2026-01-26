-- =====================================================
-- BookOne v1.3 - Accounting System Fixes Migration
-- CORRECTED for existing dinusri_acc database schema
-- =====================================================

-- 1. CHART OF ACCOUNTS - Payment accounts and proper account structure
CREATE TABLE IF NOT EXISTS `chart_of_accounts` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id` INT(10) UNSIGNED NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `account_type` ENUM('Asset', 'Liability', 'Equity', 'Revenue', 'Expense') NOT NULL,
    `sub_type` VARCHAR(50) NULL COMMENT 'Cash, Bank, AR, AP, Inventory, etc.',
    `parent_id` INT(10) UNSIGNED NULL,
    `is_system` TINYINT(1) DEFAULT 0 COMMENT 'System accounts cannot be deleted',
    `is_active` TINYINT(1) DEFAULT 1,
    `opening_balance` DECIMAL(15,2) DEFAULT 0,
    `opening_balance_date` DATE NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_code_business` (`business_id`, `code`),
    KEY `idx_business` (`business_id`),
    KEY `idx_type` (`account_type`),
    CONSTRAINT `chart_of_accounts_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `chart_of_accounts_ibfk_2` FOREIGN KEY (`parent_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add payment_account_id to transactions (skip if exists)
-- Check and add columns one by one
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'payment_account_id');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `transactions` ADD COLUMN `payment_account_id` INT(10) UNSIGNED NULL AFTER `payment_method`',
    'SELECT "payment_account_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'due_date');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `transactions` ADD COLUMN `due_date` DATE NULL AFTER `date`',
    'SELECT "due_date already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'is_reversal');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `transactions` ADD COLUMN `is_reversal` TINYINT(1) DEFAULT 0 AFTER `voided`',
    'SELECT "is_reversal already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'reversed_transaction_id');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `transactions` ADD COLUMN `reversed_transaction_id` INT(10) UNSIGNED NULL AFTER `is_reversal`',
    'SELECT "reversed_transaction_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. SETTLEMENT ALLOCATIONS - For multi-invoice payments
CREATE TABLE IF NOT EXISTS `settlement_allocations` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id` INT(10) UNSIGNED NOT NULL,
    `settlement_id` INT(10) UNSIGNED NOT NULL COMMENT 'The Receive/Pay transaction',
    `source_doc_id` INT(10) UNSIGNED NOT NULL COMMENT 'The Sale/Purchase/Expense being settled',
    `allocated_amount` DECIMAL(15,2) NOT NULL,
    `allocated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `allocated_by` INT(10) UNSIGNED NULL,
    PRIMARY KEY (`id`),
    KEY `idx_settlement` (`settlement_id`),
    KEY `idx_source_doc` (`source_doc_id`),
    KEY `idx_business` (`business_id`),
    CONSTRAINT `settlement_allocations_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `settlement_allocations_ibfk_2` FOREIGN KEY (`settlement_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `settlement_allocations_ibfk_3` FOREIGN KEY (`source_doc_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `settlement_allocations_ibfk_4` FOREIGN KEY (`allocated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. JOURNAL ENTRIES - Proper double-entry ledger
CREATE TABLE IF NOT EXISTS `journal_entries` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id` INT(10) UNSIGNED NOT NULL,
    `department_id` INT(10) UNSIGNED NULL,
    `transaction_id` INT(10) UNSIGNED NULL COMMENT 'Link to source transaction if auto-generated',
    `entry_date` DATE NOT NULL,
    `reference` VARCHAR(50) NULL,
    `description` TEXT NULL,
    `is_opening_entry` TINYINT(1) DEFAULT 0,
    `is_reversal` TINYINT(1) DEFAULT 0,
    `reversed_entry_id` INT(10) UNSIGNED NULL COMMENT 'If this is a reversal, link to original',
    `is_balanced` TINYINT(1) DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `created_by` INT(10) UNSIGNED NULL,
    PRIMARY KEY (`id`),
    KEY `idx_date` (`business_id`, `entry_date`),
    KEY `idx_transaction` (`transaction_id`),
    CONSTRAINT `journal_entries_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `journal_entries_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
    CONSTRAINT `journal_entries_ibfk_3` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `journal_entries_ibfk_4` FOREIGN KEY (`reversed_entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE SET NULL,
    CONSTRAINT `journal_entries_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. JOURNAL LINES - Individual debit/credit lines
CREATE TABLE IF NOT EXISTS `journal_lines` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `journal_entry_id` INT(10) UNSIGNED NOT NULL,
    `account_id` INT(10) UNSIGNED NOT NULL,
    `debit` DECIMAL(15,2) DEFAULT 0,
    `credit` DECIMAL(15,2) DEFAULT 0,
    `description` VARCHAR(255) NULL,
    PRIMARY KEY (`id`),
    KEY `idx_journal` (`journal_entry_id`),
    KEY `idx_account` (`account_id`),
    CONSTRAINT `journal_lines_ibfk_1` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE CASCADE,
    CONSTRAINT `journal_lines_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. OPENING BALANCES - Proper opening balance tracking
CREATE TABLE IF NOT EXISTS `opening_balances` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id` INT(10) UNSIGNED NOT NULL,
    `department_id` INT(10) UNSIGNED NULL,
    `account_id` INT(10) UNSIGNED NOT NULL,
    `balance_date` DATE NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `is_debit` TINYINT(1) NOT NULL COMMENT '1=Debit balance, 0=Credit balance',
    `notes` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `created_by` INT(10) UNSIGNED NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_opening` (`business_id`, `department_id`, `account_id`, `balance_date`),
    CONSTRAINT `opening_balances_ibfk_1` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `opening_balances_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
    CONSTRAINT `opening_balances_ibfk_3` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `opening_balances_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Add period_lock_date to businesses (uses_inventory already exists)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'businesses' AND COLUMN_NAME = 'period_lock_date');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `businesses` ADD COLUMN `period_lock_date` DATE NULL COMMENT "Transactions on or before this date cannot be edited"',
    'SELECT "period_lock_date already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 8. Add default_account_id to categories (is_inventory already exists)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'default_account_id');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `categories` ADD COLUMN `default_account_id` INT(10) UNSIGNED NULL',
    'SELECT "default_account_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- INSERT DEFAULT ACCOUNTS FOR EXISTING BUSINESSES
-- =====================================================

-- Insert default accounts for business_id = 1 (Clossyan Technologies)
-- Only if not already present

INSERT IGNORE INTO `chart_of_accounts` (`business_id`, `code`, `name`, `account_type`, `sub_type`, `is_system`) VALUES
-- Asset Accounts (1xxx)
(1, '1000', 'Cash on Hand', 'Asset', 'Cash', 1),
(1, '1010', 'Bank Account', 'Asset', 'Bank', 1),
(1, '1015', 'Card Clearing', 'Asset', 'Bank', 1),
(1, '1020', 'Online Wallet', 'Asset', 'Bank', 1),
(1, '1100', 'Accounts Receivable', 'Asset', 'AR', 1),
(1, '1150', 'Supplier Prepayments', 'Asset', 'Prepayment', 1),
(1, '1200', 'Inventory', 'Asset', 'Inventory', 1),
-- Liability Accounts (2xxx)
(1, '2000', 'Accounts Payable', 'Liability', 'AP', 1),
(1, '2050', 'Customer Deposits', 'Liability', 'Deposit', 1),
-- Equity Accounts (3xxx)
(1, '3000', 'Owner Capital', 'Equity', 'Capital', 1),
(1, '3100', 'Owner Drawings', 'Equity', 'Drawings', 1),
(1, '3200', 'Retained Earnings', 'Equity', 'Retained', 1),
(1, '3900', 'Opening Balance Equity', 'Equity', 'Opening', 1),
-- Revenue Accounts (4xxx)
(1, '4000', 'Sales Revenue', 'Revenue', 'Sales', 1),
(1, '4100', 'Other Income', 'Revenue', 'Other', 1),
-- Expense Accounts (5xxx-6xxx)
(1, '5000', 'Cost of Goods Sold', 'Expense', 'COGS', 1),
(1, '5100', 'Direct Costs', 'Expense', 'DirectCost', 1),
(1, '6000', 'Operating Expenses', 'Expense', 'Operating', 1),
(1, '6100', 'Rent & Utilities', 'Expense', 'Operating', 0),
(1, '6200', 'Salaries & Wages', 'Expense', 'Operating', 0),
(1, '6300', 'Office Supplies', 'Expense', 'Operating', 0),
(1, '6400', 'Marketing & Advertising', 'Expense', 'Operating', 0),
(1, '6500', 'Travel & Transport', 'Expense', 'Operating', 0),
(1, '6900', 'Miscellaneous Expenses', 'Expense', 'Operating', 0);

-- =====================================================
-- MIGRATE PAYMENT METHODS TO ACCOUNT IDS
-- =====================================================

-- Map Cash payments to Cash account (code 1000)
UPDATE `transactions` t
SET `payment_account_id` = (
    SELECT `id` FROM `chart_of_accounts` 
    WHERE `business_id` = t.`business_id` AND `code` = '1000' LIMIT 1
)
WHERE t.`payment_method` = 'Cash'
AND t.`type` IN ('Receive', 'Pay', 'Transfer', 'Owner')
AND t.`payment_account_id` IS NULL;

-- Map Bank payments to Bank account (code 1010)
UPDATE `transactions` t
SET `payment_account_id` = (
    SELECT `id` FROM `chart_of_accounts` 
    WHERE `business_id` = t.`business_id` AND `code` = '1010' LIMIT 1
)
WHERE t.`payment_method` = 'Bank'
AND t.`type` IN ('Receive', 'Pay', 'Transfer', 'Owner')
AND t.`payment_account_id` IS NULL;

-- Map Card payments to Card Clearing (code 1015)
UPDATE `transactions` t
SET `payment_account_id` = (
    SELECT `id` FROM `chart_of_accounts` 
    WHERE `business_id` = t.`business_id` AND `code` = '1015' LIMIT 1
)
WHERE t.`payment_method` = 'Card'
AND t.`type` IN ('Receive', 'Pay', 'Transfer', 'Owner')
AND t.`payment_account_id` IS NULL;

-- Map Online payments to Online Wallet (code 1020)
UPDATE `transactions` t
SET `payment_account_id` = (
    SELECT `id` FROM `chart_of_accounts` 
    WHERE `business_id` = t.`business_id` AND `code` = '1020' LIMIT 1
)
WHERE t.`payment_method` = 'Online'
AND t.`type` IN ('Receive', 'Pay', 'Transfer', 'Owner')
AND t.`payment_account_id` IS NULL;

-- =====================================================
-- MIGRATE EXISTING SETTLEMENTS TO ALLOCATIONS
-- =====================================================

INSERT IGNORE INTO `settlement_allocations` (`business_id`, `settlement_id`, `source_doc_id`, `allocated_amount`, `allocated_by`)
SELECT 
    t.`business_id`,
    t.`id` AS `settlement_id`,
    t.`source_doc_id`,
    t.`amount` AS `allocated_amount`,
    t.`user_id` AS `allocated_by`
FROM `transactions` t
WHERE t.`type` IN ('Receive', 'Pay')
AND t.`source_doc_id` IS NOT NULL
AND t.`voided` = 0;

-- =====================================================
-- ADD FOREIGN KEY FOR payment_account_id (if not exists)
-- =====================================================

-- Note: This may fail if the FK already exists - that's OK
-- ALTER TABLE `transactions` 
-- ADD CONSTRAINT `transactions_payment_account_fk` 
-- FOREIGN KEY (`payment_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL;

SELECT 'Migration v1.3 complete!' AS status;
