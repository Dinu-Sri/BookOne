/**
 * Clossyan Basic Books - JavaScript
 * Ultra-minimal, vanilla JS
 */

(function() {
    'use strict';
    
    // Global state
    const state = {
        currentPage: 1,
        filters: {},
        editingId: null,
        deleteId: null
    };
    
    // Utility functions
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);
    const getCurrencySymbol = () => (window.AppConfig && window.AppConfig.currencySymbol) || '$';
    const formatMoney = (n) => getCurrencySymbol() + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const h = (str) => {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    };
    
    // Toast notifications
    function showToast(message, type = 'info') {
        const container = $('#toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    }
    
    // API helper
    async function api(url, options = {}) {
        const defaults = {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        };
        
        if (options.body && !(options.body instanceof FormData)) {
            defaults.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        
        try {
            const response = await fetch(url, { ...defaults, ...options });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }
            
            return data;
        } catch (error) {
            showToast(error.message, 'error');
            throw error;
        }
    }
    
    // Modal functions
    function openModal(modalId) {
        const modal = $('#' + modalId);
        if (modal) modal.classList.add('show');
    }
    
    function closeModal(modalId) {
        const modal = $('#' + modalId);
        if (modal) {
            modal.classList.remove('show');
            const form = $('form', modal);
            if (form) form.reset();
        }
    }
    
    // Initialize modal close handlers
    function initModals() {
        $$('.modal').forEach(modal => {
            // Close on overlay click
            const overlay = $('.modal-overlay', modal);
            if (overlay) {
                overlay.addEventListener('click', () => modal.classList.remove('show'));
            }
            
            // Close button
            const closeBtn = $('.modal-close', modal);
            if (closeBtn) {
                closeBtn.addEventListener('click', () => modal.classList.remove('show'));
            }
        });
        
        // Cancel buttons
        $$('[id$="Cancel"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) modal.classList.remove('show');
            });
        });
    }
    
    // Tab handling
    function initTabs() {
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                
                // Update buttons
                $$('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update panes
                $$('.tab-pane').forEach(p => p.classList.remove('active'));
                const pane = $('#tab-' + tabId);
                if (pane) pane.classList.add('active');
                
                // Load data for tab if needed
                if (typeof loadTabData === 'function') {
                    loadTabData(tabId);
                }
            });
        });
    }
    
    // Sidebar toggle
    function initSidebar() {
        const toggle = $('#menuToggle');
        const sidebar = $('#sidebar');
        
        if (toggle && sidebar) {
            toggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
            
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (sidebar.classList.contains('open') && 
                    !sidebar.contains(e.target) && 
                    !toggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            });
        }
    }
    
    // ============================================
    // TRANSACTIONS PAGE
    // ============================================
    
    function initTransactionsPage() {
        if (!$('#transactionsTable')) return;
        
        // Load transactions
        loadTransactions();
        
        // Add new button (legacy - keeping for backwards compatibility)
        $('#btnAddNew')?.addEventListener('click', () => {
            openNewTransaction('Sale');
        });
        
        // Transaction form
        $('#transactionForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveTransaction();
        });
        
        // Filters
        $('#filtersForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            state.currentPage = 1;
            updateFilters();
            loadTransactions();
        });
        
        $('#btnClearFilters')?.addEventListener('click', () => {
            $('#filtersForm').reset();
            state.filters = {};
            state.currentPage = 1;
            loadTransactions();
        });
        
        // Auto-settlement checkbox - immediate reload
        $('#showAutoSettlements')?.addEventListener('change', () => {
            state.currentPage = 1;
            updateFilters();
            loadTransactions();
        });
        
        // Delete confirmation
        $('#btnConfirmDelete')?.addEventListener('click', deleteTransaction);
        $('#btnCancelDelete')?.addEventListener('click', () => closeModal('deleteModal'));
        $('#deleteModalClose')?.addEventListener('click', () => closeModal('deleteModal'));
        
        // Remove receipt button
        $('#btnRemoveReceipt')?.addEventListener('click', () => {
            $('#txnReceipt').value = '';
            $('#currentReceipt').style.display = 'none';
            // Add hidden field to mark for removal
            let removeField = $('#transactionForm').querySelector('input[name="remove_receipt"]');
            if (!removeField) {
                removeField = document.createElement('input');
                removeField.type = 'hidden';
                removeField.name = 'remove_receipt';
                $('#transactionForm').appendChild(removeField);
            }
            removeField.value = '1';
        });
    }
    
    function updateFilters() {
        state.filters = {
            date_from: $('#dateFrom')?.value || '',
            date_to: $('#dateTo')?.value || '',
            type: $('#filterType')?.value || '',
            payment_method: $('#filterPayment')?.value || '',
            status: $('#filterStatus')?.value || '',
            search: $('#filterSearch')?.value || '',
            show_auto: $('#showAutoSettlements')?.checked ? '1' : ''
        };
    }
    
    async function loadTransactions() {
        const params = new URLSearchParams({
            ...state.filters,
            page: state.currentPage
        });
        
        try {
            const data = await api(`api/transactions.php?action=list&${params}`);
            renderTransactions(data.data);
            renderPagination(data.pagination);
            updateTotals(data.totals);
        } catch (e) {
            console.error('Failed to load transactions:', e);
        }
    }
    
    function renderTransactions(transactions) {
        const tbody = $('#transactionsBody');
        if (!tbody) return;
        
        if (!transactions.length) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center">No transactions found</td></tr>';
            return;
        }
        
        tbody.innerHTML = transactions.map(t => `
            <tr data-id="${t.id}">
                <td>${h(t.date)}</td>
                <td><span class="type-badge type-${t.type.toLowerCase()}">${h(t.type)}</span></td>
                <td>${h(t.party || '-')}</td>
                <td>${h(t.description || '-')}</td>
                <td>${h(t.payment_method)}</td>
                <td class="col-amount">${formatMoney(t.amount)}</td>
                <td>${h(t.category_name || '-')}</td>
                <td>${h(t.invoice_or_bill_ref || '-')}</td>
                <td><span class="status status-${t.status.toLowerCase()}">${h(t.status)}</span></td>
                <td class="col-receipt">${t.receipt_file ? `<a href="api/receipt.php?id=${t.id}" target="_blank" class="receipt-link">📎</a>` : ''}</td>
                <td class="col-actions">
                    <div class="action-btns">
                        <button class="action-btn edit" onclick="editTransaction(${t.id})">Edit</button>
                        <button class="action-btn delete" onclick="confirmDelete(${t.id})">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    function renderPagination(pagination) {
        const container = $('#pagination');
        if (!container || !pagination) return;
        
        const { current_page, total_pages } = pagination;
        
        if (total_pages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        
        // Previous button
        html += `<button ${current_page === 1 ? 'disabled' : ''} onclick="goToPage(${current_page - 1})">‹</button>`;
        
        // Page numbers
        const range = 2;
        for (let i = 1; i <= total_pages; i++) {
            if (i === 1 || i === total_pages || (i >= current_page - range && i <= current_page + range)) {
                html += `<button class="${i === current_page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
            } else if (i === current_page - range - 1 || i === current_page + range + 1) {
                html += '<button disabled>...</button>';
            }
        }
        
        // Next button
        html += `<button ${current_page === total_pages ? 'disabled' : ''} onclick="goToPage(${current_page + 1})">›</button>`;
        
        container.innerHTML = html;
    }
    
    function updateTotals(totals) {
        if (!totals) return;
        $('#totalIncome').textContent = formatMoney(totals.income);
        $('#totalExpense').textContent = formatMoney(totals.expense);
        $('#totalNet').textContent = formatMoney(totals.net);
        $('#totalNet').className = 'total-value ' + (totals.net >= 0 ? 'income' : 'expense');
        $('#totalCount').textContent = totals.count;
    }
    
    window.goToPage = function(page) {
        state.currentPage = page;
        loadTransactions();
    };
    
    // Open new transaction with pre-selected type
    window.openNewTransaction = function(type) {
        state.editingId = null;
        $('#transactionForm')?.reset();
        $('#modalTitle').textContent = 'Add ' + type;
        $('#txnId').value = '';
        $('#txnDate').value = new Date().toISOString().split('T')[0];
        $('#txnType').value = type;
        $('#txnDepartment').value = window.AppConfig?.departmentId || '';
        $('#currentReceipt').style.display = 'none';
        
        // Trigger type change to show/hide relevant fields
        $('#txnType').dispatchEvent(new Event('change'));
        
        openModal('transactionModal');
    };
    
    window.editTransaction = async function(id) {
        try {
            const data = await api(`api/transactions.php?action=get&id=${id}`);
            const t = data.data;
            
            state.editingId = id;
            $('#modalTitle').textContent = 'Edit Transaction';
            $('#txnId').value = t.id;
            $('#txnDate').value = t.date;
            $('#txnType').value = t.type;
            $('#txnParty').value = t.party || '';
            $('#txnAmount').value = t.amount;
            $('#txnDescription').value = t.description || '';
            $('#txnPaymentMethod').value = t.payment_method;
            $('#txnCategory').value = t.category_id || '';
            $('#txnRef').value = t.invoice_or_bill_ref || '';
            $('#txnStatus').value = t.status;
            $('#txnLinkId').value = t.link_id || '';
            $('#txnDepartment').value = t.department_id || '';
            $('#txnNotes').value = t.notes || '';
            
            // Receipt
            const currentReceipt = $('#currentReceipt');
            if (t.receipt_file) {
                $('#receiptName').textContent = t.receipt_file.split('/').pop();
                currentReceipt.style.display = 'flex';
            } else {
                currentReceipt.style.display = 'none';
            }
            
            // Remove the remove_receipt field if it exists
            const removeField = $('#transactionForm').querySelector('input[name="remove_receipt"]');
            if (removeField) removeField.value = '0';
            
            openModal('transactionModal');
        } catch (e) {
            console.error('Failed to load transaction:', e);
        }
    };
    
    window.confirmDelete = function(id) {
        state.deleteId = id;
        openModal('deleteModal');
    };
    
    async function saveTransaction() {
        const form = $('#transactionForm');
        const formData = new FormData(form);
        
        try {
            const data = await api('api/transactions.php?action=save', {
                method: 'POST',
                body: formData
            });
            
            showToast(data.message, 'success');
            closeModal('transactionModal');
            loadTransactions();
        } catch (e) {
            console.error('Failed to save transaction:', e);
        }
    }
    
    async function deleteTransaction() {
        if (!state.deleteId) return;
        
        const formData = new FormData();
        formData.append('id', state.deleteId);
        formData.append('csrf_token', window.AppConfig?.csrfToken || '');
        
        try {
            const data = await api('api/transactions.php?action=delete', {
                method: 'POST',
                body: formData
            });
            
            showToast(data.message, 'success');
            closeModal('deleteModal');
            loadTransactions();
        } catch (e) {
            console.error('Failed to delete transaction:', e);
        }
        
        state.deleteId = null;
    }
    
    // ============================================
    // REPORTS PAGE
    // ============================================
    
    function initReportsPage() {
        if (!$('#tab-dashboard')) return;
        
        // Set default dates (current financial year or month)
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        $('#reportDateFrom').value = firstDay.toISOString().split('T')[0];
        $('#reportDateTo').value = now.toISOString().split('T')[0];
        $('#reportAsOfDate') && ($('#reportAsOfDate').value = now.toISOString().split('T')[0]);
        
        // Load initial data
        loadReportData('dashboard');
        
        // Generate button
        $('#btnGenerateReport')?.addEventListener('click', () => {
            const activeTab = $('.tab-btn.active')?.dataset.tab || 'dashboard';
            loadReportData(activeTab);
        });
        
        // Export button
        $('#btnExportReport')?.addEventListener('click', exportReport);
        
        // Print button
        $('#btnPrintReport')?.addEventListener('click', () => window.print());
        
        // Tab change handler
        document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                // Show/hide as-of date for balance sheet
                const asOfGroup = $('#asOfDateGroup');
                if (asOfGroup) {
                    asOfGroup.style.display = tab === 'balance_sheet' ? 'block' : 'none';
                }
            });
        });
        
        // Ledger account filter
        $('#ledgerAccountFilter')?.addEventListener('change', () => {
            loadReportData('ledger');
        });
        
        // Tab data loading
        window.loadTabData = loadReportData;
    }
    
    async function loadReportData(tab) {
        const dateFrom = $('#reportDateFrom')?.value || '';
        const dateTo = $('#reportDateTo')?.value || '';
        const asOfDate = $('#reportAsOfDate')?.value || dateTo;
        const ledgerAccount = $('#ledgerAccountFilter')?.value || '';
        
        const params = new URLSearchParams({ from: dateFrom, to: dateTo, as_of: asOfDate });
        if (ledgerAccount) params.append('account', ledgerAccount);
        
        try {
            switch (tab) {
                case 'dashboard':
                    const dash = await api(`api/reports.php?action=dashboard&${params}`);
                    if (dash.success && dash.data) {
                        const d = dash.data;
                        $('#dashRevenue').textContent = formatMoney(d.profit_loss?.revenue || 0);
                        const totalExp = (d.profit_loss?.cogs || 0) + (d.profit_loss?.operating_expenses || 0);
                        $('#dashExpenses').textContent = formatMoney(totalExp);
                        $('#dashNetProfit').textContent = formatMoney(d.profit_loss?.net_profit || 0);
                        $('#dashNetProfit').className = 'card-value ' + ((d.profit_loss?.net_profit || 0) >= 0 ? 'income' : 'expense');
                        const grossMargin = d.profit_loss?.revenue > 0 
                            ? ((d.profit_loss.gross_profit / d.profit_loss.revenue) * 100).toFixed(1) 
                            : 0;
                        $('#dashGrossMargin').textContent = grossMargin + '%';
                        $('#dashCash').textContent = formatMoney(d.balances?.cash || 0);
                        $('#dashBank').textContent = formatMoney(d.balances?.bank || 0);
                        $('#dashAR').textContent = formatMoney(d.balances?.ar || 0);
                        $('#dashAP').textContent = formatMoney(d.balances?.ap || 0);
                    }
                    break;
                
                case 'sales':
                    const sales = await api(`api/reports.php?action=sales&${params}`);
                    if (sales.success && sales.data) {
                        const s = sales.data;
                        $('#salesPeriod').textContent = `For the period ${dateFrom} to ${dateTo}`;
                        $('#salesTotalAmount').textContent = formatMoney(s.summary?.total_amount || 0);
                        $('#salesTotalCount').textContent = s.summary?.count || 0;
                        $('#salesReceived').textContent = formatMoney(s.summary?.total_received || 0);
                        $('#salesOutstanding').textContent = formatMoney(s.summary?.total_outstanding || 0);
                        
                        const tbody = $('#salesTableBody');
                        if (tbody && s.transactions) {
                            if (s.transactions.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No sales found</td></tr>';
                            } else {
                                tbody.innerHTML = s.transactions.map(t => `
                                    <tr>
                                        <td>${h(t.date)}</td>
                                        <td>${h(t.invoice_or_bill_ref || '-')}</td>
                                        <td>${h(t.party || '-')}</td>
                                        <td>${h(t.category_name || '-')}</td>
                                        <td class="text-right">${formatMoney(t.amount)}</td>
                                        <td><span class="badge badge-${t.status === 'Paid' ? 'success' : t.status === 'Part' ? 'warning' : 'danger'}">${t.status}</span></td>
                                        <td>${h(t.payment_method || '-')}</td>
                                    </tr>
                                `).join('');
                            }
                        }
                    }
                    break;
                
                case 'purchases':
                    const purch = await api(`api/reports.php?action=purchases&${params}`);
                    if (purch.success && purch.data) {
                        const p = purch.data;
                        $('#purchasesPeriod').textContent = `For the period ${dateFrom} to ${dateTo}`;
                        $('#purchasesTotalAmount').textContent = formatMoney(p.summary?.total_amount || 0);
                        $('#purchasesTotalCount').textContent = p.summary?.count || 0;
                        $('#purchasesPaid').textContent = formatMoney(p.summary?.total_paid || 0);
                        $('#purchasesOutstanding').textContent = formatMoney(p.summary?.total_outstanding || 0);
                        
                        const tbody = $('#purchasesTableBody');
                        if (tbody && p.transactions) {
                            if (p.transactions.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No purchases found</td></tr>';
                            } else {
                                tbody.innerHTML = p.transactions.map(t => `
                                    <tr>
                                        <td>${h(t.date)}</td>
                                        <td>${h(t.invoice_or_bill_ref || '-')}</td>
                                        <td>${h(t.party || '-')}</td>
                                        <td>${h(t.category_name || '-')}</td>
                                        <td class="text-right">${formatMoney(t.amount)}</td>
                                        <td><span class="badge badge-${t.status === 'Paid' ? 'success' : t.status === 'Part' ? 'warning' : 'danger'}">${t.status}</span></td>
                                        <td>${h(t.payment_method || '-')}</td>
                                    </tr>
                                `).join('');
                            }
                        }
                    }
                    break;
                
                case 'expenses':
                    const exp = await api(`api/reports.php?action=expenses&${params}`);
                    if (exp.success && exp.data) {
                        const e = exp.data;
                        $('#expensesPeriod').textContent = `For the period ${dateFrom} to ${dateTo}`;
                        $('#expensesTotalAmount').textContent = formatMoney(e.summary?.total_amount || 0);
                        $('#expensesTotalCount').textContent = e.summary?.count || 0;
                        
                        // Expenses by category
                        const catBody = $('#expensesCategoryBody');
                        if (catBody && e.by_category) {
                            if (e.by_category.length === 0) {
                                catBody.innerHTML = '<tr><td colspan="3" class="text-center">No expenses found</td></tr>';
                            } else {
                                catBody.innerHTML = e.by_category.map(c => `
                                    <tr>
                                        <td>${h(c.category)}</td>
                                        <td class="text-right">${formatMoney(c.total)}</td>
                                        <td class="text-right">${c.percentage}%</td>
                                    </tr>
                                `).join('');
                            }
                        }
                        
                        // All expense transactions
                        const tbody = $('#expensesTableBody');
                        if (tbody && e.transactions) {
                            if (e.transactions.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No expenses found</td></tr>';
                            } else {
                                tbody.innerHTML = e.transactions.map(t => `
                                    <tr>
                                        <td>${h(t.date)}</td>
                                        <td>${h(t.description || t.party || '-')}</td>
                                        <td>${h(t.category_name || '-')}</td>
                                        <td class="text-right">${formatMoney(t.amount)}</td>
                                        <td>${h(t.payment_method || '-')}</td>
                                    </tr>
                                `).join('');
                            }
                        }
                    }
                    break;
                    
                case 'profit_loss':
                    const pl = await api(`api/reports.php?action=profit_loss&${params}`);
                    if (pl.success && pl.data) {
                        const p = pl.data;
                        $('#plPeriod').textContent = `For the period ${dateFrom} to ${dateTo}`;
                        $('#plSalesRevenue').textContent = formatMoney(p.summary?.revenue || 0);
                        $('#plOtherIncome').textContent = formatMoney(0);
                        $('#plTotalRevenue').textContent = formatMoney(p.summary?.revenue || 0);
                        $('#plOpeningStock').textContent = formatMoney(p.cogs?.opening_stock || 0);
                        $('#plPurchases').textContent = formatMoney(p.cogs?.purchases || 0);
                        $('#plClosingStock').textContent = '(' + formatMoney(p.cogs?.closing_stock || 0) + ')';
                        $('#plCOGS').textContent = formatMoney(p.summary?.cogs || 0);
                        $('#plGrossProfit').textContent = formatMoney(p.summary?.gross_profit || 0);
                        // Expenses by category
                        const expList = $('#plExpensesList');
                        if (expList && p.expenses_by_category) {
                            expList.innerHTML = p.expenses_by_category.map(e => `
                                <div class="statement-line">
                                    <span>${h(e.category || 'Uncategorized')}</span>
                                    <span class="amount">${formatMoney(e.amount)}</span>
                                </div>
                            `).join('');
                        }
                        $('#plTotalExpenses').textContent = formatMoney(p.summary?.operating_expenses || 0);
                        $('#plNetProfit').textContent = formatMoney(p.summary?.net_profit || 0);
                        const netProfitEl = $('#plNetProfit');
                        if (netProfitEl) {
                            netProfitEl.style.color = (p.summary?.net_profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
                        }
                    }
                    break;
                    
                case 'cash_flow':
                    const cf = await api(`api/reports.php?action=cash_flow&${params}`);
                    if (cf.success && cf.data) {
                        const c = cf.data;
                        $('#cfPeriod').textContent = `For the period ${dateFrom} to ${dateTo}`;
                        $('#cfReceiptsCustomers').textContent = formatMoney(c.cash_in?.from_customers || 0);
                        $('#cfOwnerContributions').textContent = formatMoney(c.cash_in?.owner_contributions || 0);
                        $('#cfOtherReceipts').textContent = formatMoney(c.cash_in?.other || 0);
                        $('#cfTotalIn').textContent = formatMoney(c.cash_in?.total || 0);
                        $('#cfPaymentsSuppliers').textContent = formatMoney(c.cash_out?.to_suppliers || 0);
                        $('#cfExpensesPaid').textContent = formatMoney(c.cash_out?.expenses || 0);
                        $('#cfOwnerDrawings').textContent = formatMoney(c.cash_out?.drawings || 0);
                        $('#cfTotalOut').textContent = formatMoney(c.cash_out?.total || 0);
                        const netFlow = (c.cash_in?.total || 0) - (c.cash_out?.total || 0);
                        $('#cfNetCashFlow').textContent = formatMoney(netFlow);
                        $('#cfNetFlow').textContent = formatMoney(netFlow);
                        $('#cfOpeningBalance').textContent = formatMoney(c.opening_balance || 0);
                        $('#cfClosingBalance').textContent = formatMoney(c.closing_balance || 0);
                    }
                    break;
                    
                case 'balance_sheet':
                    const bs = await api(`api/reports.php?action=balance_sheet&${params}`);
                    if (bs.success && bs.data) {
                        const b = bs.data;
                        $('#bsAsOfDate').textContent = b.as_of;
                        $('#bsCash').textContent = formatMoney(b.assets?.cash || 0);
                        $('#bsBank').textContent = formatMoney(b.assets?.bank || 0);
                        $('#bsAR').textContent = formatMoney(b.assets?.accounts_receivable || 0);
                        $('#bsInventory').textContent = formatMoney(b.assets?.inventory || 0);
                        $('#bsTotalCurrentAssets').textContent = formatMoney(b.assets?.total || 0);
                        $('#bsTotalAssets').textContent = formatMoney(b.assets?.total || 0);
                        $('#bsAP').textContent = formatMoney(b.liabilities?.accounts_payable || 0);
                        $('#bsTotalLiabilities').textContent = formatMoney(b.liabilities?.total || 0);
                        $('#bsOwnerCapital').textContent = formatMoney(b.equity?.opening_balances || 0);
                        $('#bsRetainedEarnings').textContent = formatMoney(b.equity?.owner_contributions || 0);
                        $('#bsCurrentProfit').textContent = formatMoney(b.equity?.retained_earnings || 0);
                        $('#bsDrawings').textContent = '(' + formatMoney(0) + ')';
                        $('#bsTotalEquity').textContent = formatMoney(b.equity?.total || 0);
                        $('#bsTotalLiabilitiesEquity').textContent = formatMoney((b.liabilities?.total || 0) + (b.equity?.total || 0));
                        // Balance check
                        const checkEl = $('#balanceCheck');
                        if (checkEl) {
                            if (b.balance_check) {
                                checkEl.className = 'balance-check balanced';
                                checkEl.innerHTML = '<span class="balance-status">✓ Balance Sheet is balanced</span>';
                            } else {
                                checkEl.className = 'balance-check unbalanced';
                                const diff = (b.assets?.total || 0) - (b.liabilities?.total || 0) - (b.equity?.total || 0);
                                checkEl.innerHTML = `<span class="balance-status">⚠ Difference: ${formatMoney(diff)}</span>`;
                            }
                        }
                    }
                    break;
                    
                case 'ledger':
                    const ledger = await api(`api/reports.php?action=ledger&${params}`);
                    if (ledger.success && ledger.data) {
                        const l = ledger.data;
                        const tbody = $('#ledgerTableBody');
                        if (tbody) {
                            if (!l.entries || l.entries.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No transactions found</td></tr>';
                            } else {
                                tbody.innerHTML = l.entries.map(e => `
                                    <tr>
                                        <td>${h(e.date)}</td>
                                        <td>${h(e.ref)}</td>
                                        <td>${h(e.description)}</td>
                                        <td>${h(e.account)}</td>
                                        <td class="text-right">${e.debit > 0 ? formatMoney(e.debit) : ''}</td>
                                        <td class="text-right">${e.credit > 0 ? formatMoney(e.credit) : ''}</td>
                                        <td class="text-right">${formatMoney(e.balance)}</td>
                                    </tr>
                                `).join('');
                            }
                        }
                        $('#ledgerTotalDebit').textContent = formatMoney(l.totals?.debit || 0);
                        $('#ledgerTotalCredit').textContent = formatMoney(l.totals?.credit || 0);
                    }
                    break;
                    
                case 'receivables':
                    const ar = await api(`api/reports.php?action=ar_aging&${params}`);
                    if (ar.success && ar.data) {
                        const a = ar.data;
                        $('#ar0_30').textContent = formatMoney(a.summary?.['0-30'] || 0);
                        $('#ar31_60').textContent = formatMoney(a.summary?.['31-60'] || 0);
                        $('#ar61_90').textContent = formatMoney(a.summary?.['61-90'] || 0);
                        $('#ar90plus').textContent = formatMoney(a.summary?.['90+'] || 0);
                        $('#arTotal').textContent = formatMoney(a.total || 0);
                        const tbody = $('#receivablesTableBody');
                        if (tbody && a.details) {
                            if (a.details.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No outstanding receivables</td></tr>';
                            } else {
                                tbody.innerHTML = a.details.map(r => `
                                    <tr>
                                        <td>${h(r.party || 'Unknown')}</td>
                                        <td>${h(r.invoice_or_bill_ref || '-')}</td>
                                        <td>${h(r.invoice_date)}</td>
                                        <td class="text-right">${formatMoney(r.invoice_amount)}</td>
                                        <td class="text-right">${formatMoney(r.paid_amount)}</td>
                                        <td class="text-right">${formatMoney(r.outstanding)}</td>
                                        <td>${r.days_old} days</td>
                                        <td><button class="btn btn-sm" onclick="recordPayment(${r.id}, 'Receive')">Record Payment</button></td>
                                    </tr>
                                `).join('');
                            }
                        }
                    }
                    break;
                    
                case 'payables':
                    const ap = await api(`api/reports.php?action=ap_aging&${params}`);
                    if (ap.success && ap.data) {
                        const a = ap.data;
                        $('#ap0_30').textContent = formatMoney(a.summary?.['0-30'] || 0);
                        $('#ap31_60').textContent = formatMoney(a.summary?.['31-60'] || 0);
                        $('#ap61_90').textContent = formatMoney(a.summary?.['61-90'] || 0);
                        $('#ap90plus').textContent = formatMoney(a.summary?.['90+'] || 0);
                        $('#apTotal').textContent = formatMoney(a.total || 0);
                        const tbody = $('#payablesTableBody');
                        if (tbody && a.details) {
                            if (a.details.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No outstanding payables</td></tr>';
                            } else {
                                tbody.innerHTML = a.details.map(r => `
                                    <tr>
                                        <td>${h(r.party || 'Unknown')}</td>
                                        <td>${h(r.invoice_or_bill_ref || '-')}</td>
                                        <td>${h(r.bill_date)}</td>
                                        <td class="text-right">${formatMoney(r.bill_amount)}</td>
                                        <td class="text-right">${formatMoney(r.paid_amount)}</td>
                                        <td class="text-right">${formatMoney(r.outstanding)}</td>
                                        <td>${r.days_old} days</td>
                                        <td><button class="btn btn-sm" onclick="recordPayment(${r.id}, 'Pay')">Make Payment</button></td>
                                    </tr>
                                `).join('');
                            }
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error('Failed to load report data:', e);
            showToast('Failed to load report: ' + e.message, 'error');
        }
    }
    
    // Record payment helper (redirect to transactions with pre-filled data)
    window.recordPayment = function(docId, type) {
        // For now, redirect to transactions page
        window.location.href = `index.php?action=add&type=${type}&source_doc_id=${docId}`;
    };
    
    function renderReportTable(tbodyId, data, columns, isSummary = false) {
        const tbody = $('#' + tbodyId);
        if (!tbody) return;
        
        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center">No data</td></tr>`;
            return;
        }
        
        const moneyFields = ['amount', 'total', 'total_amount', 'received', 'paid', 'outstanding'];
        
        tbody.innerHTML = data.map(row => {
            const cells = columns.map(col => {
                let value = row[col];
                if (moneyFields.includes(col)) {
                    value = formatMoney(value);
                } else if (col === 'status') {
                    value = `<span class="status status-${(value || '').toLowerCase()}">${h(value)}</span>`;
                } else {
                    value = h(value || '-');
                }
                return `<td>${value}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
    }
    
    function renderBalancesTable(transactions) {
        const tbody = $('#balancesTableBody');
        if (!tbody) return;
        
        if (!transactions || !transactions.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No data</td></tr>';
            return;
        }
        
        const incomeTypes = ['Sale', 'Receive'];
        
        tbody.innerHTML = transactions.map(t => {
            const isIncome = incomeTypes.includes(t.type);
            return `
                <tr>
                    <td>${h(t.date)}</td>
                    <td>${h(t.type)}</td>
                    <td>${h(t.party || '-')}</td>
                    <td>${h(t.description || '-')}</td>
                    <td>${h(t.payment_method)}</td>
                    <td class="income">${isIncome ? formatMoney(t.amount) : '-'}</td>
                    <td class="expense">${!isIncome ? formatMoney(t.amount) : '-'}</td>
                </tr>
            `;
        }).join('');
    }
    
    function exportReport() {
        const dateFrom = $('#reportDateFrom')?.value || '';
        const dateTo = $('#reportDateTo')?.value || '';
        const activeTab = $('.tab-btn.active')?.dataset.tab || 'summary';
        
        let type = 'transactions';
        if (activeTab === 'sales') type = 'sales';
        else if (activeTab === 'purchases') type = 'purchases';
        else if (activeTab === 'expenses') type = 'expenses';
        
        const params = new URLSearchParams({
            type,
            date_from: dateFrom,
            date_to: dateTo,
            csrf_token: window.AppConfig?.csrfToken || ''
        });
        
        window.location.href = `api/export.php?${params}`;
    }
    
    // ============================================
    // SETTINGS PAGE
    // ============================================
    
    function initSettingsPage() {
        if (!$('#tab-profile')) return;
        
        // Profile form
        $('#profileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            try {
                const data = await api('api/settings.php?entity=profile', {
                    method: 'POST',
                    body: formData
                });
                showToast(data.message, 'success');
            } catch (e) {
                console.error('Failed to update profile:', e);
            }
        });
        
        // Password form
        $('#passwordForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            if (formData.get('new_password') !== formData.get('confirm_password')) {
                showToast('Passwords do not match', 'error');
                return;
            }
            
            try {
                const data = await api('api/settings.php?entity=password', {
                    method: 'POST',
                    body: formData
                });
                showToast(data.message, 'success');
                e.target.reset();
            } catch (e) {
                console.error('Failed to change password:', e);
            }
        });
        
        // Load settings data
        window.loadTabData = loadSettingsTabData;
        
        // Initialize CRUD for settings entities
        initSettingsCrud('users', 'user');
        initSettingsCrud('businesses', 'business');
        initSettingsCrud('departments', 'department');
        initSettingsCrud('categories', 'category');
        
        // Category filter buttons
        $$('.category-filters .btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.category-filters .btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadCategories(btn.dataset.filter);
            });
        });
        
        // Export form
        $('#exportForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const params = new URLSearchParams({
                type: formData.get('type'),
                date_from: formData.get('date_from'),
                date_to: formData.get('date_to'),
                csrf_token: window.AppConfig?.csrfToken || ''
            });
            window.location.href = `api/export.php?${params}`;
        });
    }
    
    function loadSettingsTabData(tab) {
        switch (tab) {
            case 'users':
                loadUsers();
                loadDepartmentsDropdown();
                break;
            case 'businesses':
                loadBusinesses();
                break;
            case 'departments':
                loadDepartments();
                break;
            case 'categories':
                loadCategories('all');
                break;
        }
    }
    
    function initSettingsCrud(entity, singular) {
        // Add button
        $(`#btnAdd${capitalize(singular)}`)?.addEventListener('click', () => {
            state.editingId = null;
            $(`#${singular}ModalTitle`).textContent = `Add ${capitalize(singular)}`;
            $(`#${singular}Id`).value = '';
            openModal(`${singular}Modal`);
        });
        
        // Form submit
        $(`#${singular}Form`)?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const id = formData.get('id');
            
            try {
                const data = await api(`api/settings.php?entity=${entity}&action=save`, {
                    method: 'POST',
                    body: formData
                });
                showToast(data.message, 'success');
                closeModal(`${singular}Modal`);
                loadSettingsTabData(entity);
            } catch (e) {
                console.error(`Failed to save ${singular}:`, e);
            }
        });
        
        // Cancel button
        $(`#${singular}Cancel`)?.addEventListener('click', () => closeModal(`${singular}Modal`));
        $(`#${singular}ModalClose`)?.addEventListener('click', () => closeModal(`${singular}Modal`));
    }
    
    async function loadUsers() {
        try {
            const data = await api('api/settings.php?entity=users&action=list');
            const tbody = $('#usersTableBody');
            if (!tbody) return;
            
            tbody.innerHTML = data.data.map(u => `
                <tr>
                    <td>${h(u.username)}</td>
                    <td>${h(u.name)}</td>
                    <td>${h(u.email || '-')}</td>
                    <td>${h(u.role)}</td>
                    <td>${h(u.department_name || '-')}</td>
                    <td><span class="status status-${u.active ? 'active' : 'inactive'}">${u.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn edit" onclick="editUser(${u.id})">Edit</button>
                            <button class="action-btn delete" onclick="deleteEntity('users', ${u.id})">Del</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Failed to load users:', e);
        }
    }
    
    async function loadDepartmentsDropdown() {
        try {
            const data = await api('api/settings.php?entity=departments&action=list');
            const select = $('#userDepartment');
            if (!select) return;
            
            select.innerHTML = '<option value="">-- Select --</option>' + 
                data.data.filter(d => d.active).map(d => 
                    `<option value="${d.id}">${h(d.name)}</option>`
                ).join('');
        } catch (e) {
            console.error('Failed to load departments:', e);
        }
    }
    
    window.editUser = async function(id) {
        try {
            const data = await api(`api/settings.php?entity=users&action=get&id=${id}`);
            const u = data.data;
            
            state.editingId = id;
            $('#userModalTitle').textContent = 'Edit User';
            $('#userId').value = u.id;
            $('#userUsername').value = u.username;
            $('#userPassword').value = '';
            $('#userName').value = u.name;
            $('#userEmail').value = u.email || '';
            $('#userRole').value = u.role;
            $('#userDepartment').value = u.department_id || '';
            $('input[name="active"]', $('#userForm')).checked = u.active;
            
            openModal('userModal');
        } catch (e) {
            console.error('Failed to load user:', e);
        }
    };
    
    async function loadBusinesses() {
        try {
            const data = await api('api/settings.php?entity=businesses&action=list');
            const tbody = $('#businessesTableBody');
            if (!tbody) return;
            
            tbody.innerHTML = data.data.map(b => `
                <tr>
                    <td>${h(b.name)}</td>
                    <td>${h(b.phone || '-')}</td>
                    <td>${h(b.email || '-')}</td>
                    <td>${h(b.tax_id || '-')}</td>
                    <td>${h(b.currency)}</td>
                    <td><span class="status status-${b.active ? 'active' : 'inactive'}">${b.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn edit" onclick="editBusiness(${b.id})">Edit</button>
                            <button class="action-btn delete" onclick="deleteEntity('businesses', ${b.id})">Del</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Failed to load businesses:', e);
        }
    }
    
    window.editBusiness = async function(id) {
        try {
            const data = await api(`api/settings.php?entity=businesses&action=get&id=${id}`);
            const b = data.data;
            
            state.editingId = id;
            $('#businessModalTitle').textContent = 'Edit Business';
            $('#businessId').value = b.id;
            $('#businessName').value = b.name;
            $('#businessAddress').value = b.address || '';
            $('#businessPhone').value = b.phone || '';
            $('#businessEmail').value = b.email || '';
            $('#businessTaxId').value = b.tax_id || '';
            $('#businessCurrency').value = b.currency || 'USD';
            $('#businessFiscalYear').value = b.financial_year_start || 1;
            $('#businessPeriodLock').value = b.period_lock_date || '';
            $('#businessUsesInventory').checked = b.uses_inventory == 1;
            $('input[name="active"]', $('#businessForm')).checked = b.active;
            
            openModal('businessModal');
        } catch (e) {
            console.error('Failed to load business:', e);
        }
    };
    
    async function loadDepartments() {
        try {
            const data = await api('api/settings.php?entity=departments&action=list');
            const tbody = $('#departmentsTableBody');
            if (!tbody) return;
            
            tbody.innerHTML = data.data.map(d => `
                <tr>
                    <td>${h(d.name)}</td>
                    <td><span class="status status-${d.active ? 'active' : 'inactive'}">${d.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn edit" onclick="editDepartment(${d.id})">Edit</button>
                            <button class="action-btn delete" onclick="deleteEntity('departments', ${d.id})">Del</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Failed to load departments:', e);
        }
    }
    
    window.editDepartment = async function(id) {
        try {
            const data = await api(`api/settings.php?entity=departments&action=get&id=${id}`);
            const d = data.data;
            
            state.editingId = id;
            $('#departmentModalTitle').textContent = 'Edit Department';
            $('#departmentId').value = d.id;
            $('#departmentName').value = d.name;
            $('input[name="active"]', $('#departmentForm')).checked = d.active;
            
            openModal('departmentModal');
        } catch (e) {
            console.error('Failed to load department:', e);
        }
    };
    
    async function loadCategories(filter = 'all') {
        try {
            const data = await api(`api/settings.php?entity=categories&action=list&filter=${filter}`);
            const tbody = $('#categoriesTableBody');
            if (!tbody) return;
            
            tbody.innerHTML = data.data.map(c => `
                <tr>
                    <td>${h(c.name)}</td>
                    <td>${h(c.type)}</td>
                    <td><span class="status status-${c.active ? 'active' : 'inactive'}">${c.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn edit" onclick="editCategory(${c.id})">Edit</button>
                            <button class="action-btn delete" onclick="deleteEntity('categories', ${c.id})">Del</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Failed to load categories:', e);
        }
    }
    
    window.editCategory = async function(id) {
        try {
            const data = await api(`api/settings.php?entity=categories&action=get&id=${id}`);
            const c = data.data;
            
            state.editingId = id;
            $('#categoryModalTitle').textContent = 'Edit Category';
            $('#categoryId').value = c.id;
            $('#categoryName').value = c.name;
            $('#categoryType').value = c.type;
            $('input[name="active"]', $('#categoryForm')).checked = c.active;
            
            openModal('categoryModal');
        } catch (e) {
            console.error('Failed to load category:', e);
        }
    };
    
    window.deleteEntity = async function(entity, id) {
        if (!confirm('Are you sure you want to delete this item?')) return;
        
        const formData = new FormData();
        formData.append('id', id);
        formData.append('csrf_token', window.AppConfig?.csrfToken || '');
        
        try {
            const data = await api(`api/settings.php?entity=${entity}&action=delete`, {
                method: 'POST',
                body: formData
            });
            showToast(data.message, 'success');
            loadSettingsTabData(entity);
        } catch (e) {
            console.error(`Failed to delete ${entity}:`, e);
        }
    };
    
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    // ============================================
    // INITIALIZATION
    // ============================================
    
    document.addEventListener('DOMContentLoaded', () => {
        initModals();
        initTabs();
        initSidebar();
        initTransactionsPage();
        initReportsPage();
        initSettingsPage();
    });
})();

// Language switcher function (global)
function switchLanguage(lang) {
    fetch('api/language.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: 'lang=' + encodeURIComponent(lang)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Reload page to apply new language
            window.location.reload();
        } else {
            alert(data.error || 'Failed to change language');
        }
    })
    .catch(error => {
        console.error('Language switch error:', error);
        alert('Failed to change language');
    });
}

// Department switcher function (global)
function switchDepartment(deptId) {
    fetch('api/department.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: 'department_id=' + encodeURIComponent(deptId)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Reload page to apply new department context
            window.location.reload();
        } else {
            alert(data.error || 'Failed to switch department');
        }
    })
    .catch(error => {
        console.error('Department switch error:', error);
        alert('Failed to switch department');
    });
}
