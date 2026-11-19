# Dayline fitness journal

Dayline is a single-user iPhone fitness journal built as a Progressive Web App. It stores your records in IndexedDB. The public site serves the app files and USDA starter catalog. Set up your targets, meals, schedule, and trainer link from the installed app on your phone.

## Run the production build locally

Use Node.js 24 LTS. The release was built with Node.js 24.16.0 and npm 12.2.1.

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open the URL Vite prints. Wait for **Available offline** before testing a disconnected reload. Use `npm run dev` for development. Production builds generate the service worker and precache list in `dist`.

## Run the browser checks

After building, run these commands. Playwright serves `dist` under `/fitness-tracker/` and tests it in desktop Chromium and iPhone-profile WebKit.

```powershell
npx playwright install chromium webkit
npm run test:e2e
```

## Publish to GitHub Pages

1. After publication is approved, create a public GitHub repository named `fitness-tracker`.
2. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push the project source and lockfile to `main`. The included workflow builds and uploads `dist`. Keep backups, private links, and personal setup out of the repository.
4. When the workflow succeeds, open the HTTPS link in **Settings → Pages**. Confirm Dayline loads and displays **Available offline**. Open the installed app from this same URL when you change phones. The build uses relative paths for the manifest, icons, and service worker. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Install and check on iPhone

1. Open the published HTTPS URL in Safari. Tap **Share → Add to Home Screen**. Turn on **Open as Web App** if offered, then tap **Add**. [Apple’s Home Screen web app guide](https://support.apple.com/guide/iphone/iph42ab2f3a7/ios)
2. Open Dayline from the new Home Screen icon. Wait for **Available offline**. Log a test food in Food, then check the meal and totals in Today.
3. Force-close Dayline, enable Airplane Mode, and reopen it. Confirm that your test meal is still present and that a search for `nasi putih` works. Reconnect and remove the test meal.
4. In **Settings → Daily targets**, enter your ranges from the blueprint. In Training, tap **Set up training split** to schedule Upper A, Lower & Core, and Upper B. Use **Edit template** to change days or exercises later. In Today, edit a logged meal and tap **Save to usual meals** for one-tap logging.
5. In Apple Health, find Steps for the date you are logging. In Today, tap **Enter steps** and type the daily total. A later edit replaces that date’s total.
6. In Apple Reminders, create **Log lunch** and an evening check-in. Set their times and recurrence. In Dayline Settings, save your reference times and confirm setup. Create a temporary reminder for a few minutes ahead, close Dayline, and check that Apple Reminders alerts you. Remove the temporary reminder.
7. Check portrait and landscape layout, the numeric keyboard, Larger Text, and VoiceOver. Log a set, lock the phone until its rest interval expires, and reopen Dayline. The saved set should remain, and the timer should read **Rest complete**.
8. In Settings, optionally save your private ChatGPT conversation link. In Today, tap **Ask my trainer** and review the summary. Tap **Copy summary**, then **Open trainer chat**. Paste the text yourself, then return to Dayline and check that your logs are still there.
9. In **Settings → Backup and restore**, export a JSON backup to private Files. Check the file preview before you restore it to a clean installation. Keep a weekly copy. Clearing site data or losing the phone can remove your local records.
10. On your phone, check a warm offline start and catalog search with a year of synthetic logs before relying on the speed targets. Record the model, iOS version, and times. The blueprint targets 2 seconds to usable Today and 200 ms for local search after typing stops.

## Food data

- The catalog contains 74 USDA records with source IDs, descriptions, edible gram weights, published portions where available, and local search aliases. The source is SR Legacy, April 2018. To regenerate the catalog, download the corresponding CSV ZIP and run `python scripts/build-catalog.py PATH_TO_ZIP`. [USDA FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/)
- The starter soy chicken and rice soup is a documented estimate. Open **Ingredients and yield** to see its weights and final batch yield.
- Barcode lookup sends an exact barcode to the Open Food Facts v3.6 API on request. Dayline identifies itself with an `X-User-Agent` header and spaces requests at least five seconds apart. Open Food Facts documents a limit of 15 product reads per minute per IP address. The form offers offline label entry when lookup fails. Saved results retain their barcode and source attribution and stay separate from the USDA catalog. [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
