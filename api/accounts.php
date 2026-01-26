<?php
/**
 * BookOne v1.3 - Accounts & Opening Balances API
 */

require_once __DIR__ . '/../includes/auth.php';
Auth::init();
Auth::requireAuth();

require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/accounting.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($method) {
        case 'GET':
            if ($action === 'list') {
                echo json_encode(listAccounts());
            } elseif ($action === 'get' && isset($_GET['id'])) {
                echo json_encode(getAccount((int)$_GET['id']));
            } elseif ($action === 'opening_balances') {
                echo json_encode(getOpeningBalances());
            } elseif ($action === 'balance' && isset($_GET['id'])) {
                echo json_encode(getAccountBalance((int)$_GET['id']));
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
            
            if ($action === 'create') {
                echo json_encode(createAccount($data));
            } elseif ($action === 'update') {
                echo json_encode(updateAccount($data));
            } elseif ($action === 'set_opening_balances') {
                echo json_encode(setOpeningBalancesApi($data));
            } elseif ($action === 'init_defaults') {
                echo json_encode(initDefaultAccounts());
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
 * List all accounts for the business
 */
function listAccounts() {
    $businessId = Auth::user('business_id');
    $accountType = $_GET['type'] ?? null;
    $subType = $_GET['sub_type'] ?? null;
    $activeOnly = !isset($_GET['include_inactive']);
    
    $where = "business_id = ?";
    $params = [$businessId];
    
    if ($accountType) {
        $where .= " AND account_type = ?";
        $params[] = $accountType;
    }
    
    if ($subType) {
        $where .= " AND sub_type = ?";
        $params[] = $subType;
    }
    
    if ($activeOnly) {
        $where .= " AND is_active = 1";
    }
    
    $accounts = db()->fetchAll(
        "SELECT * FROM chart_of_accounts WHERE $where ORDER BY code",
        $params
    );
    
    // Add current balance to each account
    $asOfDate = date('Y-m-d');
    foreach ($accounts as &$account) {
        $account['current_balance'] = calculateAccountBalance($account['id'], $asOfDate);
    }
    
    return ['success' => true, 'data' => $accounts];
}

/**
 * Get single account details
 */
function getAccount($id) {
    $businessId = Auth::user('business_id');
    
    $account = db()->fetch(
        "SELECT * FROM chart_of_accounts WHERE id = ? AND business_id = ?",
        [$id, $businessId]
    );
    
    if (!$account) {
        throw new Exception('Account not found');
    }
    
    $account['current_balance'] = calculateAccountBalance($id);
    
    return ['success' => true, 'data' => $account];
}

/**
 * Get account balance
 */
function getAccountBalance($id) {
    $businessId = Auth::user('business_id');
    $asOfDate = $_GET['as_of'] ?? date('Y-m-d');
    
    $account = db()->fetch(
        "SELECT * FROM chart_of_accounts WHERE id = ? AND business_id = ?",
        [$id, $businessId]
    );
    
    if (!$account) {
        throw new Exception('Account not found');
    }
    
    $balance = calculateAccountBalance($id, $asOfDate);
    
    return [
        'success' => true, 
        'data' => [
            'account_id' => $id,
            'account_name' => $account['name'],
            'as_of_date' => $asOfDate,
            'balance' => $balance
        ]
    ];
}

/**
 * Create new account
 */
function createAccount($data) {
    $businessId = Auth::user('business_id');
    
    $required = ['code', 'name', 'account_type'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            throw new Exception("Missing required field: $field");
        }
    }
    
    // Check code uniqueness
    $existing = db()->fetch(
        "SELECT id FROM chart_of_accounts WHERE business_id = ? AND code = ?",
        [$businessId, $data['code']]
    );
    
    if ($existing) {
        throw new Exception("Account code '{$data['code']}' already exists");
    }
    
    $validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    if (!in_array($data['account_type'], $validTypes)) {
        throw new Exception('Invalid account type');
    }
    
    $id = db()->insert('chart_of_accounts', [
        'business_id' => $businessId,
        'code' => $data['code'],
        'name' => $data['name'],
        'account_type' => $data['account_type'],
        'sub_type' => $data['sub_type'] ?? null,
        'parent_id' => $data['parent_id'] ?? null,
        'is_system' => 0,
        'is_active' => 1
    ]);
    
    return ['success' => true, 'id' => $id, 'message' => 'Account created'];
}

/**
 * Update account
 */
function updateAccount($data) {
    $businessId = Auth::user('business_id');
    
    if (empty($data['id'])) {
        throw new Exception('Account ID required');
    }
    
    $account = db()->fetch(
        "SELECT * FROM chart_of_accounts WHERE id = ? AND business_id = ?",
        [$data['id'], $businessId]
    );
    
    if (!$account) {
        throw new Exception('Account not found');
    }
    
    // Cannot change system accounts' core properties
    if ($account['is_system']) {
        if (isset($data['code']) && $data['code'] !== $account['code']) {
            throw new Exception('Cannot change code of system account');
        }
        if (isset($data['account_type']) && $data['account_type'] !== $account['account_type']) {
            throw new Exception('Cannot change type of system account');
        }
        if (isset($data['sub_type']) && $data['sub_type'] !== $account['sub_type']) {
            throw new Exception('Cannot change sub_type of system account');
        }
    }
    
    $updateData = [];
    $allowedFields = ['name', 'is_active'];
    if (!$account['is_system']) {
        $allowedFields = array_merge($allowedFields, ['code', 'account_type', 'sub_type', 'parent_id']);
    }
    
    foreach ($allowedFields as $field) {
        if (isset($data[$field])) {
            $updateData[$field] = $data[$field];
        }
    }
    
    if (empty($updateData)) {
        throw new Exception('No fields to update');
    }
    
    // Check code uniqueness if changing code
    if (!empty($updateData['code']) && $updateData['code'] !== $account['code']) {
        $existing = db()->fetch(
            "SELECT id FROM chart_of_accounts WHERE business_id = ? AND code = ? AND id != ?",
            [$businessId, $updateData['code'], $data['id']]
        );
        if ($existing) {
            throw new Exception("Account code '{$updateData['code']}' already exists");
        }
    }
    
    db()->update('chart_of_accounts', $updateData, 'id = ?', [$data['id']]);
    
    return ['success' => true, 'message' => 'Account updated'];
}

/**
 * Get current opening balances
 */
function getOpeningBalances() {
    $businessId = Auth::user('business_id');
    
    // Get all accounts with opening balances
    $accounts = db()->fetchAll(
        "SELECT a.*, ob.amount as opening_amount, ob.is_debit, ob.balance_date
         FROM chart_of_accounts a
         LEFT JOIN opening_balances ob ON ob.account_id = a.id
         WHERE a.business_id = ? AND a.is_active = 1
         ORDER BY a.code",
        [$businessId]
    );
    
    // Group by account type
    $byType = [
        'Asset' => [],
        'Liability' => [],
        'Equity' => [],
        'Revenue' => [],
        'Expense' => []
    ];
    
    $totalAssets = 0;
    $totalLiabilities = 0;
    $totalEquity = 0;
    
    foreach ($accounts as $acc) {
        $balance = (float)($acc['opening_amount'] ?? $acc['opening_balance'] ?? 0);
        $acc['opening_balance_amount'] = $balance;
        
        if (isset($byType[$acc['account_type']])) {
            $byType[$acc['account_type']][] = $acc;
        }
        
        if ($acc['account_type'] === 'Asset') {
            $totalAssets += $balance;
        } elseif ($acc['account_type'] === 'Liability') {
            $totalLiabilities += $balance;
        } elseif ($acc['account_type'] === 'Equity') {
            $totalEquity += $balance;
        }
    }
    
    return [
        'success' => true,
        'data' => [
            'accounts' => $accounts,
            'by_type' => $byType,
            'totals' => [
                'assets' => $totalAssets,
                'liabilities' => $totalLiabilities,
                'equity' => $totalEquity,
                'is_balanced' => abs($totalAssets - $totalLiabilities - $totalEquity) < 0.01
            ]
        ]
    ];
}

/**
 * Set opening balances
 */
function setOpeningBalancesApi($data) {
    $businessId = Auth::user('business_id');
    $userId = Auth::user('id');
    
    if (empty($data['balances']) || !is_array($data['balances'])) {
        throw new Exception('Balances array required');
    }
    
    $balanceDate = $data['balance_date'] ?? date('Y-m-d');
    
    // Convert to account_id => amount format
    $balances = [];
    foreach ($data['balances'] as $item) {
        if (isset($item['account_id']) && isset($item['amount'])) {
            $balances[(int)$item['account_id']] = (float)$item['amount'];
        }
    }
    
    if (empty($balances)) {
        throw new Exception('No valid balances provided');
    }
    
    $result = setOpeningBalances($businessId, $balances, $balanceDate, $userId);
    
    return [
        'success' => true,
        'message' => 'Opening balances saved',
        'journal_id' => $result['journal_id']
    ];
}

/**
 * Initialize default accounts for a business
 */
function initDefaultAccounts() {
    $businessId = Auth::user('business_id');
    
    // Check if accounts already exist
    $existing = db()->fetch(
        "SELECT COUNT(*) as cnt FROM chart_of_accounts WHERE business_id = ?",
        [$businessId]
    );
    
    if ($existing['cnt'] > 0) {
        throw new Exception('Accounts already exist. Cannot reinitialize.');
    }
    
    // Create default accounts
    $accounts = [
        // Assets (1xxx)
        ['1000', 'Cash on Hand', 'Asset', 'Cash', 1],
        ['1010', 'Bank Account', 'Asset', 'Bank', 1],
        ['1015', 'Card Clearing', 'Asset', 'Bank', 1],
        ['1020', 'Online Wallet', 'Asset', 'Bank', 1],
        ['1100', 'Accounts Receivable', 'Asset', 'AR', 1],
        ['1150', 'Supplier Prepayments', 'Asset', 'Prepayment', 1],
        ['1200', 'Inventory', 'Asset', 'Inventory', 1],
        
        // Liabilities (2xxx)
        ['2000', 'Accounts Payable', 'Liability', 'AP', 1],
        ['2050', 'Customer Deposits', 'Liability', 'Deposit', 1],
        
        // Equity (3xxx)
        ['3000', 'Owner Capital', 'Equity', 'Capital', 1],
        ['3100', 'Owner Drawings', 'Equity', 'Drawings', 1],
        ['3200', 'Retained Earnings', 'Equity', 'Retained', 1],
        ['3900', 'Opening Balance Equity', 'Equity', 'Opening', 1],
        
        // Revenue (4xxx)
        ['4000', 'Sales Revenue', 'Revenue', 'Sales', 1],
        ['4100', 'Other Income', 'Revenue', 'Other', 1],
        
        // Expenses (5xxx-6xxx)
        ['5000', 'Cost of Goods Sold', 'Expense', 'COGS', 1],
        ['5100', 'Direct Costs', 'Expense', 'DirectCost', 1],
        ['6000', 'Operating Expenses', 'Expense', 'Operating', 1],
        ['6100', 'Rent & Utilities', 'Expense', 'Operating', 0],
        ['6200', 'Salaries & Wages', 'Expense', 'Operating', 0],
        ['6300', 'Office Supplies', 'Expense', 'Operating', 0],
        ['6400', 'Marketing & Advertising', 'Expense', 'Operating', 0],
        ['6500', 'Travel & Transport', 'Expense', 'Operating', 0],
        ['6900', 'Miscellaneous Expenses', 'Expense', 'Operating', 0],
    ];
    
    $created = 0;
    foreach ($accounts as $acc) {
        db()->insert('chart_of_accounts', [
            'business_id' => $businessId,
            'code' => $acc[0],
            'name' => $acc[1],
            'account_type' => $acc[2],
            'sub_type' => $acc[3],
            'is_system' => $acc[4],
            'is_active' => 1
        ]);
        $created++;
    }
    
    return [
        'success' => true,
        'message' => "Created $created default accounts"
    ];
}
