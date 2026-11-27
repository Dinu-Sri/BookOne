# BookOne UI design rule book: calm screens

Effective 2026-11-27, at the owner's request. **Every new or changed screen MUST follow this rule book.** It sits on top of [UI_UX_CHANGE_GUIDE](UI_UX_CHANGE_GUIDE.md) (process and QA contract), [UI_CONTROL_REGISTRY](UI_CONTROL_REGISTRY.md) (controls) and [LIST_TABLE_UX_GUIDE](LIST_TABLE_UX_GUIDE.md) (lists). Those still apply. This rule book decides how a screen *looks and reads*.

The reference implementation is the bank reconciliation module (v2.25):
- home: `reconciliation-inbox.tsx`;
- import: `bank-import-studio/*`;
- workspace: `reconciliation-compare.tsx`.

When this rule book and an older screen disagree, the rule book wins for new and changed work.

## Who we design for

The user is a shop owner or clerk, not an accountant or a developer. They should know **what this screen is for and what to do next within five seconds**, without reading help.

Every rule below serves that goal: fewer things on screen, plain words, one obvious next step.

## The ten rules

### 1. One purpose, one sentence, one primary action

- The page head has:
  - a title;
  - **one** plain sentence saying what the screen is for;
  - the single most important action as the only primary (blue) button.
- Other actions are secondary buttons or quiet links.
- No screen has two primary buttons visible at once. In a dock or dialog, the primary is the action that moves the user forward.

### 2. Plain words, the user's words

- Name things by what the user understands, not by how the system is built. For example:

  | Internal | Shown to the user |
  |---|---|
  | session, case | reconciliation, item |
  | outstanding | waiting to clear |
  | difference | left to explain |
  | scope | what it can do |
  | client | assistant |
  | MCP URL, OAuth, JWKS, token, issuer | goes under **Technical details** |

- One action keeps one name through the whole flow: the button, the dialog title, the confirm button and the toast. Example: "Create in BookOne" → "Create this BookOne entry?" → "Create entry" → toast "Added to BookOne".
- Never show raw enums, ids, hashes or codes as the main text. Codes may follow a name, e.g. "Commercial Bank (1100)".
- Sentence case everywhere. **No ALL-CAPS labels, eyebrows or table headers** (uppercase via CSS counts too).
- Numbers: 2 decimals for money, tabular figures, the currency once per group rather than on every cell when space is tight.

### 3. Fill the screen, scroll inside, not the page

- **Work screens** (matching, reviewing, mapping, editing a design):
  - size to the window under the top bar (`height: calc(100dvh - 72px - …)`);
  - lists scroll inside their own pane;
  - the page itself must not scroll at **1366×768**.
- **Settings and overview screens** may scroll, but the primary action stays reachable: put it in the page head or a sticky footer, not at the bottom of a long form.
- Use the width. A main column plus a 300 px guide aside (`.ux-split`) beats one narrow centred column with empty space on both sides.
- A one-question step (upload a file, pick an account) sits in a compact centred card with its buttons attached. It must not be a tall empty card with the button far away.

### 4. Show only what applies now (progressive disclosure)

- Show the actions that apply to the current selection or state, and nothing greyed out "for later". Example: the reconcile action dock shows Create only for a bank-only line, and nothing at all when the month is done.
- Secondary material goes in a closed `<details>` disclosure with a count:
  - imported files;
  - technical details;
  - history;
  - developer settings.
- Long text (prompts, keys, JSON) is never shown open by default. Show a short summary and a Copy button; the full text sits behind "Show".
- Do not repeat a status in a badge **and** a hint **and** a sentence. Hints become tooltips (`title`) only when the visible label already says it.

### 5. Status in words, with colour as support

- Every status is a word (Ready, Needs your OK, Waiting to clear, Reconciled), using the shared `Badge` tones:
  - success: done or good;
  - warning: needs the user;
  - info: in progress;
  - neutral: off or not started;
  - danger: failed.
- Colour is never the only signal.
- One unit per concept across screens. If the home list says "10 of 10 done", the detail screen counts the same things.
- Put the one number the user is driving to zero (or to "ready") large, with a tick when it is good. Example: Left to explain LKR 0.00 ✓.

### 6. Sequences get named steps; nothing else gets numbers

- A real sequence uses **named** stages (Upload · Account · Columns · Check & save), never "step 3 of 9" or bare dots.
- A "How it works" guide aside has at most **4** numbered steps, each a bold short name plus one sentence, with links to the guide and a practice file.
- Do not number things that are not a sequence.

### 7. Sums read as a statement

Show totals as a short statement in plain lines, with the result as the final ruled line. Do not use a row of equal statistic tiles:

```
Starting balance        164,422.50
+ Money in               20,000.00
− Money out             107,630.00
= Closing balance        76,792.50
```

Use `dl.ux-statement` (or `.bis-sum`) with `is-total` on the result. Each `dt` text ends with a space, so screen readers and tests read "Difference LKR 0.00".

### 8. Always say what happens next

- **Empty states** invite the first action: what to do, and a button to do it.
- **Finished states** show a "What's next" card (`.ux-next`). Example: "Commercial Bank is reconciled to 30 November 2026. Next: the December statement…" with **Import December**.
- **Suggestions** carry a plain reason. Example: "Same amount, 1 day apart. Banks often record payments a day or two later."
- **Errors** say what happened and how to fix it, in the interface's voice. No apologies, no codes as the message.
- **Dangerous or permanent actions** (delete, revoke, publish, post) confirm with `ConfirmDialog`. The dialog names the thing and the consequence.

### 9. Pre-fill the obvious, never decide money silently

- Select the obvious next item.
- Suggest a category or match with a reason.
- Never post, publish or approve on the user's behalf. Agents prepare; a person approves (see AgentBridge).
- Safe defaults: new abilities start off, and the least power is granted first.

### 10. Works at three sizes

Check every changed screen at:

| Size | What must hold |
|---|---|
| Desktop 1920×~860 | everything fits; no empty half-screen |
| Laptop 1366×768 | the work screen does not scroll the page |
| Phone 390×844 | no sideways scroll; tables turn into stacked cards under 640 px; asides drop below the main column under 1100 px |

## Shared layout kit (globals.css "Calm screen kit")

Build new screens from these classes before inventing module CSS. They only use existing tokens (`--ink`, `--line`, `--brand`, status colours, radii, shadows).

| Class | Use |
|---|---|
| `.workspace.ux-page` | Page wrapper with the standard padding and gap |
| `.ux-head` > `.ux-head-text` (`h1.page-title` + `p`) + `.ux-head-actions` | Title, one sentence, actions |
| `.ux-split` > `.ux-main` + `aside.ux-guide` | Main column and 300 px guide |
| `.ux-card` > `.ux-card-head` (`h2` + `span` meta) + `.ux-card-body` | A section |
| `.ux-rows` > `.ux-row` (`.ux-row-text` with `strong` + `span`, then the control) | Setting rows: name, one sentence, control on the right |
| `.ux-next` > `.ux-next-row` | What's next |
| `details.ux-disclosure` > `summary` (`span` count) | Folded secondary content |
| `dl.ux-statement` (`div.is-total`) | Sums |
| `ol.ux-stages` > `li.is-done` / `li.is-current` | Named stages |
| `.ux-empty` | Empty state |
| `.ux-fill` | Work screen that fills the window under the top bar |

Controls still come from the registry (`SelectField`, `DateField`, `TextField`, `SearchField`, `Button`, `Badge`, `ConfirmDialog`, `withFormPending`).

## Review checklist (paste into the CHG)

- [ ] Purpose sentence and exactly one primary action per view
- [ ] No jargon, ids or enums on the main surface; technical detail folded
- [ ] Sentence case; no uppercase labels
- [ ] Only applicable actions shown; long text folded behind Copy / Show
- [ ] Status words plus Badge tone; one counting unit across screens
- [ ] Sums as a statement; money with 2 decimals
- [ ] Empty, finished and error states say what to do next
- [ ] Nothing posted, published or approved without a person
- [ ] Checked at 1920, 1366×768 and 390×844; work screens do not page-scroll at 1366×768
- [ ] Registry controls only; test ids and accessible names kept or migrated in the same commit

## Applying this to legacy screens

When you touch a legacy screen, bring the part you change up to this rule book. Do not rewrite whole modules for looks alone. Bigger redesigns follow the bank reconciliation method:
1. Study the screen on staging with synthetic data.
2. List the problems in the CHG.
3. Redesign with this kit.
4. Keep every business rule, field name and test hook.
5. Review on staging at the three sizes and record what was found and fixed.
