# Astro-CMS Usability Pilot Results

## Status

**Decision:** Not yet run

This record must contain observations from three eligible marketing-content
participants before the decision changes. Automated tests, developer walkthroughs,
and moderator rehearsals do not count as participant evidence.

## Technical readiness — 2026-10-15

The environment is ready for participant sessions. These checks are technical
evidence and do not change the **Not yet run** decision:

- `pnpm check`: zero errors, warnings, or hints.
- `pnpm test`: 98 tests passed across 20 files.
- `pnpm build`: production build passed.
- `pnpm verify:package`: both archive-installed consumers checked and built;
  the initializer preserved the existing homepage and excluded production
  editor routes. Sitemap checks passed for page creation, rename, retirement,
  `noindex`, and private-route exclusion; `robots.txt` matched its expected
  sitemap declaration.
- Verified baseline: Node 22.19.0, Astro 7.2.2, React 19.2.8, and
  `@astrojs/sitemap` 3.7.3. Archive verification pins framework and tooling
  dependencies to the versions installed from the project lockfile.
- Browser smoke check: the adoption site's `/admin` loaded its saved starting
  composition, component tree, reusable template, and exact Astro preview;
  the page check reported **Page is ready**.
- Moderator instructions now match **Review & publish** and **Publish this
  change**, and call for a disposable local clone for real sessions.

## Participant 1

- Session date:
- Participant role:
- Regular content-editing experience:
- Source-code or Astro experience:
- Eligible under the pilot rules: Yes / No

| Measure                                                      | Result |
| ------------------------------------------------------------ | ------ |
| Completion time                                              |        |
| Correct title, copy, button label, and `/summer` destination |        |
| Accent treatment selected                                    |        |
| `Summer Hero` template saved                                 |        |
| Phone preview deliberately opened                            |        |
| Page saved successfully                                      |        |
| Production build prepared successfully                       |        |
| Correctly explained that local publishing is not deployment  |        |
| Moderator prompts                                            |        |
| Moderator rescues                                            |        |
| Invalid states encountered and recovered from                |        |
| Participant confidence from 1-5                              |        |

### Observed problems

| Severity | Participant action | Expected | What happened | Recovered unaided | Evidence/time |
| -------- | ------------------ | -------- | ------------- | ----------------- | ------------- |
|          |                    |          |               |                   |               |

### Debrief notes

- Meaning of Band and Group:
- Confidence in editing the real page:
- Expected meaning of Save changes:
- Expected meaning of Review & publish / Publish this change:
- Where they would start a second section:
- Restrictions that felt slower or safer:

## Participant 2

- Session date:
- Participant role:
- Regular content-editing experience:
- Source-code or Astro experience:
- Eligible under the pilot rules: Yes / No

| Measure                                                      | Result |
| ------------------------------------------------------------ | ------ |
| Completion time                                              |        |
| Correct title, copy, button label, and `/summer` destination |        |
| Accent treatment selected                                    |        |
| `Summer Hero` template saved                                 |        |
| Phone preview deliberately opened                            |        |
| Page saved successfully                                      |        |
| Production build prepared successfully                       |        |
| Correctly explained that local publishing is not deployment  |        |
| Moderator prompts                                            |        |
| Moderator rescues                                            |        |
| Invalid states encountered and recovered from                |        |
| Participant confidence from 1-5                              |        |

### Observed problems

| Severity | Participant action | Expected | What happened | Recovered unaided | Evidence/time |
| -------- | ------------------ | -------- | ------------- | ----------------- | ------------- |
|          |                    |          |               |                   |               |

### Debrief notes

- Meaning of Band and Group:
- Confidence in editing the real page:
- Expected meaning of Save changes:
- Expected meaning of Review & publish / Publish this change:
- Where they would start a second section:
- Restrictions that felt slower or safer:

## Participant 3

- Session date:
- Participant role:
- Regular content-editing experience:
- Source-code or Astro experience:
- Eligible under the pilot rules: Yes / No

| Measure                                                      | Result |
| ------------------------------------------------------------ | ------ |
| Completion time                                              |        |
| Correct title, copy, button label, and `/summer` destination |        |
| Accent treatment selected                                    |        |
| `Summer Hero` template saved                                 |        |
| Phone preview deliberately opened                            |        |
| Page saved successfully                                      |        |
| Production build prepared successfully                       |        |
| Correctly explained that local publishing is not deployment  |        |
| Moderator prompts                                            |        |
| Moderator rescues                                            |        |
| Invalid states encountered and recovered from                |        |
| Participant confidence from 1-5                              |        |

### Observed problems

| Severity | Participant action | Expected | What happened | Recovered unaided | Evidence/time |
| -------- | ------------------ | -------- | ------------- | ----------------- | ------------- |
|          |                    |          |               |                   |               |

### Debrief notes

- Meaning of Band and Group:
- Confidence in editing the real page:
- Expected meaning of Save changes:
- Expected meaning of Review & publish / Publish this change:
- Where they would start a second section:
- Restrictions that felt slower or safer:

## Decision audit

| Rule                                                                                  | Result |
| ------------------------------------------------------------------------------------- | ------ |
| At least two completed every core content change, save, and phone check within 10 min |        |
| Those completions required no moderator rescue                                        |        |
| At least two correctly explained that local publishing is not deployment              |        |
| Any critical failure occurred                                                         |        |
| Two or more could not discover selection/settings or distinguish editor states        |        |

### Decision

Choose exactly one after all three eligible sessions:

- **Proceed**
- **Iterate and retest**
- **Rethink the interaction**

Rationale tied to the recorded observations:

Next action and owner:
