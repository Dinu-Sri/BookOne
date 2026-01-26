# BookOne v1.3 - Accounting System Logic Documentation

**Document Version:** 1.3.1  
**System:** BookOne Accounting Software  
**Last Updated:** January 26, 2026  
**Verified Against Code:** January 26, 2026  
**For Accountant Review**

---

## Table of Contents
1. [System Overview](#system-overview)
2. [CRITICAL FIX: Double-Entry Generation](#critical-fix-double-entry-generation)
3. [Transaction Types & Journal Entries](#transaction-types--journal-entries)
4. [Chart of Accounts](#chart-of-accounts)
5. [Settlement Allocations (Multi-Invoice Payments)](#settlement-allocations)
6. [Inventory vs Service Business Mode](#inventory-vs-service-business-mode)
7. [Payment Account Tracking](#payment-account-tracking)
8. [Opening Balances](#opening-balances)
9. [Period Locking & Reversals](#period-locking--reversals)
10. [Profit & Loss Statement (Accrual)](#profit--loss-statement)
11. [Cash Flow Statement (Cash-Based)](#cash-flow-statement)
12. [Balance Sheet](#balance-sheet)
13. [AR & AP Aging Reports](#ar--ap-aging-reports)
14. [Audit Trail](#audit-trail)
15. [Automated Tests](#automated-tests)

---

## System Overview

BookOne v1.3 is a **proper double-entry accounting system** with:

- **Journal Entry Auto-Generation**: Every transaction creates balanced journal entries
- **Recognition vs Settlement**: Accrual P&L (recognition) + Cash Flow (settlement)
- **Multi-Invoice Payment Allocations**: Payments can be split across multiple invoices
- **Proper Payment Account Tracking**: Cash, Bank, Card Clearing, Online Wallet as separate accounts
- **Opening Balance Support**: Full balance sheet migration capability
- **Locked Period Reversals**: Audit-safe editing via reversals

### Critical v1.3 Fixes
1. **Recognition docs NEVER post Cash/Bank directly** - eliminates double-counting
2. **Settlement allocations** - supports unallocated payments and multi-invoice matching
3. **Payment accounts** - balances from proper GL accounts, not payment_method labels
4. **Opening balances** - enforces accounting equation (A = L + E)

---

## CRITICAL FIX: Double-Entry Generation

### The Problem (Before v1.3)
The previous system had a bug where:
- Recognition docs (Sale/Purchase/Expense) with immediate payment would:
  1. Post Cash/Bank directly from the recognition doc
  2. ALSO create an auto-settlement that posts Cash/Bank again
- This caused **double-counted cash** and **negative AR/AP**

### The Solution (v1.3)
**RULE: Recognition documents NEVER post to Cash/Bank accounts directly.**

| Transaction Type | ALWAYS Posts To | NEVER Posts To |
|-----------------|-----------------|----------------|
| Sale | AR, Revenue | Cash, Bank |
| Purchase | Inventory/DirectCost, AP | Cash, Bank |
| Expense | ExpenseAccount, AP | Cash, Bank |
| Receive | Cash/Bank, AR (or Deposits) | Revenue |
| Pay | AP (or Prepayments), Cash/Bank | Expense |

The auto-settlement mechanism handles the Cash/Bank posting:
```
Sale with Cash payment:
  1. Sale doc:    Dr AR 1000, Cr Revenue 1000  (recognition)
  2. Auto-Receive: Dr Cash 1000, Cr AR 1000    (settlement)
  
  Net effect: Dr Cash 1000, Cr Revenue 1000 ✓
  AR net effect: 0 ✓
```

### Auto-Settlement Behavior

When a recognition document (Sale/Purchase/Expense) is created with a non-Credit payment method:
- System automatically creates a corresponding settlement (Receive/Pay)
- Auto-settlements are flagged with `is_auto_settlement = 1`
- Auto-settlements are hidden from transaction list by default (can be shown via checkbox)
- Linked via `source_doc_id` and allocation record

| Recognition Type | Payment Method | Auto-Creates |
|-----------------|----------------|--------------|
| Sale | Cash/Bank/Card/Online | Receive |
| Sale | Credit | Nothing (manual settle later) |
| Purchase | Cash/Bank/Card/Online | Pay |
| Purchase | Credit | Nothing (manual settle later) |
| Expense | Cash/Bank/Card/Online | Pay |
| Expense | Credit | Nothing (manual settle later) |

---

## Transaction Types & Journal Entries

### A) Sale (Recognition)
```
Dr AccountsReceivable    [amount]
    Cr SalesRevenue              [amount]

Description: Records revenue and customer obligation
P&L Effect: Revenue increases (accrual)
Cash Effect: NONE (until Receive)
```

### B) Purchase (Recognition)
```
If uses_inventory = true AND category.is_inventory = true:
  Dr InventoryAsset        [amount]
      Cr AccountsPayable           [amount]

If uses_inventory = false OR category.is_inventory = false:
  Dr DirectCost/Expense    [amount]
      Cr AccountsPayable           [amount]

Description: Records purchase obligation
P&L Effect: Direct cost or deferred to COGS
Cash Effect: NONE (until Pay)
```

### C) Expense (Recognition)
```
Dr ExpenseAccount (by category)  [amount]
    Cr AccountsPayable                   [amount]

Description: Records expense obligation
P&L Effect: Expense increases (accrual)
Cash Effect: NONE (until Pay)
```

### D) Receive (Settlement)
```
ALLOCATED PORTION:
  Dr PaymentAccount (Cash/Bank/Card)  [allocated_amount]
      Cr AccountsReceivable                   [allocated_amount]

UNALLOCATED PORTION (advance/deposit):
  Dr PaymentAccount (Cash/Bank/Card)  [unallocated_amount]
      Cr CustomerDeposits (Liability)         [unallocated_amount]

Description: Records cash receipt and AR reduction
P&L Effect: NONE (already recognized via Sale)
Cash Effect: Increases cash/bank balance
```

### E) Pay (Settlement)
```
ALLOCATED PORTION:
  Dr AccountsPayable            [allocated_amount]
      Cr PaymentAccount (Cash/Bank)     [allocated_amount]

UNALLOCATED PORTION (prepayment):
  Dr SupplierPrepayments (Asset)  [unallocated_amount]
      Cr PaymentAccount (Cash/Bank)       [unallocated_amount]

Description: Records cash payment and AP reduction
P&L Effect: NONE (already recognized via Purchase/Expense)
Cash Effect: Decreases cash/bank balance
```

### F) Transfer (Movement)
```
Dr ToPaymentAccount      [amount]
    Cr FromPaymentAccount        [amount]

Description: Internal fund transfer
P&L Effect: NONE
Cash Effect: Reallocation between accounts
```

### G) Owner Transactions (Equity)
```
CONTRIBUTION (positive amount):
  Dr PaymentAccount (Cash/Bank)  [amount]
      Cr OwnerCapital                    [amount]

DRAWING (negative amount):
  Dr OwnerDrawings               [amount]
      Cr PaymentAccount (Cash/Bank)      [amount]

Description: Owner investment or withdrawal
P&L Effect: NONE (equity, not income/expense)
Cash Effect: Increases/Decreases cash
```

---

## Chart of Accounts

### Default Account Structure

| Code | Account Name | Type | Sub-Type | System |
|------|-------------|------|----------|--------|
| **Assets (1xxx)** |
| 1000 | Cash on Hand | Asset | Cash | Yes |
| 1010 | Bank Account | Asset | Bank | Yes |
| 1015 | Card Clearing | Asset | Bank | Yes |
| 1020 | Online Wallet | Asset | Bank | Yes |
| 1100 | Accounts Receivable | Asset | AR | Yes |
| 1150 | Supplier Prepayments | Asset | Prepayment | Yes |
| 1200 | Inventory | Asset | Inventory | Yes |
| **Liabilities (2xxx)** |
| 2000 | Accounts Payable | Liability | AP | Yes |
| 2050 | Customer Deposits | Liability | Deposit | Yes |
| **Equity (3xxx)** |
| 3000 | Owner Capital | Equity | Capital | Yes |
| 3100 | Owner Drawings | Equity | Drawings | Yes |
| 3200 | Retained Earnings | Equity | Retained | Yes |
| 3900 | Opening Balance Equity | Equity | Opening | Yes |
| **Revenue (4xxx)** |
| 4000 | Sales Revenue | Revenue | Sales | Yes |
| 4100 | Other Income | Revenue | Other | Yes |
| **Expenses (5xxx-6xxx)** |
| 5000 | Cost of Goods Sold | Expense | COGS | Yes |
| 5100 | Direct Costs | Expense | DirectCost | Yes |
| 6000 | Operating Expenses | Expense | Operating | Yes |
| 6100 | Rent & Utilities | Expense | Operating | No |
| 6200 | Salaries & Wages | Expense | Operating | No |

---

## Settlement Allocations

### Multi-Invoice Payment Support

A single Receive/Pay can now be allocated across multiple documents:

```
settlement_allocations table:
- settlement_id: The Receive/Pay transaction
- source_doc_id: The Sale/Purchase/Expense being settled
- allocated_amount: Amount applied to this document

Constraint: SUM(allocated_amount) <= settlement.amount
```

### Example: Customer pays Rs 10,000 against two invoices

```
Invoice A: Rs 6,000 outstanding
Invoice B: Rs 5,000 outstanding
Payment:   Rs 10,000 received

Allocations:
- Rs 6,000 -> Invoice A (fully paid)
- Rs 4,000 -> Invoice B (partial)

Invoice B remaining: Rs 1,000
```

### Unallocated Payments

| Scenario | Account | Type |
|----------|---------|------|
| Customer pays before invoice | CustomerDeposits | Liability |
| Supplier paid before bill | SupplierPrepayments | Asset |

When the invoice/bill is created, apply the deposit/prepayment via allocation.

---

## Inventory vs Service Business Mode

### Setting: `uses_inventory` (per business)

| Mode | uses_inventory | Purchase Behavior | COGS Calculation |
|------|----------------|-------------------|------------------|
| Service | false | Purchases → Direct Expense | N/A |
| Inventory | true | Inventory Purchases → Asset | Periodic method |

### Periodic COGS Calculation (Inventory Mode)

```
COGS = Opening Stock + Inventory Purchases − Closing Stock

Where:
- Opening Stock: From stock_adjustments (type='Opening')
- Inventory Purchases: Purchases with is_inventory=true category
- Closing Stock: From stock_adjustments (type='Closing')
```

**Important:** COGS is accurate only if closing stock is recorded via StockAdjust.

---

## Payment Account Tracking

### v1.3 Change: Account-Based Balances

Previously, balances were calculated by `payment_method` label (Cash/Bank).

Now, balances are calculated from proper `payment_account_id`:

```
transactions.payment_account_id → chart_of_accounts.id

Each Receive/Pay/Transfer links to a specific account for:
- More accurate per-account balances
- Support for multiple bank accounts
- Card clearing account tracking
- Online wallet separation
```

### Payment Method → Account Mapping (Migration)

| payment_method | Default Account |
|----------------|-----------------|
| Cash | 1000 - Cash on Hand |
| Bank | 1010 - Bank Account |
| Card | 1015 - Card Clearing |
| Online | 1020 - Online Wallet |

---

## Opening Balances

### Setup Requirement for Migrating Businesses

When migrating from another system, set opening balances for:
- Cash & Bank accounts
- Accounts Receivable (AR)
- Accounts Payable (AP)
- Inventory (if applicable)
- Customer Deposits (if any)
- Supplier Prepayments (if any)
- Equity (to balance)

### Accounting Equation Enforcement

```
Assets = Liabilities + Equity

At opening balance save:
1. Sum all Asset account balances
2. Sum all Liability account balances
3. Sum all Equity account balances
4. IF Assets ≠ Liabilities + Equity → REJECT SAVE

Difference must be posted to Opening Balance Equity (3900).
```

### Opening Entry Journal

Opening balances create a special journal entry:
```
journal_entries.is_opening_entry = 1
entry_date = balance_date (typically FY start)

All opening balances posted as:
- Assets: Debit
- Liabilities: Credit
- Equity: Credit
```

---

## Period Locking & Reversals

### Period Lock

Locked periods prevent direct edits to transactions.

```sql
period_balances:
- period (YYYY-MM)
- is_locked (boolean)
- locked_at (timestamp)
- locked_by (user_id)
```

### Reversal for Locked Periods

Instead of editing locked transactions:

1. Create a **Reversal Transaction** in the current open period
2. Reversal negates all journal lines (swap Dr/Cr)
3. Link reversal to original (`reversed_transaction_id`)
4. Create new correct transaction

```
Original (Jan 2025 - LOCKED):
  Sale #100: Dr AR 1000, Cr Revenue 1000

Reversal (Feb 2025 - OPEN):
  Reversal #105: Dr Revenue 1000, Cr AR 1000
  (references: reversed_transaction_id = 100)

Correction (Feb 2025 - OPEN):
  Sale #106: Dr AR 1200, Cr Revenue 1200
```

---

## Profit & Loss Statement

### Basis: Accrual (Recognition-Based)

**What's Included:**
- Revenue: Sales (all, regardless of payment status)
- COGS: If inventory mode (Opening + Purchases - Closing)
- Operating Expenses: Expense transactions + non-inventory Purchases

**What's EXCLUDED:**
- Receive transactions
- Pay transactions
- Transfer transactions
- Owner transactions

### Formula

```
Revenue            = SUM(Sale.amount) where voided=0
COGS               = OpeningStock + InventoryPurchases - ClosingStock (if inventory)
Gross Profit       = Revenue - COGS
Operating Expenses = SUM(Expense.amount) + SUM(non-inventory Purchase.amount)
Net Profit         = Gross Profit - Operating Expenses
```

---

## Cash Flow Statement

### Basis: Cash (Settlement-Based)

**What's Included:**
- Operating: Receive (inflows), Pay (outflows)
- Financing: Owner contributions/drawings
- Investing: (Future: asset purchases/sales)

**What's EXCLUDED:**
- Sale transactions (use Receive instead)
- Purchase/Expense transactions (use Pay instead)

### Formula

```
Operating Cash Flow:
  Inflows  = SUM(Receive.amount)
  Outflows = SUM(Pay.amount)
  Net      = Inflows - Outflows

Financing Cash Flow:
  Owner In  = SUM(Owner.amount where amount > 0)
  Owner Out = SUM(ABS(Owner.amount) where amount < 0)
  Net       = Owner In - Owner Out

Total Net Cash Change = Operating Net + Financing Net
```

---

## Balance Sheet

### Components

**Assets:**
- Current Assets:
  - Cash (sum of Cash account balances)
  - Bank (sum of Bank account balances)
  - Accounts Receivable (AR account balance)
  - Inventory (if uses_inventory, Inventory account balance)
  - Supplier Prepayments

**Liabilities:**
- Current Liabilities:
  - Accounts Payable (AP account balance)
  - Customer Deposits

**Equity:**
- Owner Capital (from Capital account)
- Owner Drawings (contra, from Drawings account)
- Retained Earnings (from Retained account)
- Note: Total Equity is derived as (Total Assets - Total Liabilities) to ensure balance

### Accounting Equation Check

```
Total Assets = Total Liabilities + Total Equity

If not balanced, indicates data integrity issue.
```

---

## AR & AP Aging Reports

### AR Aging (Accounts Receivable)

Groups outstanding Sales by age:

| Bucket | Days |
|--------|------|
| Current | Not yet due (if due_date set) |
| 1-30 | 1-30 days past due |
| 31-60 | 31-60 days past due |
| 61-90 | 61-90 days past due |
| 90+ | Over 90 days past due |

**Outstanding = Invoice Amount - SUM(Allocated Receive Amounts)**

### AP Aging (Accounts Payable)

Same structure for Purchases/Expenses.

**Outstanding = Bill Amount - SUM(Allocated Pay Amounts)**

---

## Audit Trail

### audit_log Table

Every create/update/void/reverse is logged:

```
- action: Create, Update, Void, Reverse, Lock, Unlock
- entity_type: transactions, journal_entries, etc.
- entity_id: The affected record ID
- old_values: JSON snapshot before change
- new_values: JSON snapshot after change
- user_id, ip_address, user_agent, timestamp
```

---

## Automated Tests

### Test File: tests/accounting_tests.php

Run tests via CLI or browser with `?run_tests=1`

| Test # | Name | Validates |
|--------|------|-----------|
| 1 | Journal Entry Balance | Every entry balances (Dr = Cr) |
| 2 | Sale Never Posts Cash | Sale → AR/Revenue only |
| 3 | Purchase Never Posts Cash | Purchase → Inv or Cost/AP only |
| 4 | Receive Posts Cash | Receive → Cash/Bank debit |
| 5 | Pay Posts Cash | Pay → Cash/Bank credit |
| 6 | Allocation Enforcement | sum(alloc) <= settlement |
| 7 | Unallocated Handling | Goes to Deposits/Prepayments |
| 8 | Opening Balance Equation | A = L + E enforced |
| 9 | Period Lock | Prevents locked period edits |
| 10 | P&L Excludes Settlements | No Receive/Pay in P&L |
| 11 | Cash Flow Settlements Only | Only Receive/Pay/Owner |
| 12 | Inventory COGS | Periodic calculation correct |

---

## File Structure (v1.3)

```
BookOne/
├── includes/
│   ├── accounting.php           # Core accounting functions (v1.3)
│   ├── functions.php            # Utility functions
│   └── auth.php                 # Authentication
├── api/
│   ├── transactions.php         # Transaction CRUD with journal generation
│   ├── reports.php              # All reports (P&L, Cash Flow, Balance Sheet, etc.)
│   ├── accounts.php             # Chart of accounts & opening balances
│   └── periods.php              # Period locking
├── migrations/
│   └── v1.3_accounting_fixes_corrected.sql # Database migration
├── tests/
│   └── accounting_tests.php     # Automated tests
├── ACCOUNTING_LOGIC.md          # This document
├── BEGINNERS_GUIDE.md           # User guide for new users
└── TEST_SCENARIOS.md            # Test transactions & expected results
```

---

## Migration Steps to v1.3

1. **Backup database**
2. **Run migration SQL**: `migrations/v1.3_accounting_fixes_corrected.sql`
3. **Run account initialization**: `CALL migrate_payment_methods();`
4. **Files already consolidated**: 
   - `accounting.php` (core accounting functions)
   - `transactions.php` (transaction API)
   - `reports.php` (all reports)
5. **Run tests**: `php tests/accounting_tests.php`
6. **Verify balances match** expected values

---

## Summary of v1.3 Changes

| Component | v1.1/1.2 | v1.3 |
|-----------|----------|------|
| Journal Generation | Partial (Cash from recognition) | Full (Recognition never touches Cash) |
| Auto-Settlements | Created but visible | Created & hidden by default (filterable) |
| Payment Tracking | payment_method label | payment_account_id (GL account) |
| Multi-Invoice Payments | Not supported | settlement_allocations table |
| Unallocated Payments | Not handled | CustomerDeposits/SupplierPrepayments |
| Opening Balances | Cash/Bank only | Full chart of accounts |
| Balance Calculation | Legacy formulas | Account-based GL balances |
| Locked Period Edits | Blocked | Reversal mechanism |
| Inventory Mode | Basic | Proper COGS with warnings |
| Automated Tests | None | 12 core accounting rules |

---

*Document prepared for accountant review. Verified against system code on January 26, 2026.*
*Questions and corrections welcome.*
