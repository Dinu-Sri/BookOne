# BookOne v2 — Accounting Engine Design

**The "Simple Entry → Professional Accounting" Engine**

---

## 1. Core Philosophy

The current v1.x has the right architecture under the hood (double-entry journal, recognition vs settlement separation, settlement allocations). But the **user interface** still requires the user to think like an accountant — they must choose between 7 transaction types (Sale, Purchase, Expense, Receive, Pay, Transfer, Owner), pick the right category from a long dropdown, and understand payment method implications.

### The V2 Goal

> A business owner should be able to record "I sold something" or "I paid for something" in **3 fields, 1 click** — and the engine maps it to proper professional double-entry accounting behind the scenes.

The simplified UI captures the **business reality**. The engine translates it to **accounting reality**.

---

## 2. Current State Analysis (What v1.x Got Right)

### ✅ Strengths to Preserve

| Feature | Why It Works |
|---------|-------------|
| **Single `transactions` table** | One source of truth, not scattered across invoice/payment/bill tables |
| **Recognition vs Settlement separation** | Sale creates AR, Receive settles AR — this is *the* critical accounting correctness guarantee |
| **Auto-settlement** | When user pays immediately, system auto-creates the settlement — user doesn't need to know about AR/AP |
| **Settlement allocations** | Multi-invoice payments handled correctly |
| **Journal auto-generation** | Every transaction produces balanced journal entries automatically |
| **Audit trail** | Every mutation logged with old/new JSON |
| **Void (not delete)** | Transactions are voided, not deleted — audit integrity |

### ❌ Pain Points in Current UX

| Pain Point | Impact |
|------------|--------|
| **7 transaction types** | User must understand accounting concepts (Sale vs Receive, Purchase vs Pay) |
| **Long category dropdown** | 19 categories, user must find the right one |
| **Payment method selection** | User must decide Cash/Bank/Card/Online/Credit — and that choice has hidden accounting consequences |
| **Status field visible** | User sees "Paid/Partial/Unpaid" — this is derived, should be automatic |
| **No defaults/suggestions** | Every field is a blank slate every time |
| **Party field is plain text** | No autocomplete from past entries, no CRM link |
| **Transfer requires 2 account selectors** | Complex UI for a simple concept ("move money") |

---

## 3. The Simplified Entry Model

### 3.1 New Entry Types (Business Language, Not Accounting Language)

The user sees **4 verbs**, not 7 accounting types:

| User Sees | What They're Doing | Engine Maps To |
|-----------|-------------------|----------------|
| **💰 Money In** | I received money | → Sale (if from customer) or Receive (if payment for existing invoice) or Owner Contribution |
| **💸 Money Out** | I paid/spent money | → Purchase (if buying goods), Expense (if overhead), Pay (if paying bill), or Owner Drawings |
| **↔️ Move Money** | I moved money between accounts | → Transfer |
| **📋 Invoice/Bill** | I issued an invoice or got a bill (not paid yet) | → Sale (Credit) or Purchase (Credit) |

This maps to a **single entry form** that adapts based on context:

```
┌─────────────────────────────────────────┐
│  💰 What happened?                       │
│                                         │
│  ○ I received money                     │
│  ● I spent money                        │
│  ○ I moved money between accounts       │
│  ○ I created an invoice/bill (pay later)│
├─────────────────────────────────────────┤
│  👤 Who?              [Party name     ] │  ← Autocomplete from history
│                                         │
│  📝 What for?         [Description    ] │  ← Free text, engine infers category
│                                         │
│  💵 How much?         [$ 1,500.00     ] │
│                                         │
│  🏦 From/To account?  [Cash on Hand ▾ ] │  ← Auto-detected, pre-selected
│                                         │
│  📎 Receipt?          [📷 Take photo  ] │  ← Mobile-first: camera or upload
├─────────────────────────────────────────┤
│  Engine inferences:                      │
│  → Type: Expense (based on category)    │
│  → Category: Marketing (inferred)       │
│  → Journal: Dr Marketing 1500, Cr Cash  │
│                                         │
│           [ ✓ Record Expense ]          │
└─────────────────────────────────────────┘
```

### 3.2 What the Engine Handles Automatically

| User Action | Engine Decision | How |
|-------------|----------------|-----|
| Records "Money In" from "John" | Is this a Sale (new revenue) or Receive (existing invoice)? | Search for outstanding invoices from "John" → if found, allocate; if not, create Sale + auto-settle |
| Records "Money Out" for "Office Supplies" | Is this an Expense or Purchase? | Category "Office Supplies" is expense type → Expense. Category "Raw Materials" is inventory → Purchase |
| Chooses "Bank" as account | Map to correct GL account | Lookup `chart_of_accounts` by `sub_type = 'Bank'` |
| Writes "Facebook ads" as description | Infer category | NLP: "ads" → Marketing, "rent" → Rent, "salary" → Salaries |
| Takes photo of receipt | OCR → fill fields | Extract date, amount, vendor name, category hints from receipt image |

---

## 4. The Engine Architecture

### 4.1 Layer Model

```
┌──────────────────────────────────────────────────┐
│               SIMPLE UI LAYER                     │
│  (3-4 fields, mobile-first, no accounting terms)  │
├──────────────────────────────────────────────────┤
│              INFERENCE ENGINE                     │
│  ┌─────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Type    │ │ Category │ │ Account Resolution │  │
│  │ Mapper  │ │ Inferrer │ │ (Cash/Bank/etc)    │  │
│  └─────────┘ └──────────┘ └───────────────────┘  │
├──────────────────────────────────────────────────┤
│            TRANSACTION ORCHESTRATOR               │
│  (Creates entry, auto-settlements, allocations)   │
├──────────────────────────────────────────────────┤
│              JOURNAL ENGINE                       │
│  (Double-entry generation, recognition/settlement │
│   separation, balanced entry validation)          │
├──────────────────────────────────────────────────┤
│              PERSISTENCE LAYER                    │
│  (transactions, journal_entries, journal_lines,   │
│   settlement_allocations, audit_log)              │
└──────────────────────────────────────────────────┘
```

### 4.2 The Inference Engine (New in v2)

This is the key new component. It takes the simplified input and produces the full transaction data.

```typescript
// packages/accounting/src/inference/types.ts

interface SimpleEntry {
  direction: 'money_in' | 'money_out' | 'move_money' | 'invoice_bill';
  party: string;           // Who (customer/vendor/employee)
  description: string;     // What happened
  amount: number;          // How much
  accountId?: string;      // Which account (Cash, Bank, etc.) — auto-detected if omitted
  date?: string;           // Defaults to today
  receiptFile?: File;      // Optional receipt image
  // For move_money:
  fromAccountId?: string;
  toAccountId?: string;
  // For invoice_bill:
  isInvoice?: boolean;     // true = customer invoice, false = vendor bill
  dueDate?: string;
}

interface InferredTransaction {
  type: 'Sale' | 'Purchase' | 'Expense' | 'Receive' | 'Pay' | 'Transfer' | 'Owner';
  party: string;
  amount: number;
  categoryId: string | null;
  categoryConfidence: number;   // 0-1, how confident the inference is
  paymentMethod: 'Cash' | 'Bank' | 'Card' | 'Online' | 'Credit';
  paymentAccountId: string;
  description: string;
  invoiceRef: string | null;
  isAlreadySettled: boolean;    // true if payment is immediate (not Credit)
  linkToExistingDoc: string | null;  // If this settles an existing invoice/bill
  journalPreview: JournalLine[];     // Show user what will happen
}
```

### 4.3 Category Inference Engine

This is the most impactful UX improvement. Instead of a 19-item dropdown, the user types what they bought/sold, and the engine suggests.

```typescript
// packages/accounting/src/inference/category-inferrer.ts

interface CategoryRule {
  patterns: RegExp[];        // Regex patterns to match
  categoryId: string;        // Which category to assign
  defaultType: 'Sale' | 'Purchase' | 'Expense' | 'Owner';
  examples: string[];        // For AI suggestion display
}

// Tier 1: Fast regex rules (sub-ms, no AI needed)
const CATEGORY_RULES: CategoryRule[] = [
  {
    patterns: [/rent/i, /lease/i, /office space/i],
    categoryId: 'rent',
    defaultType: 'Expense',
    examples: ['Office rent', 'Warehouse lease payment']
  },
  {
    patterns: [/salary|wages|payroll|staff pay/i],
    categoryId: 'salaries',
    defaultType: 'Expense',
    examples: ['Staff salary', 'Contractor payment']
  },
  {
    patterns: [/electricity|water|internet|utility|phone bill/i],
    categoryId: 'utilities',
    defaultType: 'Expense',
    examples: ['Electricity bill', 'Internet payment']
  },
  {
    patterns: [/facebook|google ads|advertising|marketing|promot/i],
    categoryId: 'marketing',
    defaultType: 'Expense',
    examples: ['Facebook ads', 'Google Ads campaign']
  },
  {
    patterns: [/travel|transport|fuel|taxi|uber|bus/i],
    categoryId: 'travel',
    defaultType: 'Expense',
    examples: ['Taxi fare', 'Fuel for delivery']
  },
  {
    patterns: [/stationery|paper|pen|office supplies|printer/i],
    categoryId: 'office_supplies',
    defaultType: 'Expense',
    examples: ['Printer paper', 'Office stationery']
  },
  {
    patterns: [/insurance|policy|coverage/i],
    categoryId: 'insurance',
    defaultType: 'Expense',
    examples: ['Vehicle insurance', 'Business insurance']
  },
  {
    patterns: [/bank charge|bank fee|service charge/i],
    categoryId: 'bank_charges',
    defaultType: 'Expense',
    examples: ['Monthly account fee', 'Transfer fee']
  },
  {
    patterns: [/raw material|fabric|wood|steel|component/i],
    categoryId: 'direct_costs',
    defaultType: 'Purchase',
    examples: ['Raw materials', 'Manufacturing components']
  },
  {
    patterns: [/inventory|stock|goods for resale|merchandise/i],
    categoryId: 'cost_of_goods',
    defaultType: 'Purchase',
    examples: ['Inventory purchase', 'Stock for resale']
  },
  {
    patterns: [/owner|personal|drawing|contribution/i],
    categoryId: 'owner_equity',
    defaultType: 'Owner',
    examples: ['Owner contribution', 'Personal withdrawal']
  },
  {
    patterns: [/sale|sold|service fee|consulting|product sale/i],
    categoryId: 'sales_revenue',
    defaultType: 'Sale',
    examples: ['Product sale', 'Consulting service']
  },
];

// Tier 2: AI/NLP for unmatched descriptions (async, optional)
async function inferCategoryWithAI(
  description: string, 
  tenantCategories: Category[]
): Promise<InferredCategory> {
  // Use OpenAI embeddings or a local model to match description
  // to closest category name + examples
  // Falls back to "Miscellaneous" with low confidence
}

// Main inferrer
export function inferCategory(
  description: string,
  party: string,
  direction: SimpleDirection,
  tenantCategories: Category[]
): CategoryInference {
  // 1. Try regex rules first (fast, deterministic)
  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(description) || pattern.test(party)) {
        const category = tenantCategories.find(c => c.slug === rule.categoryId);
        if (category) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            confidence: 0.9,
            method: 'rule',
            suggestedType: rule.defaultType
          };
        }
      }
    }
  }
  
  // 2. Fall back to direction-based default
  if (direction === 'money_in') {
    const defaultRevenue = tenantCategories.find(c => c.type === 'income');
    return { categoryId: defaultRevenue?.id, confidence: 0.3, method: 'default' };
  }
  
  const defaultExpense = tenantCategories.find(c => c.type === 'expense' && c.slug === 'miscellaneous');
  return { categoryId: defaultExpense?.id, confidence: 0.3, method: 'default' };
}
```

### 4.4 Type Mapper

The user says "Money In" — the engine decides: Sale (new revenue) or Receive (payment for existing invoice).

```typescript
// packages/accounting/src/inference/type-mapper.ts

export async function mapDirectionToType(
  direction: SimpleDirection,
  party: string,
  amount: number,
  categoryInference: CategoryInference,
  tenantId: string
): Promise<TypeMapping> {
  
  switch (direction) {
    case 'money_in': {
      // 1. Check if there's an outstanding invoice from this party
      const outstandingInvoices = await findOutstandingInvoices(tenantId, party);
      
      if (outstandingInvoices.length > 0) {
        // This is a payment for an existing invoice → Receive
        return {
          type: 'Receive',
          isSettlement: true,
          suggestedAllocations: matchAmountToInvoices(amount, outstandingInvoices),
          isAlreadySettled: true
        };
      }
      
      // 2. Check category inference for Owner contribution keywords
      if (categoryInference.suggestedType === 'Owner') {
        return { type: 'Owner', isSettlement: false, isAlreadySettled: true };
      }
      
      // 3. Otherwise, this is new revenue → Sale + auto-settle
      return {
        type: 'Sale',
        isSettlement: false,
        isAlreadySettled: true,  // Money already received → auto-create Receive
        willAutoSettle: true
      };
    }
    
    case 'money_out': {
      // 1. Check if there's an outstanding bill from this party
      const outstandingBills = await findOutstandingBills(tenantId, party);
      
      if (outstandingBills.length > 0) {
        return {
          type: 'Pay',
          isSettlement: true,
          suggestedAllocations: matchAmountToInvoices(amount, outstandingBills),
          isAlreadySettled: true
        };
      }
      
      // 2. Check category inference for Owner drawing
      if (categoryInference.suggestedType === 'Owner') {
        return { type: 'Owner', isSettlement: false, isAlreadySettled: true };
      }
      
      // 3. Determine Expense vs Purchase based on category
      if (categoryInference.suggestedType === 'Purchase') {
        return {
          type: 'Purchase',
          isSettlement: false,
          isAlreadySettled: true,  // Paid immediately → auto-create Pay
          willAutoSettle: true
        };
      }
      
      // 4. Default: Expense
      return {
        type: 'Expense',
        isSettlement: false,
        isAlreadySettled: true,
        willAutoSettle: true
      };
    }
    
    case 'move_money': {
      return { type: 'Transfer', isSettlement: false, isAlreadySettled: true };
    }
    
    case 'invoice_bill': {
      // Credit transaction — not paid yet
      return {
        type: 'Sale',  // or 'Purchase' for bills
        isSettlement: false,
        isAlreadySettled: false,  // Will be settled later
        willAutoSettle: false,
        paymentMethod: 'Credit'
      };
    }
  }
}
```

---

## 5. The Transaction Orchestrator

This is the critical step — it takes the inferred data and creates everything atomically in a single DB transaction:

```typescript
// packages/accounting/src/orchestrator.ts

export async function executeSimpleEntry(
  entry: SimpleEntry,
  tenantId: string,
  userId: string
): Promise<TransactionResult> {
  
  // Step 1: Infer
  const category = await inferCategory(entry.description, entry.party, entry.direction);
  const typeMapping = await mapDirectionToType(entry.direction, entry.party, entry.amount, category);
  const paymentAccount = await resolveAccount(entry.accountId, entry.direction);
  
  // Step 2: Validate
  if (typeMapping.type === 'Transfer') {
    if (entry.fromAccountId === entry.toAccountId) {
      throw new UserError('Cannot transfer to the same account');
    }
  }
  
  // Step 3: Execute in single DB transaction
  return await db.transaction(async (tx) => {
    
    // 3a: Create the primary transaction
    const transaction = await tx.insert(transactions).values({
      tenantId,
      departmentId: entry.departmentId,
      userId,
      date: entry.date || new Date().toISOString().slice(0, 10),
      type: typeMapping.type,
      party: entry.party,
      amount: entry.amount.toString(),
      categoryId: category.categoryId,
      paymentMethod: typeMapping.isAlreadySettled ? resolvePaymentMethod(entry.accountId) : 'Credit',
      paymentAccountId: paymentAccount.id,
      description: entry.description,
      status: typeMapping.isAlreadySettled ? 'Complete' : 'Pending',
      isAutoSettlement: false,
    }).returning();
    
    // 3b: Generate journal entry
    const journalId = await generateJournalEntry(transaction, userId, tx);
    
    // 3c: If immediate payment, auto-create settlement
    if (typeMapping.willAutoSettle) {
      await createAutoSettlement(transaction, userId, paymentAccount.id, tx);
    }
    
    // 3d: If this is a settlement itself (Receive/Pay), create allocations
    if (typeMapping.suggestedAllocations) {
      for (const alloc of typeMapping.suggestedAllocations) {
        await createAllocation(transaction.id, alloc.docId, alloc.amount, userId, tx);
      }
    }
    
    // 3e: Handle receipt attachment
    if (entry.receiptFile) {
      await storeReceipt(entry.receiptFile, transaction.id, tenantId);
    }
    
    // 3f: Log audit
    await logAudit(tx, tenantId, userId, 'Create', 'transactions', transaction.id, null, transaction);
    
    // 3g: Invalidate caches
    await invalidateTenantCaches(tenantId);
    
    return {
      transaction,
      journalId,
      inferences: { category, typeMapping },
      warnings: generateWarnings(category, typeMapping)
    };
  });
}
```

---

## 6. Journal Engine (Ported from v1, Enhanced)

The core journal generation logic from `includes/accounting.php` ports directly to TypeScript:

```typescript
// packages/accounting/src/journal-engine.ts

export async function generateJournalEntry(
  transaction: Transaction,
  userId: string,
  tx: TransactionDb
): Promise<string> {
  
  const { tenantId, type, amount } = transaction;
  
  // Resolve all required GL accounts
  const accounts = await resolveGLAccounts(tenantId, tx);
  
  // Resolve payment account
  const paymentAccount = transaction.paymentAccountId 
    ? await getAccountById(transaction.paymentAccountId, tx)
    : await resolveDefaultAccount(tenantId, transaction.paymentMethod, tx);
  
  const lines: JournalLineInput[] = [];
  
  switch (type) {
    case 'Sale':
      // Dr AR, Cr Revenue — NEVER Cash
      lines.push(
        { accountId: accounts.AR.id, debit: amount, credit: 0, desc: `AR from Sale #${transaction.id}` },
        { accountId: accounts.Sales.id, debit: 0, credit: amount, desc: `Revenue from Sale #${transaction.id}` }
      );
      break;
      
    case 'Purchase':
      const isInventory = await isInventoryCategory(transaction.categoryId, tx);
      const debitAccount = isInventory ? accounts.Inventory : (accounts.DirectCost || accounts.Operating);
      lines.push(
        { accountId: debitAccount.id, debit: amount, credit: 0, desc: `Purchase #${transaction.id}` },
        { accountId: accounts.AP.id, debit: 0, credit: amount, desc: `AP from Purchase #${transaction.id}` }
      );
      break;
      
    case 'Expense':
      const expenseAccount = await getExpenseAccount(tenantId, transaction.categoryId, tx);
      lines.push(
        { accountId: expenseAccount.id, debit: amount, credit: 0, desc: `Expense #${transaction.id}` },
        { accountId: accounts.AP.id, debit: 0, credit: amount, desc: `AP from Expense #${transaction.id}` }
      );
      break;
      
    case 'Receive':
      // Dr Cash/Bank, Cr AR (or CustomerDeposits for unallocated)
      const receiveAllocated = await getAllocatedAmount(transaction.id, tx);
      const receiveUnallocated = amount - receiveAllocated;
      
      lines.push({ accountId: paymentAccount.id, debit: amount, credit: 0, desc: `Payment received #${transaction.id}` });
      
      if (receiveAllocated > 0) {
        lines.push({ accountId: accounts.AR.id, debit: 0, credit: receiveAllocated, desc: `AR reduction #${transaction.id}` });
      }
      if (receiveUnallocated > 0 && accounts.CustomerDeposits) {
        lines.push({ accountId: accounts.CustomerDeposits.id, debit: 0, credit: receiveUnallocated, desc: `Customer deposit #${transaction.id}` });
      }
      break;
      
    case 'Pay':
      const payAllocated = await getAllocatedAmount(transaction.id, tx);
      const payUnallocated = amount - payAllocated;
      
      if (payAllocated > 0) {
        lines.push({ accountId: accounts.AP.id, debit: payAllocated, credit: 0, desc: `AP reduction #${transaction.id}` });
      }
      if (payUnallocated > 0 && accounts.SupplierPrepayments) {
        lines.push({ accountId: accounts.SupplierPrepayments.id, debit: payUnallocated, credit: 0, desc: `Supplier prepayment #${transaction.id}` });
      }
      lines.push({ accountId: paymentAccount.id, debit: 0, credit: amount, desc: `Payment made #${transaction.id}` });
      break;
      
    case 'Transfer':
      const fromAccount = await getAccountById(transaction.fromAccountId, tx);
      const toAccount = await getAccountById(transaction.toAccountId, tx);
      lines.push(
        { accountId: toAccount.id, debit: amount, credit: 0, desc: `Transfer in #${transaction.id}` },
        { accountId: fromAccount.id, debit: 0, credit: amount, desc: `Transfer out #${transaction.id}` }
      );
      break;
      
    case 'Owner':
      if (amount > 0) {
        // Contribution
        lines.push(
          { accountId: paymentAccount.id, debit: amount, credit: 0, desc: `Owner contribution #${transaction.id}` },
          { accountId: accounts.Capital.id, debit: 0, credit: amount, desc: `Capital #${transaction.id}` }
        );
      } else {
        // Drawing
        const absAmount = Math.abs(amount);
        lines.push(
          { accountId: accounts.Drawings.id, debit: absAmount, credit: 0, desc: `Owner drawings #${transaction.id}` },
          { accountId: paymentAccount.id, debit: 0, credit: absAmount, desc: `Payment for drawings #${transaction.id}` }
        );
      }
      break;
  }
  
  // Validate balanced
  const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0);
  
  if (Math.abs(totalDebits - totalCredits) > 0.005) {
    throw new JournalBalanceError(totalDebits, totalCredits);
  }
  
  // Insert journal entry + lines
  const [journal] = await tx.insert(journalEntries).values({
    tenantId,
    transactionId: transaction.id,
    entryDate: transaction.date,
    description: transaction.description,
    isBalanced: true,
    createdBy: userId,
  }).returning();
  
  for (const line of lines) {
    await tx.insert(journalLines).values({
      journalEntryId: journal.id,
      ...line
    });
  }
  
  return journal.id;
}
```

---

## 7. Receipt OCR Pipeline (Mobile-First)

The vision: user takes a photo of a receipt → system extracts date, amount, vendor, and category → pre-fills the simple entry form.

```typescript
// packages/accounting/src/ocr/pipeline.ts

interface ReceiptOCR {
  date: string | null;
  amount: number | null;
  vendor: string | null;
  items: { description: string; amount: number }[];
  confidence: number;
  rawText: string;
}

async function processReceiptOCR(image: File): Promise<ReceiptOCR> {
  // Step 1: Send to OpenAI Vision (gpt-4o-mini) or local Tesseract
  // Step 2: Extract structured data
  // Step 3: Return pre-filled fields
  
  // Prompt:
  // "Extract from this receipt: date (YYYY-MM-DD), total amount, vendor name,
  //  and a list of line items. Return as JSON."
}
```

---

## 8. Party Autocomplete & Smart Suggestions

### 8.1 Party Memory

```typescript
// The party field learns from past entries

interface PartyRecord {
  name: string;
  lastUsed: Date;
  useCount: number;
  typicalDirection: 'money_in' | 'money_out' | 'both';
  typicalCategory: string;     // Most common category
  typicalAccount: string;      // Most common payment account
  hasOutstandingInvoices: boolean;
  outstandingAmount: number;
}

// When user types "Joh..." → suggests "John Smith (Customer, 12 sales, LKR 45,000 outstanding)"
// When user types "Fac..." → suggests "Facebook (Expense, Marketing, last: LKR 6,000)"
```

### 8.2 Smart Defaults

The engine learns per-tenant behavior:

- If user always records "Facebook ads" as Marketing expense from Bank Account → auto-select those
- If user always uses "Cash on Hand" for amounts under LKR 5,000 → auto-select
- If description matches a frequent pattern → suggest the full entry from history

---

## 9. What Changes from the Current Schema

### 9.1 New Fields on `transactions`

```sql
ALTER TABLE transactions ADD COLUMN:
  -- Tracking which inference was used
  inference_method VARCHAR(20),        -- 'rule', 'ai', 'manual', 'ocr'
  inference_confidence DECIMAL(3,2),   -- 0.00-1.00
  inferred_category_id UUID,           -- What the engine guessed (may differ from final)
  inferred_type VARCHAR(20),           -- What the engine guessed
  
  -- For the simple entry flow
  entry_direction VARCHAR(20),         -- 'money_in', 'money_out', 'move_money', 'invoice_bill'
  was_auto_categorized BOOLEAN DEFAULT false,
  was_auto_settled BOOLEAN DEFAULT false,
  
  -- OCR metadata
  ocr_source VARCHAR(50),              -- 'openai_vision', 'tesseract', null
  ocr_raw_text TEXT,                   -- Raw OCR output
  ocr_confidence DECIMAL(3,2);
```

### 9.2 New Table: `party_history`

```sql
CREATE TABLE party_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  party_name VARCHAR(150) NOT NULL,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  use_count INT DEFAULT 1,
  typical_direction VARCHAR(20),
  typical_category_id UUID REFERENCES categories(id),
  typical_account_id UUID REFERENCES chart_of_accounts(id),
  total_transactions INT DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  has_outstanding BOOLEAN DEFAULT false,
  outstanding_amount DECIMAL(15,2) DEFAULT 0,
  UNIQUE(tenant_id, party_name)
);
-- Updated automatically via trigger or application logic on every transaction
```

### 9.3 New Table: `category_rules`

```sql
-- User-customizable rules that override the built-in patterns
CREATE TABLE category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pattern VARCHAR(255) NOT NULL,        -- Regex or keyword
  category_id UUID NOT NULL REFERENCES categories(id),
  default_type VARCHAR(20),             -- 'Sale', 'Purchase', 'Expense', 'Owner'
  priority INT DEFAULT 0,              -- Higher = checked first
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 10. Dual-Mode UI

The app serves two personas simultaneously:

### Mode 1: Simple Mode (Default — Business Owner)

```
┌─────────────────────────────────────────┐
│  📝 Quick Entry                          │
│                                         │
│  [💰 In]  [💸 Out]  [↔️ Move]  [📋 Bill]│
│                                         │
│  👤 John Smith                           │
│  📝 Sold painting set                    │
│  💵 15,000.00                            │
│  🏦 Cash on Hand ▾                       │
│                                         │
│  System: This will be recorded as a     │
│  Sale → Revenue with immediate cash     │
│  receipt.                               │
│                                         │
│  [ ✓ Record ]  [ 📎 Attach Receipt ]    │
└─────────────────────────────────────────┘
```

### Mode 2: Professional Mode (Accountant — Full Control)

```
┌─────────────────────────────────────────┐
│  📊 Professional Entry                   │
│                                         │
│  Type: [Sale ▾]  Date: [2026-06-14]     │
│  Party: [John Smith        ]            │
│  Amount: [15,000.00]                    │
│  Category: [Sales Revenue ▾]            │
│  Payment: [Cash ▾]  Account: [1000 ▾]   │
│  Invoice Ref: [INV-0042    ]            │
│  Department: [Art Supplies ▾]           │
│                                         │
│  Journal Preview:                       │
│  ┌─────────────────────────────────────┐│
│  │ Dr Accounts Receivable   15,000.00  ││
│  │ Cr Sales Revenue         15,000.00  ││
│  │ Dr Cash on Hand          15,000.00  ││
│  │ Cr Accounts Receivable   15,000.00  ││
│  └─────────────────────────────────────┘│
│                                         │
│  [ ✓ Save ]  [ 📎 Attach ]  [ 🔍 Audit]│
└─────────────────────────────────────────┘
```

Both modes write to the **same** `transactions` table. The professional mode exposes more fields; the simple mode hides them and uses the inference engine.

---

## 11. Key Optimizations Over Current v1.x

| Current (v1.x) | V2 Improvement |
|----------------|---------------|
| 7 type buttons at top | 4 direction toggles |
| 19-item category dropdown | Smart text → category inference |
| Payment method always visible | Auto-resolved from account selection |
| Status field shown | Derived, never shown in simple mode |
| Flat party text field | Autocomplete with history + outstanding alerts |
| Separate Transfer form | Same form, auto-detects from direction |
| No confidence/explanation | Shows "System will record this as..." |
| OCR via AI Assistant page only | Built into the main entry form |

---

## 12. Summary: The Flow

```
User enters 3 things:
  1. Direction  →  [Money In] [Money Out] [Move] [Invoice]
  2. Party      →  "John Smith" (autocomplete)
  3. Description → "Sold painting set"
  4. Amount     →  15,000
  
Engine does everything else:
  → Infers category: Sales Revenue
  → Infers type: Sale
  → Checks for outstanding invoices from John → none found
  → Creates: Sale transaction (Dr AR, Cr Revenue)
  → Auto-creates: Receive transaction (Dr Cash, Cr AR)
  → Generates: 2 balanced journal entries (4 lines total)
  → Logs: Full audit trail
  → Returns: "✓ Recorded: Sale of LKR 15,000 to John Smith"
  
Pro accountant opens it:
  → Sees full journal entries
  → Can edit, void, reallocate
  → All changes also go through the engine
```
