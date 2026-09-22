# Life Sync

**What it is:** Learnora now knows when the student's life happens, and
schedules their studying around it.

Everything else in this app models the *studying* — materials, decks, plans,
sessions, mastery. None of it knew when the student was actually free. So the
weekly plan was a wish ("90 minutes of Chemistry on Tuesday") rather than a
schedule, and a student with a 9am lecture, a Thursday shift and football on
Saturday had to do the placement themselves.

That placement is exactly the work our users don't know how to do. They are not
short of capability or material. They are short of a decision about what to do
at three o'clock on a Tuesday.

## The shape of it

```
My week (student's timetable, sleep window, capacity, chronotype)
        +
Imported .ics (real lectures, shifts, appointments — stays on device)
        ↓
availability.ts   → free windows, each scored 0-1 for focus quality
        ↓
studyDemands.ts   → due cards, tasks, exam prep, weak topics → comparable minutes
        ↓
autoSchedule.ts   → deterministic placement: deadlines hard, hard work in good hours
        ↓
Today's Timeline (dashboard)  ·  block reminders  ·  .ics export  ·  AI plan context
```

## Files

| File | What it owns |
| --- | --- |
| `lib/lifeContext.ts` | The student's week as data: sleep window, chronotype, recurring commitments, honest daily capacity, protected days. localStorage, like `settings.ts`. |
| `lib/icsImport.ts` | Reads a real calendar. Line unfolding, DTSTART/DTEND/DURATION, EXDATE, and RRULE expansion for DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY. |
| `lib/availability.ts` | Free windows per day, buffered around commitments and scored by a chronotype energy curve, capped at the student's stated capacity. |
| `lib/autoSchedule.ts` | Places demands into windows. Deterministic. |
| `lib/studyDemands.ts` | Turns tasks, exams, due cards and weak topics into one comparable queue. |
| `lib/availabilityPrompt.ts` | The same availability, said to the model. |
| `lib/ics.ts` | `generateScheduleICS` — timed events with alarms, alongside the original all-day export. |
| `hooks/useLifeContext.ts` | One shared reading of the week (`useSyncExternalStore`), so every surface agrees the instant one writes. |
| `hooks/useStudySchedule.ts` | The engine assembled from the app's existing queries. |
| `hooks/useBlockReminders.ts` | Announces a block a few minutes before it starts. Mounted on `AppShell`. |
| `views/lifesync/MyWeekView.tsx` | `/my-week` — the setup screen. |
| `views/dashboard/TodayTimelineCard.tsx` | The flagship card: today, decided. |

## Three rules the scheduler will not break

1. **Deadlines are hard.** Work due Thursday is never placed on Friday. If it
   doesn't fit it comes back as `unplaced` with a reason, and the UI says so out
   loud. "There is four hours of work and two hours of week left" is the most
   useful thing we can tell someone; quietly moving a deadline is the one thing
   a planner must never do.
2. **Hard work gets good hours.** New material takes the peak; flashcards go in
   the flat half-hour after training — not because recall goes better tired, but
   because putting it there is what keeps the peak free.
3. **Sooner beats better.** A slightly better window tomorrow loses to a
   good-enough window today, more strongly the more urgent the work is.

The scheduler is pure and deterministic: same inputs, same plan. That is what
lets the timeline recompute on every render without the day reshuffling itself
under the student — which would destroy the one thing this feature sells, the
sense that the day is decided and they can stop deciding.

## Privacy

An imported calendar names someone's doctor's appointments and their family. It
is parsed in the browser, stored in `localStorage` with the rest of the life
context, and **never uploaded**. The scheduler works fine locally, so there is
no reason to hold it. `MyWeekView` says this on the screen and the Remove button
is one click.

## Deliberate limits, stated rather than discovered later

- **`DTSTART;TZID=…` is read as local wall-clock time.** Doing better needs a
  full IANA timezone database in the bundle; the case it gets wrong (a calendar
  authored in one zone, read in another) is rarer for a student than the bundle
  cost is certain. `…Z` values are converted properly.
- **All-day calendar entries are shown, never treated as busy.** In a student's
  calendar they are "Reading week", "Mum's birthday". Treating them as 1440 busy
  minutes would silently delete whole days from the schedule.
- **Overnight commitments are out of scope.** A block wrapping midnight breaks
  the one-array-per-date shape the engine relies on; the honest answer is to
  enter a night shift as two commitments.
- **An RRULE we don't understand yields its first occurrence only** —
  under-booking the student rather than over-booking them.

## Known gaps, in the order worth closing

1. **Block reminders are in-tab only.** Real web push exists in this repo
   (`lib/push.ts` + the `send-push-reminders` edge function), but that function
   runs on a server that cannot see this schedule, because the life context it is
   built from never leaves the device. Closing it means either syncing the
   schedule server-side or scheduling pushes from the client — a real decision,
   not an oversight.
2. **Life context does not sync across devices.** Same root cause, same choice as
   `settings.ts` (which is also localStorage, with `timezone` separately mirrored
   into `profiles` for server-side use). A student who sets up their week on a
   laptop starts again on their phone.
3. **The `.ics` export is a download, not a subscription.** A stable
   `webcal://` feed the student adds once and forgets would be strictly better
   than re-exporting after every change, and needs a server endpoint plus a
   share token.
4. **`/my-week` has not had a dedicated a11y pass**, the same note the backlog
   carries for Study Room and Concept Graph. Keyboard reachability is built in
   (every toggle is a real `<button>` with `aria-pressed`, the chronotype picker
   is a `radiogroup`, day pills hold a 40px touch target) but it has not been
   exercised with a screen reader by hand.

## Tests

188 new tests across the engine and both surfaces (`*.test.ts(x)` beside each
file above). Two bugs the tests caught during development, both worth knowing
about because they were invisible from the outside:

- `autoSchedule` silently dropped any demand shorter than `minBlockMins` — ten
  minutes of due cards vanished without being placed *or* reported.
- `loadDashboardLayout` returned the stored layout as-is, so every dashboard
  section added after a student first opened the customise modal shipped hidden
  for exactly the people who already use the app. Now merged onto the defaults.
