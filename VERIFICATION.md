# Release verification

Verified on Windows using Node.js 24.16.0, npm 12.2.1, and Playwright 1.65.1. All records used in tests were synthetic.

| Environment | Result |
| --- | --- |
| Build tools | `npm ci`, `npm run typecheck`, eight unit tests, `npm run build`, and `npm run preview` passed. |
| Desktop Chromium | Six production browser tests passed. The desktop preview loaded and displayed offline readiness. |
| Mobile WebKit | Six production browser tests passed with Playwright's iPhone 13 profile. The production preview was also checked in light and dark mode. |
| Physical iPhone | Pending. Check Safari installation, Airplane Mode after force-close, VoiceOver, Larger Text, keyboard and rotation, screen-lock timer, clipboard handoff, Files sharing, reminders, and speed on the device. |
| GitHub Pages | The production files and deployment workflow are ready. The HTTPS deployment and live update check await publication approval and repository access. |

Both browser suites served the build under `/fitness-tracker/`. They checked offline reload and search, undo, steps replacement, rapid-tap handling, trainer preview and link validation, workout resume, elapsed-time rest recalculation, recipe snapshots, backup round-trip in a different timezone, invalid backup rejection, failed-save recovery, past-date selection with a year of records, reminder confirmation, and preservation of a meal and unfinished workout during a simulated site update.

The optional online lookup returned a public sample product in mobile WebKit. Its saved result remained searchable offline. The diary and trainer-preview test recorded no external network requests.

The build uses IndexedDB schema version 1. The update rehearsal exercised service-worker replacement with populated records on that schema. Phone-specific performance targets and the live GitHub Pages workflow remain unverified. Complete the [iPhone installation checklist](README.md#install-and-check-on-iphone) after deployment.
