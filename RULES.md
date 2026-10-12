# Sunday assessment rules

Runs Sundays ~7:45 pm Chicago as a scheduled task. Tunable numbers live in the sheet's **Rules** tab; this file is the procedure.

1. Read Rules. If `enabled` is FALSE, write only the heartbeat row.
2. Back up: copy the Program tab values into a note in the run summary (before/after is also kept in **Program history**).
3. Apply: for Proposals whose latest status is `accepted`/`edited`, write `To` into Program cell W{week} for that exercise, add a row to Program history, append an `applied` row. Pending proposals for past weeks become `expired`.
4. Assess the most recent session per exercise (Sets rows on/after `block_start`):
   - Skip primary lifts, warm-up/primer/cooldown/prehab groups, exercises without an Increment, ids appearing in more than one Program group, non-numeric plans, and the no-increase weeks.
   - Hold if any set was missed vs plan, effort was Grind, or the note mentions pain.
   - Otherwise propose actual + N increments (Easy `easy_steps`, Right/none `right_steps`), capped at `max_jump_pct` of the top set (never below one increment), for the next week, only if above what the plan already says.
5. Append `weight` proposals (status `pending`, source `sunday-run`) with Reason, Last week, Flags; append a `run` heartbeat row.
6. Read decline reasons/notes from the past week and mention anything notable in the summary.
