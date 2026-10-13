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

### Log pull-ups as reps, not weight
- Status: Proposed
- Raised by: Colin (reported); drafted by Dev
- Problem: The Weighted pull-up card prefills each set box with the planned load (`BW`, `+10`, `+20`, `+25`), but Colin logs reps. He has to clear the text before typing, and the box reads as a weight field.
- Behavior:
  - For rep-logged exercises, each set shows the planned load as a read-only label (`BW` or `+10 lb`) next to an empty reps input (number pad).
  - If the load used differs from the plan, tapping the load label edits it for that set. No extra taps in the normal case.
  - Saved Value uses formats the app already parses: bodyweight `6 reps` (Reps 6), weighted `10x6` (Weight 10, Reps 6). Reps must be a whole number 1-99.
  - A set with no reps is not saved. Plan text (`BW`, `+10`) is never saved as if it were a result. If a checked rep-logged set has no reps, the save screen says so in one line.
  - "Copy to all", rest timer, check circles, effort row and session save are unchanged.
  - No suggestions, targets or progression are added. Dev does not define pull-up progression.
- Acceptance criteria:
  - Typing `6` in a bodyweight set saves `6 reps` (Reps column 6, Weight blank); typing `6` with a `+10` load saves `10x6`.
  - An empty reps box saves nothing for that set, and no `BW`/`+10` plan text reaches the Sets tab.
  - "Last:" for rep-logged exercises reads reps (`6 reps`, `+10 lb × 6`); old rows read as stored, labeled "(reps not recorded)" where they have no reps.
  - Primary lifts and non-rep-logged accessories save and display exactly as before.
  - A pull-up session saved offline queues, retries, and does not duplicate.
- Rationale: None needed; this changes input and display only. No training logic is touched. (Coach: see open questions.)
- UI notes: Tap count per set goes down (no clearing prefilled text). Number pad opens on the reps box. Load label stays visible so the plan is still readable at a glance.
- Data impact: No schema change and no Apps Script change, so nothing to redeploy. Old rows are never edited or deleted. Existing 83 Weighted pull-up rows (Apr 16 - Oct 7, 2026): 24 `BW` (reps not recorded), 50 bare numbers (added load in lb, reps not recorded), 5 `LxR` (`25x4`), 3 `N reps` (Oct 7), 1 free text (`30 failed`). The old Log tab is untouched. Bare numbers in old rows stay "load", and the new UI never saves a bare number for these exercises, so the two meanings cannot mix. No migration script; old rows are interpreted at display time only and never guessed into reps.
- Edge cases:
  - Offline: unchanged; goes through the existing outbox.
  - Missing reps: not saved, with the one-line note above.
  - Invalid input (0, negative, decimals, text): rejected in the box, not saved.
  - Load edited away from plan: saved with the edited load; plan is unchanged.
  - Plan edited in the Program tab: label follows the sheet after the daily refresh.
- Risks: A forgotten reps entry means a missing set (mitigated by the save-screen note). Label/tap layout is unproven until tried on the phone.
- Rollback: Revert the commit; no data or sheet changes to undo. Rows already saved in the new format (`6 reps`, `10x6`) are the same formats already in the sheet.
- Dependencies: Coach answers below (which exercises). Not blocked by the outbox audit, but any outbox gap found there takes priority over this.
- Success check: After a pull-up session, the Sets rows for that session have Reps filled and no plan text; the next session's "Last:" shows those reps.
- Open questions for Coach / Colin (Dev will not decide these):
  1. Which exercises are rep-logged? Dev proposes Weighted pull-up and Pull-up practice (doorframe bar); Coach confirms Banded negative pull-up and Scapular pull-up.
  2. Rep targets exist only in cue text ("+10 lbs x 5, four sets", "half your max"). Should they become data in the Program tab? Dev will not parse cue text.
  3. Pull-up progression: nothing in RULES.md or the Program tab defines it beyond the weekly cue text, and the Sunday assessment skips pull-ups (no Increment). Any rep-based suggestion needs a rule written here first.
  4. Failed or partial sets: is reps completed enough, or is a marker wanted (the old data has one `30 failed`)?
  5. Is "tap the load label to edit" enough when the load differs from plan?
- Verification Dev can do: diff review for data-loss risk; run the reps parse/compose and "Last:" functions in Node against the real stored formats above; check the deploy serves the new `?v=` files. Verification Dev cannot do: one-handed use, sweaty-hands tap targets and bad-Wi-Fi saves on the iPhone. Colin tests those and reports before this is marked Shipped.

## Backlog / ideas
- Sets tab Block column: the app writes `fall-2026-b1` as a 12th column, but the live Sets header and all 1,836 rows stop at column 11 (Save ID). The deployed Apps Script is probably older than `apps-script/Code.gs`, and RULES.md step 4 (`block_start`) may have no Block data to filter on. Needs Colin to compare the script in the Apps Script editor. (Raised by: Dev)
- Sheet endpoint is readable by anyone with the URL: `doGet` in Code.gs has no check and `SHEET_URL` is in the public repo, so training, VB notes and pain notes are exposed. Not confirmed live (Dev's fetch failed). Fixing it needs a decision from Colin first. (Raised by: Dev)
- Last-session performance for rep-logged exercises, after the pull-up item and the Coach's answers.

## Decision log
| Date | Decision | Why | Revisit when |
|------|----------|-----|--------------|
| 2026-10-13 | Adopted the Coach + App Dev two-role workflow with SPEC.md as the handoff | Separate training decisions from implementation; keep a shared record | After the first few weeks of use |

## Gym friction log
Real-world annoyances or failures. Each may become an item above.
- 2026-10-13: Pull-up set boxes show the planned weight (`BW`, `+10`) but Colin logs reps; the text has to be cleared before typing. See "Log pull-ups as reps, not weight". 
