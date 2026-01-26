<?php
/**
 * BookOne v1.3 - Accounting Functions
 * Fixed double-entry system with proper GL auto-generation
 * 
 * CRITICAL FIX: Recognition docs (Sale/Purchase/Expense) NEVER post Cash/Bank directly
 * Only Settlement docs (Receive/Pay) post Cash/Bank
 */

/**
 * Get transaction type classifications
 * Recognition = affects P&L (Sale, Purchase, Expense)
 * Settlement = affects Cash/Bank and AR/AP (Receive, Pay)
 * Movement = internal transfers (Transfer)
 * Adjustment = period adjustments (Owner, StockAdjust)
 */
function getTransactionClassification() {
    return [
        'Sale'        => ['class' => 'recognition', 'affects' => 'revenue', 'creates' => 'AR'],
        'Purchase'    => ['class' => 'recognition', 'affects' => 'cost', 'creates' => 'AP'],
        'Expense'     => ['class' => 'recognition', 'affects' => 'expense', 'creates' => 'AP'],
        'Receive'     => ['class' => 'settlement', 'affects' => 'cash_in', 'reduces' => 'AR'],
        'Pay'         => ['class' => 'settlement', 'affects' => 'cash_out', 'reduces' => 'AP'],
        'Transfer'    => ['class' => 'movement', 'affects' => 'internal', 'reduces' => null],
        'Owner'       => ['class' => 'adjustment', 'affects' => 'equity', 'reduces' => null],
        'StockAdjust' => ['class' => 'adjustment', 'affects' => 'inventory', 'reduces' => null],
    ];
}

/**
 * Check if transaction type is a recognition document
 */
function isRecognitionDoc($type) {
    return in_array($type, ['Sale', 'Purchase', 'Expense']);
}

/**
 * Check if transaction type is a settlement
 */
function isSettlement($type) {
    return in_array($type, ['Receive', 'Pay']);
}

/**
 * Get chart of accounts for a business
 */
function getChartOfAccounts($businessId) {
    return db()->fetchAll(
        "SELECT * FROM chart_of_accounts WHERE business_id = ? AND is_active = 1 ORDER BY code",
        [$businessId]
    );
}

/**
 * Get account by sub_type for a business
 */
function getAccountBySubType($businessId, $subType) {
    return db()->fetch(
        "SELECT * FROM chart_of_accounts 
         WHERE business_id = ? AND sub_type = ? AND is_active = 1 
         ORDER BY is_system DESC LIMIT 1",
        [$businessId, $subType]
    );
}

/**
 * Get account by ID
 */
function getAccountById($accountId) {
    return db()->fetch("SELECT * FROM chart_of_accounts WHERE id = ?", [$accountId]);
}

/**
 * Get payment account from payment_account_id or payment_method
 * For backward compatibility, maps payment_method to default accounts
 */
function resolvePaymentAccount($businessId, $paymentAccountId = null, $paymentMethod = null) {
    // If explicit account ID provided, use it
    if ($paymentAccountId) {
        $account = getAccountById($paymentAccountId);
        if ($account && $account['business_id'] == $businessId) {
            return $account;
        }
    }
    
    // Fall back to payment_method mapping (backward compatibility)
    if ($paymentMethod) {
        $mapping = [
            'Cash'   => 'Cash',
            'Bank'   => 'Bank',
            'Card'   => 'Bank', // Default to Bank for Card
            'Online' => 'Bank', // Default to Bank for Online
        ];
        
        $subType = $mapping[$paymentMethod] ?? 'Bank';
        return getAccountBySubType($businessId, $subType);
    }
    
    return null;
}

/**
 * Check if a period is locked
 */
function isPeriodLocked($businessId, $date, $departmentId = null) {
    $period = date('Y-m', strtotime($date));
    
    $sql = "SELECT is_locked FROM period_balances 
            WHERE business_id = ? AND period = ?";
    $params = [$businessId, $period];
    
    if ($departmentId) {
        $sql .= " AND department_id = ?";
        $params[] = $departmentId;
    } else {
        $sql .= " AND department_id IS NULL";
    }
    
    $result = db()->fetch($sql, $params);
    return $result && $result['is_locked'];
}

/**
 * Check if business uses inventory
 */
function businessUsesInventory($businessId) {
    $business = db()->fetch("SELECT uses_inventory FROM businesses WHERE id = ?", [$businessId]);
    return $business && $business['uses_inventory'];
}

// ============================================================================
// JOURNAL ENTRY GENERATION (CRITICAL FIX: No Cash/Bank from Recognition Docs)
// ============================================================================

/**
 * Generate journal entry for a transaction
 * CRITICAL: Recognition docs NEVER post Cash/Bank directly
 * 
 * Mapping:
 * A) Sale: Dr AccountsReceivable, Cr SalesRevenue
 * B) Purchase: Dr Inventory/DirectCost (config), Cr AccountsPayable
 * C) Expense: Dr ExpenseAccount (category), Cr AccountsPayable
 * D) Receive: Dr PaymentAccount, Cr AccountsReceivable
 * E) Pay: Dr AccountsPayable, Cr PaymentAccount
 * F) Transfer: Dr ToAccount, Cr FromAccount
 * G) Owner: Dr/Cr OwnerCapital/Drawings and PaymentAccount
 */
function generateJournalEntry($transaction, $userId = null) {
    $businessId = $transaction['business_id'];
    $type = $transaction['type'];
    $amount = (float)$transaction['amount'];
    
    // Get required accounts
    $accounts = [
        'AR' => getAccountBySubType($businessId, 'AR'),
        'AP' => getAccountBySubType($businessId, 'AP'),
        'Sales' => getAccountBySubType($businessId, 'Sales'),
        'COGS' => getAccountBySubType($businessId, 'COGS'),
        'DirectCost' => getAccountBySubType($businessId, 'DirectCost'),
        'Operating' => getAccountBySubType($businessId, 'Operating'),
        'Capital' => getAccountBySubType($businessId, 'Capital'),
        'Drawings' => getAccountBySubType($businessId, 'Drawings'),
        'Inventory' => getAccountBySubType($businessId, 'Inventory'),
        'CustomerDeposits' => getAccountBySubType($businessId, 'Deposit'),
        'SupplierPrepayments' => getAccountBySubType($businessId, 'Prepayment'),
    ];
    
    // Payment account for settlements
    $paymentAccount = resolvePaymentAccount(
        $businessId, 
        $transaction['payment_account_id'] ?? null, 
        $transaction['payment_method'] ?? null
    );
    
    $journalLines = [];
    $description = $transaction['description'] ?? $type . ' - ' . ($transaction['party'] ?? 'Unknown');
    
    switch ($type) {
        case 'Sale':
            // A) Sale: Dr AccountsReceivable, Cr SalesRevenue
            // NEVER post Cash/Bank directly - even if payment_method != Credit
            $journalLines[] = [
                'account_id' => $accounts['AR']['id'],
                'debit' => $amount,
                'credit' => 0,
                'description' => 'AR from Sale #' . $transaction['id']
            ];
            $journalLines[] = [
                'account_id' => $accounts['Sales']['id'],
                'debit' => 0,
                'credit' => $amount,
                'description' => 'Revenue from Sale #' . $transaction['id']
            ];
            break;
            
        case 'Purchase':
            // B) Purchase: Dr Inventory/DirectCost, Cr AccountsPayable
            // Determine debit account based on inventory setting and category
            if (businessUsesInventory($businessId) && isInventoryCategory($transaction['category_id'])) {
                $debitAccount = $accounts['Inventory'];
            } else {
                $debitAccount = $accounts['DirectCost'] ?: $accounts['Operating'];
            }
            
            $journalLines[] = [
                'account_id' => $debitAccount['id'],
                'debit' => $amount,
                'credit' => 0,
                'description' => 'Purchase #' . $transaction['id']
            ];
            $journalLines[] = [
                'account_id' => $accounts['AP']['id'],
                'debit' => 0,
                'credit' => $amount,
                'description' => 'AP from Purchase #' . $transaction['id']
            ];
            break;
            
        case 'Expense':
            // C) Expense: Dr ExpenseAccount, Cr AccountsPayable
            $expenseAccount = getExpenseAccountForCategory($businessId, $transaction['category_id']);
            
            $journalLines[] = [
                'account_id' => $expenseAccount['id'],
                'debit' => $amount,
                'credit' => 0,
                'description' => 'Expense #' . $transaction['id']
            ];
            $journalLines[] = [
                'account_id' => $accounts['AP']['id'],
                'debit' => 0,
                'credit' => $amount,
                'description' => 'AP from Expense #' . $transaction['id']
            ];
            break;
            
        case 'Receive':
            // D) Receive: Dr PaymentAccount, Cr AccountsReceivable (or CustomerDeposits if unallocated)
            if (!$paymentAccount) {
                throw new Exception('Payment account required for Receive');
            }
            
            // Check if this is allocated to a specific document
            $allocatedAmount = getAllocatedAmount($transaction['id']);
            $unallocatedAmount = $amount - $allocatedAmount;
            
            // Debit PaymentAccount for full amount
            $journalLines[] = [
                'account_id' => $paymentAccount['id'],
                'debit' => $amount,
                'credit' => 0,
                'description' => 'Payment received #' . $transaction['id']
            ];
            
            // Credit AR for allocated portion
            if ($allocatedAmount > 0) {
                $journalLines[] = [
                    'account_id' => $accounts['AR']['id'],
                    'debit' => 0,
                    'credit' => $allocatedAmount,
                    'description' => 'AR reduction from Receive #' . $transaction['id']
                ];
            }
            
            // Credit CustomerDeposits for unallocated portion
            if ($unallocatedAmount > 0 && $accounts['CustomerDeposits']) {
                $journalLines[] = [
                    'account_id' => $accounts['CustomerDeposits']['id'],
                    'debit' => 0,
                    'credit' => $unallocatedAmount,
                    'description' => 'Unallocated customer deposit #' . $transaction['id']
                ];
            }
            break;
            
        case 'Pay':
            // E) Pay: Dr AccountsPayable (or SupplierPrepayments), Cr PaymentAccount
            if (!$paymentAccount) {
                throw new Exception('Payment account required for Pay');
            }
            
            // Check allocation
            $allocatedAmount = getAllocatedAmount($transaction['id']);
            $unallocatedAmount = $amount - $allocatedAmount;
            
            // Debit AP for allocated portion
            if ($allocatedAmount > 0) {
                $journalLines[] = [
                    'account_id' => $accounts['AP']['id'],
                    'debit' => $allocatedAmount,
                    'credit' => 0,
                    'description' => 'AP reduction from Pay #' . $transaction['id']
                ];
            }
            
            // Debit SupplierPrepayments for unallocated portion
            if ($unallocatedAmount > 0 && $accounts['SupplierPrepayments']) {
                $journalLines[] = [
                    'account_id' => $accounts['SupplierPrepayments']['id'],
                    'debit' => $unallocatedAmount,
                    'credit' => 0,
                    'description' => 'Supplier prepayment #' . $transaction['id']
                ];
            }
            
            // Credit PaymentAccount for full amount
            $journalLines[] = [
                'account_id' => $paymentAccount['id'],
                'debit' => 0,
                'credit' => $amount,
                'description' => 'Payment made #' . $transaction['id']
            ];
            break;
            
        case 'Transfer':
            // F) Transfer: Dr ToAccount, Cr FromAccount (balanced, no P&L impact)
            $fromAccount = resolvePaymentAccount($businessId, null, $transaction['from_account']);
            $toAccount = resolvePaymentAccount($businessId, null, $transaction['to_account']);
            
            if (!$fromAccount || !$toAccount) {
                throw new Exception('Both transfer accounts must be valid');
            }
            
            $journalLines[] = [
                'account_id' => $toAccount['id'],
                'debit' => $amount,
                'credit' => 0,
                'description' => 'Transfer in #' . $transaction['id']
            ];
            $journalLines[] = [
                'account_id' => $fromAccount['id'],
                'debit' => 0,
                'credit' => $amount,
                'description' => 'Transfer out #' . $transaction['id']
            ];
            break;
            
        case 'Owner':
            // G) Owner: map to Equity (OwnerCapital/Drawings) and PaymentAccount
            if (!$paymentAccount) {
                throw new Exception('Payment account required for Owner transaction');
            }
            
            if ($amount > 0) {
                // Owner contribution: Dr PaymentAccount, Cr OwnerCapital
                $journalLines[] = [
                    'account_id' => $paymentAccount['id'],
                    'debit' => $amount,
                    'credit' => 0,
                    'description' => 'Owner contribution #' . $transaction['id']
                ];
                $journalLines[] = [
                    'account_id' => $accounts['Capital']['id'],
                    'debit' => 0,
                    'credit' => $amount,
                    'description' => 'Capital from owner #' . $transaction['id']
                ];
            } else {
                // Owner withdrawal: Dr Drawings, Cr PaymentAccount
                $absAmount = abs($amount);
                $journalLines[] = [
                    'account_id' => $accounts['Drawings']['id'],
                    'debit' => $absAmount,
                    'credit' => 0,
                    'description' => 'Owner drawings #' . $transaction['id']
                ];
                $journalLines[] = [
                    'account_id' => $paymentAccount['id'],
                    'debit' => 0,
                    'credit' => $absAmount,
                    'description' => 'Payment for drawings #' . $transaction['id']
                ];
            }
            break;
            
        case 'StockAdjust':
            // Stock adjustment (inventory count)
            // This doesn't create standard journal - handled separately
            return null;
            
        default:
            throw new Exception("Unknown transaction type: $type");
    }
    
    // Validate journal is balanced
    $totalDebits = array_sum(array_column($journalLines, 'debit'));
    $totalCredits = array_sum(array_column($journalLines, 'credit'));
    
    if (abs($totalDebits - $totalCredits) > 0.01) {
        throw new Exception("Journal entry is not balanced: Debits=$totalDebits, Credits=$totalCredits");
    }
    
    // Create journal entry
    $journalId = db()->insert('journal_entries', [
        'business_id' => $businessId,
        'department_id' => $transaction['department_id'],
        'transaction_id' => $transaction['id'],
        'entry_date' => $transaction['date'],
        'reference' => $transaction['invoice_or_bill_ref'],
        'description' => $description,
        'is_balanced' => 1,
        'created_by' => $userId
    ]);
    
    // Insert journal lines
    foreach ($journalLines as $line) {
        $line['journal_entry_id'] = $journalId;
        db()->insert('journal_lines', $line);
    }
    
    return $journalId;
}

/**
 * Check if category is inventory type
 */
function isInventoryCategory($categoryId) {
    if (!$categoryId) return false;
    $cat = db()->fetch("SELECT is_inventory FROM categories WHERE id = ?", [$categoryId]);
    return $cat && $cat['is_inventory'];
}

/**
 * Get expense account for category (or default)
 */
function getExpenseAccountForCategory($businessId, $categoryId) {
    if ($categoryId) {
        $cat = db()->fetch("SELECT default_account_id FROM categories WHERE id = ?", [$categoryId]);
        if ($cat && $cat['default_account_id']) {
            return getAccountById($cat['default_account_id']);
        }
    }
    // Default to Operating Expenses
    return getAccountBySubType($businessId, 'Operating');
}

/**
 * Get total allocated amount for a settlement
 */
function getAllocatedAmount($settlementId) {
    $result = db()->fetch(
        "SELECT COALESCE(SUM(allocated_amount), 0) as total 
         FROM settlement_allocations WHERE settlement_id = ?",
        [$settlementId]
    );
    return (float)($result['total'] ?? 0);
}

/**
 * Create settlement allocation
 */
function createAllocation($settlementId, $sourceDocId, $amount, $userId = null) {
    $businessId = db()->fetch("SELECT business_id FROM transactions WHERE id = ?", [$settlementId])['business_id'];
    
    return db()->insert('settlement_allocations', [
        'business_id' => $businessId,
        'settlement_id' => $settlementId,
        'source_doc_id' => $sourceDocId,
        'allocated_amount' => $amount,
        'allocated_by' => $userId
    ]);
}

/**
 * Reverse a journal entry (for locked period edits)
 */
function reverseJournalEntry($journalId, $reversalDate, $userId = null) {
    $original = db()->fetch("SELECT * FROM journal_entries WHERE id = ?", [$journalId]);
    if (!$original) {
        throw new Exception("Journal entry not found");
    }
    
    // Create reversal entry
    $reversalId = db()->insert('journal_entries', [
        'business_id' => $original['business_id'],
        'department_id' => $original['department_id'],
        'transaction_id' => $original['transaction_id'],
        'entry_date' => $reversalDate,
        'reference' => 'REV-' . $original['reference'],
        'description' => 'Reversal of: ' . $original['description'],
        'is_reversal' => 1,
        'reversed_entry_id' => $journalId,
        'is_balanced' => 1,
        'created_by' => $userId
    ]);
    
    // Get original lines and reverse them
    $lines = db()->fetchAll("SELECT * FROM journal_lines WHERE journal_entry_id = ?", [$journalId]);
    foreach ($lines as $line) {
        db()->insert('journal_lines', [
            'journal_entry_id' => $reversalId,
            'account_id' => $line['account_id'],
            'debit' => $line['credit'],  // Swap debit/credit
            'credit' => $line['debit'],
            'description' => 'Reversal: ' . $line['description']
        ]);
    }
    
    return $reversalId;
}

// ============================================================================
// BALANCE CALCULATIONS (Account-based)
// ============================================================================

/**
 * Calculate account balance from journal entries
 */
function calculateAccountBalance($accountId, $asOfDate = null) {
    $account = getAccountById($accountId);
    if (!$account) return 0;
    
    $dateFilter = $asOfDate ? " AND je.entry_date <= ?" : "";
    $params = [$accountId];
    if ($asOfDate) $params[] = $asOfDate;
    
    $result = db()->fetch(
        "SELECT COALESCE(SUM(jl.debit), 0) as total_debit, 
                COALESCE(SUM(jl.credit), 0) as total_credit
         FROM journal_lines jl
         INNER JOIN journal_entries je ON jl.journal_entry_id = je.id
         WHERE jl.account_id = ? $dateFilter",
        $params
    );
    
    $totalDebit = (float)$result['total_debit'];
    $totalCredit = (float)$result['total_credit'];
    
    // Add opening balance
    $opening = (float)($account['opening_balance'] ?? 0);
    
    // Debit-normal accounts (Assets, Expenses): balance = debits - credits
    // Credit-normal accounts (Liabilities, Equity, Revenue): balance = credits - debits
    if (in_array($account['account_type'], ['Asset', 'Expense'])) {
        return $opening + $totalDebit - $totalCredit;
    } else {
        return $opening + $totalCredit - $totalDebit;
    }
}

/**
 * Get all payment account balances for a business
 */
function getPaymentAccountBalances($businessId, $asOfDate = null) {
    $accounts = db()->fetchAll(
        "SELECT * FROM chart_of_accounts 
         WHERE business_id = ? AND sub_type IN ('Cash', 'Bank') AND is_active = 1
         ORDER BY code",
        [$businessId]
    );
    
    $balances = [];
    foreach ($accounts as $account) {
        $balances[] = [
            'id' => $account['id'],
            'code' => $account['code'],
            'name' => $account['name'],
            'sub_type' => $account['sub_type'],
            'balance' => calculateAccountBalance($account['id'], $asOfDate)
        ];
    }
    
    return $balances;
}

/**
 * Calculate document outstanding amount (using allocations)
 */
function getDocumentOutstanding($docId) {
    $doc = db()->fetch(
        "SELECT id, amount, type FROM transactions WHERE id = ? AND voided = 0",
        [$docId]
    );
    
    if (!$doc || !isRecognitionDoc($doc['type'])) {
        return ['outstanding' => 0, 'derived_status' => 'N/A'];
    }
    
    // Get allocated amounts from settlement_allocations
    $allocated = db()->fetch(
        "SELECT COALESCE(SUM(sa.allocated_amount), 0) as total
         FROM settlement_allocations sa
         INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
         WHERE sa.source_doc_id = ?",
        [$docId]
    )['total'];
    
    // For backward compatibility, also check direct source_doc_id links
    // (before allocation table existed)
    $directSettled = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total
         FROM transactions 
         WHERE source_doc_id = ? AND voided = 0 
         AND type IN ('Receive', 'Pay')
         AND id NOT IN (SELECT settlement_id FROM settlement_allocations)",
        [$docId]
    )['total'];
    
    $totalSettled = (float)$allocated + (float)$directSettled;
    $outstanding = (float)$doc['amount'] - $totalSettled;
    
    // Determine status
    $status = 'Pending';
    if ($outstanding <= 0.01) {
        $status = 'Paid';
    } elseif ($totalSettled > 0) {
        $status = 'Partial';
    }
    
    return [
        'doc_amount' => (float)$doc['amount'],
        'settled_amount' => $totalSettled,
        'outstanding' => max(0, $outstanding),
        'derived_status' => $status
    ];
}

/**
 * Get all settlements for a document
 */
function getDocumentSettlements($docId) {
    return db()->fetchAll(
        "SELECT t.*, sa.allocated_amount
         FROM transactions t
         LEFT JOIN settlement_allocations sa ON sa.settlement_id = t.id AND sa.source_doc_id = ?
         WHERE (t.source_doc_id = ? OR sa.source_doc_id = ?)
         AND t.voided = 0 
         AND t.type IN ('Receive', 'Pay')
         ORDER BY t.date ASC, t.id ASC",
        [$docId, $docId, $docId]
    );
}

/**
 * Calculate AR (Accounts Receivable) for a business/department
 * AR = Total Sales - Total allocated Receive amounts
 */
function calculateAR($businessId, $departmentId = null, $asOfDate = null) {
    // Use account-based calculation if journal entries exist
    $arAccount = getAccountBySubType($businessId, 'AR');
    if ($arAccount) {
        return calculateAccountBalance($arAccount['id'], $asOfDate);
    }
    
    // Fallback to transaction-based calculation
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $dateFilter = $asOfDate ? " AND date <= ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    if ($asOfDate) $params[] = $asOfDate;
    
    // Total Sales
    $sales = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Sale' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Total Receives (allocated to Sales)
    $receives = db()->fetch(
        "SELECT COALESCE(SUM(sa.allocated_amount), 0) as total 
         FROM settlement_allocations sa
         INNER JOIN transactions s ON sa.settlement_id = s.id 
         INNER JOIN transactions doc ON sa.source_doc_id = doc.id
         WHERE s.business_id = ? AND s.type = 'Receive' AND s.voided = 0 
         AND doc.type = 'Sale'",
        [$businessId]
    )['total'];
    
    return (float)$sales - (float)$receives;
}

/**
 * Calculate AP (Accounts Payable) for a business/department
 * AP = Total Purchases/Expenses - Total allocated Pay amounts
 */
function calculateAP($businessId, $departmentId = null, $asOfDate = null) {
    // Use account-based calculation if journal entries exist
    $apAccount = getAccountBySubType($businessId, 'AP');
    if ($apAccount) {
        return calculateAccountBalance($apAccount['id'], $asOfDate);
    }
    
    // Fallback to transaction-based calculation
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $dateFilter = $asOfDate ? " AND date <= ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    if ($asOfDate) $params[] = $asOfDate;
    
    // Total Purchases + Expenses (only Credit, non-paid ones create AP)
    $purchases = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type IN ('Purchase', 'Expense') 
         AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Total Pays (allocated)
    $pays = db()->fetch(
        "SELECT COALESCE(SUM(sa.allocated_amount), 0) as total 
         FROM settlement_allocations sa
         INNER JOIN transactions s ON sa.settlement_id = s.id 
         WHERE s.business_id = ? AND s.type = 'Pay' AND s.voided = 0",
        [$businessId]
    )['total'];
    
    return (float)$purchases - (float)$pays;
}

/**
 * Calculate Cash Balance (from payment accounts)
 */
function calculateCashBalance($businessId, $departmentId = null, $asOfDate = null) {
    $cashAccount = getAccountBySubType($businessId, 'Cash');
    if ($cashAccount) {
        return calculateAccountBalance($cashAccount['id'], $asOfDate);
    }
    
    // Fallback to legacy calculation
    return calculateLegacyCashBalance($businessId, $departmentId, $asOfDate);
}

/**
 * Calculate Bank Balance (from payment accounts)
 */
function calculateBankBalance($businessId, $departmentId = null, $asOfDate = null) {
    $bankAccount = getAccountBySubType($businessId, 'Bank');
    if ($bankAccount) {
        return calculateAccountBalance($bankAccount['id'], $asOfDate);
    }
    
    // Fallback to legacy calculation
    return calculateLegacyBankBalance($businessId, $departmentId, $asOfDate);
}

/**
 * Legacy cash balance calculation (before chart of accounts)
 */
function calculateLegacyCashBalance($businessId, $departmentId = null, $asOfDate = null) {
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $dateFilter = $asOfDate ? " AND date <= ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    if ($asOfDate) $params[] = $asOfDate;
    
    // Get opening balance
    $business = db()->fetch("SELECT opening_cash FROM businesses WHERE id = ?", [$businessId]);
    $opening = (float)($business['opening_cash'] ?? 0);
    
    // Cash In: Receive with payment_method = Cash
    $cashIn = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Receive' 
         AND payment_method = 'Cash' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Cash Out: Pay with payment_method = Cash
    $cashOut = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Pay' 
         AND payment_method = 'Cash' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Transfers In/Out
    $transferIn = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Transfer' 
         AND to_account = 'Cash' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    $transferOut = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Transfer' 
         AND from_account = 'Cash' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Owner contributions to Cash
    $ownerCash = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Owner' 
         AND payment_method = 'Cash' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    return $opening + (float)$cashIn - (float)$cashOut + (float)$transferIn - (float)$transferOut + (float)$ownerCash;
}

/**
 * Legacy bank balance calculation
 */
function calculateLegacyBankBalance($businessId, $departmentId = null, $asOfDate = null) {
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $dateFilter = $asOfDate ? " AND date <= ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    if ($asOfDate) $params[] = $asOfDate;
    
    // Get opening balance
    $business = db()->fetch("SELECT opening_bank FROM businesses WHERE id = ?", [$businessId]);
    $opening = (float)($business['opening_bank'] ?? 0);
    
    // Bank In (includes Card and Online for backward compatibility)
    $bankIn = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Receive' 
         AND payment_method IN ('Bank', 'Card', 'Online') AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Bank Out
    $bankOut = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Pay' 
         AND payment_method IN ('Bank', 'Card', 'Online') AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Transfers
    $transferIn = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Transfer' 
         AND to_account = 'Bank' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    $transferOut = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Transfer' 
         AND from_account = 'Bank' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Owner contributions
    $ownerBank = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Owner' 
         AND payment_method IN ('Bank', 'Card', 'Online') AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    return $opening + (float)$bankIn - (float)$bankOut + (float)$transferIn - (float)$transferOut + (float)$ownerBank;
}

// ============================================================================
// COGS & INVENTORY
// ============================================================================

/**
 * Calculate COGS for inventory businesses
 * COGS = Opening Stock + Inventory Purchases - Closing Stock
 */
function calculateCOGS($businessId, $departmentId = null, $dateFrom = null, $dateTo = null) {
    // Check if business uses inventory
    if (!businessUsesInventory($businessId)) {
        return 0; // Service business, no COGS
    }
    
    $period = $dateTo ? date('Y-m', strtotime($dateTo)) : date('Y-m');
    $deptFilter = $departmentId ? " AND department_id = ?" : " AND department_id IS NULL";
    
    // Get opening stock for period
    $params = [$businessId, $period];
    if ($departmentId) $params[] = $departmentId;
    
    $opening = db()->fetch(
        "SELECT stock_value FROM stock_adjustments 
         WHERE business_id = ? AND period = ? $deptFilter AND adjustment_type = 'Opening'
         ORDER BY id DESC LIMIT 1",
        $params
    );
    $openingStock = (float)($opening['stock_value'] ?? 0);
    
    // Get closing stock
    $closing = db()->fetch(
        "SELECT stock_value FROM stock_adjustments 
         WHERE business_id = ? AND period = ? $deptFilter AND adjustment_type = 'Closing'
         ORDER BY id DESC LIMIT 1",
        $params
    );
    $closingStock = (float)($closing['stock_value'] ?? 0);
    
    // Get inventory purchases
    $purchaseParams = [$businessId];
    if ($departmentId) $purchaseParams[] = $departmentId;
    $dateFilterSql = "";
    if ($dateFrom) {
        $dateFilterSql .= " AND t.date >= ?";
        $purchaseParams[] = $dateFrom;
    }
    if ($dateTo) {
        $dateFilterSql .= " AND t.date <= ?";
        $purchaseParams[] = $dateTo;
    }
    
    $deptFilterPurch = $departmentId ? " AND t.department_id = ?" : "";
    
    $inventoryPurchases = db()->fetch(
        "SELECT COALESCE(SUM(t.amount), 0) as total 
         FROM transactions t
         INNER JOIN categories c ON t.category_id = c.id AND c.is_inventory = 1
         WHERE t.business_id = ? $deptFilterPurch AND t.type = 'Purchase' AND t.voided = 0 $dateFilterSql",
        $purchaseParams
    )['total'];
    
    return $openingStock + (float)$inventoryPurchases - $closingStock;
}

// ============================================================================
// P&L AND CASH FLOW (Recognition vs Settlement)
// ============================================================================

/**
 * Get P&L Summary (Recognition-based)
 * Revenue from Sales recognition only; Expenses from Expense + COGS (if inventory)
 * EXCLUDES Receive/Pay/Transfer
 */
function getProfitAndLoss($businessId, $departmentId = null, $dateFrom = null, $dateTo = null) {
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $dateFilter = "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    if ($dateFrom) {
        $dateFilter .= " AND date >= ?";
        $params[] = $dateFrom;
    }
    if ($dateTo) {
        $dateFilter .= " AND date <= ?";
        $params[] = $dateTo;
    }
    
    // Revenue (Sales only - recognition)
    $revenue = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Sale' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    $usesInventory = businessUsesInventory($businessId);
    
    if ($usesInventory) {
        // COGS from periodic inventory
        $cogs = calculateCOGS($businessId, $departmentId, $dateFrom, $dateTo);
        
        // Operating expenses (Expenses + non-inventory Purchases)
        $operatingExpenses = db()->fetch(
            "SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.business_id = ? $deptFilter 
             AND ((t.type = 'Expense') OR (t.type = 'Purchase' AND (c.is_inventory = 0 OR c.is_inventory IS NULL)))
             AND t.voided = 0 $dateFilter",
            $params
        )['total'];
    } else {
        // Service business - all purchases are expenses, no COGS
        $cogs = 0;
        $operatingExpenses = db()->fetch(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
             WHERE business_id = ? $deptFilter AND type IN ('Purchase', 'Expense') AND voided = 0 $dateFilter",
            $params
        )['total'];
    }
    
    $grossProfit = (float)$revenue - $cogs;
    $netProfit = $grossProfit - (float)$operatingExpenses;
    
    return [
        'revenue' => (float)$revenue,
        'cogs' => $cogs,
        'gross_profit' => $grossProfit,
        'operating_expenses' => (float)$operatingExpenses,
        'net_profit' => $netProfit,
        'uses_inventory' => $usesInventory,
        'cogs_note' => $usesInventory ? 'COGS accurate only if closing stock recorded' : null
    ];
}

/**
 * Get Cash Flow Summary (Settlement-based)
 * Derived from PaymentAccount movements
 * Classified: Operating (Receive/Pay), Financing (Owner/Loans)
 */
function getCashFlow($businessId, $departmentId = null, $dateFrom = null, $dateTo = null) {
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $dateFilter = "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    if ($dateFrom) {
        $dateFilter .= " AND date >= ?";
        $params[] = $dateFrom;
    }
    if ($dateTo) {
        $dateFilter .= " AND date <= ?";
        $params[] = $dateTo;
    }
    
    // Operating: Cash In from Receives
    $cashInOps = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Receive' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Operating: Cash Out from Pays
    $cashOutOps = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Pay' AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Financing: Owner contributions (positive amounts)
    $ownerIn = db()->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Owner' AND amount > 0 AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    // Financing: Owner drawings (negative amounts stored as positive)
    $ownerOut = db()->fetch(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions 
         WHERE business_id = ? $deptFilter AND type = 'Owner' AND amount < 0 AND voided = 0 $dateFilter",
        $params
    )['total'];
    
    $operatingNet = (float)$cashInOps - (float)$cashOutOps;
    $financingNet = (float)$ownerIn - (float)$ownerOut;
    
    return [
        'operating' => [
            'inflows' => (float)$cashInOps,
            'outflows' => (float)$cashOutOps,
            'net' => $operatingNet
        ],
        'financing' => [
            'owner_contributions' => (float)$ownerIn,
            'drawings' => (float)$ownerOut,
            'net' => $financingNet
        ],
        'investing' => [
            'inflows' => 0,
            'outflows' => 0,
            'net' => 0
        ],
        'net_change' => $operatingNet + $financingNet
    ];
}

// ============================================================================
// BALANCE SHEET
// ============================================================================

/**
 * Get Balance Sheet
 * Computed from account balances (including OpeningEntry, all journals)
 */
function getBalanceSheet($businessId, $departmentId = null, $asOfDate = null) {
    $asOfDate = $asOfDate ?: date('Y-m-d');
    
    // Get payment account balances
    $paymentBalances = getPaymentAccountBalances($businessId, $asOfDate);
    $totalCash = 0;
    $totalBank = 0;
    foreach ($paymentBalances as $acc) {
        if ($acc['sub_type'] === 'Cash') {
            $totalCash += $acc['balance'];
        } else {
            $totalBank += $acc['balance'];
        }
    }
    
    // AR & AP
    $ar = calculateAR($businessId, $departmentId, $asOfDate);
    $ap = calculateAP($businessId, $departmentId, $asOfDate);
    
    // Inventory (if enabled)
    $inventory = 0;
    if (businessUsesInventory($businessId)) {
        $invAccount = getAccountBySubType($businessId, 'Inventory');
        if ($invAccount) {
            $inventory = calculateAccountBalance($invAccount['id'], $asOfDate);
        }
    }
    
    // Prepayments and Deposits
    $supplierPrepayments = 0;
    $customerDeposits = 0;
    $prepaymentAccount = getAccountBySubType($businessId, 'Prepayment');
    $depositAccount = getAccountBySubType($businessId, 'Deposit');
    if ($prepaymentAccount) {
        $supplierPrepayments = calculateAccountBalance($prepaymentAccount['id'], $asOfDate);
    }
    if ($depositAccount) {
        $customerDeposits = calculateAccountBalance($depositAccount['id'], $asOfDate);
    }
    
    // Total Assets
    $totalAssets = $totalCash + $totalBank + $ar + $inventory + $supplierPrepayments;
    
    // Total Liabilities
    $totalLiabilities = $ap + $customerDeposits;
    
    // Equity (derived to balance)
    $equity = $totalAssets - $totalLiabilities;
    
    // Get detailed equity if accounts exist
    $capitalAccount = getAccountBySubType($businessId, 'Capital');
    $drawingsAccount = getAccountBySubType($businessId, 'Drawings');
    $retainedAccount = getAccountBySubType($businessId, 'Retained');
    
    $ownerCapital = $capitalAccount ? calculateAccountBalance($capitalAccount['id'], $asOfDate) : 0;
    $drawings = $drawingsAccount ? calculateAccountBalance($drawingsAccount['id'], $asOfDate) : 0;
    $retainedEarnings = $retainedAccount ? calculateAccountBalance($retainedAccount['id'], $asOfDate) : 0;
    
    return [
        'as_of_date' => $asOfDate,
        'assets' => [
            'current' => [
                'cash' => $totalCash,
                'bank' => $totalBank,
                'accounts_receivable' => $ar,
                'inventory' => $inventory,
                'supplier_prepayments' => $supplierPrepayments
            ],
            'total' => $totalAssets
        ],
        'liabilities' => [
            'current' => [
                'accounts_payable' => $ap,
                'customer_deposits' => $customerDeposits
            ],
            'total' => $totalLiabilities
        ],
        'equity' => [
            'owner_capital' => $ownerCapital,
            'drawings' => $drawings,
            'retained_earnings' => $retainedEarnings,
            'total' => $equity
        ],
        'balanced' => abs($totalAssets - ($totalLiabilities + $equity)) < 0.01,
        'payment_accounts' => $paymentBalances
    ];
}

// ============================================================================
// OPENING BALANCES
// ============================================================================

/**
 * Set opening balances for a business
 * Creates/updates opening balance entries and validates accounting equation
 */
function setOpeningBalances($businessId, $balances, $balanceDate, $userId = null) {
    // Validate accounting equation: Assets = Liabilities + Equity
    $totalAssets = 0;
    $totalLiabilities = 0;
    $totalEquity = 0;
    
    foreach ($balances as $accountId => $amount) {
        $account = getAccountById($accountId);
        if (!$account || $account['business_id'] != $businessId) {
            throw new Exception("Invalid account: $accountId");
        }
        
        switch ($account['account_type']) {
            case 'Asset':
                $totalAssets += $amount;
                break;
            case 'Liability':
                $totalLiabilities += $amount;
                break;
            case 'Equity':
                $totalEquity += $amount;
                break;
        }
    }
    
    $difference = $totalAssets - $totalLiabilities - $totalEquity;
    if (abs($difference) > 0.01) {
        throw new Exception(
            "Opening balances do not balance. " .
            "Assets ($totalAssets) must equal Liabilities ($totalLiabilities) + Equity ($totalEquity). " .
            "Difference: $difference"
        );
    }
    
    db()->beginTransaction();
    
    try {
        // Delete existing opening balances for this date
        db()->query(
            "DELETE FROM opening_balances WHERE business_id = ? AND balance_date = ?",
            [$businessId, $balanceDate]
        );
        
        // Insert new opening balances
        foreach ($balances as $accountId => $amount) {
            if ($amount == 0) continue;
            
            $account = getAccountById($accountId);
            $isDebit = in_array($account['account_type'], ['Asset', 'Expense']) ? 1 : 0;
            
            db()->insert('opening_balances', [
                'business_id' => $businessId,
                'account_id' => $accountId,
                'balance_date' => $balanceDate,
                'amount' => abs($amount),
                'is_debit' => $isDebit,
                'created_by' => $userId
            ]);
            
            // Also update account's opening_balance field
            db()->update(
                'chart_of_accounts',
                ['opening_balance' => $amount, 'opening_balance_date' => $balanceDate],
                'id = ?',
                [$accountId]
            );
        }
        
        // Create opening journal entry
        $journalId = db()->insert('journal_entries', [
            'business_id' => $businessId,
            'entry_date' => $balanceDate,
            'reference' => 'OPENING',
            'description' => 'Opening Balances as of ' . $balanceDate,
            'is_opening_entry' => 1,
            'is_balanced' => 1,
            'created_by' => $userId
        ]);
        
        // Insert journal lines
        foreach ($balances as $accountId => $amount) {
            if ($amount == 0) continue;
            
            $account = getAccountById($accountId);
            $isDebitNormal = in_array($account['account_type'], ['Asset', 'Expense']);
            
            if ($amount > 0) {
                $debit = $isDebitNormal ? $amount : 0;
                $credit = $isDebitNormal ? 0 : $amount;
            } else {
                $debit = $isDebitNormal ? 0 : abs($amount);
                $credit = $isDebitNormal ? abs($amount) : 0;
            }
            
            db()->insert('journal_lines', [
                'journal_entry_id' => $journalId,
                'account_id' => $accountId,
                'debit' => $debit,
                'credit' => $credit,
                'description' => 'Opening balance: ' . $account['name']
            ]);
        }
        
        db()->commit();
        return ['success' => true, 'journal_id' => $journalId];
        
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }
}

// ============================================================================
// TRANSACTION REVERSAL
// ============================================================================

/**
 * Reverse a transaction (for locked period or audit-safe edits)
 */
function reverseTransaction($transactionId, $reversalDate, $userId, $reason = '') {
    $txn = db()->fetch("SELECT * FROM transactions WHERE id = ? AND voided = 0", [$transactionId]);
    if (!$txn) {
        return ['success' => false, 'error' => 'Transaction not found or already voided'];
    }
    
    // Check if target reversal date is in locked period
    if (isPeriodLocked($txn['business_id'], $reversalDate, $txn['department_id'])) {
        return ['success' => false, 'error' => 'Reversal date is in locked period'];
    }
    
    db()->beginTransaction();
    
    try {
        // Create reversal transaction
        $reversalData = [
            'business_id' => $txn['business_id'],
            'department_id' => $txn['department_id'],
            'user_id' => $userId,
            'date' => $reversalDate,
            'type' => $txn['type'],
            'party' => $txn['party'],
            'amount' => -$txn['amount'], // Negative to reverse
            'category_id' => $txn['category_id'],
            'payment_method' => $txn['payment_method'],
            'payment_account_id' => $txn['payment_account_id'],
            'description' => 'REVERSAL: ' . ($txn['description'] ?? ''),
            'invoice_or_bill_ref' => 'REV-' . ($txn['invoice_or_bill_ref'] ?? $txn['id']),
            'source_doc_id' => $txn['source_doc_id'],
            'is_reversal' => 1,
            'reversed_transaction_id' => $transactionId,
            'status' => 'Complete'
        ];
        
        $reversalId = db()->insert('transactions', $reversalData);
        
        // Mark original as reversed (not voided, for audit trail)
        db()->update('transactions', [
            'is_reversed' => 1,
            'reversed_by_id' => $reversalId
        ], 'id = ?', [$transactionId]);
        
        // Reverse journal entries
        $originalJournal = db()->fetch(
            "SELECT id FROM journal_entries WHERE transaction_id = ?",
            [$transactionId]
        );
        
        if ($originalJournal) {
            reverseJournalEntry($originalJournal['id'], $reversalDate, $userId);
        }
        
        // Generate new journal for reversal transaction
        generateJournalEntry(array_merge($reversalData, ['id' => $reversalId]), $userId);
        
        // Log audit
        logAuditAction($txn['business_id'], $userId, 'Reverse', 'transactions', $transactionId, $txn, [
            'reversal_id' => $reversalId,
            'reason' => $reason
        ]);
        
        db()->commit();
        return ['success' => true, 'reversal_id' => $reversalId];
        
    } catch (Exception $e) {
        db()->rollBack();
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Void a transaction (soft delete with reversal)
 */
function voidTransaction($transactionId, $userId, $reason = '') {
    $txn = db()->fetch("SELECT * FROM transactions WHERE id = ? AND voided = 0", [$transactionId]);
    if (!$txn) {
        return ['success' => false, 'error' => 'Transaction not found or already voided'];
    }
    
    // Check if period is locked
    if (isPeriodLocked($txn['business_id'], $txn['date'], $txn['department_id'])) {
        return ['success' => false, 'error' => 'Cannot void transaction in locked period. Use Reverse instead.'];
    }
    
    // Check if document has linked settlements/allocations
    if (isRecognitionDoc($txn['type'])) {
        $allocations = db()->fetch(
            "SELECT COUNT(*) as cnt FROM settlement_allocations sa
             INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
             WHERE sa.source_doc_id = ?",
            [$transactionId]
        );
        
        if ($allocations && $allocations['cnt'] > 0) {
            return ['success' => false, 'error' => 'Cannot void document with allocations. Void settlements first.'];
        }
        
        // Check legacy settlements
        $settlements = getDocumentSettlements($transactionId);
        if (!empty($settlements)) {
            return ['success' => false, 'error' => 'Cannot void document with linked settlements. Void settlements first.'];
        }
    }
    
    db()->beginTransaction();
    
    try {
        // Mark as voided
        db()->update('transactions', [
            'voided' => 1,
            'voided_by' => $userId,
            'voided_at' => date('Y-m-d H:i:s'),
            'void_reason' => $reason
        ], 'id = ?', [$transactionId]);
        
        // Void any auto-settlements
        db()->query(
            "UPDATE transactions SET voided = 1, voided_by = ?, voided_at = NOW(), void_reason = ?
             WHERE source_doc_id = ? AND is_auto_settlement = 1",
            [$userId, 'Parent document voided', $transactionId]
        );
        
        // Void related journal entries
        db()->query(
            "UPDATE journal_entries SET is_voided = 1 WHERE transaction_id = ?",
            [$transactionId]
        );
        
        // Log the void action
        logAuditAction($txn['business_id'], $userId, 'Void', 'transactions', $transactionId, $txn, ['reason' => $reason]);
        
        db()->commit();
        return ['success' => true];
    } catch (Exception $e) {
        db()->rollBack();
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Log audit action
 */
function logAuditAction($businessId, $userId, $action, $entityType, $entityId, $oldValues = null, $newValues = null) {
    db()->insert('audit_log', [
        'business_id' => $businessId,
        'user_id' => $userId,
        'action' => $action,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'old_values' => $oldValues ? json_encode($oldValues) : null,
        'new_values' => $newValues ? json_encode($newValues) : null,
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255)
    ]);
}

// ============================================================================
// AGING REPORTS (using allocations)
// ============================================================================

/**
 * Get AR Aging Report
 */
function getARAging($businessId, $departmentId = null, $asOfDate = null) {
    $asOfDate = $asOfDate ?: date('Y-m-d');
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    
    return db()->fetchAll(
        "SELECT 
            t.id,
            t.party,
            t.invoice_or_bill_ref,
            t.date as invoice_date,
            t.due_date,
            t.amount as invoice_amount,
            COALESCE((
                SELECT SUM(sa.allocated_amount) 
                FROM settlement_allocations sa 
                INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                WHERE sa.source_doc_id = t.id
            ), 0) as paid_amount,
            t.amount - COALESCE((
                SELECT SUM(sa.allocated_amount) 
                FROM settlement_allocations sa 
                INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                WHERE sa.source_doc_id = t.id
            ), 0) as outstanding,
            DATEDIFF(?, COALESCE(t.due_date, t.date)) as days_overdue,
            CASE 
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 0 THEN 'Current'
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 30 THEN '1-30'
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 60 THEN '31-60'
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 90 THEN '61-90'
                ELSE '90+'
            END as aging_bucket
         FROM transactions t
         WHERE t.business_id = ? AND t.type = 'Sale' AND t.voided = 0 $deptFilter
         HAVING outstanding > 0.01
         ORDER BY days_overdue DESC",
        array_merge([$asOfDate, $asOfDate, $asOfDate, $asOfDate, $asOfDate], $params)
    );
}

/**
 * Get AP Aging Report
 */
function getAPAging($businessId, $departmentId = null, $asOfDate = null) {
    $asOfDate = $asOfDate ?: date('Y-m-d');
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    
    return db()->fetchAll(
        "SELECT 
            t.id,
            t.party,
            t.invoice_or_bill_ref,
            t.date as bill_date,
            t.due_date,
            t.amount as bill_amount,
            COALESCE((
                SELECT SUM(sa.allocated_amount) 
                FROM settlement_allocations sa 
                INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                WHERE sa.source_doc_id = t.id
            ), 0) as paid_amount,
            t.amount - COALESCE((
                SELECT SUM(sa.allocated_amount) 
                FROM settlement_allocations sa 
                INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                WHERE sa.source_doc_id = t.id
            ), 0) as outstanding,
            DATEDIFF(?, COALESCE(t.due_date, t.date)) as days_overdue,
            CASE 
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 0 THEN 'Current'
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 30 THEN '1-30'
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 60 THEN '31-60'
                WHEN DATEDIFF(?, COALESCE(t.due_date, t.date)) <= 90 THEN '61-90'
                ELSE '90+'
            END as aging_bucket
         FROM transactions t
         WHERE t.business_id = ? AND t.type IN ('Purchase', 'Expense') AND t.voided = 0 $deptFilter
         HAVING outstanding > 0.01
         ORDER BY days_overdue DESC",
        array_merge([$asOfDate, $asOfDate, $asOfDate, $asOfDate, $asOfDate], $params)
    );
}

// ============================================================================
// PERIOD LOCKING
// ============================================================================

/**
 * Lock a period
 */
function lockPeriod($businessId, $period, $userId, $departmentId = null) {
    $existing = db()->fetch(
        "SELECT id FROM period_balances WHERE business_id = ? AND period = ? AND department_id " . 
        ($departmentId ? "= ?" : "IS NULL"),
        $departmentId ? [$businessId, $period, $departmentId] : [$businessId, $period]
    );
    
    if ($existing) {
        db()->update('period_balances', [
            'is_locked' => 1,
            'locked_at' => date('Y-m-d H:i:s'),
            'locked_by' => $userId
        ], 'id = ?', [$existing['id']]);
    } else {
        $endDate = date('Y-m-t', strtotime($period . '-01'));
        
        // Store closing balances using new account-based calculation
        $balanceSheet = getBalanceSheet($businessId, $departmentId, $endDate);
        
        db()->insert('period_balances', [
            'business_id' => $businessId,
            'department_id' => $departmentId,
            'period' => $period,
            'account_type' => 'Summary',
            'closing_balance' => json_encode($balanceSheet),
            'is_locked' => 1,
            'locked_at' => date('Y-m-d H:i:s'),
            'locked_by' => $userId
        ]);
    }
    
    logAuditAction($businessId, $userId, 'Lock', 'period_balances', 0, null, ['period' => $period]);
    return true;
}

/**
 * Unlock a period (Admin only)
 */
function unlockPeriod($businessId, $period, $userId, $departmentId = null) {
    db()->query(
        "UPDATE period_balances SET is_locked = 0 
         WHERE business_id = ? AND period = ? AND department_id " . 
        ($departmentId ? "= ?" : "IS NULL"),
        $departmentId ? [$businessId, $period, $departmentId] : [$businessId, $period]
    );
    
    logAuditAction($businessId, $userId, 'Unlock', 'period_balances', 0, null, ['period' => $period]);
    return true;
}
