<?php
/**
 * Reports Page - Full Accounting Reports
 * P&L, Cash Flow, Balance Sheet, Ledger
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';

Auth::requireAuth();

$businessId = Auth::user('business_id');
$pageTitle = 'Reports - ' . APP_NAME;
$currentPage = 'reports';

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <h2>Financial Reports</h2>
</div>

<!-- Report Tabs -->
<div class="tabs reports-tabs">
    <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
    <button class="tab-btn" data-tab="sales">Sales</button>
    <button class="tab-btn" data-tab="purchases">Purchases</button>
    <button class="tab-btn" data-tab="expenses">Expenses</button>
    <button class="tab-btn" data-tab="profit_loss">Profit &amp; Loss</button>
    <button class="tab-btn" data-tab="cash_flow">Cash Flow</button>
    <button class="tab-btn" data-tab="balance_sheet">Balance Sheet</button>
    <button class="tab-btn" data-tab="ledger">General Ledger</button>
    <button class="tab-btn" data-tab="receivables">Receivables</button>
    <button class="tab-btn" data-tab="payables">Payables</button>
</div>

<!-- Report Filters -->
<div class="report-filters">
    <div class="filter-row">
        <div class="filter-group">
            <label>From</label>
            <input type="date" id="reportDateFrom">
        </div>
        <div class="filter-group">
            <label>To</label>
            <input type="date" id="reportDateTo">
        </div>
        <div class="filter-group" id="asOfDateGroup" style="display:none;">
            <label>As Of Date</label>
            <input type="date" id="reportAsOfDate">
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" id="btnGenerateReport">Generate Report</button>
            <button class="btn btn-outline" id="btnExportReport">Export CSV</button>
            <button class="btn btn-outline" id="btnPrintReport">Print</button>
        </div>
    </div>
</div>

<!-- Report Content -->
<div class="tab-content">
    
    <!-- Dashboard Tab -->
    <div class="tab-pane active" id="tab-dashboard">
        <div class="report-cards">
            <div class="report-card">
                <h4>Revenue</h4>
                <div class="card-value income" id="dashRevenue"><?= h($currencySymbol) ?>0.00</div>
                <small>Total Sales</small>
            </div>
            <div class="report-card">
                <h4>Expenses</h4>
                <div class="card-value expense" id="dashExpenses"><?= h($currencySymbol) ?>0.00</div>
                <small>COGS + Operating</small>
            </div>
            <div class="report-card">
                <h4>Net Profit</h4>
                <div class="card-value" id="dashNetProfit"><?= h($currencySymbol) ?>0.00</div>
                <small>Revenue - Expenses</small>
            </div>
            <div class="report-card">
                <h4>Gross Margin</h4>
                <div class="card-value" id="dashGrossMargin">0%</div>
                <small>(Revenue - COGS) / Revenue</small>
            </div>
        </div>
        
        <div class="report-row">
            <div class="report-section half">
                <h4>Cash Position</h4>
                <div class="report-cards small">
                    <div class="report-card">
                        <h5>Cash</h5>
                        <div class="card-value" id="dashCash"><?= h($currencySymbol) ?>0.00</div>
                    </div>
                    <div class="report-card">
                        <h5>Bank</h5>
                        <div class="card-value" id="dashBank"><?= h($currencySymbol) ?>0.00</div>
                    </div>
                </div>
            </div>
            <div class="report-section half">
                <h4>Outstanding</h4>
                <div class="report-cards small">
                    <div class="report-card">
                        <h5>Receivables</h5>
                        <div class="card-value income" id="dashAR"><?= h($currencySymbol) ?>0.00</div>
                    </div>
                    <div class="report-card">
                        <h5>Payables</h5>
                        <div class="card-value expense" id="dashAP"><?= h($currencySymbol) ?>0.00</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Sales Tab -->
    <div class="tab-pane" id="tab-sales">
        <div class="report-header">
            <h3>Sales Report</h3>
            <p class="report-period" id="salesPeriod"></p>
        </div>
        
        <div class="report-summary-cards">
            <div class="summary-card">
                <span class="label">Total Sales</span>
                <span class="value income" id="salesTotalAmount"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="summary-card">
                <span class="label">Transactions</span>
                <span class="value" id="salesTotalCount">0</span>
            </div>
            <div class="summary-card">
                <span class="label">Received</span>
                <span class="value" id="salesReceived"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="summary-card">
                <span class="label">Outstanding</span>
                <span class="value warning" id="salesOutstanding"><?= h($currencySymbol) ?>0.00</span>
            </div>
        </div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Invoice#</th>
                        <th>Customer</th>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                        <th>Status</th>
                        <th>Payment</th>
                    </tr>
                </thead>
                <tbody id="salesTableBody">
                    <tr><td colspan="7" class="text-center">No sales found</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- Purchases Tab -->
    <div class="tab-pane" id="tab-purchases">
        <div class="report-header">
            <h3>Purchases Report</h3>
            <p class="report-period" id="purchasesPeriod"></p>
        </div>
        
        <div class="report-summary-cards">
            <div class="summary-card">
                <span class="label">Total Purchases</span>
                <span class="value expense" id="purchasesTotalAmount"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="summary-card">
                <span class="label">Transactions</span>
                <span class="value" id="purchasesTotalCount">0</span>
            </div>
            <div class="summary-card">
                <span class="label">Paid</span>
                <span class="value" id="purchasesPaid"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="summary-card">
                <span class="label">Outstanding</span>
                <span class="value warning" id="purchasesOutstanding"><?= h($currencySymbol) ?>0.00</span>
            </div>
        </div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Bill#</th>
                        <th>Supplier</th>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                        <th>Status</th>
                        <th>Payment</th>
                    </tr>
                </thead>
                <tbody id="purchasesTableBody">
                    <tr><td colspan="7" class="text-center">No purchases found</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- Expenses Tab -->
    <div class="tab-pane" id="tab-expenses">
        <div class="report-header">
            <h3>Expenses Report</h3>
            <p class="report-period" id="expensesPeriod"></p>
        </div>
        
        <div class="report-summary-cards">
            <div class="summary-card">
                <span class="label">Total Expenses</span>
                <span class="value expense" id="expensesTotalAmount"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="summary-card">
                <span class="label">Transactions</span>
                <span class="value" id="expensesTotalCount">0</span>
            </div>
        </div>
        
        <h4 style="margin: 1.5rem 0 1rem;">Expenses by Category</h4>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                        <th class="text-right">% of Total</th>
                    </tr>
                </thead>
                <tbody id="expensesCategoryBody">
                    <tr><td colspan="3" class="text-center">No expenses found</td></tr>
                </tbody>
            </table>
        </div>
        
        <h4 style="margin: 1.5rem 0 1rem;">All Expense Transactions</h4>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                        <th>Payment</th>
                    </tr>
                </thead>
                <tbody id="expensesTableBody">
                    <tr><td colspan="5" class="text-center">No expenses found</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- Profit & Loss Tab -->
    <div class="tab-pane" id="tab-profit_loss">
        <div class="report-header">
            <h3>Profit &amp; Loss Statement</h3>
            <p class="report-period" id="plPeriod"></p>
        </div>
        
        <div class="financial-statement">
            <div class="statement-section">
                <div class="statement-header">Revenue</div>
                <div class="statement-line">
                    <span>Sales Revenue</span>
                    <span class="amount" id="plSalesRevenue"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Other Income</span>
                    <span class="amount" id="plOtherIncome"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-total">
                    <span>Total Revenue</span>
                    <span class="amount" id="plTotalRevenue"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section">
                <div class="statement-header">Cost of Goods Sold</div>
                <div class="statement-line">
                    <span>Opening Stock</span>
                    <span class="amount" id="plOpeningStock"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Purchases</span>
                    <span class="amount" id="plPurchases"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Less: Closing Stock</span>
                    <span class="amount" id="plClosingStock">(<?= h($currencySymbol) ?>0.00)</span>
                </div>
                <div class="statement-total">
                    <span>Cost of Goods Sold</span>
                    <span class="amount" id="plCOGS"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section highlight">
                <div class="statement-total large">
                    <span>Gross Profit</span>
                    <span class="amount" id="plGrossProfit"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section">
                <div class="statement-header">Operating Expenses</div>
                <div id="plExpensesList">
                    <!-- Dynamic expense categories -->
                </div>
                <div class="statement-total">
                    <span>Total Operating Expenses</span>
                    <span class="amount" id="plTotalExpenses"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section highlight">
                <div class="statement-total large">
                    <span>Net Profit / (Loss)</span>
                    <span class="amount" id="plNetProfit"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Cash Flow Tab -->
    <div class="tab-pane" id="tab-cash_flow">
        <div class="report-header">
            <h3>Cash Flow Statement</h3>
            <p class="report-period" id="cfPeriod"></p>
        </div>
        
        <div class="financial-statement">
            <div class="statement-section">
                <div class="statement-header">Cash Receipts (Money In)</div>
                <div class="statement-line">
                    <span>Receipts from Customers</span>
                    <span class="amount" id="cfReceiptsCustomers"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Owner Contributions (Cash)</span>
                    <span class="amount" id="cfOwnerContributions"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Other Receipts</span>
                    <span class="amount" id="cfOtherReceipts"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-total">
                    <span>Total Cash In</span>
                    <span class="amount income" id="cfTotalIn"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section">
                <div class="statement-header">Cash Payments (Money Out)</div>
                <div class="statement-line">
                    <span>Payments to Suppliers</span>
                    <span class="amount" id="cfPaymentsSuppliers"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Operating Expenses Paid</span>
                    <span class="amount" id="cfExpensesPaid"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Owner Drawings</span>
                    <span class="amount" id="cfOwnerDrawings"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-total">
                    <span>Total Cash Out</span>
                    <span class="amount expense" id="cfTotalOut"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section highlight">
                <div class="statement-total large">
                    <span>Net Cash Flow</span>
                    <span class="amount" id="cfNetCashFlow"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
            
            <div class="statement-section">
                <div class="statement-line">
                    <span>Opening Cash &amp; Bank Balance</span>
                    <span class="amount" id="cfOpeningBalance"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-line">
                    <span>Add: Net Cash Flow</span>
                    <span class="amount" id="cfNetFlow"><?= h($currencySymbol) ?>0.00</span>
                </div>
                <div class="statement-total large">
                    <span>Closing Cash &amp; Bank Balance</span>
                    <span class="amount" id="cfClosingBalance"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Balance Sheet Tab -->
    <div class="tab-pane" id="tab-balance_sheet">
        <div class="report-header">
            <h3>Balance Sheet</h3>
            <p class="report-period" id="bsPeriod">As at <span id="bsAsOfDate"></span></p>
        </div>
        
        <div class="financial-statement balance-sheet">
            <div class="bs-column">
                <div class="statement-section">
                    <div class="statement-header">ASSETS</div>
                    
                    <div class="statement-subheader">Current Assets</div>
                    <div class="statement-line">
                        <span>Cash on Hand</span>
                        <span class="amount" id="bsCash"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-line">
                        <span>Bank Accounts</span>
                        <span class="amount" id="bsBank"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-line">
                        <span>Accounts Receivable</span>
                        <span class="amount" id="bsAR"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-line">
                        <span>Inventory</span>
                        <span class="amount" id="bsInventory"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-subtotal">
                        <span>Total Current Assets</span>
                        <span class="amount" id="bsTotalCurrentAssets"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    
                    <div class="statement-total large">
                        <span>TOTAL ASSETS</span>
                        <span class="amount" id="bsTotalAssets"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                </div>
            </div>
            
            <div class="bs-column">
                <div class="statement-section">
                    <div class="statement-header">LIABILITIES</div>
                    
                    <div class="statement-subheader">Current Liabilities</div>
                    <div class="statement-line">
                        <span>Accounts Payable</span>
                        <span class="amount" id="bsAP"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-subtotal">
                        <span>Total Current Liabilities</span>
                        <span class="amount" id="bsTotalLiabilities"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                </div>
                
                <div class="statement-section">
                    <div class="statement-header">EQUITY</div>
                    <div class="statement-line">
                        <span>Owner's Capital</span>
                        <span class="amount" id="bsOwnerCapital"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-line">
                        <span>Retained Earnings</span>
                        <span class="amount" id="bsRetainedEarnings"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-line">
                        <span>Current Period Profit/(Loss)</span>
                        <span class="amount" id="bsCurrentProfit"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                    <div class="statement-line">
                        <span>Less: Drawings</span>
                        <span class="amount" id="bsDrawings">(<?= h($currencySymbol) ?>0.00)</span>
                    </div>
                    <div class="statement-subtotal">
                        <span>Total Equity</span>
                        <span class="amount" id="bsTotalEquity"><?= h($currencySymbol) ?>0.00</span>
                    </div>
                </div>
                
                <div class="statement-total large">
                    <span>TOTAL LIABILITIES &amp; EQUITY</span>
                    <span class="amount" id="bsTotalLiabilitiesEquity"><?= h($currencySymbol) ?>0.00</span>
                </div>
            </div>
        </div>
        
        <div class="balance-check" id="balanceCheck">
            <span class="balance-status"></span>
        </div>
    </div>
    
    <!-- General Ledger Tab -->
    <div class="tab-pane" id="tab-ledger">
        <div class="report-header">
            <h3>General Ledger</h3>
            <p class="report-subtitle">Double-Entry Transaction Register</p>
        </div>
        
        <div class="ledger-filters">
            <select id="ledgerAccountFilter" class="form-control">
                <option value="">All Accounts</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="AR">Accounts Receivable</option>
                <option value="AP">Accounts Payable</option>
                <option value="Sales">Sales Revenue</option>
                <option value="Purchases">Purchases/COGS</option>
                <option value="Expenses">Expenses</option>
                <option value="Owner">Owner's Equity</option>
            </select>
        </div>
        
        <div class="table-container">
            <table class="data-table ledger-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Ref#</th>
                        <th>Description</th>
                        <th>Account</th>
                        <th class="text-right">Debit</th>
                        <th class="text-right">Credit</th>
                        <th class="text-right">Balance</th>
                    </tr>
                </thead>
                <tbody id="ledgerTableBody">
                    <tr><td colspan="7" class="text-center">Select an account or generate report</td></tr>
                </tbody>
                <tfoot>
                    <tr class="ledger-totals">
                        <td colspan="4"><strong>Totals</strong></td>
                        <td class="text-right"><strong id="ledgerTotalDebit"><?= h($currencySymbol) ?>0.00</strong></td>
                        <td class="text-right"><strong id="ledgerTotalCredit"><?= h($currencySymbol) ?>0.00</strong></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>
    
    <!-- Receivables Tab -->
    <div class="tab-pane" id="tab-receivables">
        <div class="report-header">
            <h3>Accounts Receivable Aging</h3>
        </div>
        
        <div class="aging-summary">
            <div class="aging-bucket">
                <span class="bucket-label">Current (0-30)</span>
                <span class="bucket-value" id="ar0_30"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket">
                <span class="bucket-label">31-60 Days</span>
                <span class="bucket-value warning" id="ar31_60"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket">
                <span class="bucket-label">61-90 Days</span>
                <span class="bucket-value danger" id="ar61_90"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket">
                <span class="bucket-label">Over 90 Days</span>
                <span class="bucket-value critical" id="ar90plus"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket total">
                <span class="bucket-label">Total Outstanding</span>
                <span class="bucket-value" id="arTotal"><?= h($currencySymbol) ?>0.00</span>
            </div>
        </div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Invoice#</th>
                        <th>Date</th>
                        <th class="text-right">Amount</th>
                        <th class="text-right">Paid</th>
                        <th class="text-right">Outstanding</th>
                        <th>Days</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="receivablesTableBody">
                    <tr><td colspan="8" class="text-center">No outstanding receivables</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- Payables Tab -->
    <div class="tab-pane" id="tab-payables">
        <div class="report-header">
            <h3>Accounts Payable Aging</h3>
        </div>
        
        <div class="aging-summary">
            <div class="aging-bucket">
                <span class="bucket-label">Current (0-30)</span>
                <span class="bucket-value" id="ap0_30"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket">
                <span class="bucket-label">31-60 Days</span>
                <span class="bucket-value warning" id="ap31_60"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket">
                <span class="bucket-label">61-90 Days</span>
                <span class="bucket-value danger" id="ap61_90"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket">
                <span class="bucket-label">Over 90 Days</span>
                <span class="bucket-value critical" id="ap90plus"><?= h($currencySymbol) ?>0.00</span>
            </div>
            <div class="aging-bucket total">
                <span class="bucket-label">Total Outstanding</span>
                <span class="bucket-value" id="apTotal"><?= h($currencySymbol) ?>0.00</span>
            </div>
        </div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Supplier</th>
                        <th>Bill#</th>
                        <th>Date</th>
                        <th class="text-right">Amount</th>
                        <th class="text-right">Paid</th>
                        <th class="text-right">Outstanding</th>
                        <th>Days</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="payablesTableBody">
                    <tr><td colspan="8" class="text-center">No outstanding payables</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
</div>

<script>
window.AppConfig = {
    csrfToken: '<?= h(Auth::csrfToken()) ?>',
    businessId: <?= (int)$businessId ?>,
    currencySymbol: '<?= addslashes($currencySymbol) ?>'
};
</script>

<?php include __DIR__ . '/includes/footer.php'; ?>
