<?php
/**
 * Settings Page
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';

Auth::requireAuth();

$businessId = Auth::user('business_id');
$userId = Auth::user('id');
$isAdmin = Auth::isAdmin();
$isManager = Auth::isManager();
$pageTitle = 'Settings - ' . APP_NAME;
$currentPage = 'settings';

// Get current user data
$currentUser = db()->fetch("SELECT * FROM users WHERE id = ?", [$userId]);

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <h2>Settings</h2>
</div>

<!-- Settings Tabs -->
<div class="tabs">
    <button class="tab-btn active" data-tab="profile">Profile</button>
    <?php if ($isManager): ?>
        <button class="tab-btn" data-tab="users">Users</button>
    <?php endif; ?>
    <?php if ($isAdmin): ?>
        <button class="tab-btn" data-tab="businesses">Businesses</button>
    <?php endif; ?>
    <?php if ($isManager): ?>
        <button class="tab-btn" data-tab="departments">Departments</button>
        <button class="tab-btn" data-tab="categories">Categories</button>
    <?php endif; ?>
    <button class="tab-btn" data-tab="export">Export</button>
    <?php if ($isAdmin): ?>
        <button class="tab-btn" data-tab="reset" style="color: var(--danger);">⚠️ Reset</button>
    <?php endif; ?>
</div>

<div class="tab-content">
    <!-- Profile Tab -->
    <div class="tab-pane active" id="tab-profile">
        <div class="settings-section">
            <h3>Your Profile</h3>
            <form id="profileForm" class="settings-form">
                <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
                
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" value="<?= h($currentUser['username']) ?>" disabled>
                </div>
                
                <div class="form-group">
                    <label for="profileName">Display Name</label>
                    <input type="text" id="profileName" name="name" value="<?= h($currentUser['name']) ?>" required>
                </div>
                
                <div class="form-group">
                    <label for="profileEmail">Email</label>
                    <input type="email" id="profileEmail" name="email" value="<?= h($currentUser['email']) ?>">
                </div>
                
                <button type="submit" class="btn btn-primary">Update Profile</button>
            </form>
        </div>
        
        <div class="settings-section">
            <h3>Change Password</h3>
            <form id="passwordForm" class="settings-form">
                <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
                
                <div class="form-group">
                    <label for="currentPassword">Current Password</label>
                    <input type="password" id="currentPassword" name="current_password" required>
                </div>
                
                <div class="form-group">
                    <label for="newPassword">New Password</label>
                    <input type="password" id="newPassword" name="new_password" required minlength="8">
                </div>
                
                <div class="form-group">
                    <label for="confirmPassword">Confirm New Password</label>
                    <input type="password" id="confirmPassword" name="confirm_password" required>
                </div>
                
                <button type="submit" class="btn btn-primary">Change Password</button>
            </form>
        </div>
    </div>
    
    <?php if ($isManager): ?>
    <!-- Users Tab -->
    <div class="tab-pane" id="tab-users">
        <div class="settings-section">
            <div class="section-header">
                <h3>Users</h3>
                <button class="btn btn-primary btn-sm" id="btnAddUser">+ Add User</button>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Department</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="usersTableBody">
                        <tr><td colspan="7">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <?php endif; ?>
    
    <?php if ($isAdmin): ?>
    <!-- Businesses Tab -->
    <div class="tab-pane" id="tab-businesses">
        <div class="settings-section">
            <div class="section-header">
                <h3>Businesses</h3>
                <button class="btn btn-primary btn-sm" id="btnAddBusiness">+ Add Business</button>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Tax ID</th>
                            <th>Currency</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="businessesTableBody">
                        <tr><td colspan="7">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <?php endif; ?>
    
    <?php if ($isManager): ?>
    <!-- Departments Tab -->
    <div class="tab-pane" id="tab-departments">
        <div class="settings-section">
            <div class="section-header">
                <h3>Departments</h3>
                <button class="btn btn-primary btn-sm" id="btnAddDepartment">+ Add Department</button>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="departmentsTableBody">
                        <tr><td colspan="3">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <!-- Categories Tab -->
    <div class="tab-pane" id="tab-categories">
        <div class="settings-section">
            <div class="section-header">
                <h3>Categories</h3>
                <button class="btn btn-primary btn-sm" id="btnAddCategory">+ Add Category</button>
            </div>
            <div class="category-filters">
                <button class="btn btn-sm active" data-filter="all">All</button>
                <button class="btn btn-sm" data-filter="income">Income</button>
                <button class="btn btn-sm" data-filter="expense">Expense</button>
                <button class="btn btn-sm" data-filter="asset">Asset</button>
                <button class="btn btn-sm" data-filter="liability">Liability</button>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="categoriesTableBody">
                        <tr><td colspan="4">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <?php endif; ?>
    
    <!-- Export Tab -->
    <div class="tab-pane" id="tab-export">
        <div class="settings-section">
            <h3>Export Data</h3>
            <form id="exportForm" class="settings-form">
                <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="exportType">Data Type</label>
                        <select id="exportType" name="type" required>
                            <option value="transactions">Transactions</option>
                            <option value="sales">Sales Only</option>
                            <option value="purchases">Purchases Only</option>
                            <option value="expenses">Expenses Only</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="exportDateFrom">From Date</label>
                        <input type="date" id="exportDateFrom" name="date_from">
                    </div>
                    <div class="form-group">
                        <label for="exportDateTo">To Date</label>
                        <input type="date" id="exportDateTo" name="date_to">
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary">Export to CSV</button>
            </form>
        </div>
    </div>
    
    <?php if ($isAdmin): ?>
    <!-- Master Reset Tab -->
    <div class="tab-pane" id="tab-reset">
        <div class="settings-section">
            <h3>⚠️ Master Reset</h3>
            <p class="text-muted" style="margin-bottom: 1.5rem;">
                Use these options carefully. Reset actions <strong>cannot be undone</strong>.
            </p>
            
            <!-- Reset Transactions Only -->
            <div class="reset-card" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1.5rem;">
                <h4 style="color: #dc2626; margin: 0 0 0.5rem 0;">🗑️ Reset Transactions</h4>
                <p style="color: #7f1d1d; margin: 0 0 1rem 0; font-size: 0.9rem;">
                    This will delete <strong>ALL</strong> transactions, journal entries, settlements, and reset auto-increment IDs.
                    <br>Company settings, users, departments, and categories will be <strong>preserved</strong>.
                </p>
                <ul style="color: #7f1d1d; font-size: 0.85rem; margin: 0 0 1rem 1.5rem;">
                    <li>All transactions (Sale, Purchase, Expense, Receive, Pay, etc.)</li>
                    <li>All journal entries and journal lines</li>
                    <li>All settlement allocations</li>
                    <li>All opening balances</li>
                    <li>All stock adjustments</li>
                    <li>Transaction-related audit logs</li>
                </ul>
                <button type="button" class="btn" style="background: #dc2626; color: white;" onclick="confirmResetTransactions()">
                    Reset All Transactions
                </button>
            </div>
            
            <!-- Full System Reset -->
            <div class="reset-card" style="background: #fef2f2; border: 2px solid #dc2626; border-radius: var(--radius); padding: 1.5rem;">
                <h4 style="color: #dc2626; margin: 0 0 0.5rem 0;">💀 Full System Reset</h4>
                <p style="color: #7f1d1d; margin: 0 0 1rem 0; font-size: 0.9rem;">
                    This will delete <strong>EVERYTHING</strong> and reset the entire system to a fresh install state.
                    <br>Only the admin user account will be preserved.
                </p>
                <ul style="color: #7f1d1d; font-size: 0.85rem; margin: 0 0 1rem 1.5rem;">
                    <li>All transactions and journal entries</li>
                    <li>All business/company details</li>
                    <li>All departments and categories</li>
                    <li>All users (except current admin)</li>
                    <li>All chart of accounts (will be recreated)</li>
                    <li>All audit logs</li>
                </ul>
                <button type="button" class="btn" style="background: #7f1d1d; color: white;" onclick="confirmFullReset()">
                    ⚠️ Full System Reset
                </button>
            </div>
        </div>
    </div>
    <?php endif; ?>
</div>

<!-- User Modal -->
<div class="modal" id="userModal">
    <div class="modal-overlay"></div>
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="userModalTitle">Add User</h3>
            <button class="modal-close" id="userModalClose">&times;</button>
        </div>
        <form id="userForm">
            <input type="hidden" name="id" id="userId">
            <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
            
            <div class="form-group">
                <label for="userUsername">Username *</label>
                <input type="text" id="userUsername" name="username" required maxlength="50">
            </div>
            
            <div class="form-group" id="passwordGroup">
                <label for="userPassword">Password *</label>
                <input type="password" id="userPassword" name="password" minlength="8">
                <small>Leave blank to keep current password (when editing)</small>
            </div>
            
            <div class="form-group">
                <label for="userName">Display Name *</label>
                <input type="text" id="userName" name="name" required maxlength="100">
            </div>
            
            <div class="form-group">
                <label for="userEmail">Email</label>
                <input type="email" id="userEmail" name="email" maxlength="100">
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="userRole">Role</label>
                    <select id="userRole" name="role">
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <?php if ($isAdmin): ?>
                            <option value="admin">Admin</option>
                        <?php endif; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label for="userDepartment">Department</label>
                    <select id="userDepartment" name="department_id">
                        <option value="">-- Select --</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" name="active" value="1" checked> Active
                </label>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" id="userCancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Save User</button>
            </div>
        </form>
    </div>
</div>

<!-- Business Modal -->
<div class="modal" id="businessModal">
    <div class="modal-overlay"></div>
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="businessModalTitle">Add Business</h3>
            <button class="modal-close" id="businessModalClose">&times;</button>
        </div>
        <form id="businessForm">
            <input type="hidden" name="id" id="businessId">
            <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
            
            <div class="form-group">
                <label for="businessName">Business Name *</label>
                <input type="text" id="businessName" name="name" required maxlength="150">
            </div>
            
            <div class="form-group">
                <label for="businessAddress">Address</label>
                <textarea id="businessAddress" name="address" rows="2"></textarea>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="businessPhone">Phone</label>
                    <input type="text" id="businessPhone" name="phone" maxlength="30">
                </div>
                <div class="form-group">
                    <label for="businessEmail">Email</label>
                    <input type="email" id="businessEmail" name="email" maxlength="100">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="businessTaxId">Tax ID</label>
                    <input type="text" id="businessTaxId" name="tax_id" maxlength="50">
                </div>
                <div class="form-group">
                    <label for="businessCurrency">Currency</label>
                    <select id="businessCurrency" name="currency">
                        <option value="USD">USD ($) - US Dollar</option>
                        <option value="CNY">CNY (¥) - Chinese Yuan</option>
                        <option value="INR">INR (₹) - Indian Rupee</option>
                        <option value="JPY">JPY (¥) - Japanese Yen</option>
                        <option value="EUR">EUR (€) - Euro</option>
                        <option value="GBP">GBP (£) - British Pound</option>
                        <option value="LKR">LKR (Rs) - Sri Lankan Rupee</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label for="businessFiscalYear">Financial Year Start</label>
                <select id="businessFiscalYear" name="financial_year_start">
                    <option value="1">January → December (1 Jan to 31 Dec) - CN, US Corp</option>
                    <option value="4">April → March (1 Apr to 31 Mar) - IN, JP, UK</option>
                    <option value="7">July → June (1 Jul to 30 Jun) - AU, NZ</option>
                    <option value="10">October → September (1 Oct to 30 Sep) - US Federal</option>
                </select>
                <small>Example: April selection means FY2026 = 1 Apr 2026 to 31 Mar 2027</small>
            </div>
            
            <div class="form-group">
                <label for="businessPeriodLock">Period Lock Date</label>
                <input type="date" id="businessPeriodLock" name="period_lock_date">
                <small>Transactions on or before this date cannot be edited (audit protection)</small>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" name="uses_inventory" id="businessUsesInventory" value="1"> Enable Inventory Mode
                </label>
                <small>Enables Inventory account and periodic COGS calculation (Opening + Purchases - Closing)</small>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" name="active" value="1" checked> Active
                </label>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" id="businessCancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Business</button>
            </div>
        </form>
    </div>
</div>

<!-- Department Modal -->
<div class="modal" id="departmentModal">
    <div class="modal-overlay"></div>
    <div class="modal-content modal-sm">
        <div class="modal-header">
            <h3 id="departmentModalTitle">Add Department</h3>
            <button class="modal-close" id="departmentModalClose">&times;</button>
        </div>
        <form id="departmentForm">
            <input type="hidden" name="id" id="departmentId">
            <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
            
            <div class="form-group">
                <label for="departmentName">Department Name *</label>
                <input type="text" id="departmentName" name="name" required maxlength="100">
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" name="active" value="1" checked> Active
                </label>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" id="departmentCancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Department</button>
            </div>
        </form>
    </div>
</div>

<!-- Category Modal -->
<div class="modal" id="categoryModal">
    <div class="modal-overlay"></div>
    <div class="modal-content modal-sm">
        <div class="modal-header">
            <h3 id="categoryModalTitle">Add Category</h3>
            <button class="modal-close" id="categoryModalClose">&times;</button>
        </div>
        <form id="categoryForm">
            <input type="hidden" name="id" id="categoryId">
            <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
            
            <div class="form-group">
                <label for="categoryName">Category Name *</label>
                <input type="text" id="categoryName" name="name" required maxlength="100">
            </div>
            
            <div class="form-group">
                <label for="categoryType">Type *</label>
                <select id="categoryType" name="type" required>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" name="active" value="1" checked> Active
                </label>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" id="categoryCancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Category</button>
            </div>
        </form>
    </div>
</div>

<script>
window.AppConfig = {
    csrfToken: '<?= h(Auth::csrfToken()) ?>',
    businessId: <?= (int)$businessId ?>,
    isAdmin: <?= $isAdmin ? 'true' : 'false' ?>,
    isManager: <?= $isManager ? 'true' : 'false' ?>
};

// Master Reset Functions
function confirmResetTransactions() {
    const confirmText = prompt(
        '⚠️ WARNING: This will delete ALL transactions!\n\n' +
        'Company settings will be preserved.\n\n' +
        'Type "RESET TRANSACTIONS" to confirm:'
    );
    
    if (confirmText === 'RESET TRANSACTIONS') {
        if (confirm('Are you ABSOLUTELY sure? This cannot be undone!')) {
            performReset('transactions');
        }
    } else if (confirmText !== null) {
        alert('Reset cancelled. You must type exactly "RESET TRANSACTIONS" to proceed.');
    }
}

function confirmFullReset() {
    const confirmText = prompt(
        '💀 DANGER: This will delete EVERYTHING!\n\n' +
        'Only your admin account will be preserved.\n' +
        'The system will be reset to fresh install state.\n\n' +
        'Type "DELETE EVERYTHING" to confirm:'
    );
    
    if (confirmText === 'DELETE EVERYTHING') {
        const secondConfirm = prompt(
            'FINAL WARNING!\n\n' +
            'All data will be permanently destroyed.\n\n' +
            'Type your username "<?= h($currentUser['username']) ?>" to confirm:'
        );
        
        if (secondConfirm === '<?= h($currentUser['username']) ?>') {
            performReset('full');
        } else if (secondConfirm !== null) {
            alert('Reset cancelled. Username did not match.');
        }
    } else if (confirmText !== null) {
        alert('Reset cancelled. You must type exactly "DELETE EVERYTHING" to proceed.');
    }
}

async function performReset(type) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    try {
        const formData = new FormData();
        formData.append('csrf_token', window.AppConfig.csrfToken);
        formData.append('reset_type', type);
        
        const response = await fetch('api/settings.php?entity=reset&action=execute', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Reset completed successfully!\n\nThe page will now reload.');
            window.location.href = type === 'full' ? 'login.php' : 'settings.php';
        } else {
            alert('❌ Error: ' + (result.error || 'Reset failed'));
            btn.disabled = false;
            btn.textContent = originalText;
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
</script>

<?php include __DIR__ . '/includes/footer.php'; ?>
