<?php
/**
 * BookOne v1.1 - Period Management API
 * Close/Open periods, Stock adjustments
 */

require_once __DIR__ . '/../includes/auth.php';
Auth::init();
Auth::requireAuth();

require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/accounting_v1.1.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($method) {
        case 'GET':
            if ($action === 'list') {
                echo json_encode(listPeriods());
            } elseif ($action === 'status') {
                echo json_encode(getPeriodStatus());
            } else {
                throw new Exception('Invalid action');
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            
            // CSRF check
            if (!isset($data['csrf_token']) || $data['csrf_token'] !== ($_SESSION['csrf_token'] ?? '')) {
                throw new Exception('Invalid security token');
            }
            
            if ($action === 'close') {
                echo json_encode(closePeriod($data));
            } elseif ($action === 'open') {
                echo json_encode(openPeriod($data));
            } elseif ($action === 'stock_adjustment') {
                echo json_encode(saveStockAdjustment($data));
            } else {
                throw new Exception('Invalid action');
            }
            break;
            
        default:
            throw new Exception('Method not allowed');
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * List periods with their lock status
 */
function listPeriods() {
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    
    // Get business financial year start
    $business = db()->fetch(
        "SELECT financial_year_start FROM businesses WHERE id = ?",
        [$businessId]
    );
    $fyStart = $business['financial_year_start'] ?? 1;
    
    // Get first transaction date
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    
    $firstTxn = db()->fetch(
        "SELECT MIN(date) as min_date FROM transactions WHERE business_id = ? $deptFilter AND voided = 0",
        $params
    );
    
    $startDate = $firstTxn['min_date'] ? new DateTime($firstTxn['min_date']) : new DateTime();
    $endDate = new DateTime();
    
    // Generate list of periods
    $periods = [];
    $current = clone $startDate;
    $current->modify('first day of this month');
    
    while ($current <= $endDate) {
        $period = $current->format('Y-m');
        
        // Check if locked
        $lockParams = [$businessId, $period];
        $deptLockFilter = $departmentId ? " AND department_id = ?" : " AND department_id IS NULL";
        if ($departmentId) $lockParams[] = $departmentId;
        
        $periodStatus = db()->fetch(
            "SELECT is_locked, locked_at, locked_by 
             FROM period_balances 
             WHERE business_id = ? AND period = ? $deptLockFilter
             LIMIT 1",
            $lockParams
        );
        
        // Get transaction count for period
        $monthStart = $current->format('Y-m-01');
        $monthEnd = $current->format('Y-m-t');
        $countParams = [$businessId, $monthStart, $monthEnd];
        if ($departmentId) $countParams[] = $departmentId;
        
        $txnCount = db()->fetch(
            "SELECT COUNT(*) as cnt FROM transactions 
             WHERE business_id = ? AND date >= ? AND date <= ? AND voided = 0 $deptFilter",
            $countParams
        )['cnt'];
        
        $periods[] = [
            'period' => $period,
            'display' => $current->format('F Y'),
            'is_locked' => (bool)($periodStatus['is_locked'] ?? false),
            'locked_at' => $periodStatus['locked_at'] ?? null,
            'transaction_count' => (int)$txnCount
        ];
        
        $current->modify('+1 month');
    }
    
    // Reverse to show newest first
    $periods = array_reverse($periods);
    
    return ['success' => true, 'data' => $periods];
}

/**
 * Get status of specific period
 */
function getPeriodStatus() {
    $period = $_GET['period'] ?? date('Y-m');
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    
    $isLocked = isPeriodLocked($businessId, $period . '-01', $departmentId);
    
    // Get balances
    $endDate = date('Y-m-t', strtotime($period . '-01'));
    
    $balances = [
        'cash' => calculateCashBalance($businessId, $departmentId, $endDate),
        'bank' => calculateBankBalance($businessId, $departmentId, $endDate),
        'ar' => calculateAR($businessId, $departmentId, $endDate),
        'ap' => calculateAP($businessId, $departmentId, $endDate)
    ];
    
    // Get stored balances if period is locked
    $storedBalances = null;
    if ($isLocked) {
        $deptFilter = $departmentId ? " AND department_id = ?" : " AND department_id IS NULL";
        $params = [$businessId, $period];
        if ($departmentId) $params[] = $departmentId;
        
        $stored = db()->fetchAll(
            "SELECT account_type, closing_balance FROM period_balances 
             WHERE business_id = ? AND period = ? $deptFilter",
            $params
        );
        
        $storedBalances = [];
        foreach ($stored as $row) {
            $storedBalances[strtolower($row['account_type'])] = $row['closing_balance'];
        }
    }
    
    return [
        'success' => true,
        'data' => [
            'period' => $period,
            'is_locked' => $isLocked,
            'calculated_balances' => $balances,
            'stored_balances' => $storedBalances
        ]
    ];
}

/**
 * Close a period
 */
function closePeriod($data) {
    if (empty($data['period'])) {
        throw new Exception('Period required');
    }
    
    $period = $data['period'];
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    $userId = Auth::user('id');
    
    // Validate period format
    if (!preg_match('/^\d{4}-\d{2}$/', $period)) {
        throw new Exception('Invalid period format. Use YYYY-MM.');
    }
    
    // Check if already locked
    if (isPeriodLocked($businessId, $period . '-01', $departmentId)) {
        throw new Exception('Period is already closed');
    }
    
    // Check for unresolved issues
    $endDate = date('Y-m-t', strtotime($period . '-01'));
    $startDate = $period . '-01';
    
    $deptFilter = $departmentId ? " AND department_id = ?" : "";
    $params = [$businessId, $startDate, $endDate];
    if ($departmentId) $params[] = $departmentId;
    
    // Check for draft transactions
    $drafts = db()->fetch(
        "SELECT COUNT(*) as cnt FROM transactions 
         WHERE business_id = ? AND date >= ? AND date <= ? 
         AND status = 'Draft' AND voided = 0 $deptFilter",
        $params
    )['cnt'];
    
    if ($drafts > 0 && empty($data['force'])) {
        throw new Exception("Cannot close period with $drafts draft transactions. Review or force close.");
    }
    
    // Lock the period
    lockPeriod($businessId, $period, $userId, $departmentId);
    
    return [
        'success' => true,
        'message' => "Period $period closed successfully"
    ];
}

/**
 * Open a period (Admin only)
 */
function openPeriod($data) {
    // Check admin
    if (Auth::user('role') !== 'Admin') {
        throw new Exception('Admin access required to reopen periods');
    }
    
    if (empty($data['period'])) {
        throw new Exception('Period required');
    }
    
    $period = $data['period'];
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    $userId = Auth::user('id');
    
    // Validate period format
    if (!preg_match('/^\d{4}-\d{2}$/', $period)) {
        throw new Exception('Invalid period format. Use YYYY-MM.');
    }
    
    // Check if locked
    if (!isPeriodLocked($businessId, $period . '-01', $departmentId)) {
        throw new Exception('Period is not closed');
    }
    
    // Unlock the period
    unlockPeriod($businessId, $period, $userId, $departmentId);
    
    return [
        'success' => true,
        'message' => "Period $period reopened successfully"
    ];
}

/**
 * Save stock adjustment
 */
function saveStockAdjustment($data) {
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    $userId = Auth::user('id');
    
    // Check if business uses inventory
    $business = db()->fetch("SELECT uses_inventory FROM businesses WHERE id = ?", [$businessId]);
    if (!$business['uses_inventory']) {
        throw new Exception('This business is not configured for inventory tracking');
    }
    
    // Validate required fields
    if (empty($data['period']) || !isset($data['stock_value']) || empty($data['adjustment_type'])) {
        throw new Exception('Period, stock value, and adjustment type required');
    }
    
    $period = $data['period'];
    $stockValue = (float)$data['stock_value'];
    $adjustmentType = $data['adjustment_type']; // 'Opening' or 'Closing'
    
    if (!in_array($adjustmentType, ['Opening', 'Closing'])) {
        throw new Exception('Invalid adjustment type. Use Opening or Closing.');
    }
    
    // Check if period is locked
    if (isPeriodLocked($businessId, $period . '-01', $departmentId)) {
        throw new Exception('Cannot adjust stock in locked period');
    }
    
    // Check for existing adjustment
    $deptFilter = $departmentId ? " AND department_id = ?" : " AND department_id IS NULL";
    $params = [$businessId, $period, $adjustmentType];
    if ($departmentId) $params[] = $departmentId;
    
    $existing = db()->fetch(
        "SELECT id FROM stock_adjustments 
         WHERE business_id = ? AND period = ? AND adjustment_type = ? $deptFilter",
        $params
    );
    
    if ($existing) {
        // Update existing
        db()->update('stock_adjustments', [
            'stock_value' => $stockValue,
            'notes' => $data['notes'] ?? null,
            'created_by' => $userId
        ], 'id = ?', [$existing['id']]);
        
        $message = "$adjustmentType stock updated for $period";
    } else {
        // Insert new
        db()->insert('stock_adjustments', [
            'business_id' => $businessId,
            'department_id' => $departmentId,
            'period' => $period,
            'adjustment_type' => $adjustmentType,
            'stock_value' => $stockValue,
            'notes' => $data['notes'] ?? null,
            'created_by' => $userId
        ]);
        
        $message = "$adjustmentType stock recorded for $period";
    }
    
    // Log audit
    logAuditAction($businessId, $userId, 'StockAdjust', 'stock_adjustments', 0, null, [
        'period' => $period,
        'type' => $adjustmentType,
        'value' => $stockValue
    ]);
    
    return [
        'success' => true,
        'message' => $message
    ];
}
