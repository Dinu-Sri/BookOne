<?php
/**
 * Settings API Endpoint
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

Auth::requireAuth();

$businessId = Auth::user('business_id');
$userId = Auth::user('id');
$isAdmin = Auth::isAdmin();
$isManager = Auth::isManager();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$entity = $_GET['entity'] ?? '';

// Verify CSRF for state-changing operations
if ($method === 'POST') {
    $token = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!Auth::verifyCsrf($token)) {
        jsonError('Invalid security token', 403);
    }
}

// Route to appropriate handler
switch ($entity) {
    case 'profile':
        handleProfile();
        break;
    case 'password':
        handlePassword();
        break;
    case 'users':
        if (!$isManager) jsonError('Access denied', 403);
        handleUsers();
        break;
    case 'businesses':
        if (!$isAdmin) jsonError('Access denied', 403);
        handleBusinesses();
        break;
    case 'departments':
        if (!$isManager) jsonError('Access denied', 403);
        handleDepartments();
        break;
    case 'categories':
        if (!$isManager) jsonError('Access denied', 403);
        handleCategories();
        break;
    case 'reset':
        if (!$isAdmin) jsonError('Access denied', 403);
        handleReset();
        break;
    default:
        jsonError('Invalid entity');
}

function handleProfile() {
    global $userId;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Invalid method');
    }
    
    $name = trim(input('name'));
    $email = trim(input('email'));
    
    if (empty($name)) {
        jsonError('Name is required');
    }
    
    db()->update('users', [
        'name' => $name,
        'email' => $email ?: null
    ], 'id = ?', [$userId]);
    
    Auth::refreshUserData();
    
    jsonSuccess([], 'Profile updated');
}

function handlePassword() {
    global $userId;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Invalid method');
    }
    
    $currentPassword = input('current_password');
    $newPassword = input('new_password');
    $confirmPassword = input('confirm_password');
    
    if (empty($currentPassword) || empty($newPassword)) {
        jsonError('All password fields are required');
    }
    
    if ($newPassword !== $confirmPassword) {
        jsonError('New passwords do not match');
    }
    
    if (strlen($newPassword) < 8) {
        jsonError('Password must be at least 8 characters');
    }
    
    // Verify current password
    $user = db()->fetch("SELECT password FROM users WHERE id = ?", [$userId]);
    if (!password_verify($currentPassword, $user['password'])) {
        jsonError('Current password is incorrect');
    }
    
    Auth::updatePassword($userId, $newPassword);
    
    jsonSuccess([], 'Password changed successfully');
}

function handleUsers() {
    global $businessId, $isAdmin;
    $action = $_GET['action'] ?? 'list';
    
    switch ($action) {
        case 'list':
            $sql = "SELECT u.id, u.username, u.name, u.email, u.role, u.active,
                           d.name as department_name, u.department_id
                    FROM users u
                    LEFT JOIN departments d ON u.department_id = d.id
                    WHERE u.business_id = ?
                    ORDER BY u.name";
            $users = db()->fetchAll($sql, [$businessId]);
            jsonResponse(['data' => $users]);
            break;
            
        case 'get':
            $id = (int)input('id');
            $user = db()->fetch(
                "SELECT id, username, name, email, role, department_id, active 
                 FROM users WHERE id = ? AND business_id = ?",
                [$id, $businessId]
            );
            if (!$user) jsonError('User not found', 404);
            jsonResponse(['data' => $user]);
            break;
            
        case 'save':
            $id = (int)input('id');
            $isEdit = $id > 0;
            
            $username = trim(input('username'));
            $name = trim(input('name'));
            $password = input('password');
            $email = trim(input('email'));
            $role = input('role', 'user');
            $departmentId = input('department_id') ?: null;
            $active = input('active') ? 1 : 0;
            
            if (empty($username) || empty($name)) {
                jsonError('Username and name are required');
            }
            
            // Validate role
            $validRoles = ['user', 'manager'];
            if ($isAdmin) $validRoles[] = 'admin';
            if (!in_array($role, $validRoles)) {
                $role = 'user';
            }
            
            // Check username uniqueness
            $existing = db()->fetch(
                "SELECT id FROM users WHERE username = ? AND id != ?",
                [$username, $id]
            );
            if ($existing) {
                jsonError('Username already exists');
            }
            
            $data = [
                'username' => $username,
                'name' => $name,
                'email' => $email ?: null,
                'role' => $role,
                'department_id' => $departmentId,
                'active' => $active
            ];
            
            if (!$isEdit && empty($password)) {
                jsonError('Password is required for new users');
            }
            
            if (!empty($password)) {
                if (strlen($password) < 8) {
                    jsonError('Password must be at least 8 characters');
                }
                $data['password'] = Auth::hashPassword($password);
            }
            
            if ($isEdit) {
                // Check ownership
                $user = db()->fetch("SELECT id FROM users WHERE id = ? AND business_id = ?", [$id, $businessId]);
                if (!$user) jsonError('User not found', 404);
                
                db()->update('users', $data, 'id = ?', [$id]);
                jsonSuccess(['id' => $id], 'User updated');
            } else {
                $data['business_id'] = $businessId;
                $newId = db()->insert('users', $data);
                jsonSuccess(['id' => $newId], 'User created');
            }
            break;
            
        case 'delete':
            $id = (int)input('id');
            
            // Prevent self-deletion
            if ($id === Auth::user('id')) {
                jsonError('Cannot delete your own account');
            }
            
            $user = db()->fetch("SELECT id FROM users WHERE id = ? AND business_id = ?", [$id, $businessId]);
            if (!$user) jsonError('User not found', 404);
            
            // Check if user has transactions
            $hasTxn = db()->fetch("SELECT id FROM transactions WHERE user_id = ? LIMIT 1", [$id]);
            if ($hasTxn) {
                // Deactivate instead of delete
                db()->update('users', ['active' => 0], 'id = ?', [$id]);
                jsonSuccess([], 'User deactivated (has transactions)');
            } else {
                db()->delete('users', 'id = ?', [$id]);
                jsonSuccess([], 'User deleted');
            }
            break;
            
        default:
            jsonError('Invalid action');
    }
}

function handleBusinesses() {
    $action = $_GET['action'] ?? 'list';
    
    switch ($action) {
        case 'list':
            $businesses = db()->fetchAll(
                "SELECT * FROM businesses ORDER BY name"
            );
            jsonResponse(['data' => $businesses]);
            break;
            
        case 'get':
            $id = (int)input('id');
            $business = db()->fetch("SELECT * FROM businesses WHERE id = ?", [$id]);
            if (!$business) jsonError('Business not found', 404);
            jsonResponse(['data' => $business]);
            break;
            
        case 'save':
            $id = (int)input('id');
            $isEdit = $id > 0;
            
            $name = trim(input('name'));
            if (empty($name)) {
                jsonError('Business name is required');
            }
            
            $data = [
                'name' => $name,
                'address' => trim(input('address')) ?: null,
                'phone' => trim(input('phone')) ?: null,
                'email' => trim(input('email')) ?: null,
                'tax_id' => trim(input('tax_id')) ?: null,
                'currency' => input('currency', 'USD'),
                'financial_year_start' => (int)input('financial_year_start', 1),
                'uses_inventory' => input('uses_inventory') ? 1 : 0,
                'period_lock_date' => input('period_lock_date') ?: null,
                'active' => input('active') ? 1 : 0
            ];
            
            if ($isEdit) {
                db()->update('businesses', $data, 'id = ?', [$id]);
                
                // Update session if this is the current user's business
                if (Auth::user('business_id') == $id) {
                    $_SESSION['user']['business_currency'] = $data['currency'];
                    $_SESSION['user']['financial_year_start'] = $data['financial_year_start'];
                    $_SESSION['user']['business_name'] = $data['name'];
                    $_SESSION['user']['uses_inventory'] = $data['uses_inventory'];
                    $_SESSION['user']['period_lock_date'] = $data['period_lock_date'];
                }
                
                jsonSuccess(['id' => $id], 'Business updated');
            } else {
                $newId = db()->insert('businesses', $data);
                
                // Create default department
                db()->insert('departments', [
                    'business_id' => $newId,
                    'name' => 'General'
                ]);
                
                jsonSuccess(['id' => $newId], 'Business created');
            }
            break;
            
        case 'delete':
            $id = (int)input('id');
            
            // Check if has transactions
            $hasTxn = db()->fetch("SELECT id FROM transactions WHERE business_id = ? LIMIT 1", [$id]);
            if ($hasTxn) {
                db()->update('businesses', ['active' => 0], 'id = ?', [$id]);
                jsonSuccess([], 'Business deactivated (has transactions)');
            } else {
                db()->delete('businesses', 'id = ?', [$id]);
                jsonSuccess([], 'Business deleted');
            }
            break;
            
        default:
            jsonError('Invalid action');
    }
}

function handleDepartments() {
    global $businessId;
    $action = $_GET['action'] ?? 'list';
    
    switch ($action) {
        case 'list':
            $departments = db()->fetchAll(
                "SELECT * FROM departments WHERE business_id = ? ORDER BY name",
                [$businessId]
            );
            jsonResponse(['data' => $departments]);
            break;
            
        case 'get':
            $id = (int)input('id');
            $dept = db()->fetch(
                "SELECT * FROM departments WHERE id = ? AND business_id = ?",
                [$id, $businessId]
            );
            if (!$dept) jsonError('Department not found', 404);
            jsonResponse(['data' => $dept]);
            break;
            
        case 'save':
            $id = (int)input('id');
            $isEdit = $id > 0;
            
            $name = trim(input('name'));
            if (empty($name)) {
                jsonError('Department name is required');
            }
            
            $data = [
                'name' => $name,
                'active' => input('active') ? 1 : 0
            ];
            
            if ($isEdit) {
                $dept = db()->fetch(
                    "SELECT id FROM departments WHERE id = ? AND business_id = ?",
                    [$id, $businessId]
                );
                if (!$dept) jsonError('Department not found', 404);
                
                db()->update('departments', $data, 'id = ?', [$id]);
                jsonSuccess(['id' => $id], 'Department updated');
            } else {
                $data['business_id'] = $businessId;
                $newId = db()->insert('departments', $data);
                jsonSuccess(['id' => $newId], 'Department created');
            }
            break;
            
        case 'delete':
            $id = (int)input('id');
            
            // Check if used
            $inUse = db()->fetch(
                "SELECT id FROM transactions WHERE department_id = ? LIMIT 1",
                [$id]
            );
            $inUseUser = db()->fetch(
                "SELECT id FROM users WHERE department_id = ? LIMIT 1",
                [$id]
            );
            
            if ($inUse || $inUseUser) {
                db()->update('departments', ['active' => 0], 'id = ? AND business_id = ?', [$id, $businessId]);
                jsonSuccess([], 'Department deactivated (in use)');
            } else {
                db()->delete('departments', 'id = ? AND business_id = ?', [$id, $businessId]);
                jsonSuccess([], 'Department deleted');
            }
            break;
            
        default:
            jsonError('Invalid action');
    }
}

function handleCategories() {
    global $businessId;
    $action = $_GET['action'] ?? 'list';
    
    switch ($action) {
        case 'list':
            $filter = input('filter');
            $sql = "SELECT * FROM categories WHERE business_id = ?";
            $params = [$businessId];
            
            if ($filter && $filter !== 'all') {
                $sql .= " AND type = ?";
                $params[] = $filter;
            }
            
            $sql .= " ORDER BY type, name";
            $categories = db()->fetchAll($sql, $params);
            jsonResponse(['data' => $categories]);
            break;
            
        case 'get':
            $id = (int)input('id');
            $cat = db()->fetch(
                "SELECT * FROM categories WHERE id = ? AND business_id = ?",
                [$id, $businessId]
            );
            if (!$cat) jsonError('Category not found', 404);
            jsonResponse(['data' => $cat]);
            break;
            
        case 'save':
            $id = (int)input('id');
            $isEdit = $id > 0;
            
            $name = trim(input('name'));
            $type = input('type', 'expense');
            
            if (empty($name)) {
                jsonError('Category name is required');
            }
            
            $validTypes = ['income', 'expense', 'asset', 'liability'];
            if (!in_array($type, $validTypes)) {
                $type = 'expense';
            }
            
            $data = [
                'name' => $name,
                'type' => $type,
                'active' => input('active') ? 1 : 0
            ];
            
            if ($isEdit) {
                $cat = db()->fetch(
                    "SELECT id FROM categories WHERE id = ? AND business_id = ?",
                    [$id, $businessId]
                );
                if (!$cat) jsonError('Category not found', 404);
                
                db()->update('categories', $data, 'id = ?', [$id]);
                jsonSuccess(['id' => $id], 'Category updated');
            } else {
                $data['business_id'] = $businessId;
                $newId = db()->insert('categories', $data);
                jsonSuccess(['id' => $newId], 'Category created');
            }
            break;
            
        case 'delete':
            $id = (int)input('id');
            
            // Check if used
            $inUse = db()->fetch(
                "SELECT id FROM transactions WHERE category_id = ? LIMIT 1",
                [$id]
            );
            
            if ($inUse) {
                db()->update('categories', ['active' => 0], 'id = ? AND business_id = ?', [$id, $businessId]);
                jsonSuccess([], 'Category deactivated (in use)');
            } else {
                db()->delete('categories', 'id = ? AND business_id = ?', [$id, $businessId]);
                jsonSuccess([], 'Category deleted');
            }
            break;
            
        default:
            jsonError('Invalid action');
    }
}

/**
 * Handle Master Reset
 */
function handleReset() {
    global $userId, $businessId;
    
    $action = $_GET['action'] ?? '';
    
    if ($action !== 'execute') {
        jsonError('Invalid action');
    }
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Invalid method');
    }
    
    $resetType = input('reset_type');
    
    if (!in_array($resetType, ['transactions', 'full'])) {
        jsonError('Invalid reset type');
    }
    
    // Increase execution time for large resets
    set_time_limit(120);
    
    try {
        if ($resetType === 'transactions') {
            // Reset transactions only - keep company settings
            resetTransactionsOnly($businessId);
            
        } else if ($resetType === 'full') {
            // Full system reset
            resetFullSystem($userId);
        }
        
        // Log the action
        try {
            if ($resetType === 'transactions') {
                logAudit('master_reset', 'system', null, null, ['type' => 'transactions', 'business_id' => $businessId]);
            }
        } catch (Exception $e) {
            // Ignore logging errors
        }
        
        jsonSuccess([], ucfirst($resetType) . ' reset completed successfully');
        
    } catch (Exception $e) {
        jsonError('Reset failed: ' . $e->getMessage());
    }
}

/**
 * Reset transactions only - preserves company settings
 */
function resetTransactionsOnly($businessId) {
    $db = db();
    
    // Delete in order of dependencies
    
    // 1. Journal lines (depends on journal_entries)
    $db->query("DELETE jl FROM journal_lines jl 
                INNER JOIN journal_entries je ON jl.journal_entry_id = je.id 
                WHERE je.business_id = ?", [$businessId]);
    
    // 2. Journal entries
    $db->query("DELETE FROM journal_entries WHERE business_id = ?", [$businessId]);
    
    // 3. Settlement allocations
    $db->query("DELETE FROM settlement_allocations WHERE business_id = ?", [$businessId]);
    
    // 4. Opening balances
    $db->query("DELETE FROM opening_balances WHERE business_id = ?", [$businessId]);
    
    // 5. Stock adjustments
    $db->query("DELETE FROM stock_adjustments WHERE business_id = ?", [$businessId]);
    
    // 6. Period balances
    $db->query("DELETE FROM period_balances WHERE business_id = ?", [$businessId]);
    
    // 7. Transactions
    $db->query("DELETE FROM transactions WHERE business_id = ?", [$businessId]);
    
    // 8. Reset chart of accounts opening balances
    $db->query("UPDATE chart_of_accounts SET opening_balance = 0, opening_balance_date = NULL WHERE business_id = ?", [$businessId]);
    
    // 9. Reset business opening balances
    $db->query("UPDATE businesses SET opening_cash = 0, opening_bank = 0 WHERE id = ?", [$businessId]);
    
    // 10. Delete transaction-related audit logs (optional - keep for compliance)
    // $db->query("DELETE FROM audit_log WHERE entity_type IN ('transactions', 'journal_entries') AND business_id = ?", [$businessId]);
    
    // 11. Reset auto-increment for transactions table (optional, may fail on some hosts)
    try {
        $db->query("ALTER TABLE transactions AUTO_INCREMENT = 1");
        $db->query("ALTER TABLE journal_entries AUTO_INCREMENT = 1");
        $db->query("ALTER TABLE journal_lines AUTO_INCREMENT = 1");
        $db->query("ALTER TABLE settlement_allocations AUTO_INCREMENT = 1");
        $db->query("ALTER TABLE opening_balances AUTO_INCREMENT = 1");
        $db->query("ALTER TABLE stock_adjustments AUTO_INCREMENT = 1");
    } catch (Exception $e) {
        // Ignore AUTO_INCREMENT errors - not critical
    }
}

/**
 * Full system reset - returns to fresh install state
 */
function resetFullSystem($currentUserId) {
    $db = db();
    
    // Get current user info before deleting
    $currentUser = $db->fetch("SELECT * FROM users WHERE id = ?", [$currentUserId]);
    
    if (!$currentUser) {
        throw new Exception('Current user not found');
    }
    
    // 1. Delete all journal lines
    $db->query("DELETE FROM journal_lines");
    
    // 2. Delete all journal entries
    $db->query("DELETE FROM journal_entries");
    
    // 3. Delete all settlement allocations
    $db->query("DELETE FROM settlement_allocations");
    
    // 4. Delete all opening balances
    $db->query("DELETE FROM opening_balances");
    
    // 5. Delete all stock adjustments
    $db->query("DELETE FROM stock_adjustments");
    
    // 6. Delete all period balances
    $db->query("DELETE FROM period_balances");
    
    // 7. Delete all transactions
    $db->query("DELETE FROM transactions");
    
    // 8. Delete all chart of accounts
    $db->query("DELETE FROM chart_of_accounts");
    
    // 9. Delete all categories
    $db->query("DELETE FROM categories");
    
    // 10. Delete all departments
    $db->query("DELETE FROM departments");
    
    // 11. Delete all users except current admin
    $db->query("DELETE FROM users WHERE id != ?", [$currentUserId]);
    
    // 12. Delete all businesses
    $db->query("DELETE FROM businesses");
    
    // 13. Delete all audit logs
    $db->query("DELETE FROM audit_log");
    
    // 14. Reset current user's business_id and department_id
    $db->query("UPDATE users SET business_id = NULL, department_id = NULL WHERE id = ?", [$currentUserId]);
    
    // 15. Reset auto-increment for all tables
    $tables = [
        'transactions', 'journal_entries', 'journal_lines', 'settlement_allocations',
        'opening_balances', 'stock_adjustments', 'period_balances', 'chart_of_accounts',
        'categories', 'departments', 'businesses', 'audit_log'
    ];
    
    foreach ($tables as $table) {
        try {
            $db->query("ALTER TABLE `$table` AUTO_INCREMENT = 1");
        } catch (Exception $e) {
            // Ignore if table doesn't exist
        }
    }
    
    // 16. Create a default business for the admin user
    $newBusinessId = $db->insert('businesses', [
        'name' => 'My Business',
        'currency' => 'LKR',
        'financial_year_start' => 1,
        'uses_inventory' => 0,
        'opening_cash' => 0,
        'opening_bank' => 0,
        'active' => 1
    ]);
    
    // 17. Assign admin to the new business
    $db->query("UPDATE users SET business_id = ?, role = 'admin' WHERE id = ?", [$newBusinessId, $currentUserId]);
    
    // 18. Create default categories
    $defaultCategories = [
        ['name' => 'General Sales', 'type' => 'income', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'Service Income', 'type' => 'income', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'General Purchases', 'type' => 'expense', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'Office Supplies', 'type' => 'expense', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'Utilities', 'type' => 'expense', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'Rent', 'type' => 'expense', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'Salaries', 'type' => 'expense', 'business_id' => $newBusinessId, 'active' => 1],
        ['name' => 'Transport', 'type' => 'expense', 'business_id' => $newBusinessId, 'active' => 1],
    ];
    
    foreach ($defaultCategories as $cat) {
        $db->insert('categories', $cat);
    }
    
    // 19. Create default chart of accounts
    createDefaultChartOfAccounts($newBusinessId);
}

/**
 * Create default chart of accounts for a business
 */
function createDefaultChartOfAccounts($businessId) {
    $db = db();
    
    $accounts = [
        // Assets
        ['code' => '1000', 'name' => 'Cash on Hand', 'account_type' => 'Asset', 'sub_type' => 'Cash', 'is_system' => 1],
        ['code' => '1010', 'name' => 'Bank Account', 'account_type' => 'Asset', 'sub_type' => 'Bank', 'is_system' => 1],
        ['code' => '1100', 'name' => 'Accounts Receivable', 'account_type' => 'Asset', 'sub_type' => 'AR', 'is_system' => 1],
        ['code' => '1150', 'name' => 'Supplier Prepayments', 'account_type' => 'Asset', 'sub_type' => 'Prepayment', 'is_system' => 1],
        ['code' => '1200', 'name' => 'Inventory', 'account_type' => 'Asset', 'sub_type' => 'Inventory', 'is_system' => 1],
        
        // Liabilities
        ['code' => '2000', 'name' => 'Accounts Payable', 'account_type' => 'Liability', 'sub_type' => 'AP', 'is_system' => 1],
        ['code' => '2050', 'name' => 'Customer Deposits', 'account_type' => 'Liability', 'sub_type' => 'Deposit', 'is_system' => 1],
        
        // Equity
        ['code' => '3000', 'name' => 'Owner Capital', 'account_type' => 'Equity', 'sub_type' => 'Capital', 'is_system' => 1],
        ['code' => '3100', 'name' => 'Owner Drawings', 'account_type' => 'Equity', 'sub_type' => 'Drawings', 'is_system' => 1],
        ['code' => '3200', 'name' => 'Retained Earnings', 'account_type' => 'Equity', 'sub_type' => 'Retained', 'is_system' => 1],
        ['code' => '3900', 'name' => 'Opening Balance Equity', 'account_type' => 'Equity', 'sub_type' => 'Opening', 'is_system' => 1],
        
        // Revenue
        ['code' => '4000', 'name' => 'Sales Revenue', 'account_type' => 'Revenue', 'sub_type' => 'Sales', 'is_system' => 1],
        ['code' => '4100', 'name' => 'Other Income', 'account_type' => 'Revenue', 'sub_type' => 'Other', 'is_system' => 1],
        
        // Expenses
        ['code' => '5000', 'name' => 'Cost of Goods Sold', 'account_type' => 'Expense', 'sub_type' => 'COGS', 'is_system' => 1],
        ['code' => '5100', 'name' => 'Direct Costs', 'account_type' => 'Expense', 'sub_type' => 'DirectCost', 'is_system' => 1],
        ['code' => '6000', 'name' => 'Operating Expenses', 'account_type' => 'Expense', 'sub_type' => 'Operating', 'is_system' => 1],
    ];
    
    foreach ($accounts as $account) {
        $account['business_id'] = $businessId;
        $account['is_active'] = 1;
        $account['opening_balance'] = 0;
        $db->insert('chart_of_accounts', $account);
    }
}
