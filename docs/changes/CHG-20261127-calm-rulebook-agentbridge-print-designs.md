# CHG-20261127-calm-rulebook-agentbridge-print-designs (v2.26.0)

Status: ready-for-QA after the staging deploy (not yet checked on staging).

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved), on top of v2.25.5.
- Source: the owner's request to:
  - make the bank reconciliation UI approach the rule book for all future work;
  - redesign the AgentBridge and Commerce connection screens;
  - let assistants design print templates with compulsory and optional parts, logo checks and versions, with no delete by agents.

  The owner decided that a person approves agent designs, and that the first release covers the existing print items plus a proforma invoice.
- No QA finding and no UX/UXW/WB ID. The QA design inventory reference stays `024f8c35223a28c0662d469b71cd96579d4ee24d`.

## Changes

1. **Rule book.** `docs/UI_DESIGN_RULEBOOK.md` (calm screens: ten rules plus a review checklist) and the shared `.ux-*` layout kit in `globals.css`, including `.ux-switch`. It is mandatory through `AGENTS.md`, `.claude/CLAUDE.md`, `UI_UX_CHANGE_GUIDE` and `UI_CONTROL_REGISTRY`.
2. **AgentBridge screen** (`company-agent-bridge.tsx`), redesigned:
   - status line;
   - three plain switches (form field names unchanged);
   - compact Copy cards with the prompt folded;
   - Connected assistants with Change abilities and Revoke access in a ConfirmDialog;
   - Technical details folded.

   Kept: the "Copy connection prompt" and "Save AgentBridge settings" buttons, the prompt textarea labels, the "Connect with …" headings and the `.ab-prompt-card` class. The e2e markup mirror and spec were updated: the empty state is now a paragraph instead of a table cell, and a switch check was added.
3. **Print designs:**
   - new package `@bookone/print-design` (format, element catalogue, compulsory sets, validation, defaults, assistant guide; 25 tests);
   - tables `print_designs` and `print_design_assets` (migration 059 with RLS, added to the backup archive);
   - renderer, document adapters and screens under Company → Print designs. The menu entry "Document styles" became "Print designs", and Document styles is reachable as "Standard look";
   - proforma invoice routes (from a quotation or a sales order) and a dispatch note route;
   - POS bill, purchase order, payment voucher and packing slip use an approved design when one is in use.

   With no design in use, prints are unchanged. Documents remember the design version they first printed with.
4. **AgentBridge abilities.** Capabilities `design_read` / `design_write`, job keys `agent_bridge.design_*` (module company) and 8 tools. There is no delete, approve or use tool. Optional abilities (product mapping included) stop when "Allow AI assistants" is off. The AB-04 pinned action-key list was extended with the two keys. 5 new tests.

## Evidence

- Typecheck passes for all packages.
- Unit tests:

  | Package | Tests |
  |---|---|
  | print-design | 25 |
  | agent-bridge | 167 |
  | auth | 246 (+5 skipped) |
  | accounting | 302 |
  | commerce | 78 |
  | statement-import | 48 |

- UI-02 lint passes. It once timed out under parallel turbo load and passed on rerun.
- AgentBridge connect e2e: 5 of 5 pass locally.
- Not run: the Next build (runs in CI) and any staging check.

## Not done yet

- Commerce Integrations redesign (the next work package).
- Staging review of AgentBridge and Print designs at three sizes.
- A live assistant designing from a screenshot.

## Rollback

Revert the commit. Migration 059 is additive. Prints fall back to the standard print.

## v2.26.1: editor panel without sideways scrolling

**Owner check:** the print design editor's left panel scrolled sideways.

**Cause:** the panel's grid column took the width of its widest content (select labels, part names), so sections were 564 px wide inside a 405 px panel.

**Fix:**
- shrinkable grid tracks (`minmax(0, 1fr)`) for the panel and the two-column field rows;
- truncated select labels;
- part names shown in full, with their location on a small second line.

**Verified on staging** (ZZ-TEST, VAT tax invoice draft) with the CSS injected: with the items table part open, the panel's scroll width equals its client width (405).
