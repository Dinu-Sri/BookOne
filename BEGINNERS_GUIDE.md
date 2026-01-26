# BookOne - Beginner's Guide to Entering Transactions

No accounting experience needed! This guide explains everything in simple terms.

---

## 📚 The Basics: What is a Transaction?

A **transaction** is any money event in your business:
- Money coming IN (sales, payments received)
- Money going OUT (purchases, expenses, payments made)
- Money moving BETWEEN accounts (transfers)

---

## 🎯 The 7 Transaction Types

### 1. 💰 SALE - You Sold Something

**When to use:** You sold a product or service to a customer.

**Examples:**
- Sold a website to a client for Rs. 50,000
- Sold 10 t-shirts for Rs. 5,000
- Provided consulting service for Rs. 15,000

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Sale |
| Date | When the sale happened |
| Party | Customer name (who bought it) |
| Amount | Total sale amount |
| Payment Method | How they paid (see below) |
| Category | Type of income (Sales Revenue, Service Revenue, etc.) |
| Description | What you sold |
| Invoice Ref | Your invoice number (optional) |

**Payment Method choices:**

| Choose This | When... |
|-------------|---------|
| **Cash** | Customer paid cash immediately |
| **Bank** | Customer transferred to your bank immediately |
| **Card** | Customer paid by card immediately |
| **Online** | Customer paid via PayPal, etc. immediately |
| **Credit** | Customer will pay LATER (on credit) |

> 💡 **Tip:** If customer pays immediately, choose Cash/Bank/Card. If they'll pay later (like in 30 days), choose **Credit**.

---

### 2. 🛒 PURCHASE - You Bought Something for Resale/Business

**When to use:** You bought inventory, raw materials, or goods to sell.

**Examples:**
- Bought 100 t-shirts from supplier for Rs. 30,000
- Purchased computer parts for Rs. 45,000
- Bought raw materials for manufacturing

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Purchase |
| Date | When you bought it |
| Party | Supplier name (who you bought from) |
| Amount | Total purchase amount |
| Payment Method | How you paid |
| Category | Usually "Cost of Goods Sold" |
| Description | What you bought |
| Bill Ref | Supplier's bill number (optional) |

**Payment Method:**
- **Cash/Bank/Card** = You paid immediately
- **Credit** = You'll pay the supplier later

---

### 3. 📝 EXPENSE - Business Running Costs

**When to use:** You paid for something that's NOT for resale - just running the business.

**Examples:**
- Paid electricity bill Rs. 3,000
- Paid office rent Rs. 25,000
- Bought office supplies Rs. 2,000
- Paid for advertising Rs. 5,000
- Paid employee salary Rs. 40,000

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Expense |
| Date | When you paid/incurred |
| Party | Who you paid (CEB, landlord, etc.) |
| Amount | How much |
| Payment Method | How you paid |
| Category | Type of expense (Rent, Utilities, Salaries, etc.) |
| Description | What it was for |

> 💡 **Purchase vs Expense:**
> - **Purchase** = Things you BUY to SELL (inventory, materials)
> - **Expense** = Costs to RUN the business (rent, salaries, utilities)

---

### 4. 📥 RECEIVE - Money Coming In

**When to use:** You received money from a customer (especially for a past sale).

**Examples:**
- Customer ABC paid Rs. 25,000 for last month's invoice
- Collected partial payment Rs. 10,000 from a customer
- Received advance payment for future work

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Receive |
| Date | When you received the money |
| Party | Who paid you |
| Amount | How much you received |
| Payment Method | How they paid (Cash/Bank/Card/Online) |
| Source Document | Link to the original Sale (if applicable) |
| Description | Payment details |

**Source Document:** This is important! If this payment is for a specific invoice:
1. Click the Source Document dropdown
2. Select the original Sale transaction
3. This links the payment to the invoice and marks it as paid

> 💡 **When do you need RECEIVE?**
> - If you made a **Credit** sale earlier, use Receive when customer pays
> - If customer pays in **multiple parts**, use Receive for each payment
> - If you made a Cash/Bank sale, system auto-creates Receive (you don't need to)

---

### 5. 📤 PAY - Money Going Out

**When to use:** You're paying a supplier for a past purchase.

**Examples:**
- Paid supplier Rs. 30,000 for last week's purchase
- Made partial payment Rs. 15,000 to supplier
- Paid outstanding bill

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Pay |
| Date | When you paid |
| Party | Who you paid |
| Amount | How much you paid |
| Payment Method | How you paid (Cash/Bank) |
| Source Document | Link to the original Purchase (if applicable) |
| Description | Payment details |

> 💡 **When do you need PAY?**
> - If you made a **Credit** purchase earlier, use Pay when you pay supplier
> - If you pay in **multiple parts**, use Pay for each payment
> - If you made a Cash/Bank purchase, system auto-creates Pay (you don't need to)

---

### 6. 🔄 TRANSFER - Moving Money Between Accounts

**When to use:** Moving money between your own accounts.

**Examples:**
- Deposited cash into bank account
- Withdrew cash from bank
- Moved money between bank accounts

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Transfer |
| Date | When you transferred |
| Amount | How much |
| From Account | Where money came FROM (Cash or Bank) |
| To Account | Where money went TO (Cash or Bank) |
| Description | Reason for transfer |

> 💡 **Transfer doesn't change your total money** - it just moves it from one place to another.

---

### 7. 👤 OWNER - Owner's Personal Transactions

**When to use:** Owner putting money in or taking money out.

**Examples:**
- Owner invested Rs. 100,000 into business
- Owner withdrew Rs. 20,000 for personal use
- Owner paid business expense from personal funds

**How to enter:**

| Field | What to Enter |
|-------|---------------|
| Type | Owner |
| Date | When it happened |
| Party | Owner's name |
| Amount | How much |
| Payment Method | Cash/Bank |
| Category | Owner Equity (investment) or Owner Drawings (withdrawal) |
| Description | Investment or withdrawal |

**For Investment (money IN):**
- Category: Owner Equity
- Description: "Capital investment" or "Owner investment"

**For Withdrawal (money OUT):**
- Category: Owner Drawings  
- Description: "Owner withdrawal" or "Personal drawings"

---

## 🔄 Understanding Auto-Settlement

**What is it?**
When you enter a Sale/Purchase/Expense with immediate payment, the system automatically creates a second transaction to record the cash movement.

**Example:**
```
You enter: Sale, Rs. 5,000, Cash
System creates:
  1. Sale Rs. 5,000 (records the revenue)
  2. Receive Rs. 5,000 (records the cash coming in) ← AUTO
```

**Why?**
This keeps proper accounting records. Don't delete the auto-created transactions!

**How to identify:**
- Shows "Auto-settlement for Sale #X" in description
- Has a link icon or reference to the original transaction

---

## 📋 Common Scenarios

### Scenario 1: Customer Buys and Pays Cash

**Just enter ONE transaction:**
- Type: Sale
- Payment Method: Cash
- ✅ System handles the rest

---

### Scenario 2: Customer Buys on Credit (Will Pay Later)

**Step 1 - When they buy:**
- Type: Sale
- Payment Method: **Credit**
- (No cash changes hands yet)

**Step 2 - When they pay (days/weeks later):**
- Type: Receive
- Link to the original Sale
- Now your cash increases

---

### Scenario 3: Customer Pays in Multiple Parts

**Step 1 - Sale:**
- Type: Sale
- Amount: Rs. 50,000
- Payment Method: Credit

**Step 2 - First payment:**
- Type: Receive
- Amount: Rs. 20,000
- Link to the Sale

**Step 3 - Second payment:**
- Type: Receive
- Amount: Rs. 30,000
- Link to the Sale

---

### Scenario 4: You Buy Supplies and Pay Immediately

**Just enter ONE transaction:**
- Type: Purchase (if for resale) or Expense (if for business use)
- Payment Method: Cash or Bank
- ✅ System handles the rest

---

### Scenario 5: You Buy on Credit, Pay Later

**Step 1 - When you buy:**
- Type: Purchase
- Payment Method: **Credit**

**Step 2 - When you pay:**
- Type: Pay
- Link to the original Purchase

---

### Scenario 6: Pay Monthly Salary

- Type: Expense
- Party: Employee name
- Amount: Salary amount
- Payment Method: Bank (if bank transfer) or Cash
- Category: Salaries & Wages
- Description: "January 2026 salary"

---

### Scenario 7: Owner Puts Money into Business

- Type: Owner
- Party: Your name
- Amount: Investment amount
- Payment Method: Bank
- Category: Owner Equity
- Description: "Capital investment"

---

### Scenario 8: Deposit Daily Cash Sales to Bank

- Type: Transfer
- Amount: Cash amount
- From Account: Cash
- To Account: Bank
- Description: "Daily cash deposit"

---

## ❓ Quick Decision Guide

**"I received money"**
- From customer for a sale? → **Sale** (if new) or **Receive** (if for past sale)
- Owner putting money in? → **Owner**

**"I paid money"**
- For something to sell? → **Purchase**
- For business costs? → **Expense**
- To a supplier for past purchase? → **Pay**
- Owner taking money out? → **Owner**
- Moving between my accounts? → **Transfer**

---

## 🎯 Tips for Success

1. **Enter transactions daily** - Don't let them pile up
2. **Be consistent with names** - Always spell "ABC Company" the same way
3. **Use descriptions** - Future you will thank you
4. **Link payments to invoices** - Helps track who owes what
5. **Choose correct categories** - Makes reports meaningful
6. **Don't delete auto-settlements** - They're supposed to be there!

---

## 📊 What the Reports Show

After entering transactions:

| Report | Shows You |
|--------|-----------|
| **Dashboard** | Cash on hand, bank balance, total receivables/payables |
| **Sales Report** | All sales, who owes you money |
| **Purchases Report** | All purchases, who you owe money to |
| **P&L (Profit & Loss)** | Revenue minus expenses = your profit |
| **Cash Flow** | Where cash came from and went to |
| **Balance Sheet** | Overall financial position |

---

*Happy bookkeeping! 📚*
*BookOne - Simple Accounting for Sri Lankan Businesses*
