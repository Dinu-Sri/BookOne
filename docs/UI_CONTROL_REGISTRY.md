# BookOne UI control registry

Canonical shared controls for **new or changed** BookOne UI. Reuse these primitives. Do not add a second design kit, palette, or typography system. The showcase at `/design-system` is a demo, not proof of production behaviour.

UI-02 CoreGuard enforces this registry with an AST lint (`packages/auth/test/ui-consistency.ts`) plus browser fixtures (`apps/web/e2e/ui-02.spec.ts`). Accounts and Advances must stay at zero violations. Legacy screens keep a recorded baseline that cannot grow.

## Approved wrappers (AST allow-list)

| File | Export | Use for |
|---|---|---|
| `apps/web/src/components/ui/text-field.tsx` | `TextField`, `AmountField`, `TextAreaField`, `SearchField` | Visible text, money, multiline, list search |
| `apps/web/src/components/ui/select-field.tsx` | `SelectField` | Real labelled combobox (portal, keyboard, search from 8 options, hidden `name` input) |
| `apps/web/src/components/ui/date-field.tsx` | `DateField` | Single calendar date, ISO `YYYY-MM-DD` |
| `apps/web/src/components/ui/form-shell.tsx` | `FormBackLink`, `FormShell`, `FormFooter` | Create/detail/opening/import top Back and footer |

Existing production primitives that stay in use:

| File | Export | Use for |
|---|---|---|
| `apps/web/src/components/ui/bookone-ui.tsx` | `Button`, `Card`, `Badge` | Actions, cards, status |
| `apps/web/src/components/ui/confirm-dialog.tsx` | `ConfirmDialog` | Archive/reactivate and other destructive confirms |
| `apps/web/src/components/ui/form-busy.tsx` | `withFormPending` | Client writes that should show Working… |
| `apps/web/src/components/layout/date-range-picker.tsx` | `DateRangePicker` | List period filter (`compact` keeps the calendar in-flow) |
| `apps/web/src/components/module/product-add-search.tsx` | `ProductAddSearch` | Catalogue product entry |

`SelectLike` in `bookone-ui.tsx` is a decorative focusable div with a chevron. Do not use it as a working select.

## Field contract

- Visible text/amount/textarea controls use class token `.input` inside `.field`, with a persistent `<label htmlFor>`.
- Amounts keep server decimal validation. Do not coerce blank, invalid, or negative values into money.
- Search on list screens uses `SearchField` (`input party-search`) in `party-toolbar`.
- Help and errors sit next to the control (`.field-help`, `.form-error`).
- Hidden, checkbox, radio, file, submit, button, reset, and image inputs remain allowed HTML. They are exempt from the unstyled-field rule.

## Select contract

- Use `SelectField`. Option `value` is the server identifier (account code, party id, document id). The visible label may include code + name.
- Keyboard: ArrowDown/Enter/Space open, arrows move, Enter picks, Escape/outside click closes and returns focus.
- Search appears when there are 8 or more options. Empty, no-match, and disabled reasons are visible text.
- Menu is portalled at z-index 320 using `menuPosition`.
- Native `<select>` is not allowed on new or changed UI outside the approved wrapper files.

## Date contract

- Use `DateField`. Value is date-only ISO `YYYY-MM-DD` via local year-month-day (parse at noon local to avoid TZ shift).
- Blank stays blank. The trigger says **Select date**. Do not show today for an empty required date.
- `compact` keeps the calendar in-flow for nested period controls. Default (`!compact`) portals the calendar.
- Native `type="date"`, `time`, `datetime-local`, `month`, and `week` are not allowed outside `date-field.tsx`.

## Navigation and lists

- Create, detail, opening, import, and nested Accounts forms use `FormShell` / `FormBackLink` with a safe `href` (Accounts parent is `/accounts`). Do not use `router.back()` as the only return path.
- Cancel/Back is `type="button"` and does not submit.
- Lists follow `docs/LIST_TABLE_UX_GUIDE.md`: toolbar, sortable headers, page size 10, `doc-action-panel` portal (z ≥ 300).
- Protected actions (system Archive) stay hidden in the UI and remain refused on the server.

## Labels

Human-readable class, subtype, liquidity, control, kind, and status strings live in `apps/web/src/lib/coa-labels.ts`. Do not render raw enums such as `operating_expense` in the UI.

## Exceptions

New exceptions name location, rule, reason, owner, and review trigger. Do not exclude a whole new directory. Changing a legacy file that still has native controls requires repairing that file or recording a reviewed exception. The baseline JSON is `packages/auth/test/ui-02-baseline.json`.
