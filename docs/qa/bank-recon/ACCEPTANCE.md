# Bank reconciliation simple compare — candidate evidence

Product **2.14.4**. Fixture `docs/coreguard/fixtures/bank-recon.v1.json` plus ISO/serial/invalid CSVs. Pilot company tenants import at `/reconciliation/import`. Live retest 2026-11-20 of v2.14.3 · 7513520 found inbox Rs. 0.00 vs compare LKR 1,400.00, hardcoded fee captions, and guided Add to BookOne.

## Implemented

- ISO `YYYY-MM-DD` and Excel serial dates normalize to the same four dates. Two-digit `11/3/26` is not guessed without an explicit format.
- Studio always confirms the named bank. A one-sheet file is skipped with a Change reason. High-confidence CSV uses one mapping table: Date · Description · Bank reference · Money · Running balance.
- Statement equation is visible before save: 1,000 + 625 − 225 = 1,400. Row counts sum to input rows.
- Compare workbench: Bank statement left, BookOne right. States Possible match / Bank only / BookOne only / Waiting to clear / Matched / Needs decision. One Confirm match action. Search BookOne before create. Review & finish is hidden until eligible. Server recomputes the same close rule.
- Inbox, compare and classic use `bankClose − bookClose + outstandingNet`. Unverified when bank or BookOne closing is missing. A stored 0 is not treated as an explained difference.
- Create category lists eligible company expense/income accounts with their actual names. Seeded 6800 posts as General Expense, not a hardcoded Bank fees caption.
- Guided bank-only starts with Search BookOne, then create. It does not offer Add to BookOne as the first action.
- Guided and classic first paint no longer treat `session=null` as not found while the query is still opening.
- Seeded CoreGuard: opening 1,000, matching +500/−200/+125, BookOne-only +60, fee created in the run. Import + Confirm match do not add journals. After fee and waiting, BookOne 1,460 − 60 = bank 1,400. Finish once.

## Still independent QA

- Ambiguous same-amount pairs, date-boundary edges, duplicate re-import, Viewer write denial on a live session, laptop/narrow screenshots, keyboard-only remapping.
- Live-tenant matching, invalid-direction correction, and live posting-account selection after this image deploys. Encrypted restore LAST.
