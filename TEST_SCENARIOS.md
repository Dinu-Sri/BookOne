# BookOne v1.3 - Test Scenarios for Clossyan Technologies

Use this document to validate the accounting system. Enter each transaction and verify the expected results.

---

## Starting Point

Before testing, verify your starting balances are all **ZERO** (or note your current balances and add them to expected results).

---

## SCENARIO 1: Credit Sale (No Immediate Payment)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Sale |
| Date | 2026-01-27 |
| Party | ABC Electronics |
| Amount | 25,000 LKR |
| Payment Method | Credit |
| Category | Sales Revenue |
| Description | Website development - Phase 1 |
| Invoice Ref | INV-001 |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 0 (unchanged)
- Bank Balance: 0 (unchanged)  
- AR (Receivables): +25,000
- Revenue: +25,000

**Sales Report:**
- ABC Electronics | INV-001 | 25,000 | Outstanding: 25,000 | Status: Unpaid

**P&L Report (Jan 2026):**
- Sales Revenue: 25,000
- Net Profit: 25,000

**Cash Flow:**
- Operating Activities: 0 (no cash received yet!)

---

## SCENARIO 2: Cash Sale (Immediate Payment)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Sale |
| Date | 2026-01-27 |
| Party | Walk-in Customer |
| Amount | 5,000 LKR |
| Payment Method | Cash |
| Category | Sales Revenue |
| Description | Logo design |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: +5,000
- AR (Receivables): 25,000 (unchanged from Scenario 1)
- Revenue: 30,000 (25,000 + 5,000)

**Note:** System creates auto-settlement (Receive) for 5,000

**Cash Flow:**
- Operating Activities: +5,000

---

## SCENARIO 3: Credit Purchase (No Immediate Payment)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Purchase |
| Date | 2026-01-27 |
| Party | Tech Suppliers Ltd |
| Amount | 15,000 LKR |
| Payment Method | Credit |
| Category | Cost of Goods Sold |
| Description | Computer parts for project |
| Bill Ref | BILL-001 |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 5,000 (unchanged)
- AP (Payables): +15,000
- Expenses: +15,000

**Purchases Report:**
- Tech Suppliers Ltd | BILL-001 | 15,000 | Outstanding: 15,000 | Status: Unpaid

**P&L Report (Jan 2026):**
- Sales Revenue: 30,000
- COGS: 15,000
- Net Profit: 15,000

**Cash Flow:**
- Operating Activities: 5,000 (unchanged - no cash paid yet!)

---

## SCENARIO 4: Bank Purchase (Immediate Payment)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Purchase |
| Date | 2026-01-27 |
| Party | Office Depot |
| Amount | 3,000 LKR |
| Payment Method | Bank |
| Category | Office Supplies |
| Description | Printer and paper |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 5,000 (unchanged)
- Bank Balance: -3,000
- AP (Payables): 15,000 (unchanged from Scenario 3)

**Note:** System creates auto-settlement (Pay) for 3,000

**P&L Report:**
- Sales Revenue: 30,000
- COGS: 15,000
- Office Supplies: 3,000
- Net Profit: 12,000

**Cash Flow:**
- Operating Activities: 5,000 - 3,000 = +2,000

---

## SCENARIO 5: Receive Payment (Partial - Settling Invoice)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Receive |
| Date | 2026-01-28 |
| Party | ABC Electronics |
| Amount | 10,000 LKR |
| Payment Method | Bank |
| Source Document | INV-001 (Sale #1) |
| Description | Partial payment for INV-001 |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 5,000 (unchanged)
- Bank Balance: -3,000 + 10,000 = +7,000
- AR (Receivables): 25,000 - 10,000 = 15,000

**Sales Report:**
- ABC Electronics | INV-001 | 25,000 | Paid: 10,000 | Outstanding: 15,000 | Status: Part

**Cash Flow:**
- Operating Activities: 2,000 + 10,000 = +12,000

**P&L Report:**
- Net Profit: 12,000 (unchanged - Receive doesn't affect P&L!)

---

## SCENARIO 6: Pay Supplier (Full Payment)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Pay |
| Date | 2026-01-28 |
| Party | Tech Suppliers Ltd |
| Amount | 15,000 LKR |
| Payment Method | Bank |
| Source Document | BILL-001 (Purchase #1) |
| Description | Full payment for BILL-001 |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 5,000 (unchanged)
- Bank Balance: 7,000 - 15,000 = -8,000
- AP (Payables): 15,000 - 15,000 = 0

**Purchases Report:**
- Tech Suppliers Ltd | BILL-001 | 15,000 | Paid: 15,000 | Outstanding: 0 | Status: Paid

**Cash Flow:**
- Operating Activities: 12,000 - 15,000 = -3,000

**P&L Report:**
- Net Profit: 12,000 (unchanged - Pay doesn't affect P&L!)

---

## SCENARIO 7: Expense (Immediate Cash Payment)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Expense |
| Date | 2026-01-28 |
| Party | Ceylon Electricity Board |
| Amount | 2,500 LKR |
| Payment Method | Cash |
| Category | Rent & Utilities |
| Description | January electricity bill |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 5,000 - 2,500 = 2,500
- Bank Balance: -8,000 (unchanged)

**P&L Report:**
- Sales Revenue: 30,000
- COGS: 15,000
- Office Supplies: 3,000
- Rent & Utilities: 2,500
- Net Profit: 9,500

**Cash Flow:**
- Operating Activities: -3,000 - 2,500 = -5,500

---

## SCENARIO 8: Transfer (Cash to Bank)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Transfer |
| Date | 2026-01-28 |
| Amount | 2,000 LKR |
| From Account | Cash |
| To Account | Bank |
| Description | Deposit cash to bank |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 2,500 - 2,000 = 500
- Bank Balance: -8,000 + 2,000 = -6,000
- Total Cash+Bank: 500 + (-6,000) = -5,500

**Note:** Transfer doesn't affect P&L or total cash position

---

## SCENARIO 9: Owner Investment

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Owner |
| Date | 2026-01-28 |
| Party | Owner Name |
| Amount | 50,000 LKR |
| Payment Method | Bank |
| Category | Owner Equity |
| Description | Capital investment |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 500 (unchanged)
- Bank Balance: -6,000 + 50,000 = 44,000

**Cash Flow:**
- Financing Activities: +50,000

**Balance Sheet:**
- Owner Capital: +50,000

---

## SCENARIO 10: Receive Final Payment (Complete Invoice)

### Transaction to Enter:
| Field | Value |
|-------|-------|
| Type | Receive |
| Date | 2026-01-29 |
| Party | ABC Electronics |
| Amount | 15,000 LKR |
| Payment Method | Cash |
| Source Document | INV-001 (Sale #1) |
| Description | Final payment for INV-001 |

### Expected Results After Entry:

**Dashboard:**
- Cash Balance: 500 + 15,000 = 15,500
- Bank Balance: 44,000 (unchanged)
- AR (Receivables): 15,000 - 15,000 = 0

**Sales Report:**
- ABC Electronics | INV-001 | 25,000 | Paid: 25,000 | Outstanding: 0 | Status: Paid

---

## FINAL VERIFICATION - Summary After All Scenarios

### Dashboard Balances:
| Account | Expected Balance |
|---------|-----------------|
| Cash | 15,500 LKR |
| Bank | 44,000 LKR |
| Total Cash+Bank | 59,500 LKR |
| Accounts Receivable | 0 LKR |
| Accounts Payable | 0 LKR |

### P&L Report (January 2026):
| Line Item | Amount |
|-----------|--------|
| **Revenue** | |
| Sales Revenue | 30,000 |
| **Total Revenue** | **30,000** |
| **Expenses** | |
| Cost of Goods Sold | 15,000 |
| Office Supplies | 3,000 |
| Rent & Utilities | 2,500 |
| **Total Expenses** | **20,500** |
| **Net Profit** | **9,500** |

### Cash Flow Report (January 2026):
| Section | Amount |
|---------|--------|
| **Operating Activities** | |
| Cash received from customers | 30,000 |
| Cash paid to suppliers | -18,000 |
| Cash paid for expenses | -2,500 |
| **Net Operating** | **9,500** |
| **Financing Activities** | |
| Owner investment | 50,000 |
| **Net Financing** | **50,000** |
| **Net Cash Change** | **59,500** |

### Balance Sheet (as of Jan 29, 2026):
| Account | Debit | Credit |
|---------|-------|--------|
| **Assets** | | |
| Cash | 15,500 | |
| Bank | 44,000 | |
| Accounts Receivable | 0 | |
| **Total Assets** | **59,500** | |
| **Liabilities** | | |
| Accounts Payable | | 0 |
| **Total Liabilities** | | **0** |
| **Equity** | | |
| Owner Capital | | 50,000 |
| Retained Earnings (Net Profit) | | 9,500 |
| **Total Equity** | | **59,500** |
| **Total L + E** | | **59,500** |

✅ **Accounting Equation Check:** Assets (59,500) = Liabilities (0) + Equity (59,500) ✓

---

## Transaction Entry Checklist

| # | Type | Party | Amount | Method | ✓ Entered | ✓ Verified |
|---|------|-------|--------|--------|-----------|------------|
| 1 | Sale | ABC Electronics | 25,000 | Credit | ☐ | ☐ |
| 2 | Sale | Walk-in Customer | 5,000 | Cash | ☐ | ☐ |
| 3 | Purchase | Tech Suppliers Ltd | 15,000 | Credit | ☐ | ☐ |
| 4 | Purchase | Office Depot | 3,000 | Bank | ☐ | ☐ |
| 5 | Receive | ABC Electronics | 10,000 | Bank | ☐ | ☐ |
| 6 | Pay | Tech Suppliers Ltd | 15,000 | Bank | ☐ | ☐ |
| 7 | Expense | Ceylon Electricity | 2,500 | Cash | ☐ | ☐ |
| 8 | Transfer | - | 2,000 | Cash→Bank | ☐ | ☐ |
| 9 | Owner | Owner Name | 50,000 | Bank | ☐ | ☐ |
| 10 | Receive | ABC Electronics | 15,000 | Cash | ☐ | ☐ |

---

## Troubleshooting

If numbers don't match:

1. **Cash balance wrong?** 
   - Check if auto-settlements were created for Cash sales/purchases/expenses
   - Transfer should move money between Cash and Bank

2. **P&L shows Receive/Pay amounts?**
   - BUG! Receive/Pay should NEVER appear in P&L
   - Only Sale, Purchase, Expense affect P&L

3. **Cash Flow shows Sale/Purchase directly?**
   - BUG! Cash Flow should only show settlements (Receive/Pay/Transfer)
   - Recognition documents should NOT appear in Cash Flow

4. **AR/AP not reducing after payment?**
   - Check if Source Document was linked correctly
   - Verify allocation was created in settlement_allocations table

---

*Test document for BookOne v1.3*
*Clossyan Technologies PVT LTD*
