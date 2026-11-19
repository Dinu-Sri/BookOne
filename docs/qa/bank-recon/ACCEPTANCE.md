# Bank reconciliation simple compare — candidate evidence

Product **2.14.1**. Fixture `docs/coreguard/fixtures/bank-recon.v1.json` plus ISO/serial/invalid CSVs. v2.14.0 Production Check `44571222338` failed web `tsc`; this candidate types the Studio save confirmation and statement-equation difference.

## Implemented

- ISO `YYYY-MM-DD` and Excel serial dates normalize to the same four dates. Two-digit `11/3/26` is not guessed without an explicit format.
- Studio always confirms the named bank. A one-sheet file is skipped with a Change reason. High-confidence CSV uses one mapping table: Date · Description · Bank reference · Money · Running balance.
- Statement equation is visible before save: 1,000 + 625 − 225 = 1,400. Row counts sum to input rows.
- Compare workbench: Bank statement left, BookOne right. States Possible match / Bank only / BookOne only / Waiting to clear / Matched / Needs decision. One Confirm match action. Search BookOne before create. Review & finish is hidden until eligible. Server recomputes the same close rule.
- Guided and classic first paint no longer treat `session=null` as not found while the query is still opening.
- Seeded CoreGuard: opening 1,000, matching +500/−200/+125, BookOne-only +60, fee created in the run. Import + Confirm match do not add journals. After fee and waiting, BookOne 1,460 − 60 = bank 1,400. Finish once.

## Still independent QA

- Ambiguous same-amount pairs, date-boundary edges, duplicate re-import, Viewer write denial on a live session, laptop/narrow screenshots, keyboard-only remapping.
- Live-tenant reconciliation. Encrypted restore LAST.
