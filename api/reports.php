<?php
/**
 * BookOne v1.3 - Reports API
 * Fixed: Proper P&L vs Cash Flow, Account-based balances
 */

require_once __DIR__ . '/../includes/auth.php';
Auth::init();
Auth::requireAuth();

require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/accounting.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    switch ($action) {
        case 'dashboard':
        case 'summary':
            echo json_encode(getDashboard());
            break;
        case 'sales':
            echo json_encode(getSalesReport());
            break;
        case 'purchases':
            echo json_encode(getPurchasesReport());
            break;
        case 'expenses':
            echo json_encode(getExpensesReport());
            break;
        case 'profit_loss':
            echo json_encode(getProfitLossReport());
            break;
        case 'cash_flow':
            echo json_encode(getCashFlowReport());
            break;
        case 'balance_sheet':
        case 'balances':
            echo json_encode(getBalanceSheetReport());
            break;
        case 'ar_aging':
        case 'receivables':
            echo json_encode(getARAgingReport());
            break;
        case 'ap_aging':
        case 'payables':
            echo json_encode(getAPAgingReport());
            break;
        case 'general_ledger':
        case 'ledger':
            echo json_encode(getGeneralLedgerReport());
            break;
        case 'trial_balance':
            echo json_encode(getTrialBalance());
            break;
        case 'accounts':
            echo json_encode(getAccountBalances());
            break;
        case 'audit_log':
            echo json_encode(getAuditLogReport());
            break;
        default:
            throw new Exception('Invalid report action');
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * Get date filter parameters
 */
function getDateFilters() {
    $businessId = Auth::user('business_id');
    $business = db()->fetch("SELECT financial_year_start FROM businesses WHERE id = ?", [$businessId]);
    $fyStart = $business['financial_year_start'] ?? 1;
    
    $today = new DateTime();
    $currentMonth = (int)$today->format('n');
    $currentYear = (int)$today->format('Y');
    
    if ($currentMonth < $fyStart) {
        $fyYear = $currentYear - 1;
    } else {
        $fyYear = $currentYear;
    }
    
    $defaultFrom = sprintf('%04d-%02d-01', $fyYear, $fyStart);
    $nextFyStart = new DateTime(sprintf('%04d-%02d-01', $fyYear + 1, $fyStart));
    $nextFyStart->modify('-1 day');
    $defaultTo = $nextFyStart->format('Y-m-d');
    
    return [
        'from' => $_GET['from'] ?? $defaultFrom,
        'to' => $_GET['to'] ?? $defaultTo,
        'business_id' => $businessId,
        'department_id' => Auth::user('department_id')
    ];
}

/**
 * Dashboard - Key metrics
 */
function getDashboard() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    // Get P&L summary (recognition-based)
    $pnl = getProfitAndLoss($businessId, $departmentId, $dateFrom, $dateTo);
    
    // Get Cash Flow summary (settlement-based)
    $cashFlow = getCashFlow($businessId, $departmentId, $dateFrom, $dateTo);
    
    // Current balances (as of today) from chart of accounts
    $asOfDate = date('Y-m-d');
    
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
    $arBalance = calculateAR($businessId, $departmentId, $asOfDate);
    $apBalance = calculateAP($businessId, $departmentId, $asOfDate);
    
    // Transaction counts for period
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $params = [$businessId, $dateFrom, $dateTo];
    if ($departmentId) $params[] = $departmentId;
    
    $counts = db()->fetch(
        "SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN type = 'Sale' THEN 1 ELSE 0 END) as sales,
            SUM(CASE WHEN type = 'Purchase' THEN 1 ELSE 0 END) as purchases,
            SUM(CASE WHEN type = 'Expense' THEN 1 ELSE 0 END) as expenses,
            SUM(CASE WHEN type = 'Receive' THEN 1 ELSE 0 END) as receives,
            SUM(CASE WHEN type = 'Pay' THEN 1 ELSE 0 END) as pays
         FROM transactions 
         WHERE business_id = ? AND date >= ? AND date <= ? AND voided = 0 $deptFilter",
        $params
    );
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'profit_loss' => $pnl,
            'cash_flow' => $cashFlow,
            'balances' => [
                'cash' => $totalCash,
                'bank' => $totalBank,
                'ar' => $arBalance,
                'ap' => $apBalance,
                'total_cash' => $totalCash + $totalBank,
                'net_receivables' => $arBalance - $apBalance
            ],
            'payment_accounts' => $paymentBalances,
            'counts' => $counts
        ]
    ];
}

/**
 * Sales Report - List all sales with allocation-based outstanding
 */
function getSalesReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId, $dateFrom, $dateTo];
    if ($departmentId) $params[] = $departmentId;
    
    // Get all sales with allocation-based received amounts
    $sales = db()->fetchAll(
        "SELECT t.*, c.name as category_name,
                COALESCE((
                    SELECT SUM(sa.allocated_amount) 
                    FROM settlement_allocations sa 
                    INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                    WHERE sa.source_doc_id = t.id
                ), 0) as received
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
         AND t.type = 'Sale' AND t.voided = 0 $deptFilter
         ORDER BY t.date DESC, t.id DESC",
        $params
    );
    
    // Calculate totals
    $totalAmount = 0;
    $totalReceived = 0;
    foreach ($sales as &$sale) {
        $totalAmount += (float)$sale['amount'];
        $totalReceived += (float)$sale['received'];
        $sale['outstanding'] = (float)$sale['amount'] - (float)$sale['received'];
        $sale['status'] = $sale['outstanding'] <= 0.01 ? 'Paid' : ($sale['received'] > 0 ? 'Partial' : 'Unpaid');
    }
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => [
                'total_amount' => $totalAmount,
                'total_received' => $totalReceived,
                'total_outstanding' => $totalAmount - $totalReceived,
                'count' => count($sales)
            ],
            'transactions' => $sales
        ]
    ];
}

/**
 * Purchases Report - List all purchases with allocation-based outstanding
 */
function getPurchasesReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId, $dateFrom, $dateTo];
    if ($departmentId) $params[] = $departmentId;
    
    // Get all purchases with allocation-based paid amounts
    $purchases = db()->fetchAll(
        "SELECT t.*, c.name as category_name, c.is_inventory,
                COALESCE((
                    SELECT SUM(sa.allocated_amount) 
                    FROM settlement_allocations sa 
                    INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                    WHERE sa.source_doc_id = t.id
                ), 0) as paid
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
         AND t.type = 'Purchase' AND t.voided = 0 $deptFilter
         ORDER BY t.date DESC, t.id DESC",
        $params
    );
    
    // Calculate totals
    $totalAmount = 0;
    $totalPaid = 0;
    $inventoryTotal = 0;
    $directCostTotal = 0;
    
    foreach ($purchases as &$purchase) {
        $totalAmount += (float)$purchase['amount'];
        $totalPaid += (float)$purchase['paid'];
        $purchase['outstanding'] = (float)$purchase['amount'] - (float)$purchase['paid'];
        $purchase['status'] = $purchase['outstanding'] <= 0.01 ? 'Paid' : ($purchase['paid'] > 0 ? 'Partial' : 'Unpaid');
        
        if ($purchase['is_inventory']) {
            $inventoryTotal += (float)$purchase['amount'];
        } else {
            $directCostTotal += (float)$purchase['amount'];
        }
    }
    
    $usesInventory = businessUsesInventory($businessId);
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => [
                'total_amount' => $totalAmount,
                'total_paid' => $totalPaid,
                'total_outstanding' => $totalAmount - $totalPaid,
                'inventory_purchases' => $inventoryTotal,
                'direct_cost_purchases' => $directCostTotal,
                'count' => count($purchases)
            ],
            'transactions' => $purchases,
            'uses_inventory' => $usesInventory,
            'note' => $usesInventory 
                ? 'Inventory purchases affect Balance Sheet (Inventory Asset). COGS calculated using periodic method.'
                : 'All purchases affect P&L directly as expenses.'
        ]
    ];
}

/**
 * Expenses Report
 */
function getExpensesReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId, $dateFrom, $dateTo];
    if ($departmentId) $params[] = $departmentId;
    
    // Get all expenses
    $expenses = db()->fetchAll(
        "SELECT t.*, c.name as category_name,
                COALESCE((
                    SELECT SUM(sa.allocated_amount) 
                    FROM settlement_allocations sa 
                    INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                    WHERE sa.source_doc_id = t.id
                ), 0) as paid
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
         AND t.type = 'Expense' AND t.voided = 0 $deptFilter
         ORDER BY t.date DESC, t.id DESC",
        $params
    );
    
    // Get expenses by category
    $byCategory = db()->fetchAll(
        "SELECT COALESCE(c.name, 'Uncategorized') as category, SUM(t.amount) as total
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
         AND t.type = 'Expense' AND t.voided = 0 $deptFilter
         GROUP BY t.category_id, c.name
         ORDER BY total DESC",
        $params
    );
    
    // Calculate totals
    $totalAmount = 0;
    $totalPaid = 0;
    foreach ($expenses as &$expense) {
        $totalAmount += (float)$expense['amount'];
        $totalPaid += (float)$expense['paid'];
        $expense['outstanding'] = (float)$expense['amount'] - (float)$expense['paid'];
        $expense['status'] = $expense['outstanding'] <= 0.01 ? 'Paid' : ($expense['paid'] > 0 ? 'Partial' : 'Unpaid');
    }
    
    foreach ($byCategory as &$cat) {
        $cat['percentage'] = $totalAmount > 0 ? round(($cat['total'] / $totalAmount) * 100, 1) : 0;
    }
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => [
                'total_amount' => $totalAmount,
                'total_paid' => $totalPaid,
                'total_outstanding' => $totalAmount - $totalPaid,
                'count' => count($expenses)
            ],
            'by_category' => $byCategory,
            'transactions' => $expenses
        ]
    ];
}

/**
 * Profit & Loss Report - Recognition based
 * Revenue from Sales; Expenses from Expense + COGS (if inventory)
 * EXCLUDES Receive/Pay/Transfer
 */
function getProfitLossReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId, $dateFrom, $dateTo];
    if ($departmentId) $params[] = $departmentId;
    
    // Get summary from accounting module
    $pnl = getProfitAndLoss($businessId, $departmentId, $dateFrom, $dateTo);
    
    // Revenue breakdown by category
    $revenueByCategory = db()->fetchAll(
        "SELECT COALESCE(c.name, 'Uncategorized') as category, COALESCE(SUM(t.amount), 0) as amount
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
         AND t.type = 'Sale' AND t.voided = 0 $deptFilter
         GROUP BY c.id
         ORDER BY amount DESC",
        $params
    );
    
    $usesInventory = businessUsesInventory($businessId);
    
    // COGS breakdown if inventory business
    $cogsBreakdown = null;
    if ($usesInventory) {
        // Get period for stock adjustments
        $period = date('Y-m', strtotime($dateTo));
        $deptFilterStock = $departmentId ? " AND department_id = ?" : " AND department_id IS NULL";
        $stockParams = [$businessId, $period];
        if ($departmentId) $stockParams[] = $departmentId;
        
        $opening = db()->fetch(
            "SELECT stock_value FROM stock_adjustments 
             WHERE business_id = ? AND period = ? $deptFilterStock AND adjustment_type = 'Opening'
             ORDER BY id DESC LIMIT 1",
            $stockParams
        );
        
        $closing = db()->fetch(
            "SELECT stock_value FROM stock_adjustments 
             WHERE business_id = ? AND period = ? $deptFilterStock AND adjustment_type = 'Closing'
             ORDER BY id DESC LIMIT 1",
            $stockParams
        );
        
        // Inventory purchases
        $invPurchases = db()->fetch(
            "SELECT COALESCE(SUM(t.amount), 0) as total
             FROM transactions t
             INNER JOIN categories c ON t.category_id = c.id AND c.is_inventory = 1
             WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
             AND t.type = 'Purchase' AND t.voided = 0" . $deptFilter,
            $params
        )['total'];
        
        $cogsBreakdown = [
            'opening_stock' => (float)($opening['stock_value'] ?? 0),
            'purchases' => (float)$invPurchases,
            'closing_stock' => (float)($closing['stock_value'] ?? 0),
            'cogs' => $pnl['cogs'],
            'note' => $pnl['cogs_note']
        ];
    }
    
    // Operating expense breakdown
    $expensesByCategory = db()->fetchAll(
        "SELECT COALESCE(c.name, 'Uncategorized') as category, t.type, COALESCE(SUM(t.amount), 0) as amount
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.business_id = ? AND t.date >= ? AND t.date <= ? 
         AND t.type IN ('Expense', 'Purchase') AND t.voided = 0 $deptFilter"
         . ($usesInventory ? " AND (c.is_inventory = 0 OR c.is_inventory IS NULL OR t.type = 'Expense')" : "") .
        " GROUP BY c.id, t.type
         ORDER BY amount DESC",
        $params
    );
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => $pnl,
            'revenue_by_category' => $revenueByCategory,
            'cogs_breakdown' => $cogsBreakdown,
            'expenses_by_category' => $expensesByCategory,
            'uses_inventory' => $usesInventory,
            'basis' => 'Accrual (Recognition-based)'
        ]
    ];
}

/**
 * Cash Flow Report - Settlement based
 * Derived from PaymentAccount movements
 */
function getCashFlowReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $params = [$businessId, $dateFrom, $dateTo];
    if ($departmentId) $params[] = $departmentId;
    
    // Get summary from accounting module
    $cashFlow = getCashFlow($businessId, $departmentId, $dateFrom, $dateTo);
    
    // Opening balances (day before period start)
    $dayBefore = date('Y-m-d', strtotime($dateFrom . ' -1 day'));
    $openingBalances = getPaymentAccountBalances($businessId, $dayBefore);
    
    // Closing balances (end of period)
    $closingBalances = getPaymentAccountBalances($businessId, $dateTo);
    
    // Calculate totals
    $openingTotal = array_sum(array_column($openingBalances, 'balance'));
    $closingTotal = array_sum(array_column($closingBalances, 'balance'));
    
    // Detailed movements by payment account
    $movementsByAccount = db()->fetchAll(
        "SELECT pa.name as account_name, pa.sub_type,
                SUM(CASE WHEN t.type = 'Receive' THEN t.amount ELSE 0 END) as inflows,
                SUM(CASE WHEN t.type = 'Pay' THEN t.amount ELSE 0 END) as outflows,
                SUM(CASE WHEN t.type = 'Owner' AND t.amount > 0 THEN t.amount ELSE 0 END) as owner_in,
                SUM(CASE WHEN t.type = 'Owner' AND t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as owner_out,
                SUM(CASE WHEN t.type = 'Transfer' AND t.to_account = pa.sub_type THEN t.amount ELSE 0 END) as transfer_in,
                SUM(CASE WHEN t.type = 'Transfer' AND t.from_account = pa.sub_type THEN t.amount ELSE 0 END) as transfer_out
         FROM chart_of_accounts pa
         LEFT JOIN transactions t ON t.payment_account_id = pa.id 
              AND t.date >= ? AND t.date <= ? AND t.voided = 0
         WHERE pa.business_id = ? AND pa.sub_type IN ('Cash', 'Bank') AND pa.is_active = 1
         GROUP BY pa.id
         ORDER BY pa.code",
        [$dateFrom, $dateTo, $businessId]
    );
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => [
                'operating' => $cashFlow['operating'],
                'financing' => $cashFlow['financing'],
                'investing' => $cashFlow['investing'],
                'net_change' => $cashFlow['net_change']
            ],
            'balances' => [
                'opening' => $openingTotal,
                'closing' => $closingTotal,
                'change' => $closingTotal - $openingTotal
            ],
            'opening_by_account' => $openingBalances,
            'closing_by_account' => $closingBalances,
            'movements_by_account' => $movementsByAccount,
            'basis' => 'Cash (Settlement-based)'
        ]
    ];
}

/**
 * Balance Sheet Report
 */
function getBalanceSheetReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $asOfDate = $_GET['as_of'] ?? date('Y-m-d');
    
    // Get balance sheet from accounting module
    $balanceSheet = getBalanceSheet($businessId, $departmentId, $asOfDate);
    
    return [
        'success' => true,
        'data' => array_merge($balanceSheet, [
            'accounting_equation' => [
                'assets' => $balanceSheet['assets']['total'],
                'liabilities' => $balanceSheet['liabilities']['total'],
                'equity' => $balanceSheet['equity']['total'],
                'formula' => 'Assets = Liabilities + Equity',
                'is_balanced' => $balanceSheet['balanced']
            ]
        ])
    ];
}

/**
 * AR Aging Report
 */
function getARAgingReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $asOfDate = $_GET['as_of'] ?? date('Y-m-d');
    
    // Get aging from accounting module
    $aging = getARAging($businessId, $departmentId, $asOfDate);
    
    // Summarize by bucket
    $buckets = ['Current' => 0, '1-30' => 0, '31-60' => 0, '61-90' => 0, '90+' => 0];
    $totalOutstanding = 0;
    
    foreach ($aging as $row) {
        $bucket = $row['aging_bucket'];
        if (isset($buckets[$bucket])) {
            $buckets[$bucket] += (float)$row['outstanding'];
        }
        $totalOutstanding += (float)$row['outstanding'];
    }
    
    return [
        'success' => true,
        'data' => [
            'as_of_date' => $asOfDate,
            'summary' => [
                'total_outstanding' => $totalOutstanding,
                'by_bucket' => $buckets,
                'count' => count($aging)
            ],
            'details' => $aging
        ]
    ];
}

/**
 * AP Aging Report
 */
function getAPAgingReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $asOfDate = $_GET['as_of'] ?? date('Y-m-d');
    
    // Get aging from accounting module
    $aging = getAPAging($businessId, $departmentId, $asOfDate);
    
    // Summarize by bucket
    $buckets = ['Current' => 0, '1-30' => 0, '31-60' => 0, '61-90' => 0, '90+' => 0];
    $totalOutstanding = 0;
    
    foreach ($aging as $row) {
        $bucket = $row['aging_bucket'];
        if (isset($buckets[$bucket])) {
            $buckets[$bucket] += (float)$row['outstanding'];
        }
        $totalOutstanding += (float)$row['outstanding'];
    }
    
    return [
        'success' => true,
        'data' => [
            'as_of_date' => $asOfDate,
            'summary' => [
                'total_outstanding' => $totalOutstanding,
                'by_bucket' => $buckets,
                'count' => count($aging)
            ],
            'details' => $aging
        ]
    ];
}

/**
 * General Ledger Report - Journal entries view
 */
function getGeneralLedgerReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $departmentId = $filters['department_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    $accountId = $_GET['account_id'] ?? null;
    
    $where = "je.business_id = ? AND je.entry_date >= ? AND je.entry_date <= ?";
    $params = [$businessId, $dateFrom, $dateTo];
    
    if ($departmentId) {
        $where .= " AND je.department_id = ?";
        $params[] = $departmentId;
    }
    
    if ($accountId) {
        $where .= " AND jl.account_id = ?";
        $params[] = $accountId;
    }
    
    // Get journal entries with lines
    $entries = db()->fetchAll(
        "SELECT je.*, t.type as txn_type, t.party, t.invoice_or_bill_ref,
                jl.account_id, a.code as account_code, a.name as account_name,
                jl.debit, jl.credit, jl.description as line_description
         FROM journal_entries je
         INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
         INNER JOIN chart_of_accounts a ON jl.account_id = a.id
         LEFT JOIN transactions t ON je.transaction_id = t.id
         WHERE $where AND je.is_reversal = 0
         ORDER BY je.entry_date, je.id, jl.id",
        $params
    );
    
    // Get account list for filter
    $accounts = db()->fetchAll(
        "SELECT id, code, name, account_type FROM chart_of_accounts 
         WHERE business_id = ? AND is_active = 1 ORDER BY code",
        [$businessId]
    );
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'entries' => $entries,
            'accounts' => $accounts,
            'selected_account' => $accountId
        ]
    ];
}

/**
 * Trial Balance
 */
function getTrialBalance() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $asOfDate = $_GET['as_of'] ?? date('Y-m-d');
    
    // Get all accounts with balances
    $accounts = db()->fetchAll(
        "SELECT a.id, a.code, a.name, a.account_type, a.sub_type,
                a.opening_balance,
                COALESCE(SUM(jl.debit), 0) as total_debit,
                COALESCE(SUM(jl.credit), 0) as total_credit
         FROM chart_of_accounts a
         LEFT JOIN journal_lines jl ON jl.account_id = a.id
         LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id 
              AND je.entry_date <= ? AND je.is_reversal = 0
         WHERE a.business_id = ? AND a.is_active = 1
         GROUP BY a.id
         ORDER BY a.code",
        [$asOfDate, $businessId]
    );
    
    $totalDebits = 0;
    $totalCredits = 0;
    
    foreach ($accounts as &$acc) {
        $opening = (float)$acc['opening_balance'];
        $debits = (float)$acc['total_debit'];
        $credits = (float)$acc['total_credit'];
        
        // Calculate balance based on account type
        if (in_array($acc['account_type'], ['Asset', 'Expense'])) {
            $acc['balance'] = $opening + $debits - $credits;
            if ($acc['balance'] > 0) {
                $acc['debit_balance'] = $acc['balance'];
                $acc['credit_balance'] = 0;
            } else {
                $acc['debit_balance'] = 0;
                $acc['credit_balance'] = abs($acc['balance']);
            }
        } else {
            $acc['balance'] = $opening + $credits - $debits;
            if ($acc['balance'] > 0) {
                $acc['debit_balance'] = 0;
                $acc['credit_balance'] = $acc['balance'];
            } else {
                $acc['debit_balance'] = abs($acc['balance']);
                $acc['credit_balance'] = 0;
            }
        }
        
        $totalDebits += $acc['debit_balance'];
        $totalCredits += $acc['credit_balance'];
    }
    
    return [
        'success' => true,
        'data' => [
            'as_of_date' => $asOfDate,
            'accounts' => $accounts,
            'totals' => [
                'debits' => $totalDebits,
                'credits' => $totalCredits,
                'is_balanced' => abs($totalDebits - $totalCredits) < 0.01
            ]
        ]
    ];
}

/**
 * Account Balances (for widgets)
 */
function getAccountBalances() {
    $businessId = Auth::user('business_id');
    $asOfDate = $_GET['as_of'] ?? date('Y-m-d');
    
    $paymentBalances = getPaymentAccountBalances($businessId, $asOfDate);
    $ar = calculateAR($businessId, null, $asOfDate);
    $ap = calculateAP($businessId, null, $asOfDate);
    
    $totalCash = 0;
    $totalBank = 0;
    foreach ($paymentBalances as $acc) {
        if ($acc['sub_type'] === 'Cash') {
            $totalCash += $acc['balance'];
        } else {
            $totalBank += $acc['balance'];
        }
    }
    
    return [
        'success' => true,
        'data' => [
            'as_of_date' => $asOfDate,
            'payment_accounts' => $paymentBalances,
            'totals' => [
                'cash' => $totalCash,
                'bank' => $totalBank,
                'total_liquid' => $totalCash + $totalBank,
                'ar' => $ar,
                'ap' => $ap,
                'net_receivables' => $ar - $ap
            ]
        ]
    ];
}

/**
 * Audit Log Report
 */
function getAuditLogReport() {
    $filters = getDateFilters();
    $businessId = $filters['business_id'];
    $dateFrom = $filters['from'];
    $dateTo = $filters['to'];
    
    $logs = db()->fetchAll(
        "SELECT al.*, u.name as user_name
         FROM audit_log al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.business_id = ? AND DATE(al.created_at) >= ? AND DATE(al.created_at) <= ?
         ORDER BY al.created_at DESC
         LIMIT 500",
        [$businessId, $dateFrom, $dateTo]
    );
    
    return [
        'success' => true,
        'data' => [
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'logs' => $logs
        ]
    ];
}
