# Security

## Model

ProfitLab is a static, browser-only application. It has no server, no accounts, no network calls
and no analytics. All data lives in this browser's `localStorage` and in files you export.

## Untrusted input

- **CSV / JSON imports** are size-limited (1 MB CSV, 5 MB workspace JSON, 5,000 rows), parsed by
  strict code, and validated field by field (CSV) or against a Zod schema (workspace JSON).
- **Rendering** goes through React's escaping; no `dangerouslySetInnerHTML`, no `eval`.
- **CSV export** prefixes text cells beginning with `=`, `+`, `-`, `@`, tab or CR with an
  apostrophe to prevent spreadsheet formula injection.
- **External links** use `rel="noopener noreferrer"`.

## Secrets

No credentials are required or stored. `npm run secrets` scans the tree for common key and token
patterns and personal e-mail addresses and fails the build on a hit.

## Reporting

Open a private security advisory on the repository once it is published, or contact the
maintainer through their GitHub profile. Do not post exploit details in public issues.
