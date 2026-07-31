# BookOne Bank Reconciliation Engine & Workbench

> **Canonical product, UX, accounting, data, and implementation specification**  
> **Repository:** `Dinu-Sri/BookOne`  
> **Prepared:** 31 July 2026  
> **Status:** Main implementation objective and authoritative design direction  
> **Supersedes for reconciliation UX:** the current pass-only `BankMatchWizard` experience as the primary interface  
> **Preserves:** the existing Smart Bank Import Studio as the normalization and staging layer

---

## 0. Document Authority

This document is the main implementation specification for the next BookOne bank reconciliation engine and user experience.

The coding agent must treat the requirements in this document as authoritative unless a later approved architecture decision record explicitly changes them.

The implementation must:

1. Reuse BookOne's current accounting engine, tenancy model, design system, audit patterns, and Smart Bank Import Studio.
2. Add functionality through additive database migrations.
3. Preserve existing imported statement data and working import functionality.
4. Avoid introducing a second competing reconciliation engine.
5. Keep the ordinary workflow extremely simple for older users, non-technical users, junior staff, senior staff with limited computer confidence, and users with limited accounting knowledge.
6. Keep advanced accounting capability available without exposing unnecessary complexity to ordinary users.
7. Never silently post, edit, delete, or reinterpret accounting entries.
8. Make every financial decision explainable, reviewable, auditable, reversible where legally and technically possible, and safe under concurrent use.

---

# 1. Executive Objective

## 1.1 Product promise

The target experience is:

```text
Import → Reconcile → Done
```

To the ordinary user, the system should feel like:

> “BookOne checked the bank statement against my records, showed only the items that need my attention, explained why, and safely completed the reconciliation.”

The user must not need to understand:

- Debit and credit mechanics
- Fingerprints
- Matching scores
- Jaccard similarity
- Journal line construction
- Database status values
- Import file ownership
- Reconciliation algorithms
- Account IDs
- Internal transaction IDs

The user should understand:

- This bank transaction is already in BookOne.
- This bank transaction is missing from BookOne.
- This BookOne transaction has not cleared the bank yet.
- Two or more records may belong together.
- This appears to be a transfer.
- This appears to be a duplicate.
- This item needs a decision.
- The bank and BookOne now agree.
- The remaining difference is explained or still unresolved.

## 1.2 Main design decision

The primary user-facing reconciliation object is:

```text
Bank account + statement period
```

Example:

```text
HNB Current Account
01 July 2026 – 31 July 2026
```

It is **not**:

```text
HNB_July_1.xlsx
HNB_July_2.xlsx
```

Imported files remain evidence sources attached to the reconciliation period. Multiple files may contribute lines to the same reconciliation session.

## 1.3 Core architecture

```text
Official bank file
      ↓
Smart Bank Import Studio
Map → normalize → validate → deduplicate
      ↓
Immutable normalized bank-side staging
      ↓
Reconciliation Session
Bank account + statement period
      ↓
Two-sided matching and exception engine
      ↓
User confirms:
- Match existing
- Create missing
- Transfer
- Outstanding timing item
- Duplicate / exclude with reason
      ↓
Balance verification
      ↓
Reconciled
      ↓
Optional period close
```

---

# 2. Current BookOne Baseline

## 2.1 What must be preserved

BookOne already has a strong import foundation:

- Smart Bank Import Studio
- Server-side Excel and CSV parsing
- Sri Lankan bank format presets
- Manual mapping rescue
- Versioned tenant profiles
- Bank account binding
- File hash checks
- Line fingerprints
- Period overlap and gap warnings
- Running-balance continuity checks
- Staging before ledger posting
- Exact and fuzzy candidate generation
- Explicit creation through `recordEntry`
- Import events and audit history
- Undo of entries created from an import
- Shared cashbook and ERP reconciliation engine

Relevant current locations include:

```text
docs/BANK_IMPORT_STUDIO.md
docs/STATEMENT_IMPORT_ARCHITECTURE.md
apps/web/src/app/actions/bank-import-studio.ts
apps/web/src/app/actions/statement-import.ts
apps/web/src/components/bank-import-studio/studio-wizard.tsx
apps/web/src/components/bank-import-studio/match-wizard.tsx
apps/web/src/components/bank-import-studio/bank-imports-hub.tsx
packages/statement-import/
packages/db/src/schema/reconciliation.ts
packages/db/migrations/022_statement_import_engine.sql
packages/db/migrations/023_bank_import_studio.sql
```

## 2.2 Current limitation

The current matching experience is primarily a sequence of passes:

```text
Exact matches
→ Fuzzy matches
→ Unmatched bank lines
→ Create entries
→ Done
```

This is useful as a guided queue, but it does not provide a complete, trustworthy overview of reconciliation.

The current flow is mainly bank-line driven. It does not fully present the second side:

```text
BookOne transactions that have not appeared in the bank
```

Examples:

- Outstanding cheques
- Deposits in transit
- Delayed card settlements
- Pending online transfers
- Book entries recorded on the final day but cleared after the statement end
- Incorrectly dated or incorrectly assigned BookOne transactions

A true reconciliation engine must handle both directions.

## 2.3 Required evolution

Keep the current matching functions where useful, but evolve the product to:

```text
Reconciliation Inbox
→ Reconciliation Workbench
→ Optional “Fix one by one” guided queue
→ Balance verification
→ Reconciled
```

The table and guided queue must use the same reconciliation cases and server actions. They must not become separate engines.

---

# 3. Product Goals

## 3.1 Primary goals

| Goal | Required outcome |
|---|---|
| Low cognitive load | Ordinary users see only the next necessary decision |
| Accounting integrity | No silent posting, rewriting, deletion, or incorrect categorization |
| Complete reconciliation | Bank-only, BookOne-only, matched, transferred, duplicate, and timing items are represented |
| Explainability | Every suggestion says why it was made |
| Visual confidence | A two-sided table clearly shows bank, relationship, BookOne result, and status |
| Fast happy path | Safe matches can be bulk-confirmed after review |
| Guided rescue | Difficult items can be fixed one by one |
| Balance proof | Reconciliation cannot be completed while an unexplained difference remains |
| Reversibility | Links can be reopened; created entries can be reversed through controlled actions |
| Auditability | Every decision has user, time, reason, before state, and after state |
| Reuse | One engine serves personal, sole-proprietor, and full ERP users |
| Multi-bank support | Sessions remain isolated by bank account |
| Resumability | Work is automatically preserved and can be continued later |

## 3.2 Success experience

A user should be able to say:

> “I imported the bank statement, BookOne found what was already recorded, I checked the few uncertain items, added the missing bank fees and transfers, marked one cheque as not yet cleared, and finished when the difference became zero.”

## 3.3 Non-goals for the initial implementation

The first release does not need:

- Open Banking live feeds
- Fully automated posting without user confirmation
- AI-controlled accounting decisions
- Automatic correction of historical journals
- Automatic deletion of user transactions
- Automatic classification of every bank narrative
- PDF OCR as the primary source
- Multi-currency foreign-exchange settlement automation beyond safe representation and review
- Complex treasury cash pooling
- Automatic bank-error correction without explicit user approval

---

# 4. Non-Negotiable Accounting Principles

## 4.1 Separate worlds

```text
Bank statement world
≠
BookOne accounting world
```

Bank rows are evidence of bank activity. They are not automatically accounting entries.

BookOne transactions and journals remain the accounting source of truth after the user confirms the appropriate treatment.

## 4.2 Match before create

When a bank row already represents an existing BookOne transaction:

- Link it.
- Do not create a duplicate.
- Do not modify the original transaction amount.
- Do not rewrite the journal.
- Do not change the category silently.

## 4.3 Staging before books

Imported bank rows remain in staging until the user performs an explicit reconciliation action.

## 4.4 No silent money

No reconciliation action may create a journal without an explicit confirmation that clearly states:

- Number of entries to be created
- Total money in
- Total money out
- Bank account
- Period
- Classification or category treatment
- Whether any items will remain unresolved

## 4.5 Reverse and repost, never destructive rewrite

Corrections to posted accounting entries use BookOne’s established reversal and reposting pattern.

## 4.6 One bank account per source import

Every imported file and normalized bank line must be bound to one bank or liquid account.

A reconciliation session can include multiple source files, but all source files must belong to the same selected bank account unless a controlled transfer flow explicitly links two account sessions.

## 4.7 Locked periods

- Viewing is allowed.
- Matching that does not change the ledger may be allowed according to policy.
- Creating, reversing, correcting, or reposting is blocked in a locked period unless an approved current-period adjustment flow is used.
- The server must enforce this rule.
- The UI must explain the block and not merely disable a button without reason.

## 4.8 No automatic sales assumption

A positive bank amount is not automatically a sale.

Money in may be:

- Customer payment
- Cash sale
- Owner contribution
- Loan received
- Transfer from another account
- Interest income
- Refund
- Capital injection
- Other income
- Unknown and requiring review

## 4.9 No automatic ordinary-expense assumption

A negative bank amount is not automatically an ordinary expense.

Money out may be:

- Supplier payment
- Expense
- Asset purchase
- Loan repayment
- Owner drawing
- Transfer to another account
- Tax payment
- Bank fee
- Refund
- Payroll
- Unknown and requiring review

## 4.10 Conservative failure

When uncertain:

1. Stop.
2. Explain.
3. Show evidence.
4. Ask one clear question.
5. Preserve the user’s progress.
6. Never silently select the financially risky option.

---

# 5. User Groups and Modes

## 5.1 Simple Mode

Primary audience:

- Personal users
- Sole proprietors
- Junior staff
- Senior staff with low computer confidence
- Non-accountants
- Occasional users

Simple Mode uses:

- Money In
- Money Out
- Transfer
- Already in BookOne
- Add to BookOne
- Waiting to clear
- Duplicate
- Needs your decision
- Bank and BookOne agree

Simple Mode hides:

- Account codes
- Journal IDs
- Match algorithms
- Detailed GL treatment
- Technical flags
- Raw JSON
- Internal status names

## 5.2 Professional Mode

Primary audience:

- Accountants
- Finance officers
- ERP users
- Reviewers
- Auditors
- Administrators with reconciliation permissions

Professional Mode may additionally show:

- Account codes
- Journal links
- Book domain
- Source transaction IDs
- Adjustment type
- Match reason detail
- Value date
- Posting date
- Period lock state
- Reconciliation reference
- Audit timeline
- Formal bank reconciliation statement

Professional Mode must use the same cases and actions, not a separate data model.

---

# 6. Terminology

## 6.1 User-facing terms

| Internal concept | Simple user wording |
|---|---|
| Reconciliation session | Bank reconciliation |
| Bank statement line | Bank transaction |
| Book transaction | BookOne record |
| Link | Match |
| Create transaction | Add to BookOne |
| Unmatched book transaction | Waiting to clear |
| Proposed action | BookOne suggestion |
| Match score | Hidden; show reasons |
| Reconciliation case | Item |
| Reopen | Fix again |
| Exclude | Do not include, with reason |
| Period lock | This month is closed |
| Ledger balance | BookOne balance |
| Statement balance | Bank balance |
| Difference | Difference left |

## 6.2 Important distinctions

```text
Imported ≠ Reconciled ≠ Closed
```

- **Imported:** Bank rows have been normalized and stored.
- **Reconciled:** Bank and BookOne relationships have been resolved and the difference is zero or formally explained according to policy.
- **Closed:** The accounting period has been locked through a separate authorized action.

---

# 7. Information Architecture

## 7.1 Recommended routes

Preserve current routes through redirects or wrappers where necessary.

```text
/reconciliation
    Reconciliation inbox for ERP

/reconciliation/import
    Existing Smart Bank Import Studio in ERP shell

/reconciliation/session/[sessionId]
    Main Reconciliation Workbench

/reconciliation/session/[sessionId]/guided
    Fix-one-by-one guided queue

/reconciliation/session/[sessionId]/report
    Formal reconciliation summary and audit view

/cashbook/bank-imports
    Simple-shell reconciliation inbox

/cashbook/match?importId=...
    Compatibility route; resolve import → session and redirect/open guided mode
```

## 7.2 Navigation model

### Personal and sole-proprietor shell

```text
Cashbook
├── Import bank
├── Bank reconciliation
└── Settings
```

### Full ERP shell

```text
Banking / Reconciliation
├── Reconciliation inbox
├── Import bank file
├── Reconciled periods
└── Reconciliation reports
```

Avoid having separate “Bank imports” and “Reconciliation” locations that appear to contain different truths.

The inbox may still display source import status, but the main task label should be **Bank reconciliation**.

---

# 8. Main Reconciliation Object

## 8.1 Session identity

A session is defined by:

```text
tenant
+ bank account
+ statement period from
+ statement period to
+ optional statement identifier
```

Example:

```text
Tenant: Clossyan Technologies
Bank: HNB Current Account
Period: 01 July 2026 – 31 July 2026
```

## 8.2 Source files

A session may contain:

```text
HNB_July_Part_1.xlsx
HNB_July_Part_2.xlsx
HNB_Adjustments.csv
```

The user should see:

> 3 source files · 118 unique bank transactions

Source files are evidence. They are not separate reconciliation tasks unless the periods or bank accounts differ.

## 8.3 Session states

| State | Meaning | User label |
|---|---|---|
| `draft` | Setup incomplete | Draft |
| `ready` | Bank rows available; matching not reviewed | Ready to reconcile |
| `in_progress` | Some cases resolved | N items need attention |
| `ready_to_finish` | All blocking items resolved; balance test passes | Ready to finish |
| `reconciled` | Reconciliation confirmed | Reconciled |
| `reopened` | Completed session reopened due to correction or broken link | Reopened |
| `closed` | Reconciled and accounting period locked | Closed |
| `voided` | Session voided through controlled action | Voided |

Do not use generic **Done** or **All set** when open cases remain.

---

# 9. Reconciliation Case Model

## 9.1 Why a case layer is required

Current bank line statuses are not enough to represent:

- One bank line matched to multiple BookOne transactions
- Multiple bank lines matched to one BookOne transaction
- Transfers across accounts
- BookOne-only timing items
- Adjustments
- Reopened relationships
- User explanations and reason codes
- Independent suggestion, accounting outcome, and review state

Introduce a case layer as the reconciliation authority.

## 9.2 Three independent dimensions

### Relationship type

```text
none
one_to_one
one_bank_to_many_books
many_banks_to_one_book
many_to_many
transfer_pair
book_only
bank_only
```

### Accounting outcome

```text
match_existing
create_new
transfer
outstanding
duplicate
exclude
adjustment
unresolved
```

### Review state

```text
suggested
needs_review
confirmed
blocked
reopened
superseded
```

Example:

```text
Relationship: one_to_one
Outcome: match_existing
Review state: needs_review
```

This is more accurate than one overloaded `status` field.

## 9.3 Recommended core type

```ts
type ReconciliationCase = {
  id: string;
  tenantId: string;
  sessionId: string;

  relationshipType:
    | 'none'
    | 'one_to_one'
    | 'one_bank_to_many_books'
    | 'many_banks_to_one_book'
    | 'many_to_many'
    | 'transfer_pair'
    | 'book_only'
    | 'bank_only';

  suggestedOutcome:
    | 'match_existing'
    | 'create_new'
    | 'transfer'
    | 'outstanding'
    | 'duplicate'
    | 'exclude'
    | 'adjustment'
    | 'unresolved';

  confirmedOutcome: string | null;

  reviewState:
    | 'suggested'
    | 'needs_review'
    | 'confirmed'
    | 'blocked'
    | 'reopened'
    | 'superseded';

  reasonCodes: string[];
  explanation: Record<string, unknown>;

  bankAmountSigned: string;
  bookAmountSigned: string;
  differenceAmount: string;

  confidenceBand: 'strong' | 'possible' | 'weak' | 'none';
  blockingReason: string | null;

  reviewedBy: string | null;
  reviewedAt: Date | null;

  version: number;
  createdAt: Date;
  updatedAt: Date;
};
```

## 9.4 Relationship joins

```text
reconciliation_case_bank_lines
- case_id
- bank_line_id
- allocated_amount
- role

reconciliation_case_book_transactions
- case_id
- transaction_id
- allocated_amount
- role
```

Allocation fields are necessary for partial and grouped matches.

---

# 10. Balance Model

## 10.1 Required balances

The workbench should calculate and show:

1. Bank opening balance
2. Bank closing balance
3. BookOne opening balance
4. BookOne closing balance at the statement end date
5. Net outstanding BookOne timing items
6. Approved explicit adjustments
7. Difference left

## 10.2 Signed amount convention

For the selected bank account:

```text
Money into the bank account  = positive
Money out of the bank account = negative
```

The same convention must be used in:

- Matching
- Allocation
- Difference calculation
- UI totals
- API responses
- Audit events

## 10.3 Core comparison

BookOne transactions that are recorded but not yet shown by the bank are timing items.

Examples:

- Outstanding cheque: negative BookOne transaction
- Deposit in transit: positive BookOne transaction

A practical normalized comparison is:

```text
Expected bank balance
= BookOne closing balance
  - net signed outstanding BookOne transactions
  + approved bank-side correction adjustments
```

Then:

```text
Difference left
= Bank statement closing balance
  - Expected bank balance
```

The implementation must use tested decimal arithmetic, never binary floating-point for money.

## 10.4 UI wording

Do not expose the formula first.

Show:

```text
Bank closing balance       Rs. 1,245,300.00
BookOne balance            Rs. 1,240,300.00
Explained timing items     Rs.     5,000.00
Difference left            Rs.         0.00
```

Expandable explanation:

> A cheque for Rs. 5,000 is recorded in BookOne but had not cleared the bank by 31 July 2026.

## 10.5 Completion rule

A session cannot be marked reconciled unless:

- The closing balance is known, or the session is explicitly marked “transaction matching only” by an authorized role.
- No blocking cases remain.
- Every unique bank row has a confirmed or policy-approved outcome.
- Every relevant BookOne transaction in scope is matched or classified as a timing item.
- Difference left equals zero within configured tolerance.
- Any non-zero tolerance is explicitly recorded and permission-controlled.
- Balance continuity issues are resolved or acknowledged by an authorized user.
- The final review is confirmed.

---

# 11. UX Principles

## 11.1 One main decision at a time

On ordinary screens, show:

- One primary button
- One Back or secondary action
- One quiet Save & Exit action where relevant

Avoid multiple competing primary actions.

## 11.2 Summary first, detail on demand

The user should first see:

```text
32 ready to confirm
4 need your decision
6 need to be added
3 are waiting to clear
2 duplicates
```

Do not begin with a dense raw table.

## 11.3 Default to the work that needs attention

The default workbench tab is:

```text
Needs your decision
```

If no decisions remain, default to:

```text
Ready to confirm
```

## 11.4 Explain every suggestion

Do not show only:

```text
92% match
```

Show:

```text
Strong match
✓ Same amount: Rs. 12,500
✓ Same date: 24 July 2026
✓ Only one BookOne record fits
```

## 11.5 Do not rely on color alone

Every status uses:

- Icon
- Text
- Color
- Optional short explanation

## 11.6 Accessibility

Minimum requirements:

- Normal body text: 16 px in decision screens
- Secondary metadata: not below 13 px
- Main question: 24–30 px
- Clickable target: at least 44 px high
- Visible keyboard focus
- Full keyboard operation for tables, drawers, and dialogs
- High contrast
- No information available only in a tooltip
- No auto-advance after a selection
- No countdowns
- No disappearing critical messages
- Errors remain visible until resolved or dismissed
- Date format uses unambiguous wording such as `24 Jul 2026`
- Amounts use consistent `Rs. 12,500.00`

## 11.7 Progressive disclosure

Ordinary users see:

- Date
- Description
- Amount
- Suggested result
- Reason
- Required action

Professional details are under:

```text
More details
```

---

# 12. Screen 1 — Reconciliation Inbox

## 12.1 Purpose

Show each bank account and statement period as one task.

## 12.2 Desktop wireframe

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Search bank or period...       [Date range]          [Import bank file]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Needs attention                                                            │
│                                                                             │
│ HNB Current Account                                  01–31 Jul 2026         │
│ 2 source files · 118 bank transactions                                     │
│ ███████████████████░░ 112 of 118 resolved                                  │
│ 4 need your decision · 2 need adding               Difference: Rs. 5,000   │
│                                                        [Continue]           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Ready to finish                                                             │
│                                                                             │
│ Sampath Savings                                      01–31 Jul 2026         │
│ 84 of 84 resolved · Difference Rs. 0.00                    [Review & finish] │
├─────────────────────────────────────────────────────────────────────────────┤
│ Reconciled                                                                  │
│ Commercial Bank                                       01–30 Jun 2026        │
│ Reconciled by N. Perera · 05 Jul 2026                       [View]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 12.3 Toolbar

Use BookOne list standards:

- Live search
- Date range filter
- Bank account filter when there are several accounts
- Status filter
- Primary CTA: **Import bank file**

Search must match:

- Bank account name
- Bank account short name
- Period
- Source filename
- Reconciliation reference

## 12.4 Inbox columns or cards

Minimum visible information:

- Bank name
- Account nickname
- Masked account number if available
- Period
- Number of source files
- Number of unique bank rows
- Resolved count
- Attention count
- Difference left
- Status
- Main next action

## 12.5 Required status copy

| State | Card label | CTA |
|---|---|---|
| Draft import | Finish importing | Continue import |
| Ready | Ready to reconcile | Start |
| Decisions remain | 4 need your decision | Continue |
| New entries remain | 6 need adding | Review new |
| Ready | Ready to finish | Review & finish |
| Reconciled | Reconciled | View |
| Reopened | Reopened — 2 items changed | Fix now |
| Closed | Closed | View report |

## 12.6 Empty state

```text
No bank reconciliations yet

Import an Excel or CSV statement from your bank.
BookOne will check it against your records before anything is added.

[Import bank file]
```

## 12.7 File access

Each session card may include a quiet link:

```text
Source files (2)
```

Opening it shows:

- Filename
- File hash short reference
- Imported by
- Import time
- Period detected
- Row count
- Duplicates removed
- Mapping profile
- Validation warnings

Source files must not dominate the ordinary inbox.

---

# 13. Screen 2 — Reconciliation Workbench

## 13.1 Purpose

Provide one trustworthy workspace where the user can:

- Understand the overall state
- See both bank and BookOne sides
- Resolve exceptions
- Confirm safe matches
- Create missing entries
- Mark timing items
- Handle transfers
- Verify the balance
- Finish reconciliation

## 13.2 Desktop layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Bank reconciliations                                                       │
│ HNB Current Account · 01–31 Jul 2026             [Save & exit] [More ▾]     │
│ 2 source files · Last saved 2 minutes ago                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Bank closing       BookOne balance      Explained timing      Difference left │
│ Rs. 1,245,300.00   Rs. 1,240,300.00     Rs. 5,000.00          Rs. 0.00       │
├──────────────────────────────────────────────────────────────────────────────┤
│ 42 of 48 resolved      ███████████████████░                                  │
│ [Fix 4 items one by one]                            [Review safe matches]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ All 48 | Ready 32 | Needs decision 4 | Add 6 | Waiting 3 | Duplicates 2     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Search...  [Date] [Amount] [Type] [Only selected]             [Columns ▾]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ □ BANK TRANSACTION        CONNECTION     BOOKONE RECORD       RESULT ACTION  │
│ □ 18 Jul CEFT ABC         ↔              Customer payment      Strong Review │
│   + Rs. 25,000                           + Rs. 25,000                         │
│ □ 19 Jul BANK CHARGE      →              No record             Add expense   │
│   - Rs. 750                                                               › │
│ □ No bank transaction     ←              Cheque payment        Waiting clear │
│                                          - Rs. 5,000                         │
└──────────────────────────────────────────────────────────────────────────────┘
│ 48 total · page 1 of 5                                Previous      Next      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 13.3 Header

The header contains:

- Back to inbox
- Bank account name
- Statement period
- Source file count
- Last saved state
- Save & Exit
- More menu

More menu:

- View source files
- Re-run suggestions
- Export exception report
- View audit history
- Reopen session, permission-controlled
- Void session, permission-controlled
- Help

## 13.4 Balance cards

Cards:

1. Bank closing balance
2. BookOne closing balance
3. Explained timing items
4. Difference left

Rules:

- Difference left receives the strongest visual emphasis.
- `Rs. 0.00` uses success icon and text.
- Non-zero uses amber or red depending on whether it is fully explained.
- Clicking a card opens a breakdown drawer.
- Do not use unexplained abbreviations.

## 13.5 Progress bar

Show:

```text
42 of 48 items resolved
```

Resolved means a case has a valid confirmed outcome.

Do not count:

- System suggestions not confirmed
- Blocked creates
- Unexplained skips
- Broken links
- Cases reopened after an accounting edit

---

# 14. Workbench Tabs

## 14.1 Required tabs

```text
All
Ready to confirm
Needs your decision
Add to BookOne
Waiting to clear
Duplicates / excluded
Completed
```

Each tab includes a count.

## 14.2 Default tab logic

1. `Needs your decision`, if count > 0
2. `Add to BookOne`, if no decision cases but create cases remain
3. `Ready to confirm`, if safe suggestions remain
4. `All`, otherwise

## 14.3 Tab meanings

### Ready to confirm

Strong one-to-one suggestions that passed server validation.

### Needs your decision

Ambiguous, conflicting, incomplete, date-risk, amount-risk, repeated-amount, balance-break, or multi-match items.

### Add to BookOne

Bank transactions with no appropriate existing BookOne record.

### Waiting to clear

BookOne records not found on the bank statement but likely timing items.

### Duplicates / excluded

Items that appear to be duplicates or non-transaction rows. Exclusions require a reason.

### Completed

Confirmed match, created entry, confirmed transfer, confirmed outstanding item, or approved exclusion.

---

# 15. Main Two-Sided Table

## 15.1 Core columns

| Column | Purpose |
|---|---|
| Select | Controlled bulk action |
| Bank transaction | Date, description, signed amount, source badge |
| Connection | Visual relationship |
| BookOne record | Date, description, amount, type |
| Result | Strong match, check, add, waiting, duplicate, blocked |
| Action | One clear next action or chevron |

## 15.2 Relationship symbols

```text
↔   One bank line matches one BookOne record
↔↔  One side matches multiple records
→   Bank exists; BookOne record is missing
←   BookOne exists; bank transaction is missing
⇄   Transfer between accounts
—   Duplicate or excluded
!   Blocked or inconsistent
```

Always pair symbols with text for accessibility.

## 15.3 Bank transaction cell

Show:

- Transaction date
- Description
- Signed amount
- Reference when useful
- Source file row only in expanded details
- Warning badge when needed

Example:

```text
24 Jul 2026
CEFT 003928 ABC COMPANY
+ Rs. 25,000.00
Ref 003928
```

## 15.4 BookOne cell

Show:

- Transaction date
- Plain transaction type
- Party or description
- Signed amount for the selected bank
- Status if reversed or edited

Example:

```text
24 Jul 2026
Customer payment
ABC Company
+ Rs. 25,000.00
```

## 15.5 Result labels

| Label | Icon | Tone |
|---|---|---|
| Strong match | Check + link | Green |
| Possible match | Eye | Amber |
| Add to BookOne | Plus | Blue |
| Waiting to clear | Clock | Purple |
| Transfer | Arrows | Blue/Purple |
| Duplicate | Copy | Grey |
| Excluded | Minus-circle | Grey |
| Blocked | Alert triangle | Red |
| Completed | Check-circle | Green |
| Reopened | Rotate | Amber |

## 15.6 Row expansion

Clicking anywhere on the row opens the detail drawer.

Do not require a tiny icon to access essential details.

## 15.7 Pagination

Recommended:

- 10 rows per page in Simple Mode
- Optional 25 rows per page in Professional Mode
- Reset to page 1 when filters change
- Copy: `48 total · page 1 of 5`

## 15.8 Sorting

Sortable:

- Bank date
- Bank amount
- BookOne date
- Result
- Difference
- Confidence band
- Updated time

## 15.9 Filters

- Search description, reference, party, amount
- Date range
- Money in / money out
- Result type
- Source file
- Amount range
- Only selected
- Only blocked
- Only reopened
- Only with notes

Advanced filters remain hidden under **More filters**.

---

# 16. Bulk Actions

## 16.1 Safety rule

Bulk actions are permitted only for cases that share a compatible action and pass server-side validation.

## 16.2 Allowed bulk actions

- Confirm selected strong matches
- Mark selected bank charges with the same category
- Mark selected items as waiting to clear
- Exclude selected confirmed duplicates with one reason
- Add selected similar entries after showing classification and totals
- Reopen selected matches, permission-controlled

## 16.3 Bulk confirmation summary

Before confirmation:

```text
Confirm 32 matches?

Bank account: HNB Current Account
Period: 01–31 Jul 2026
Total money in matched:  Rs. 480,000.00
Total money out matched: Rs. 322,500.00

This only links bank transactions to existing BookOne records.
It does not create or change journals.

[Cancel] [Confirm 32 matches]
```

## 16.4 Bulk exact-match review

The user must be able to:

- See every selected row through pagination or expandable review
- Deselect suspicious rows
- View reason summaries
- See repeated-amount warnings
- See any cases removed by last-second server validation

Never confirm hidden rows merely because only the first 12 were displayed.

## 16.5 Partial failures

If 8 actions were requested and 2 failed:

```text
6 completed
2 need attention

The successful items were saved.
The two unsuccessful items remain open.

[Review 2 items]
```

Do not show only a general error toast.

---

# 17. Detail Drawer

## 17.1 Purpose

Allow the user to understand and fix one item without leaving the workbench.

## 17.2 Desktop placement

- Right-side drawer
- Width approximately 480–620 px
- Full-height within viewport
- Background scroll locked only when necessary
- Escape closes unless unsaved changes exist
- Focus trapped inside
- Return focus to the originating row

## 17.3 Mobile placement

- Full-screen sheet
- Sticky header
- Sticky bottom action area
- Back returns to the same filtered table position

## 17.4 Drawer structure

```text
Item 3 of 4
Needs your decision

BANK TRANSACTION
24 Jul 2026
CEFT 003928 ABC COMPANY
+ Rs. 25,000.00
Reference: 003928
Balance after: Rs. 418,500.00

BOOKONE SUGGESTION
Customer payment — ABC Company
24 Jul 2026
+ Rs. 25,000.00

WHY BOOKONE SUGGESTED THIS
✓ Same amount
✓ Same date
✓ Reference resembles the bank description
✓ This BookOne record is not used by another match

[Confirm match]
[Find another record]
[Add as new instead]
[Leave for later]
```

## 17.5 Drawer tabs

When needed:

```text
Decision | Source details | History
```

Simple Mode defaults to Decision.

## 17.6 History tab

Show human-readable events:

```text
31 Jul 2026, 5:42 PM
BookOne suggested a possible match.

31 Jul 2026, 5:48 PM
N. Perera selected a different BookOne record.

31 Jul 2026, 5:49 PM
Match confirmed.
```

---

# 18. Explainability and Reason Codes

## 18.1 User explanation

Every suggestion must provide 1–5 short reasons.

Good:

```text
Strong match
- Same amount
- Same date
- Only one unused BookOne record fits
```

Bad:

```text
Score 0.94
Method fuzzy
```

## 18.2 Internal reason codes

Recommended reason codes:

```text
AMOUNT_EXACT
AMOUNT_WITHIN_TOLERANCE
DATE_EXACT
DATE_PLUS_1
DATE_PLUS_2
REFERENCE_EXACT
REFERENCE_SIMILAR
DESCRIPTION_SIMILAR
UNIQUE_CANDIDATE
MULTIPLE_CANDIDATES
BOOK_ALREADY_CLAIMED
BANK_LINE_ALREADY_USED
DATE_LOW_CONFIDENCE
BALANCE_BREAK
PERIOD_LOCKED
DIRECTION_CONFLICT
BANK_ACCOUNT_CONFLICT
BOOK_DOMAIN_CONFLICT
POSSIBLE_TRANSFER
POSSIBLE_BANK_FEE
POSSIBLE_DUPLICATE
OUT_OF_PERIOD
REVERSED_BOOK_TRANSACTION
BOOK_TRANSACTION_EDITED
PARTIAL_AMOUNT
GROUP_SUM_MATCH
```

## 18.3 Confidence bands

Use bands, not raw percentages in Simple Mode:

| Band | Meaning |
|---|---|
| Strong | Safe-looking suggestion; still user-confirmed |
| Possible | Needs human decision |
| Weak | Show only as an alternative |
| None | No suitable candidate |

Professional Mode may display the numeric score in details.

---

# 19. Guided “Fix One by One” Flow

## 19.1 Purpose

Give low-confidence users a short, focused experience without removing the full workbench.

## 19.2 Entry

Primary CTA:

```text
Fix 4 items one by one
```

## 19.3 Standard layout

```text
┌───────────────────────────────────────────────────────────┐
│ Item 2 of 4                            Save & exit         │
│ ███████████░░░░░                                        │
├───────────────────────────────────────────────────────────┤
│ Is this the same transaction?                             │
│                                                           │
│ Bank                                                      │
│ 24 Jul · CEFT ABC · + Rs. 25,000                          │
│                                                           │
│ Suggested BookOne record                                  │
│ 24 Jul · Customer payment · + Rs. 25,000                  │
│                                                           │
│ Why: same date, same amount, unique record                 │
├───────────────────────────────────────────────────────────┤
│ [No, show other options]              [Yes, match them]    │
└───────────────────────────────────────────────────────────┘
```

## 19.4 Queue order

1. Blocking issues
2. Ambiguous matches
3. Possible transfers
4. Bank-only creates
5. BookOne-only timing items
6. Duplicates requiring reason
7. Safe confirmations, only if the user chose guided full review

## 19.5 Completion

After the queue:

```text
You fixed all 4 items.

Difference left: Rs. 0.00

[Review and finish reconciliation]
```

Do not immediately reconcile without the final summary.

---

# 20. Flow — Confirm an Existing Match

## 20.1 Preconditions

Server validates:

- Same tenant
- Same reconciliation session
- Correct selected bank account
- Compatible signed amount or explicit partial allocation
- Compatible direction
- Transaction not voided
- Transaction not reversed
- Transaction not already fully claimed by another active reconciliation case
- Book domain compatibility
- Date in permitted matching window or explicit override reason
- Session not closed
- Expected case version matches

## 20.2 User flow

```text
Open item
→ Review bank transaction
→ Review suggested BookOne record
→ Read reasons
→ Confirm match
→ Server revalidates
→ Relationship saved
→ Case becomes confirmed
→ Totals recalculate
→ Next item or return to table
```

## 20.3 Success copy

```text
Matched successfully

This bank transaction is now connected to the existing BookOne record.
No new journal was created.
```

---

# 21. Flow — Find Another BookOne Record

## 21.1 Search interface

The drawer opens:

```text
Find another BookOne record
```

Search fields:

- Text, party, reference
- Date range around bank date
- Same amount toggle, on by default
- Include wider dates
- Professional: include already reconciled, reversed, other domain only with permission

## 21.2 Candidate cards

Each candidate shows:

- Date
- Type
- Party / description
- Signed bank-account effect
- Existing match state
- Reason it fits
- Any conflict

## 21.3 Amount rule

A candidate with a different amount cannot be directly one-to-one matched unless:

- Partial matching is selected, or
- Adjustment/split mode is used.

## 21.4 Manual-link safety

The server must not accept a transaction merely because the client sent its ID.

---

# 22. Flow — Add a Missing Bank Transaction to BookOne

## 22.1 First question

For money in:

```text
What is this money in?
```

Options:

- Customer paid me
- Sale not recorded before
- My own money
- Loan received
- Transfer from another account
- Interest or other income
- Refund received
- I am not sure

For money out:

```text
What is this money out?
```

Options:

- Paid a supplier
- Business expense
- Bought an asset
- Loan repayment
- My own withdrawal
- Transfer to another account
- Bank fee
- Tax payment
- Refund paid
- I am not sure

## 22.2 Second screen

Show only fields required for the selected type.

Examples:

### Customer paid me

- Customer
- Invoice, optional or required depending on workflow
- Amount
- Date
- Bank
- Description
- Allocation if partial

### Bank fee

- Expense category, default suggestion allowed
- Amount
- Date
- Description

### Transfer

- Other account
- Date
- Amount
- Transfer fee if present

## 22.3 Category rules

- Suggestions are allowed.
- A wrong confident category is worse than an uncategorized entry.
- Use an approved **Uncategorized bank transaction** or suspense treatment when the user genuinely cannot classify the item.
- Do not default every money-out row to Other Expense.
- Do not default every money-in row to Other Income or Sales.
- Per-line category overrides must be available.
- Similar-row bulk application must show examples before applying.

## 22.4 Party rules

- Do not create a party master automatically.
- Do not invent a named customer or supplier.
- The bank narrative may be displayed as source text.
- If the user does not know the counterparty, use a non-party transaction label without creating a fake master record, subject to the accounting engine design.

## 22.5 Confirmation

```text
Add 6 entries to BookOne?

3 bank fees               Rs. 2,250.00 out
2 customer payments       Rs. 75,000.00 in
1 owner contribution      Rs. 50,000.00 in

Nothing else will be changed.
You can review each entry before confirming.

[Cancel] [Add 6 entries]
```

## 22.6 Posting

- Use `recordEntry` or the correct domain-specific posting action.
- Preserve import ID, line ID, session ID, case ID, fingerprint, source reference, and user decision in metadata or audit context.
- Each successful entry links back to the case.
- Failures remain open.

---

# 23. Flow — Transfer Between Bank Accounts

## 23.1 Detection

Possible transfer signals:

- CEFT, SLIPS, IFT, transfer wording
- Equal and opposite amounts on two owned bank accounts
- Dates within configured window
- Similar references
- Known own-account names

The engine may suggest but never confirm automatically.

## 23.2 User flow

```text
BookOne thinks this may be a transfer.

From: Sampath Current
To: HNB Savings
Amount: Rs. 100,000
Date difference: 1 day

[Not a transfer]
[Yes, this is a transfer]
```

## 23.3 Posting rule

Use the existing `move_money` accounting path.

Do not create:

```text
Expense in one bank
+ Income in the other bank
```

## 23.4 Pairing

The reconciliation case should connect:

- Source bank line
- Destination bank line, if imported
- One BookOne transfer transaction
- Both account-side effects

If the second bank statement is not yet imported:

- Create or match the transfer once.
- Mark the other account side as awaiting statement evidence.
- Reconcile the second side when available.

## 23.5 Transfer fee

If Rs. 100,000 leaves one account and Rs. 99,500 arrives:

```text
Transfer: Rs. 100,000
Bank fee: Rs. 500
```

Use a split/adjustment case, not an unexplained mismatch.

---

# 24. Flow — One Bank Line to Many BookOne Records

Examples:

- Card settlement covering multiple sales
- One deposit covering several invoices
- Batch payment
- Net settlement after fees

## 24.1 UI

```text
Bank transaction
Card settlement
+ Rs. 48,500

Selected BookOne records
+ Sale A        Rs. 30,000
+ Sale B        Rs. 20,000
- Bank fee      Rs.  1,500
--------------------------------
Total           Rs. 48,500
Difference      Rs.      0
```

Actions:

- Search and add BookOne records
- Remove selected record
- Add adjustment
- Allocate partial amount
- Confirm when difference is zero

## 24.2 Matching engine

Add bounded grouped-candidate search:

- Same selected bank account
- Compatible direction
- Date window
- Candidate group size initially 2–5
- Decimal exact sum or configured tolerance
- Strong preference for references and same party
- Never perform unbounded subset-sum work

## 24.3 Confirmation rule

The case cannot confirm while allocated totals differ unless an approved adjustment explains the difference.

---

# 25. Flow — Many Bank Lines to One BookOne Record

Examples:

- Several deposits entered as one daily total
- Split bank settlement
- Bank posts principal and interest separately while BookOne has one combined record

UI:

```text
Selected bank transactions
+ Deposit A     Rs. 10,000
+ Deposit B     Rs. 15,000
--------------------------------
Total           Rs. 25,000

BookOne record
Daily sales deposit
+ Rs. 25,000

Difference      Rs. 0
```

The user may select additional bank lines from the same session.

---

# 26. Flow — Partial Match

## 26.1 Examples

- Partial invoice payment
- Loan installment split
- Bank pays only part of a receivable
- One transaction spans statement periods

## 26.2 Required model

Use allocation amounts on relationship joins.

Do not mark the full BookOne transaction as reconciled if only part is matched.

## 26.3 UI

```text
Bank payment received       Rs. 40,000
Invoice open amount         Rs. 75,000

Allocate this payment:
Rs. 40,000

Invoice remaining:
Rs. 35,000
```

---

# 27. Flow — BookOne Record Not in the Bank

## 27.1 Meaning

This is not automatically an error.

Possible reasons:

- Outstanding cheque
- Deposit in transit
- Transfer pending
- Card settlement pending
- Book date differs from bank clearing date
- Wrong bank account used in BookOne
- Wrong date
- Reversed or cancelled payment
- Duplicate BookOne entry

## 27.2 User question

```text
This BookOne record did not appear in the bank statement.

What happened?
```

Options:

- It is still waiting to clear
- It cleared after this statement ended
- It belongs to another bank account
- The date is wrong
- The BookOne entry is wrong
- It was cancelled or reversed
- I need my accountant to review it

## 27.3 Outstanding state

When marked waiting to clear:

- Requires expected or optional clear date
- Includes reason
- Remains visible in the next period
- Carries forward until matched, cancelled, corrected, or explicitly cleared
- Contributes to explained timing difference

## 27.4 Aging

Professional Mode may show:

```text
Outstanding for 37 days
```

Long-outstanding items should become warnings.

Suggested thresholds configurable:

- 0–30 days: normal
- 31–60 days: check
- 61+ days: serious review

---

# 28. Flow — Duplicate or Excluded Item

## 28.1 Duplicate

Possible duplicate evidence:

- Same file hash
- Same source row hash
- Same line fingerprint
- Same external reference
- Already reconciled prior import
- Overlapping source files

## 28.2 Genuine repeated payments

Do not treat matching date, amount, and description as absolute proof of duplication when:

- External references differ
- Running balances prove two movements
- Two distinct source rows exist
- The user confirms they are separate

## 28.3 Exclusion reasons

Every excluded bank row requires one reason:

- Duplicate bank row
- Opening balance row
- Closing balance row
- Informational bank row
- Repeated header
- Statement total/footer
- Wrong account
- Not my transaction
- Import mapping error
- Other, with required note

## 28.4 Financial movement rule

A real money movement cannot be excluded merely to make the difference zero.

High-risk exclusions require elevated permission or accountant review.

## 28.5 UI copy

```text
Exclude this bank row?

Reason: Duplicate bank row

This will not create or match a BookOne entry.
The reason will remain in the audit history.

[Cancel] [Exclude row]
```

---

# 29. Flow — Skip / Leave for Later

## 29.1 Rule

“Skip” must not mean “resolved.”

Use:

```text
Leave for later
```

The case remains open and continues affecting progress and difference.

## 29.2 Deferred state

Record:

- Deferred by
- Deferred at
- Reason
- Optional assignee
- Optional note
- Required follow-up state

## 29.3 Completion

A deferred financial case blocks reconciliation unless policy allows an authorized reviewer to mark it as a formally explained outstanding item.

---

# 30. Flow — Undo, Unlink, and Reopen

## 30.1 Confirmed match

Allow:

```text
Undo match
```

Effect:

- Clear active relationship
- Preserve original BookOne transaction
- Preserve bank row
- Create audit event
- Reopen case
- Recalculate totals

## 30.2 Created entry

Allow:

```text
Reverse entry created from this reconciliation
```

Effect:

- Use controlled reversal
- Never hard-delete posted journal
- Reopen case
- Link reversal references
- Recalculate session

## 30.3 Completed session

Reopen only with permission and reason.

Example:

```text
Reopen July 2026 reconciliation?

Reason required.
This will not unlock the accounting period automatically.

[Cancel] [Reopen]
```

## 30.4 Broken-link detection

Automatically reopen affected cases when:

- Matched transaction is reversed
- Matched transaction is voided
- Amount changes through correction
- Bank account changes
- Book domain changes
- Transaction date moves outside allowed relationship
- Reconciliation relationship is superseded

The inbox should show:

```text
Reopened — 2 records changed
```

---

# 31. Final Review and Finish Screen

## 31.1 Purpose

Provide a calm final proof before reconciliation.

## 31.2 Wireframe

```text
Review July reconciliation

HNB Current Account
01–31 Jul 2026

Bank transactions                    118
Matched existing BookOne records      92
Added to BookOne                      14
Transfers                              4
Waiting to clear                       5
Duplicates / excluded                  3
Needs attention                        0

Bank closing balance          Rs. 1,245,300.00
BookOne balance               Rs. 1,240,300.00
Timing items                  Rs.     5,000.00
Difference left               Rs.         0.00

✓ All bank transactions handled
✓ All BookOne timing items explained
✓ No blocking import issues
✓ Difference is zero

[Back to workbench] [Finish reconciliation]
```

## 31.3 Confirmation wording

```text
Finish this reconciliation?

This will mark HNB Current Account for 01–31 Jul 2026 as reconciled.
It will not close the accounting period.

[Cancel] [Finish reconciliation]
```

## 31.4 Reconciled success

```text
Bank and BookOne agree

HNB Current Account
01–31 Jul 2026
Difference: Rs. 0.00

Reconciled by N. Perera
31 Jul 2026 at 6:12 PM

[View report] [Back to reconciliations]
```

## 31.5 Period close

A separate action:

```text
Close accounting period
```

Show only to authorized roles and only after required account reconciliations are complete.

---

# 32. Reconciliation Report

## 32.1 Required report sections

1. Company / tenant
2. Bank account
3. Masked bank account number
4. Statement period
5. Statement opening and closing balance
6. BookOne opening and closing balance
7. Reconciled bank transactions
8. New entries created
9. Outstanding cheques/payments
10. Deposits in transit
11. Transfers
12. Adjustments
13. Duplicates and exclusions with reasons
14. Difference calculation
15. Reconciled by and time
16. Reopened history, if any
17. Source file references and hashes
18. Audit reference

## 32.2 Export

- PDF
- CSV exception report
- Printable view

No sensitive full bank account number unless role permits.

---

# 33. Responsive Design

## 33.1 Desktop

Use the full two-sided table.

## 33.2 Tablet

- Preserve summary cards in 2×2 grid
- Collapse low-priority table metadata
- Drawer width approximately 70%
- Keep tabs horizontally scrollable

## 33.3 Mobile

Do not force a six-column table.

Use stacked cards:

```text
Needs your decision

BANK
24 Jul · CEFT ABC
+ Rs. 25,000

SUGGESTED BOOKONE RECORD
24 Jul · Customer payment
+ Rs. 25,000

Strong match
Same amount · Same date

[Review]
```

Mobile bottom navigation:

```text
Summary | Items | Difference
```

Use full-screen decision sheets.

---

# 34. UI States

## 34.1 Loading

Use meaningful stages:

```text
Checking bank transactions
Comparing with BookOne records
Preparing items that need your attention
Calculating the difference
```

Do not expose SQL, matching loops, hashes, or internal job names.

## 34.2 Empty filtered result

```text
No items match these filters.

Clear filters or choose another tab.
```

## 34.3 No issues

```text
Nothing needs your decision.

32 safe matches are ready for review.
```

## 34.4 Server conflict

```text
This item was updated by another user.

BookOne has refreshed the latest version.
Please review it again before confirming.
```

## 34.5 Session changed

```text
The reconciliation changed after a BookOne transaction was edited.

2 items were reopened.
```

## 34.6 Processing failure

```text
BookOne could not finish checking this reconciliation.

Your work is saved.
Try again without re-importing the statement.

[Try again]
```

---

# 35. Permissions

## 35.1 Suggested permission actions

```text
bank_import.create
bank_import.map
bank_import.commit
reconciliation.view
reconciliation.suggest
reconciliation.confirm_match
reconciliation.create_entry
reconciliation.resolve_transfer
reconciliation.mark_outstanding
reconciliation.exclude
reconciliation.reopen_case
reconciliation.finish
reconciliation.reopen_session
reconciliation.close_period
reconciliation.export
reconciliation.view_sensitive
```

## 35.2 Role examples

| Role | Typical permissions |
|---|---|
| Data entry | Import, review suggestions, defer |
| Junior accounts | Confirm safe matches, create allowed simple entries |
| Accountant | All reconciliation outcomes, adjustments, finish |
| Finance manager | Reopen, approve high-risk exclusions, close |
| Auditor | View and export only |
| Super admin | Technical recovery, not implicit financial approval |

## 35.3 Separation of duties

Optional organizational policy:

- One user prepares.
- Another user reviews and finishes.
- Same-user completion allowed for personal/simple workspaces.

---

# 36. Server-Side Validation

Every mutation must revalidate authoritative data.

## 36.1 Confirm match

Check:

- Tenant ownership
- Session state
- Case version
- Bank account compatibility
- Book domain compatibility
- Amount allocation
- Direction
- Date window or override
- Book transaction not voided
- Book transaction not reversed
- Transaction not already fully allocated
- Bank lines not allocated elsewhere
- Period policy
- User permission

## 36.2 Create entry

Check:

- Bank line unresolved
- Not duplicate
- Amount non-zero
- Valid date
- Period unlocked
- Classification allowed
- Category exists and allowed
- Bank account exists
- Idempotency key
- No prior created transaction
- Expected case version
- User permission

## 36.3 Outstanding item

Check:

- Book transaction affects selected bank
- Not already matched
- Statement period relevance
- Reason provided
- Carry-forward state valid

## 36.4 Exclusion

Check:

- Reason
- Whether row represents a financial movement
- Permission for high-risk exclusions
- Difference impact
- Source row history

---

# 37. Matching Engine Evolution

## 37.1 Preserve deterministic foundation

Continue using:

- Exact amount
- Signed direction
- Date proximity
- Description tokens
- External reference
- Candidate uniqueness
- Greedy claim control

## 37.2 Improve candidate scope

Exclude or flag:

- Transactions linked in another active reconciliation
- Voided transactions
- Reversed transactions
- Wrong bank account
- Wrong book domain
- Wrong tenant
- Fully allocated partial transactions

## 37.3 Repeated amount ambiguity

Same date and amount is not automatically safe when multiple candidates exist.

Force review if:

- Two candidates are close
- Repeated payroll amounts
- Repeated supplier payments
- Repeated round amounts
- Duplicate descriptions
- Candidate margin below threshold

## 37.4 Group suggestions

Add bounded:

- One-to-many sum suggestions
- Many-to-one sum suggestions
- Transfer pair suggestions
- Gross settlement plus fee
- Partial allocation suggestions

## 37.5 Explainable output

Matching engine returns:

```ts
{
  confidenceBand: 'strong',
  reasons: [
    { code: 'AMOUNT_EXACT', data: { amount: '25000.00' } },
    { code: 'DATE_EXACT', data: { date: '2026-07-24' } },
    { code: 'UNIQUE_CANDIDATE', data: {} }
  ],
  conflicts: []
}
```

The UI translates this to simple text.

## 37.6 AI policy

AI may later suggest:

- Transaction type
- Category
- Counterparty interpretation
- Unusual description explanation

AI must not:

- Change amount
- Decide debit/credit direction
- Finalize a match
- Create a journal without confirmation
- Override a balance mismatch
- Exclude a financial row
- Send full bank statements to an external model without explicit policy and consent

---

# 38. Recommended Database Additions

All migrations must be additive.

## 38.1 `bank_reconciliation_sessions`

Recommended fields:

```text
id
tenant_id
bank_account_id
book_domain
period_from
period_to
statement_reference
status
statement_opening_balance
statement_closing_balance
book_opening_balance_snapshot
book_closing_balance_snapshot
outstanding_net
adjustment_net
difference_amount
tolerance_amount
source_file_count
bank_line_count
resolved_case_count
open_case_count
version
prepared_by
reviewed_by
reconciled_by
reconciled_at
closed_by
closed_at
reopened_at
reopen_reason
created_at
updated_at
voided_at
```

## 38.2 `bank_reconciliation_session_imports`

```text
session_id
import_id
attached_by
attached_at
```

Unique:

```text
(session_id, import_id)
```

## 38.3 `bank_reconciliation_cases`

Use the case model described earlier.

## 38.4 `bank_reconciliation_case_bank_lines`

```text
id
tenant_id
case_id
bank_line_id
allocated_amount
role
created_at
voided_at
```

## 38.5 `bank_reconciliation_case_book_transactions`

```text
id
tenant_id
case_id
transaction_id
allocated_amount
role
created_at
voided_at
```

## 38.6 `bank_reconciliation_adjustments`

```text
id
tenant_id
session_id
case_id
adjustment_type
amount_signed
account_code
description
created_transaction_id
status
created_by
approved_by
created_at
voided_at
```

Adjustment types may include:

```text
bank_fee
interest
rounding
bank_error
book_error
exchange_difference
other
```

## 38.7 `bank_reconciliation_outstanding_items`

```text
id
tenant_id
session_id
transaction_id
case_id
reason
expected_clear_date
carried_from_session_id
cleared_in_session_id
status
created_by
resolved_by
created_at
resolved_at
voided_at
```

## 38.8 `bank_reconciliation_events`

Immutable event log:

```text
id
tenant_id
session_id
case_id
user_id
action
before_values
after_values
reason
created_at
```

## 38.9 `bank_reconciliation_snapshots`

Final immutable summary used by reports and later integrity checks.

---

# 39. Existing Schema Compatibility

## 39.1 Bank import tables remain staging authority

Continue using:

```text
bank_statement_imports
bank_statement_lines
bank_statement_import_events
bank_import_issues
bank_statement_profiles
bank_statement_profile_versions
```

## 39.2 Status migration strategy

Do not immediately remove existing line fields.

Treat:

- `bank_statement_lines.status`
- `proposed_action`
- `reconciliation_status`

as import/matching compatibility data.

The new reconciliation case and relationship tables become the authoritative state for completed reconciliation.

## 39.3 Existing URLs

Compatibility:

- Current import CTA continues working.
- Existing import IDs resolve to a session.
- Existing match route may open guided mode.
- Existing imported and created lines remain visible.
- No existing posted transactions are recreated.

---

# 40. Suggested Server Actions / APIs

## 40.1 Session

```text
createOrGetReconciliationSession
listReconciliationSessions
getReconciliationWorkbench
attachImportToSession
recalculateReconciliationSession
finishReconciliationSession
reopenReconciliationSession
closeReconciliationPeriod
```

## 40.2 Cases

```text
runReconciliationSuggestions
getReconciliationCase
confirmReconciliationMatch
bulkConfirmReconciliationMatches
searchReconciliationCandidates
createEntryFromReconciliationCase
resolveTransferCase
resolveGroupedMatch
resolvePartialMatch
markBookTransactionOutstanding
excludeBankLineFromReconciliation
deferReconciliationCase
reopenReconciliationCase
```

## 40.3 Undo

```text
undoReconciliationMatch
reverseReconciliationCreatedEntry
undoReconciliationExclusion
```

## 40.4 Query shape

Workbench response should be optimized and paginated:

```ts
type WorkbenchQuery = {
  sessionId: string;
  tab: string;
  q?: string;
  from?: string;
  to?: string;
  direction?: 'in' | 'out';
  result?: string[];
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
};
```

## 40.5 Concurrency

Every mutation includes:

```text
expectedSessionVersion
expectedCaseVersion
idempotencyKey
```

Return a structured conflict result rather than silently overwriting.

---

# 41. Audit Requirements

Audit every:

- Import attached
- Suggestion run
- Candidate selected
- Match confirmed
- Match undone
- Entry created
- Entry create failed
- Entry reversed
- Transfer confirmed
- Outstanding item created
- Outstanding item carried forward
- Outstanding item cleared
- Duplicate excluded
- Exclusion undone
- Case deferred
- Case reopened
- Session reconciled
- Session reopened
- Period closed
- Export generated

Each event records:

- Tenant
- User
- Role
- Session
- Case
- Bank line IDs
- Transaction IDs
- Before
- After
- Reason
- Time
- Request or idempotency reference

---

# 42. Source Data Integrity

## 42.1 Original evidence

Retain:

- Original file hash
- Filename
- Import user
- Import date
- Profile version
- Normalized row
- Raw source row or retained representation
- Transform log
- Exclusion reason
- Validation results

## 42.2 Immutability

Do not mutate the original normalized bank amount or date to make a match.

If mapping was wrong:

- Void or supersede the import through a controlled process.
- Preserve the original import.
- Create corrected normalized rows.
- Reopen affected reconciliation cases.
- Never silently rewrite evidence.

---

# 43. Edge-Case Catalogue

| Edge case | Required behaviour |
|---|---|
| Same file uploaded twice | Return or attach existing import; no duplicate rows |
| Same lines across overlapping files | Mark duplicate evidence; retain source references |
| Genuine repeated identical transactions | Use row identity, references, running balance, and user decision |
| Statement spans several months | Group by month; one session per accounting period unless authorized multi-period session |
| Statement starts mid-month | Show coverage warning |
| Missing days between files | Show statement gap warning |
| Closing balance missing | Allow matching; block normal reconciliation completion or require authorized transaction-only mode |
| Opening balance missing | Derive only when mathematically safe; otherwise show incomplete verification |
| Running balance discontinuity | Block or require review depending severity |
| Date format ambiguous | Force date review |
| Value date differs from transaction date | Preserve both; matching policy configurable |
| Bank reverses a transaction | Match reversal pair or create controlled reversal |
| Bank fee deducted from settlement | Group match plus fee adjustment |
| Transfer between own banks | One move-money transaction, two account-side reconciliations |
| Transfer second side not imported | Mark awaiting evidence in the other bank |
| One deposit covers several invoices | One-to-many allocation |
| Several deposits equal one daily record | Many-to-one allocation |
| Partial invoice payment | Partial allocation; invoice remains open |
| Cheque not presented | Outstanding payment carried forward |
| Deposit not credited | Deposit in transit carried forward |
| Long-outstanding cheque | Aging warning and review |
| Card settlement delayed | Wider explainable matching window |
| Wrong bank selected at import | Block session attachment; controlled reassignment only before dependent actions |
| Wrong book domain | Block match/create |
| Period locked | View allowed; mutations blocked according to policy |
| Transaction edited after match | Reopen case |
| Transaction reversed after match | Reopen case and show broken relationship |
| Created entry partially succeeds in batch | Show exact success/failure breakdown |
| Two users edit same case | Optimistic conflict and refresh |
| Session already reconciled | Read-only unless reopened with permission |
| Account archived | Historical view allowed; new actions restricted |
| Foreign currency | Preserve account currency, base amount, exchange difference; require professional review |
| Zero amount row | Exclude as non-financial with source reason |
| Informational balance row | Exclude with known row type |
| Macro-enabled file | Never execute macros |
| Spreadsheet formula injection | Escape on export and treat as data |
| Malicious HTML in description | Escape and sanitize display |
| Huge statement | Paginated/queued processing with saved progress |
| Re-import after rollback | Require idempotency and explicit reason |
| Bank error | Represent explicit bank-side adjustment; do not edit BookOne merely to force agreement |
| Book error | Use reversal/correction workflow |
| Tax payment | Classify through correct liability/expense path, not generic expense |
| Loan installment | Split principal and interest when required |
| Payroll batch | Group or match payroll posting, not individual expense duplication |
| Merchant settlement | Match gross sales/receivables plus fees and withholding |
| Cash deposit | Match cash-to-bank transfer, not income |
| Owner transfer | Owner contribution/drawing only after user confirms |
| Refund | Use correct reversal/refund flow |
| Chargeback | Use explicit chargeback treatment |
| Bank interest | Create interest income after confirmation |
| Withholding tax in settlement | Split and post to correct tax account |
| Rounding difference | Only within configured tolerance and with reason |
| Duplicate BookOne entry | Do not reconcile both; require correction |
| Statement line belongs to another account | Block and explain |
| Source file deleted from object storage | Reconciliation remains valid from immutable normalized evidence; flag evidence retention issue |
| Closing balance changed after file correction | Recalculate and reopen final state |

---

# 44. Copy and Language Guide

## 44.1 Preferred wording

Use:

- Already in BookOne
- Add to BookOne
- Needs your decision
- Waiting to clear
- Bank and BookOne agree
- Difference left
- Find another record
- This is a transfer
- Leave for later
- Review and finish
- Reopen
- Source file

Avoid in Simple Mode:

- Auto-post
- Debit
- Credit
- Jaccard
- Fingerprint
- Candidate set
- GL mutation
- Reconciliation status code
- Execute
- Submit
- Process

## 44.2 Critical reassurance copy

At import completion:

> Your bank transactions were saved for checking. BookOne has not changed your accounting entries automatically.

At match confirmation:

> This only connects the bank transaction to an existing BookOne record. It does not create or change a journal.

At create confirmation:

> This will add real BookOne entries for the selected bank transactions.

At finish:

> This marks the bank account as reconciled for this period. It does not close the accounting period.

---

# 45. Performance and Scale

## 45.1 Initial targets

- 5,000 visible normalized rows per import supported without UI failure
- Server-side pagination
- Workbench first meaningful view under 2 seconds for normal monthly statements
- Suggestion processing shown with meaningful progress
- Idempotent retries
- Candidate search limited and indexed
- Group matching bounded
- No loading all source rows into the browser

## 45.2 Indexes

Consider indexes on:

```text
tenant_id, bank_account_id, transaction_date
session_id, review_state
session_id, suggested_outcome
session_id, updated_at
bank_line_id
transaction_id
fingerprint
external_ref
status, voided_at
```

## 45.3 Caching

Cache read summaries carefully, but invalidate after every case mutation.

Never cache across tenants.

---

# 46. Observability

Track non-sensitive metrics:

- Reconciliation sessions started
- Sessions completed
- Median time to reconcile
- Percentage of bank lines matched existing
- Percentage created
- Percentage marked outstanding
- Percentage transferred
- Duplicate prevention count
- Reopened session rate
- Broken-link rate
- Difference-nonzero rate
- Average decisions per session
- Bulk confirmation reversal rate
- Create failure rate
- Long-outstanding item count
- Support escalation rate
- Guided mode usage
- Professional mode usage
- User abandonment point
- Concurrency conflicts
- Number of high-risk exclusions
- Number of sessions finished with tolerance

Do not log full bank narratives in analytics.

---

# 47. Testing Strategy

## 47.1 Unit tests

- Signed amount conversion
- Bank balance calculation
- Outstanding adjustment formula
- Difference calculation
- Match reason generation
- Repeated amount ambiguity
- One-to-many allocation totals
- Many-to-one totals
- Partial allocation
- Transfer pair signs
- Tolerance handling
- Session status derivation
- Case state transitions
- Reopen detection
- Permission checks
- Idempotency

## 47.2 Integration tests

- Import → session creation
- Multiple imports → one session
- Confirm one-to-one match
- Undo match
- Create missing entry
- Partial batch create failure
- Reverse created entry
- Mark outstanding
- Carry outstanding to next period
- Transfer across two banks
- Group match plus fee
- Finish reconciliation
- Reopen after transaction edit
- Locked period behavior
- Concurrent updates
- RLS isolation
- Soft void

## 47.3 E2E scenarios

Add scenarios to `docs/E2E_SCENARIO_CATALOG.md`.

Minimum:

1. Non-technical user completes a clean monthly reconciliation.
2. User confirms 20 safe matches after reviewing all.
3. User fixes an ambiguous repeated amount.
4. User creates a bank fee.
5. User classifies money in as owner contribution, not sale.
6. User resolves a transfer.
7. User marks an outstanding cheque.
8. User matches one bank settlement to several BookOne records.
9. User handles partial creation failure.
10. User undoes a match.
11. User reverses an entry created from reconciliation.
12. Reconciled session reopens after transaction correction.
13. User cannot post into a locked period.
14. Two users update the same case.
15. Mobile guided flow.
16. Keyboard-only flow.
17. Sinhala mode labels and layout.
18. Duplicate overlap file.
19. Missing closing balance.
20. Difference cannot be forced to zero through exclusion.

## 47.4 Usability tests

Test with:

- Older non-IT user
- Junior accounts clerk
- Senior manager with occasional system use
- Accountant
- Sole proprietor
- Sinhala-first user

Success criteria:

- User identifies next action without explanation.
- User understands match versus create.
- User understands waiting to clear.
- User does not accidentally classify transfer as income/expense.
- User can explain Difference left.
- User can resume after leaving.
- User can undo a mistake.

---

# 48. Acceptance Criteria

## 48.1 Reconciliation inbox

- [ ] Groups work by bank account and period
- [ ] Supports multiple source files
- [ ] Shows exact remaining work
- [ ] Shows Difference left
- [ ] Uses clear statuses
- [ ] Has search, date, bank, and status filters
- [ ] Preserves cashbook and ERP shells

## 48.2 Workbench

- [ ] Shows balance cards
- [ ] Shows resolved progress
- [ ] Shows two-sided bank/BookOne table
- [ ] Includes required tabs
- [ ] Default opens attention work
- [ ] Provides row detail drawer
- [ ] Supports table and guided modes
- [ ] Supports bulk selection safely
- [ ] Is responsive and keyboard accessible

## 48.3 Accounting

- [ ] Match before create
- [ ] No auto-sale assumption
- [ ] No generic-expense bulk default without review
- [ ] Transfers use move-money
- [ ] BookOne-only timing items supported
- [ ] One-to-many supported
- [ ] Many-to-one supported
- [ ] Partial allocation supported
- [ ] Created entries use accounting engine
- [ ] Corrections use reversal
- [ ] Period locks enforced
- [ ] Difference must be zero or authorized under explicit policy

## 48.4 Safety

- [ ] Manual match server validation
- [ ] Cross-session uniqueness
- [ ] Duplicate evidence retained
- [ ] Exclusion reason required
- [ ] Leave-for-later remains unresolved
- [ ] Partial failures visible
- [ ] Optimistic concurrency
- [ ] Idempotency
- [ ] Full audit
- [ ] Reopen on broken relationship

## 48.5 Completion

- [ ] No “All set” with open items
- [ ] Final review screen
- [ ] Reconciliation separate from close
- [ ] Immutable final snapshot
- [ ] Formal report available

---

# 49. Implementation Phases

## Phase 0 — Terminology and state cleanup

- Introduce session and case types.
- Define authoritative state transitions.
- Define reason-code catalog.
- Add compatibility mapping from current line statuses.
- Keep current wizard operational during development.

## Phase 1 — Reconciliation inbox

- Create account-period sessions.
- Attach existing imports.
- Replace file-first task cards with session cards.
- Show progress, attention count, and difference.
- Add routes and compatibility redirects.

## Phase 2 — Read-only two-sided workbench

- Balance cards
- Tabs
- Paginated table
- BookOne-only candidate loading
- Detail drawer
- Explainability
- Audit timeline
- No new mutation beyond current safe functions

## Phase 3 — Safe one-to-one workflow

- Strong match bulk review
- Candidate search
- Manual server validation
- Undo match
- Optimistic locking
- Reopen behavior

## Phase 4 — Missing entries and classification

- Plain-language transaction type resolver
- Per-line categories
- Similar-row application
- Safe uncategorized treatment
- Exact partial failure reporting
- Reverse created entry

## Phase 5 — True reconciliation

- BookOne-only timing items
- Carry-forward outstanding items
- Difference calculation
- Final review
- Reconciliation snapshot
- Report

## Phase 6 — Transfers and grouped relationships

- Transfer pairing
- One-to-many
- Many-to-one
- Partial allocation
- Fee/adjustment support

## Phase 7 — Close and governance

- Reviewer workflow
- Reopen permissions
- Period close prerequisites
- Export
- Operational metrics
- Full E2E coverage

---

# 50. Recommended Component Structure

```text
components/reconciliation/
  reconciliation-inbox.tsx
  reconciliation-session-card.tsx
  reconciliation-workbench.tsx
  reconciliation-summary-cards.tsx
  reconciliation-progress.tsx
  reconciliation-tabs.tsx
  reconciliation-toolbar.tsx
  reconciliation-table.tsx
  reconciliation-mobile-card.tsx
  reconciliation-case-drawer.tsx
  reconciliation-reason-list.tsx
  reconciliation-candidate-search.tsx
  reconciliation-create-entry-flow.tsx
  reconciliation-transfer-flow.tsx
  reconciliation-group-match.tsx
  reconciliation-outstanding-flow.tsx
  reconciliation-exclusion-dialog.tsx
  reconciliation-final-review.tsx
  reconciliation-audit-timeline.tsx
  reconciliation-source-files.tsx
  reconciliation-balance-breakdown.tsx
  reconciliation-guided-queue.tsx
```

Shared server actions should remain under a clearly bounded reconciliation action module rather than spreading financial mutations across UI components.

---

# 51. State Transition Rules

## 51.1 Case transitions

```text
suggested
  → needs_review
  → confirmed
  → reopened
  → confirmed

suggested
  → confirmed

needs_review
  → blocked
  → needs_review

confirmed
  → superseded
```

Invalid:

```text
suggested → closed
blocked → confirmed without resolving block
confirmed → deleted
```

## 51.2 Session transitions

```text
draft
→ ready
→ in_progress
→ ready_to_finish
→ reconciled
→ closed
```

Alternative:

```text
reconciled
→ reopened
→ in_progress
→ ready_to_finish
→ reconciled
```

Void is a controlled terminal branch, not ordinary deletion.

---

# 52. Formal Definition of Resolved

A case is resolved only if one of the following is confirmed:

- Valid match to existing BookOne transaction(s)
- Valid created BookOne transaction
- Valid transfer
- Valid outstanding timing item
- Valid duplicate
- Valid exclusion with permitted reason
- Valid explicit adjustment
- Superseded by another confirmed case

A suggestion, deferred item, failed create, or hidden row is not resolved.

---

# 53. Formal Definition of Reconciled

A session is reconciled only when:

```text
all cases resolved
AND no blocking import issues
AND no broken relationships
AND no unauthorized exclusions
AND difference left = 0 within allowed tolerance
AND final review confirmed
```

A session with unresolved cases may be saved but not reconciled.

---

# 54. Coding-Agent Rules

The coding agent must:

1. Read `AGENTS.md`.
2. Read `docs/BANK_IMPORT_STUDIO.md`.
3. Read this specification completely.
4. Inspect the current statement import actions and match wizard.
5. Use additive migrations only.
6. Preserve RLS.
7. Preserve existing imports and accounting entries.
8. Reuse `recordEntry` and reversal actions.
9. Avoid a second matching engine.
10. Keep UI state and server state separate.
11. Revalidate every mutation on the server.
12. Use decimal-safe money operations.
13. Add audit events.
14. Add E2E scenarios or backlog entries.
15. Keep Simple Mode plain-language.
16. Hide advanced data unless requested.
17. Never use AI as financial authority.
18. Never mark a session reconciled merely because the user exited the flow.
19. Never treat skip as resolved without an approved accounting outcome.
20. Never use filename as the main reconciliation object.

---

# 55. Final Product Definition

The final BookOne experience must feel like:

```text
1. Import the official bank file.
2. BookOne checks it against the selected bank account and BookOne records.
3. BookOne immediately confirms nothing was silently posted.
4. The reconciliation inbox shows the account and period.
5. The workbench shows:
   - what already matches,
   - what needs a decision,
   - what must be added,
   - what is waiting to clear,
   - what is duplicate,
   - and the remaining difference.
6. The user fixes only the exceptions.
7. BookOne proves the balance.
8. The user reviews and finishes.
9. The audit report remains available.
```

The quality measure is not simply whether BookOne can match many bank transactions.

The quality measure is whether BookOne can prevent an ordinary user from:

- Creating duplicates
- Matching the wrong account
- Treating transfers as income or expenses
- Treating every deposit as a sale
- Treating every withdrawal as an expense
- Hiding real bank movements as skipped rows
- Finishing with an unexplained difference
- Editing closed-period accounting accidentally
- Losing work
- Being unable to understand or undo a decision

The target product is:

> **A conservative, explainable, two-sided bank reconciliation engine that is easy for non-accountants but strong enough for professional accounting review.**
