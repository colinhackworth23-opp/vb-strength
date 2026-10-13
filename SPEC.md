# SPEC.md: VB Strength

## Decision ownership
- Colin has final approval on product direction and material changes.
- Coach owns training rationale and proposed programming behavior.
- App Dev owns implementation, reliability, security, and UX execution.
- Coach and Dev may challenge each other with evidence and explicit trade-offs.
- Dev does not change training prescriptions or invent training logic to fill a gap.
- Coach does not dictate implementation details without a demonstrated need.
- Conflicting or ambiguous items stay Proposed until resolved. Only approved items move to Ready.

Statuses: Proposed -> Ready -> Building -> Shipped (implemented, tested to acceptance criteria, and deployed) -> or Rejected.

Related docs: `README.md` (files, Sheet tabs, deploy steps) and `RULES.md` (Sunday assessment procedure).

## Short form (default)

### [Title]
- Status: Proposed
- Raised by: Coach / Dev / Colin
- Problem: The real-world friction or training question
- Behavior: What the app should do (suggest-and-confirm, never auto-apply)
- Acceptance criteria: Observable pass/fail conditions
  - e.g., a completed set is still visible after refresh
  - e.g., a failed sync retried later does not create a duplicate set

## Full form (use when the item touches data, sync, or training logic)
Add these to the short form:
- Rationale: Principle, evidence strength (Strong / Moderate / Heuristic), assumptions, limits
- UI notes: Placement, tap count, interaction
- Data impact: Fields, Sheet tabs, schema changes, migration
- Edge cases: Offline, missing data, retries, conflicts, invalid input
- Risks: What could regress or mislead
- Rollback: How to disable or revert safely
- Dependencies: Other items or decisions needed first
- Success check: What we expect to see in the logs or in use after release

## Release checklist (full-form items)
- [ ] Existing critical workflows still work
- [ ] Relevant tests pass
- [ ] Offline and sync behavior verified, where applicable
- [ ] No credentials or sensitive data exposed
- [ ] Data integrity checked
- [ ] SPEC.md and decision log updated
- [ ] Commit, push, and deployment status accurately reported

## Active items

### Verify save-outbox retry safety
- Status: Proposed
- Raised by: Dev
- Problem: The app queues saves in an outbox (`sync.js`) when signal is bad. It is not yet confirmed that retrying a queued save can never insert the same set twice, or that a save is never lost.
- Behavior: Audit the current outbox and the Apps Script write path. Report what happens on retry, on refresh mid-save, and on a failed write. No behavior changes until the audit is reviewed.
- Acceptance criteria:
  - A written summary of how each case is handled today (retry, refresh, failed write, duplicate submission)
  - Any gap found is raised as its own item (full form) before any code changes

## Backlog / ideas
- 

## Decision log
| Date | Decision | Why | Revisit when |
|------|----------|-----|--------------|
| 2026-10-13 | Adopted the Coach + App Dev two-role workflow with SPEC.md as the handoff | Separate training decisions from implementation; keep a shared record | After the first few weeks of use |

## Gym friction log
Real-world annoyances or failures. Each may become an item above.
- 
