# Development change ledger

Create one record per coding task before implementation, using [TEMPLATE.md](TEMPLATE.md). Name it `CHG-YYYYMMDD-short-slug.md`. Keep task scope, actual changes, risks, validation and handover current. Preserve history and link superseding records rather than rewriting old conclusions.

Canonical QA: https://github.com/Dinu-Sri/bookone-qa. Product records describe intent and implementation; actual test/run evidence lives in QA. Follow [QA_CHANGE_CONTRACT.md](../QA_CHANGE_CONTRACT.md).

Never include secrets, customer data or raw traces in these public files. Place final commit SHAs in PR metadata and external run records to avoid self-referential SHA edits.
