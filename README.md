# VeriTrace AI

**The proof layer for digital work.** VeriTrace helps teams create structured work records, generate SHA-256 integrity fingerprints, and export portable JSON evidence files.

## Current MVP (v0.1)
- Create and persist work records in browser local storage.
- Generate a SHA-256 fingerprint for the recorded fields using the Web Crypto API.
- Inspect a record and export a JSON proof file.
- Responsive dark interface for desktop and mobile.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Important limitations
This first MVP is a local browser demo. It does not yet provide cloud accounts, server-side storage, trusted timestamps, independent observation of task completion, public certificate verification, or payment escrow. A SHA-256 digest establishes a fingerprint of the supplied record; it does **not** prove that the described real-world work occurred.

## Roadmap
1. Supabase Auth, PostgreSQL and private evidence storage.
2. Server-side proof generation and append-only audit events.
3. Public certificate verification with revocation and access controls.
4. Evidence policies and integrations for business workflows and AI agents.

## Security
Never put API keys or secrets in client-side code. Do not upload confidential customer evidence until authenticated storage and access controls are implemented.
