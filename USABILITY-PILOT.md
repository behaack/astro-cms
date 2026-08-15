# Astro-CMS Usability Pilot

## Decision this pilot must make

Can a person who edits marketing content—but does not develop Astro sites—use
the constrained editor without training?

The architecture and second-project adoption tests have already passed. This
pilot is deliberately about comprehension, confidence, and task completion. It
must not be reported as passed until real participants have been observed.

## Participant

Recruit three people who regularly edit website or campaign content. At least
two should have no source-code or Astro experience. Do not use contributors to
this repository for the first three sessions.

## Setup before each session

From `examples/adoption-site`:

```bash
pnpm pilot:reset
pnpm dev
```

Open `http://localhost:4331/admin`. Give the participant only
[`PILOT-TASK.md`](./examples/adoption-site/PILOT-TASK.md). Do not explain the
component hierarchy, property panel, page tree, templates, preview sizes, or
save/build controls in advance.

The reset command intentionally replaces the pilot fixture's page and template
files. Never run it in a real site.

## Moderator protocol

1. Say: “This is an early page editor. Please complete the campaign brief and
   think aloud. We are testing the editor, not you.”
2. Start the timer when the editor is visible.
3. Do not offer help for the first five minutes.
4. If the participant is blocked after five minutes, ask only: “What are you
   trying to do now?”
5. Record every hint. A direct instruction such as “select the title in the
   preview” counts as a moderator rescue.
6. Stop at 15 minutes or when the participant says the task is complete.
7. Verify the saved page and production build after the participant stops; do
   not silently correct their work.

## Measures

Record these facts, not general impressions:

| Measure                                                      | Result |
| ------------------------------------------------------------ | ------ |
| Completion time                                              |        |
| Correct title, copy, button label, and `/summer` destination |        |
| Accent treatment selected                                    |        |
| `Summer Hero` template saved                                 |        |
| Phone preview deliberately opened                            |        |
| Page saved successfully                                      |        |
| Production build prepared successfully                       |        |
| Moderator prompts                                            |        |
| Moderator rescues                                            |        |
| Invalid states encountered and recovered from                |        |
| Participant's confidence from 1–5                            |        |

For each observed problem, record the participant's action, what they expected,
what happened, whether they recovered, and a severity:

- **Critical:** prevents task completion or risks publishing the wrong result.
- **Major:** requires a rescue or repeated trial and error.
- **Minor:** causes hesitation but the participant recovers unaided.

## Debrief questions

Ask these after the task:

1. What did you think “Band” and “Group” meant?
2. At what point did you feel confident—or not confident—that you were editing
   the real page?
3. What did you expect “Save changes” to do?
4. What did you expect “Build for publishing” to do?
5. If you wanted to create a second section, where would you start?
6. What, if anything, felt more restrictive than the page editors you use now?
7. Would these restrictions make you feel safer or merely slower?

## Decision rule

- **Proceed:** at least two of the first three participants complete every core
  content change, save, and phone check within 10 minutes with no rescue. At
  least two correctly explain that building is not deployment.
- **Iterate and retest:** participants understand the component model but share
  recoverable problems with labels, selection, insertion, or state feedback.
- **Rethink the interaction:** two or more participants cannot discover the
  component/settings relationship, cannot tell what is selected, or cannot
  distinguish preview, saved state, and publishing after two rescues.

Do not average away a critical failure. Fix it and repeat the same task with a
new participant.
