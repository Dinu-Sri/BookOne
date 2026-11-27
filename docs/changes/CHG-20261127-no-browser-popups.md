# CHG-20261127-no-browser-popups (v2.31.2)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved).
- Source: the owner's staging check of v2.31.1:
  - changing a job showed a browser pop-up ("staging.clossyan.com says…"); BookOne must never use browser messages, only its own professional dialogs;
  - the Jobs Save button sat at the very bottom of a long page.

## Changes

- **New `components/ui/ask.tsx`:**
  - `askConfirm({ title, message, confirmLabel, cancelLabel, tone })` returns a Promise of a boolean;
  - `askText({ title, label, defaultValue })` returns a Promise of a string or null;
  - both render the existing `ConfirmDialog` (focus trap, Escape, return focus) in a short-lived root.
- **All 11 browser pop-ups replaced** with a clear title, message and button label. Each enclosing handler became `async`:

  | Screen | Pop-ups replaced |
  |---|---|
  | Jobs | Leave without saving? (the "unsaved job changes" wording is kept for the AgentBridge-01 source check) |
  | Bank import match wizard | add entries, skip lines, undo entries |
  | Statement import wizard (English and Sinhala) | import lines, add entries, undo entries, discard import |
  | POS till | switch mode and clear the cart, clear the cart |
  | Rich text editor | the link prompt is now `askText` |

- **No regression is possible:** `packages/auth/test/no-browser-popups.test.ts` fails if `apps/web/src` calls `window.alert`, `window.confirm` or `window.prompt` again. No e2e test relied on browser dialogs.
- **Jobs Save:**
  - Save job is also in the card header, which sticks under the 72 px app bar;
  - the bottom save bar now really sticks (the card no longer clips overflow, which had disabled `position: sticky`);
  - both show the unsaved state.
- **Rule book:**
  - rule 8 forbids browser pop-ups and names the helpers;
  - rule 3 requires Save to stay visible on long forms (sticky header plus sticky bar, no `overflow: hidden` parent, 72 px offset);
  - the review checklist has a new line for both.

## Evidence

- Typecheck passes.
- Auth tests: 247 (+5 skipped), including the new no-popups test.
- CI browser set (AgentBridge-01, connect and consent, UI-NAV-01, DB-01, COA-01, UI-02): 40 of 40.
- Not yet checked: staging.

## Rollback

Revert the commit.
