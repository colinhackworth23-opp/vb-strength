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

### Test week at the end of Block 1 (Week 11)
- Status: Building. Approved by Colin 2026-11-09 (test Dec 7 - 13; Block 2 starts Dec 14, right after). Built, tested and pushed; not Shipped until Colin has run the test days on his phone.
- Raised by: Colin; drafted by Coach
- Problem: Block 1 ends with a deload (Week 10, Nov 30 - Dec 6). Colin wants fresh numbers as the baseline for Block 2 instead of estimating from 8-rep sets.
- Behavior (suggest-and-confirm, never auto-apply):
  - Add a Week 11 (Dec 7 - 13, after the deload) to the program. It is a test week, not a training week.
  - Mon: Back squat. Wed: bodyweight pull-up test first (arms fresh, matches the usual Wednesday order), then incline bench. The single-arm DB clean and jerk is dropped that day. Fri: Hex bar deadlift.
  - Each test lift: warm-up ramp, then ONE top set of 3 reps (3RM attempt); if a joint is symptomatic that day, drop to a lighter 5-rep top set instead of skipping. Stop the set at the first sign of form breaking or a sharp slowdown. No second attempt. Reps and weight are logged as for any set.
  - Pull-ups: one set of bodyweight reps to the last clean rep. Log reps.
  - Everything else that day is about half the Week 4 volume. Calves and shoulder/knee prehab stay as written.
  - After the top set, the app shows an estimated max (Epley: weight x (1 + reps/30)) and suggests it as the new training max (TM). In this app a TM is the estimated max itself (current TMs: squat 235, bench 170, dl 325, ohp 115), not a percentage of it. Colin confirms or edits the number. Nothing is written to the Program tab or used for Block 2 until he confirms.
  - Sunday assessment makes no proposals for Week 11 and does not read test sets as normal progression (add 11 to the Rules tab `no_increase_weeks`).
- Acceptance criteria:
  - Week 11 appears after Week 10 with only the three test days and the accessory work above.
  - A logged 3-rep top set on each lift shows an estimated max, offered as the new TM, which Colin can edit before confirming. Squat, incline bench and hex bar TMs only; ohp has no test.
  - Without Colin's confirmation, no Program cell and no Rules value changes.
  - Test sets are saved to the Sets tab with Block `fall-2026-b1` and can be told apart from Block 1 training sets (exercise ID and week are enough).
- Rationale: Testing a 3-rep max is safer than a 1RM and, per Moderate evidence, gives a more accurate estimate than extrapolating from 8-rep sets. The single-attempt rule is Heuristic. The new TM equals the estimated max because the program's weekly percentages (65-86% TM) are already built on max-style TMs. A deload before testing lets the numbers reflect readiness, not fatigue.
- Goals to score against (Coach, Heuristic; estimated one-rep max, not the weight on the bar). Equivalent 3-rep weights (floor / solid / stretch): squat 220 / 225 / 235, hex bar 310 / 320 / 325, incline bench 160 / 165 / 170. Estimated-max form: squat 250 solid (floor 240), hex bar 350 (floor 340), incline bench 180 (floor 175), bodyweight pull-ups 9-10 reps (floor 8). Baselines today (estimated, not tested): squat 234, hex bar 329, incline bench 171, pull-ups 7.
- Test day ramps (Coach; Heuristic; weights in lb are placeholders for the "good" top set and Colin picks the final weight with the chooser below). Ramp sets are listed as load x reps, with rest in minutes:
  - Back squat (top set 225 x 3): bar x 8 (1), 95 x 5 (1), 135 x 4 (2), 165 x 3 (2), 185 x 2 (3), 205 x 1 (4-5), then the top set.
  - Hex bar deadlift (top set 320 x 3): 135 x 5 (1), 185 x 4 (2), 225 x 3 (2), 255 x 2 (3), 285 x 1 (4-5), then the top set.
  - Incline bench (top set 165 x 3): bar x 8 (1), 65 x 6 (1), 95 x 5 (2), 115 x 4 (2), 135 x 3 (3), 150 x 1 (4-5), then the top set. Spotter or safeties required.
  - Bodyweight pull-ups (no chooser; reps are the result): scapular pull-ups x 10 (1), 3 bodyweight reps (2), 5 bodyweight reps (3), then one set to the last clean rep (full hang at the bottom, chin over the bar, no kipping). Use the same grip setup Colin plans to use from now on and note it.
  - Reaching the last ramp single before the top set triggers the chooser. Pull-ups have no chooser.
  - Pull-up goals (reps): floor 8, good 9-10, stretch 11-12.
- UI notes (Coach supplies the content; Dev decides layout):
  - Once the last ramp set before the top set is checked, show a "Choose your top set" card with three options per lift. Colin taps one and it fills the top-set weight. Nothing is pre-selected or auto-chosen.
  - Top-set options for 3 reps (floor / good / stretch): squat 220 / 225 / 235, hex bar 310 / 320 / 325, incline bench 160 / 165 / 170. Current TMs for reference: squat 235, hex bar 325, incline bench 170.
  - Guide text on the card, same for all three lifts:
    - Stretch: the last ramp single moved fast and smooth, it felt like 4 or more reps were left, depth and form were clean, nothing hurts, and sleep and energy were normal.
    - Good: the last ramp single moved at a normal pace, it felt like 2-3 reps were left, and form was clean.
    - Floor: the last ramp single was slower, it felt like 2 or fewer reps were left, or sleep or energy was poor, or you are sore.
    - Stop rule: any knee or shoulder pain, depth getting shallow, or the bar slowing sharply means stop. Drop to a lighter 5-rep set instead of forcing the 3.
  - The guide text is advice; it never blocks a choice. These cut-offs are Heuristic.
- Data impact: A Week 11 column in the Program tab (or Dev's proposal for how to add a week) and the test exercises as Program rows. Rules tab: `no_increase_weeks` becomes `10,11`. No change to Sets columns. Dev decides how the app shows the estimate.
- Edge cases: Week 11 skipped or shortened (travel, tournament): nothing carries forward; test in Block 2 Week 1 instead. If Colin is off for more than 2-3 weeks after the test, the Coach re-ramps at Block 2 Week 1 from 5-10% below the tested number.
- Risks: A pain flag on a test day overrides the test. Maxing out can mislead if the set was not a true 3RM; the estimate is only as good as the set.
- Rollback: Remove Week 11 from the Program tab; no data to undo.
- Dependencies: Colin confirms the Block 2 start date and what happens between Dec 7 and January. If there is a long gap, Week 11 stays but the Coach re-ramps in Block 2 Week 1.
- Success check: By Dec 13, three lifts and pull-ups have a logged top set and Colin has confirmed training maxes for Block 2.
- Open questions for Colin: answered 2026-11-09. Test Dec 7 - 13; Block 2 starts Dec 14, the Monday after. No gap after testing, so the re-ramp edge case above does not apply.
- Coach decisions made while building (Heuristic; Colin can overrule any of them):
  - Tue and Thu are recovery days (the existing off-day cuff routine). Saturday prehab stays. Calves and shoulder/knee work stay inside the gym days.
  - Test days run the test lift right after the warm-up and primer. Friday's hang clean, front squat and interval finisher are dropped so the hex bar test is fresh. Wednesday drops the clean and jerk, scapular pull-ups, weighted pull-ups and banded negatives (the pull-up test replaces them).
  - "Half the Week 4 volume" = the first 2 sets of each remaining accessory, at the live Week 4 plan values from the Program tab (for example RDL 165 / 175). No verdict chips, offsets or proposals on test-week accessories.
  - Suggested new TM = the Epley estimate rounded down to 5 lbs (conservative).
- Build notes (Dev, 2026-11-09):
  - Week 11 lives in `program.js` (`WEEKS[10]` with `testWeek:true`, and `TEST_WEEK` holding the ramps, top-set options, guide text and kept accessories). No Program tab column was added, so no sheet schema or Apps Script change and Colin cannot edit Week 11 in the sheet. That is the Dev proposal the data-impact line allowed for.
  - `app.js` `buildTestDay`: readiness card (Rough night shows advice only and changes no load), protocol callout, warm-up and primer, ramp rows (checked off with their own rest timer, never logged), the "Choose your top set" card (hidden until the last ramp single is checked; nothing pre-selected), a top-set row (3 reps by default, weight empty until chosen; an unchosen top set saves nothing), and an estimate card (Epley) with an editable TM box and Confirm. Confirming sets the app TM and queues one Maxes row (squat, bench, dl, ohp), the same row the Maxes screen writes. The pull-up test is one rep-logged set saved as `N reps` under `weighted-pull-up` in Week 11.
  - Confirming a new TM also changes the loads the app shows for Weeks 1-10, because those are computed from the TM. This only affects how past weeks display; logged sets do not change.
  - The week picker now reaches Week 11, and the app opens on it from Dec 7. Rules tab `no_increase_weeks` is now `10,11` (read first: it was `10`).
  - Asset `?v=` tags bumped to `20261109b`.
- Tests run (Dev): `node tests/test-week.test.js` (5 pass: Week 11 dates and days, Weeks 1-10 untouched, options and ramps match this item, kept accessories exist and are at most half their Week 4 sets). Existing suites pass (`week8` 5, `sync-helpers` 13). Page-level check in jsdom with the real scripts, run twice (built-in program and Program-tab-shaped program), 20 pass. It covers: Week 10 unchanged; Week 11 ramps, drops and recovery days; half-volume accessories; chooser hidden until the last single with nothing pre-selected; Good fills 225 → estimate 248 and suggested TM 245; 5 reps recomputes (263); an invalid TM is rejected; confirming 240 updates the TM and queues one Maxes row; the Monday save logs one squat row `225×3` in Week 11 with `fall-2026-b1` and no ramp rows; the Wednesday save logs `9 reps` and saves nothing for an unchosen bench top set; choices survive a re-render. The Week 8 page check still passes (11).
- Not verified (needs Colin's phone): chooser and TM box layout and tap targets, the iOS number pad on the TM box, and whether the Maxes row reaches the sheet. Also, the Sunday Dec 13 run will see Week 11 sessions with no Week 12 to propose for. It should propose nothing; Block 2 setup (new block id, start date, program) is a separate item.

### Week 8: one extra set on five lifts
- Status: Building. Approved by Colin 2026-11-09. Built, tested and pushed; not Shipped until Colin has done Week 8 on his phone (Nov 16 - 22).
- Raised by: Colin (asked why Weeks 7 and 8 have identical loads); drafted by Coach
- Problem: Week 8 is labeled "Peak volume" but has the same percentages and sets as Week 7, so nothing in it is higher volume. The label and the numbers disagree.
- Behavior (Week 8 only, Nov 16 - 22):
  - Add one set to each of: back squat (4 -> 5 sets), incline bench (4 -> 5), hex bar deadlift (3 -> 4), Romanian deadlift (3 -> 4), barbell hip thrust (3 -> 4).
  - The extra set uses the same weight and reps as the last planned set that day (for example squat: Week 8 top weight x 6; RDL and hip thrust: the last set's weight x 10).
  - Intensity, reps and every other week are unchanged. No other exercise changes.
  - The extra set is optional. If Colin skips it, that is not a missed set: the Sunday assessment must not hold or flag progression because it was skipped.
- Acceptance criteria:
  - In Week 8 the five lifts show one more set than Week 7, with the weight and reps above. Weeks 1-7 and 9-10 are unchanged.
  - Skipping the extra set leaves the session savable and creates no "missed plan" flag in the Sunday run.
  - The extra set saves and displays like any other set, with its effort rating on the lift unchanged.
- Rationale: A modest volume increase at unchanged intensity is a standard way to build a peak-volume week (Moderate for the general principle that more volume at moderate loads supports hypertrophy and strength; the specific +1 set is a Heuristic). It adds about 25% to squat and bench volume in one week, which should be easy to absorb at RPE 8-9 loads, but it comes right before Thanksgiving week, the deload and the test.
- UI notes: Nothing new. The set appears in the normal set list.
- Data impact: Squat, bench and hex bar come from `program.js` percentages (the arrays for Week 8 each gain one entry). RDL and hip thrust come from the Program tab: add one value to the Week 8 cell (W8) of each row, copying the last value currently in that cell, and read the current W8 cell first because accepted proposals may have changed it. RULES.md step 4 needs one line: the extra Week 8 set is optional for the assessment.
- Edge cases: Offline and sync unchanged. If Week 8 is shortened (travel, illness), drop the extra sets first. If a pain flag appears, the extra set goes.
- Risks: Added fatigue could carry into Week 9 and the test. If recovery is poor (check-in energy "Dragging", pain, or a long volleyball week), skip the extra set.
- Rollback: Remove the extra entry from each lift in Week 8.
- Dependencies: None. Not blocked by the test-week item.
- Success check: Colin completes Week 8 with the extra sets on most lifts and Week 9 loads still hit plan. If Week 9 loads drop, the Coach reverts this for the next block.
- Build notes (Dev, 2026-11-09):
  - Squat and bench `pcts` gain a fifth entry (0.84) and hex bar a fourth (0.82) in `program.js`, so the extra set is the same % TM and 6 reps as the last planned set. RDL and hip thrust: Program tab cells `R37` (RDL) and `R71` (hip thrust) were read first (still `135 / 145 / 155` and `275 / 305 / 340`, no pending Week 8 proposals) and are now `135 / 145 / 155 / 155` and `275 / 305 / 340 / 340`. The built-in defaults in `program.js` match.
  - Making the set truly optional needed more than adding it, because the app saves every box that has a value whether or not its check circle was ticked. New in `app.js`, only for the five Week 8 extra sets (`OPTIONAL_LAST_SET` in `program.js`): the set is labelled "optional"; it is saved only if its check circle is ticked; the RDL and hip thrust "Next week?" chip appears after the three required sets; the progress bar does not wait for it; a skipped extra set cannot count as a PR. Every other set in every other week behaves exactly as before.
  - RULES.md step 4 has the one line saying the extra set is optional and that a proposal's `To` keeps the same number of sets as the plan cell. The scheduled Sunday task keeps its own copy of the procedure and does not read RULES.md, so the same two sentences were added to its prompt (Colin's call to review). The first run that can touch this is Sunday Nov 15, which proposes Week 8 targets from Week 7.
  - Asset `?v=` tags bumped to `20261109a`. No Apps Script change, nothing to redeploy.
- Tests run (Dev): `node tests/week8.test.js` (5 pass: Week 8 percentages and set counts, other weeks unchanged, RDL and hip thrust defaults, which sets count as optional) and `node tests/sync-helpers.test.js` (13 pass). Page-level check in jsdom with the real scripts (11 pass; scratch test, not in the repo because it needs `jsdom`): Week 7, 9 and 10 render the old set counts; Week 8 renders squat 5, bench 5, hex bar 4, RDL 4, hip thrust 4 with only the last set optional; with the extra sets skipped, the squat rows saved are 4 and RDL 3, and the chip shows; ticking an extra set saves it, unticking removes it. One test mistake was caught and fixed in my own test (stale page elements after a re-render), not in the app.
- Not verified (needs Colin's phone): how the "optional" tag looks and whether it crowds the set boxes on a small screen; the real first Week 8 save into Sets; whether the Sunday Nov 15 run keeps the four-value cells.

## Backlog / ideas
- Unticked sets are saved as if done: `saveSession` collects every set box that has a value, whether or not its check circle was ticked, so a set skipped on the day but still showing its planned weight is logged as performed. The Sunday assessment then reads that planned weight as the actual one. Week 8's optional extra sets are the only case handled so far. Needs a decision from Colin and the Coach (save only ticked sets, or warn on unticked ones) before any change, because it alters what gets logged for every exercise. (Raised by: Dev)
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
| 2026-11-09 | Add one extra set on squat, incline bench, hex bar, RDL and hip thrust in Week 8 only | Week 8 is labeled Peak volume but matched Week 7; Colin approved | After Week 9 loads are logged |
| 2026-11-09 | Test week Dec 7 - 13; Block 2 starts Dec 14 (earlier than the January plan) | Colin's call; no gap after testing, so no re-ramp | When Block 2 is drafted |
| 2026-11-09 | Week 11 is defined in program.js, not as a Program tab column | One-off week; avoids a sheet schema change and an Apps Script redeploy | If test weeks become a regular block feature |
| 2026-11-09 | Week 8 extra sets are saved only when ticked; the Sunday assessment ignores them | Otherwise a skipped extra set would be logged as done and, for RDL and hip thrust, read as a missed set | After Week 8, with the unticked-sets backlog item |

## Gym friction log
Real-world annoyances or failures. Each may become an item above.
- 2026-10-13: Pull-up set boxes show the planned weight (`BW`, `+10`) but Colin logs reps; the text has to be cleared before typing. See "Log pull-ups as reps, not weight". 
