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
- Audit result (Dev, 2026-10-13, read-only; code in `sync.js`, `app.js` `saveSession`, `apps-script/Code.gs`): **gaps found**, raised as items below. Nothing was changed. How each case works today:
  - Retry after a failed or unconfirmed send: **safe for Sets and Feedback.** The job is stored on the phone before sending and removed only after the sheet confirms its Save ID. On retry the script checks the last 3,000 rows for that Save ID under a script lock and writes nothing if found. Rows and Save ID go in one write.
  - Refresh or app close mid-save: **safe.** The job is already stored, and the outbox is flushed on app open, when signal returns, and when the app comes to the front. A second tab or app instance resending the same job is also caught by the Save ID check.
  - Failed write (script error, lock timeout): **safe.** The send result is unreadable (`no-cors`), so only the confirm check counts; no confirm means the job stays and retries (5s, doubling to 2 min, no retry limit).
  - Duplicate submission: **partly safe.** Same-job duplicates are blocked by Save ID. Tapping Save again after a refresh makes a new job with a new Save ID, so the same set rows are added again (the in-memory 2-minute guard is lost on refresh). The app reads the latest row for a set, so the screen is right, but the Sheet has duplicate rows (see item D).
  - Not observed live: every one of the 1,836 Sets rows is tagged `from-log`, so no row has ever been written through the outbox into the Sets tab. These findings come from reading the code, not from live saves.

### Gap A: A save with zero rows is never confirmed and blocks all later saves
- Status: Building. Approved by Colin 2026-10-13. Built, tested and pushed (commit `dac83ec`); not Shipped until Colin confirms on his phone.
- Raised by: Dev (from the outbox audit)
- Problem: `saveSession` always queues a Sets job, even when it has no rows (every set blank, or a day whose sets are not programmed that week). The script writes nothing for it, so no Save ID ever lands in the sheet and the confirm check never passes. The outbox stops at the first failed job, so that job retries forever and every save behind it (including real sessions) never syncs. They stay on the phone and still show in "Last:", so nothing is lost until the phone's storage is cleared, but the Sheet stops updating with no clear sign.
- Behavior: Do not queue a job with zero rows (show "Nothing to save"). Also drop zero-row jobs already in the outbox when flushing, so an existing stuck queue clears itself. No change to jobs that have rows.
- Acceptance criteria:
  - Tapping Save with no loggable sets queues nothing and says so.
  - A zero-row job already in the outbox is removed on the next flush, and the jobs behind it send.
  - Normal sessions save and confirm exactly as before; a retry after a dropped confirm still writes once.
- Data impact: None. An empty job holds no data. No sheet or script change.
- Edge cases: Offline (no change); mixed outbox with one empty job and several real ones.
- Risks: Low. The guard must only match `rows.length === 0`, never jobs with rows.
- Rollback: Revert the commit.
- Dependencies: None. Any new way of skipping unfilled sets (including the pull-up reps item) makes an empty job more likely, so this goes first.
- Success check: Pending-save count on the phone returns to zero after a flush with an empty job in the queue.
- Build notes (Dev): `saveSession` no longer queues a Sets job with no rows and shows "Nothing to save yet"; `queueSave` refuses zero-row jobs; `flushOutbox` clears zero-row jobs already stuck. A save with only effort taps (no set rows) still sends its feedback job. Tests: `node tests/sync-helpers.test.js` (an empty job in front of a real save: the real save sends once and the outbox empties; confirmed to fail on the old code). A page-level check (jsdom) of the Save button with nothing entered also passes. Not tested on a real phone.

### Gap B: A save is lost silently if the phone will not store the outbox
- Status: Proposed (low priority)
- Raised by: Dev
- Problem: `saveOutbox` swallows storage errors (private browsing, full or blocked storage). The send still runs once, but if it fails there is nothing to retry, and the screen still says "Saved ✓".
- Behavior: If storing the job fails, keep it in memory for this page's retries and show a visible warning: "Not stored on this phone yet. Keep the app open until it syncs."
- Acceptance criteria: With storage forced to fail, the warning shows; with a failed send then a good one, the job still syncs while the app stays open.
- Data impact: None. Risks: Low. Rollback: Revert the commit. Dependencies: None.
- Success check: Not expected to trigger in normal use; test only by forcing it.

### Gap C: Duplicate row on non-Sets tabs after a long offline gap
- Status: Proposed (low priority, short form)
- Raised by: Dev
- Problem: VB Sessions, Check-ins, Maxes and Proposals have no Save ID column; the script remembers a save for 6 hours. If the send reaches the sheet, the confirm fails, and the phone then stays offline more than 6 hours, the retry adds the row a second time.
- Behavior: Decision needed from Colin whether to add a Save ID column to those tabs (sheet and script change that Colin deploys) or accept the risk.
- Acceptance criteria: A retry after more than 6 hours does not add a second row.

### Gap D: Saving the same session twice adds the set rows twice
- Status: Proposed (decision for Colin, short form)
- Raised by: Dev
- Problem: Re-saving a day after editing (or after a refresh) appends a second set of rows for the same session, exercise and set. The app and the Sunday assessment read the latest row, so results look right, but any other sheet formula or analysis sees duplicates.
- Behavior: Decision needed: keep append-only (safest for data, current behavior) or mark replaced rows. Dev recommends keeping append-only and having any analysis read the latest row per session/exercise/set.
- Acceptance criteria: Whichever is chosen is written down here and RULES.md/analysis follow it.

### Log pull-ups as reps, not weight
- Status: Building. Approved by Colin 2026-10-13 (after Gap A). Built, tested and pushed; not Shipped until Colin confirms on his phone.
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
- Dependencies: Coach answers are in (below). Gap A (outbox) went first and is in its own commit, so this item can be reverted without undoing it.
- Success check: After a pull-up session, the Sets rows for that session have Reps filled and no plan text; the next session's "Last:" shows those reps.
- Open questions for Coach / Colin (Dev will not decide these):
  1. Which exercises are rep-logged? Dev proposes Weighted pull-up and Pull-up practice (doorframe bar); Coach confirms Banded negative pull-up and Scapular pull-up.
  2. Rep targets exist only in cue text ("+10 lbs x 5, four sets", "half your max"). Should they become data in the Program tab? Dev will not parse cue text.
  3. Pull-up progression: nothing in RULES.md or the Program tab defines it beyond the weekly cue text, and the Sunday assessment skips pull-ups (no Increment). Any rep-based suggestion needs a rule written here first.
  4. Failed or partial sets: is reps completed enough, or is a marker wanted (the old data has one `30 failed`)?
  5. Is "tap the load label to edit" enough when the load differs from plan?
- Coach answers (2026-10-13; items marked "Colin" need his confirmation):
  1. Rep-logged: Weighted pull-up, Pull-up practice (doorframe bar), Banded negative pull-up, Scapular pull-up. Not Dead hang (time-based). Scapular pull-up is low value to log but harmless to include.
  2. Do not turn cue text into Program data yet. Rep targets only matter if the app ever suggests progression, and that is out of scope here (see 3). Revisit after the Week 4 decision.
  3. No app-side pull-up progression. The Sunday assessment keeps skipping pull-ups and must not read rep counts as weight. Coach decides the Week 5 start by hand at the end of Week 4 from the logged reps. Rationale: small load step after rep gains, Moderate evidence. The decision cut-offs are Heuristic and are not to be built.
  4. Reps completed is enough. No failed-set marker. If grip or a slipping handle ended the set, Colin taps Grind and writes "slipped" in the effort note. Coach reads that note; the app does nothing with it. Old `30 failed` row stays as stored.
  5. Tapping the load label to edit is enough (Colin to confirm on the phone).
  Data-integrity notes from Coach: the Sets rows before Oct 7 for Weighted pull-up record `BW` with no reps, so there is no logged rep history before Oct 7. The Week 1 figure of 5/5/5 is Colin's recollection, not data. Old bare-number rows stay as load and are never converted to reps.
- Build notes (Dev, 2026-10-13): Rep-logged ids are the four Coach-approved variants (Weighted pull-up, Pull-up practice, Banded negative pull-up, Scapular pull-up; not Dead hang), listed in `sync.js` (`REP_LOGGED_IDS`). The load label shows `BW` or `+10 lb`; tapping it opens the phone's built-in prompt box to change the load for that set. Reps box: number pad, digits only, 1-99. Saved Value is `N reps` or `LxN`. Checked sets with no reps are listed on the save screen and not saved. "Last:" reads rep-logged values with `describeRepValue`. The in-app suggestion code skips rep-logged exercises, so reps are never read as weight. "Share this workout" still shows the plan for these exercises. Script/stylesheet `?v=` tags bumped to `20261013a`. No Apps Script, sheet or Program tab change.
- Tests run (Dev): `node tests/sync-helpers.test.js` (13 pass): ids, reps validation, value compose/parse round trip against the formats already in the Sets tab, old-value display, outbox. Page-level check in jsdom with the real scripts (13 pass; scratch test, not in the repo because it needs the `jsdom` package): empty reps boxes and load labels, other exercises untouched, digits-only input, saved rows for typed reps and an edited load, no-reps note, empty-day save, typed values surviving a re-render, "Last:" text for every old format, suggestions guard, share text. One real bug was caught and fixed this way before commit (every set showed `BW` regardless of plan).
- Not verified (needs Colin's phone): one-handed use, tap targets with sweaty hands, number pad on iOS, the load prompt box inside the home-screen app, bad-Wi-Fi save, and the first real save into the Sets tab (no row has gone through the new save path yet).
- Verification Dev can do: diff review for data-loss risk; run the reps parse/compose and "Last:" functions in Node against the real stored formats above; check the deploy serves the new `?v=` files. Verification Dev cannot do: one-handed use, sweaty-hands tap targets and bad-Wi-Fi saves on the iPhone. Colin tests those and reports before this is marked Shipped.

## Backlog / ideas
- Sets tab Block column: the app writes `fall-2026-b1` as a 12th column, but the live Sets header and all 1,836 rows stop at column 11 (Save ID). The deployed Apps Script is probably older than `apps-script/Code.gs`, and RULES.md step 4 (`block_start`) may have no Block data to filter on. Needs Colin to compare the script in the Apps Script editor. (Raised by: Dev)
  - Coach check 2026-10-13: `?tab=__meta` returns version 3, so the new script is live. The Sets header row still ends at Save ID because no Sets save has happened since it was deployed. The Block header is added by the first Sets save after a workout. Dev to confirm after Colin's next session; until then RULES.md `block_start` (date-based) is the filter that works.
- Sheet endpoint is readable by anyone with the URL: `doGet` in Code.gs has no check and `SHEET_URL` is in the public repo, so training, VB notes and pain notes are exposed. Not confirmed live (Dev's fetch failed). Fixing it needs a decision from Colin first. (Raised by: Dev)
  - Coach view: pain notes and VB sessions are in that data, so this is worth fixing, but it is Colin's decision on trade-offs. Not blocking any training work.
- Sunday assessment and pull-ups: the Sunday run skips pull-ups today only because they have no Increment and a non-numeric plan. If someone adds an Increment to a pull-up row in the Program tab, the run could read `6 reps` as a weight of 6. The Coach's rule is that it must not read rep counts as weight; suggest adding a "skip rep-logged exercises (weighted-pull-up, pull-up-practice-doorframe-bar, banded-negative-pull-up, scapular-pull-up)" line to RULES.md step 4. RULES.md is the Coach's file, so Dev has not changed it. (Raised by: Dev)
- Last-session performance for rep-logged exercises, after the pull-up item and the Coach's answers.

## Decision log
| Date | Decision | Why | Revisit when |
|------|----------|-----|--------------|
| 2026-10-13 | Adopted the Coach + App Dev two-role workflow with SPEC.md as the handoff | Separate training decisions from implementation; keep a shared record | After the first few weeks of use |
| 2026-10-13 | Colin approved building Gap A (empty saves block the outbox) first, then the pull-up reps item | The audit found Gap A; the pull-up change adds another way to skip sets, so the outbox fix goes first | After Colin's first real session on the new version |

## Gym friction log
Real-world annoyances or failures. Each may become an item above.
- 2026-10-13: Pull-up set boxes show the planned weight (`BW`, `+10`) but Colin logs reps; the text has to be cleared before typing. See "Log pull-ups as reps, not weight". 
