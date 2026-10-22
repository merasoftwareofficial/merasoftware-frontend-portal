# Documentation Index

Two files:

- **`CODEBASE_MAP.md`** — what the code does **today**: the current rule for every major system (auth, leads, projects, service plans, payments/invoices, trash, documents, chess, UI design system) and where it lives. No history, no session logs, no rejected attempts. Start here.
- **`plan-system.md`** — what we are **building** in the plan allowance / top-up rebuild, and why. Design only, nothing written yet.

**Never duplicate between them.** Current behaviour, audits and bugs → the map. Target design, decisions and open questions → `plan-system.md`, which links to the map instead of restating it.

## How to update these docs

**What to keep.** A line earns its place only if the next agent would **go wrong without it** — the *why*, and what was already tried and failed. Every update tightens or deletes what it supersedes; never append. Drop line numbers and anything a grep answers in seconds.

**When to write it.** These are not the same moment:

- **The instant the owner says it** — what they want, why, their decisions, and any correction they make to how you work. This exists nowhere but the conversation; if the session ends it is gone for good. Do not save it for the end of the task.
- **After the work** — what the code now does, and what was tried and failed. Written earlier it is a guess.

**The failure mode that keeps happening: a full claim on partial evidence.** Every doc error found so far is this one — one file checked and reported as the whole problem when thirty were affected; a figure copied from a doc instead of queried from the database; a cross-reference written from memory to a section that did not exist. So: check the whole surface before describing it, query live data rather than quoting a doc's numbers, and open a section before citing it. If you only checked part, say which part — partial and labelled is useful, partial and stated as whole sends the next agent away believing the job is done.

## Working rule for this project

- No code or file changes without explicit permission — propose first, get approval.
- **Read-only investigation needs no permission** — reading code, grepping, and running read-only DB queries to check live data. Verify against the database rather than trusting a doc's figures. Any **write** still needs approval.
- Warning: `backend/.env` points at the **production** Atlas cluster (verified 2026-09-23) — there is no separate dev database, so every query runs against real customer data and any write is a live write. Keep throwaway scripts out of the repo.
- No `npm run build` unless explicitly requested.
- Fix the whole system, not a narrow slice; no patch work.
- When you change a system the map covers, update that section in the same pass.

## History

63 session-log documents were consolidated into `CODEBASE_MAP.md` on 2026-08-25: reading 63 files to find one answer was error-prone, and many had been silently superseded by later docs or by code changes never written back. The originals (once in `frontend/src/DOCS_backup_before_consolidation_work1/`, no longer on disk) survive only in Git history — never current truth. Backups now go in `E:\Allprojects\backup\<repo>\workN\`, never inside a repo (owner decision, 22 Oct 2026).
