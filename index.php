<?php
/**
 * Main Page - Transactions (Master Journal)
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';

Auth::requireAuth();

$businessId = Auth::user('business_id');
$pageTitle = 'Transactions - ' . APP_NAME;
$currentPage = 'transactions';

// Get categories and departments for dropdowns
$categories = getCategories($businessId);
$departments = getDepartments($businessId);
$types = getTransactionTypes();
$paymentMethods = getPaymentMethods();
$statuses = getStatusOptions();

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <h2>Transactions</h2>
    <div class="quick-add-buttons">
        <button class="btn btn-income" onclick="openNewTransaction('Sale')">+ Sale</button>
        <button class="btn btn-income" onclick="openNewTransaction('Receive')">+ Receive</button>
        <button class="btn btn-expense" onclick="openNewTransaction('Purchase')">+ Purchase</button>
        <button class="btn btn-expense" onclick="openNewTransaction('Expense')">+ Expense</button>
        <button class="btn btn-expense" onclick="openNewTransaction('Pay')">+ Pay</button>
        <button class="btn btn-neutral" onclick="openNewTransaction('Transfer')">↔ Transfer</button>
        <button class="btn btn-neutral" onclick="openNewTransaction('Owner')">👤 Owner</button>
    </div>
</div>

<!-- Filters Section -->
<div class="filters-section">
    <form id="filtersForm" class="filters-form">
        <div class="filter-row">
            <div class="filter-group">
                <label>From</label>
                <input type="date" name="date_from" id="dateFrom">
            </div>
            <div class="filter-group">
                <label>To</label>
                <input type="date" name="date_to" id="dateTo">
            </div>
            <div class="filter-group">
                <label>Type</label>
                <select name="type" id="filterType">
                    <option value="">All Types</option>
                    <?php foreach ($types as $key => $t): ?>
                        <option value="<?= h($key) ?>"><?= h($t['label']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="filter-group">
                <label>Payment</label>
                <select name="payment_method" id="filterPayment">
                    <option value="">All Methods</option>
                    <?php foreach ($paymentMethods as $pm): ?>
                        <option value="<?= h($pm) ?>"><?= h($pm) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="filter-group">
                <label>Status</label>
                <select name="status" id="filterStatus">
                    <option value="">All Status</option>
                    <?php foreach ($statuses as $s): ?>
                        <option value="<?= h($s) ?>"><?= h($s) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="filter-group filter-search">
                <label>Search</label>
                <input type="text" name="search" id="filterSearch" placeholder="Party, description, ref...">
            </div>
            <div class="filter-group filter-checkbox">
                <label class="checkbox-label">
                    <input type="checkbox" name="show_auto" id="showAutoSettlements"> 
                    Show auto-settlements
                </label>
            </div>
            <div class="filter-actions">
                <button type="submit" class="btn btn-sm">Filter</button>
                <button type="button" class="btn btn-sm btn-outline" id="btnClearFilters">Clear</button>
            </div>
        </div>
    </form>
</div>

<!-- Totals Summary -->
<div class="totals-bar" id="totalsBar">
    <div class="total-item">
        <span class="total-label">Income</span>
        <span class="total-value income" id="totalIncome"><?= h($currencySymbol) ?>0.00</span>
    </div>
    <div class="total-item">
        <span class="total-label">Expense</span>
        <span class="total-value expense" id="totalExpense"><?= h($currencySymbol) ?>0.00</span>
    </div>
    <div class="total-item">
        <span class="total-label">Net</span>
        <span class="total-value" id="totalNet"><?= h($currencySymbol) ?>0.00</span>
    </div>
    <div class="total-item">
        <span class="total-label">Count</span>
        <span class="total-value" id="totalCount">0</span>
    </div>
</div>

<!-- Transactions Table -->
<div class="table-container">
    <table class="data-table" id="transactionsTable">
        <thead>
            <tr>
                <th class="col-date">Date</th>
                <th class="col-type">Type</th>
                <th class="col-party">Party</th>
                <th class="col-desc">Description</th>
                <th class="col-method">Payment</th>
                <th class="col-amount">Amount</th>
                <th class="col-category">Category</th>
                <th class="col-ref">Ref#</th>
                <th class="col-status">Status</th>
                <th class="col-receipt">📎</th>
                <th class="col-actions">Actions</th>
            </tr>
        </thead>
        <tbody id="transactionsBody">
            <tr class="loading-row">
                <td colspan="11">Loading...</td>
            </tr>
        </tbody>
    </table>
</div>

<!-- Pagination -->
<div class="pagination" id="pagination"></div>

<!-- Transaction Modal -->
<div class="modal" id="transactionModal">
    <div class="modal-overlay"></div>
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="modalTitle">Add Transaction</h3>
            <button class="modal-close" id="modalClose">&times;</button>
        </div>
        <form id="transactionForm" enctype="multipart/form-data">
            <input type="hidden" name="id" id="txnId">
            <input type="hidden" name="csrf_token" value="<?= h(Auth::csrfToken()) ?>">
            
            <div class="form-row">
                <div class="form-group">
                    <label for="txnDate">Date *</label>
                    <input type="date" id="txnDate" name="date" required>
                </div>
                <div class="form-group">
                    <label for="txnType">Type *</label>
                    <select id="txnType" name="type" required>
                        <?php foreach ($types as $key => $t): ?>
                            <option value="<?= h($key) ?>"><?= h($t['label']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="txnParty">Party</label>
                    <input type="text" id="txnParty" name="party" maxlength="150" placeholder="Customer/Vendor name">
                </div>
                <div class="form-group">
                    <label for="txnAmount">Amount *</label>
                    <input type="number" id="txnAmount" name="amount" step="0.01" min="0" required>
                </div>
            </div>
            
            <div class="form-group">
                <label for="txnDescription">Description</label>
                <textarea id="txnDescription" name="description" rows="2" placeholder="Transaction details"></textarea>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="txnPaymentMethod">Payment Method</label>
                    <select id="txnPaymentMethod" name="payment_method">
                        <?php foreach ($paymentMethods as $pm): ?>
                            <option value="<?= h($pm) ?>"><?= h($pm) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label for="txnCategory">Category</label>
                    <select id="txnCategory" name="category_id">
                        <option value="">-- Select Category --</option>
                        <?php foreach ($categories as $cat): ?>
                            <option value="<?= h($cat['id']) ?>"><?= h($cat['name']) ?> (<?= h($cat['type']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="txnRef">Invoice/Bill Ref</label>
                    <input type="text" id="txnRef" name="invoice_or_bill_ref" maxlength="100">
                </div>
                <div class="form-group">
                    <label for="txnStatus">Status</label>
                    <select id="txnStatus" name="status">
                        <?php foreach ($statuses as $s): ?>
                            <option value="<?= h($s) ?>"><?= h($s) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="txnLinkId">Link to Transaction ID</label>
                    <input type="number" id="txnLinkId" name="link_id" min="1" placeholder="Related transaction ID">
                </div>
                <div class="form-group">
                    <label for="txnDepartment">Department</label>
                    <select id="txnDepartment" name="department_id">
                        <option value="">-- Select --</option>
                        <?php foreach ($departments as $dept): ?>
                            <option value="<?= h($dept['id']) ?>"><?= h($dept['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label for="txnReceipt">Receipt/Attachment</label>
                <input type="file" id="txnReceipt" name="receipt" accept=".jpg,.jpeg,.png,.gif,.pdf,.webp">
                <div id="currentReceipt" class="current-receipt" style="display:none;">
                    <span id="receiptName"></span>
                    <button type="button" class="btn btn-sm btn-danger" id="btnRemoveReceipt">Remove</button>
                </div>
            </div>
            
            <div class="form-group">
                <label for="txnNotes">Notes</label>
                <textarea id="txnNotes" name="notes" rows="2" placeholder="Internal notes"></textarea>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" id="btnCancel">Cancel</button>
                <button type="submit" class="btn btn-primary" id="btnSave">Save Transaction</button>
            </div>
        </form>
    </div>
</div>

<!-- Delete Confirmation Modal -->
<div class="modal" id="deleteModal">
    <div class="modal-overlay"></div>
    <div class="modal-content modal-sm">
        <div class="modal-header">
            <h3>Confirm Delete</h3>
            <button class="modal-close" id="deleteModalClose">&times;</button>
        </div>
        <div class="modal-body">
            <p>Are you sure you want to delete this transaction?</p>
            <p class="text-muted">This action cannot be undone.</p>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" id="btnCancelDelete">Cancel</button>
            <button class="btn btn-danger" id="btnConfirmDelete">Delete</button>
        </div>
    </div>
</div>

<script>
// Pass PHP data to JavaScript
window.AppConfig = {
    csrfToken: '<?= h(Auth::csrfToken()) ?>',
    businessId: <?= (int)$businessId ?>,
    departmentId: <?= (int)Auth::user('department_id') ?>
};
</script>

<?php
$pageScript = '';
include __DIR__ . '/includes/footer.php';
?>
