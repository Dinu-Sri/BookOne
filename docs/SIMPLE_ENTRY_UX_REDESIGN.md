# Simple Entry UX Redesign Reasoning

Date: 2026-06-20

This note records the reasoning used to redesign the Simple Entry screen. Use it as a reference when redesigning other BookOne operational screens.

## Goal

Simple Entry is the fastest daily posting surface in BookOne. The screen should help a non-accounting user record a real business event with minimal thinking, minimal mouse travel, and a predictable keyboard flow.

## Main Problem Observed

The previous layout centered a narrow card on a wide desktop viewport. That created large unused left and right areas while the actual fields stacked vertically in the middle. Users could need to scroll even though the screen had enough horizontal space.

## Design Principles

1. Use available desktop width before adding vertical height.
2. Keep the fast path visible above the fold.
3. Separate required business facts from supporting details.
4. Make accounting intelligence visible, but not dominant.
5. Keep optional work optional.
6. Preserve keyboard-first entry.

## New Layout Logic

The screen is now a wide entry console:

- Top strip: transaction type selection.
- Left lane: primary event capture.
- Right rail: payment, date, receipt, and submit.

The left lane contains the fields users think about first:

- Who was involved?
- How much?
- What was it for?
- What category did BookOne infer?

The right rail contains details that are often defaulted or secondary:

- Bank/cash/card account.
- Payment method.
- Date.
- Receipt.
- Submit action.

This places the highest-value fields closest together and keeps the action button visible on desktop.

## Keyboard Flow

The intended tab order is:

1. Selected transaction type.
2. Party / reference.
3. Amount.
4. Description.
5. Account controls.
6. Payment method.
7. Date.
8. Receipt actions.
9. Submit.

Only the selected transaction-type button is tabbable. Arrow keys can move between transaction types. This prevents users from tabbing through four mode buttons on every entry.

After a successful record, the form clears and focus returns to the party/reference field so the next entry can start immediately.

## Minimum Clicks

The default mode remains Money Out because that is likely the most common daily bookkeeping entry. Today is selected automatically. Bank is inferred from the selected account where possible.

Common path:

1. Type party.
2. Type amount.
3. Type description.
4. Press submit.

Users only touch category override, receipt, date, or account when the default is wrong.

## Non-Accounting Clarity

The screen avoids debit/credit language. It uses business words:

- Money In
- Money Out
- Move Money
- Invoice/Bill
- Paid to
- Paid from
- What was it for?

The category result is shown as BookOne's interpretation of the description, not as a mandatory accounting field.

## Priority and Visual Hierarchy

The first visual priority is the selected transaction type and the primary fields. Amount receives stronger typography. The right rail is visually quieter but still accessible.

Receipt is compact because it is optional. It should not take the same visual weight as party, amount, or description unless a receipt is attached.

## Edge Cases

### Move Money

Move Money shows both From account and To account. The party label changes to Reference because transfers do not usually involve a customer or supplier.

### Invoice/Bill

Invoice/Bill currently shares the Simple Entry pattern, but it may need its own dedicated flow later because invoices and bills need due dates, open balances, settlement state, and party-specific aging.

### Locked Periods

Date remains visible in the right rail because locked-period errors are date-related. The backend already prevents posting into locked periods. Future UI work should surface a warning immediately when a locked month is selected.

### Receipts

Receipt upload stays in the right rail because it supports the entry but should not block the core posting flow. Attached receipts should remain visible and removable.

### Small Screens

The layout collapses into one column under narrower breakpoints. The primary event fields remain above supporting details.

## Reusable Pattern for Other Screens

For operational screens, prefer this structure:

- Primary lane: the fields or data that directly complete the user's task.
- Supporting rail: filters, metadata, optional uploads, secondary controls, and submit/review actions.
- Keep the primary action visible.
- Let defaults do work.
- Reduce tab stops that are not part of the common path.
- Use business language first; accounting/system language second.

