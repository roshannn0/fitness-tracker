import { createBackup, inspectBackup, parseBackup } from './backup.js'
import { localDate, metrics, safeChat, type Metric, type Profile, type Records } from './model.js'
import { readRecords, restore, updateProfile } from './storage.js'
import { errorLine, escapeHtml as h, formIn, heading, metricLabels, metricUnit, numInput, numberValue, on, sheet,
  submit, textValue, type View } from './ui.js'

export function renderSettings(view: View) {
  const { profile } = view.data
  const drafts = new Map([...view.root.querySelectorAll<HTMLFormElement>('form[data-edited]')].map(form => [form.id, new FormData(form)]))
  view.root.innerHTML = heading('Settings', 'Personal setup, reminders and private backups.') +
    '<section class="panel"><h2>Daily targets</h2><p>Set the ranges you want to see in Today.</p><form id="target-form" class="stack"><div class="target-form">' +
    metrics.filter(key => key !== 'kcal' || !profile.hideCalories).map(key => {
      const target = profile.targets[key]
      return '<fieldset><legend>' + metricLabels[key] + ' (' + metricUnit(key) + ')</legend><div class="form-grid"><label>Lower' +
        numInput(key + '-low', target?.low) + '</label><label>Upper' + numInput(key + '-high', target?.high) + '</label></div></fieldset>'
    }).join('') + '</div>' + errorLine + '<button class="button primary">Save targets</button></form></section>' +
    '<section class="panel"><h2>Privacy display</h2><form id="display-form" class="stack"><label class="check"><input type="checkbox" name="hide-weight"' +
    (profile.hideWeight ? ' checked' : '') + '>Hide weight numbers</label><label class="check"><input type="checkbox" name="hide-calories"' +
    (profile.hideCalories ? ' checked' : '') + '>Hide calorie numbers</label><p>Exported backups still contain your original records.</p>' +
    errorLine + '<button class="button secondary">Save display settings</button></form></section>' +
    '<section class="panel"><h2>Trainer chat</h2><p>Save a private ChatGPT conversation link on this device. A blank link opens ChatGPT.</p>' +
    '<form id="trainer-form" class="stack"><label>Conversation link<input type="url" name="url" placeholder="https://chatgpt.com/c/…" value="' +
    h(profile.trainerUrl) + '" autocapitalize="off" autocomplete="off"></label><label>Trainer profile<textarea name="profile" rows="4">' +
    h(profile.trainerProfile) + '</textarea></label>' + errorLine + '<button class="button secondary">Save trainer setup</button></form></section>' +
    '<section class="panel"><div class="section-head"><div><h2>Apple Reminders</h2><p>' +
    (profile.remindersConfirmed ? 'Setup confirmed by you' : 'Setup awaiting your confirmation') + '</p></div></div><ol class="setup-list"><li>Open Reminders on your iPhone and create “Log lunch”.</li>' +
    '<li>Turn on a time and choose Repeat → Daily or choose weekdays.</li><li>Repeat for an evening check-in.</li>' +
    '<li>If reminders are silent, check Settings → Notifications → Reminders and your Focus settings.</li></ol>' +
    '<form id="reminder-form" class="stack"><div class="form-grid"><label>Lunch reference time<input type="time" name="lunch" required value="' +
    profile.lunchReminder + '"></label><label>Evening reference time<input type="time" name="evening" required value="' + profile.eveningReminder +
    '"></label></div><p>Edit the actual times in Apple Reminders whenever these reference times change.</p><label class="check"><input type="checkbox" name="confirmed"' +
    (profile.remindersConfirmed ? ' checked' : '') + '>I have created both reminders on my iPhone</label>' + errorLine +
    '<button class="button secondary">Save reminder preferences</button></form></section>' +
    '<section class="panel"><div class="section-head"><div><h2>Backup and restore</h2><p>Save a weekly copy to private Files. Clearing website data or losing this device can remove your records.</p>' +
    '</div></div><div class="button-row"><button class="button secondary" id="show-export">Export backup</button><button class="button secondary" id="show-import">Import backup</button></div></section>' +
    '<section class="panel"><h2>Food data credits</h2><p>Offline staples use USDA FoodData Central SR Legacy (April 2018). Barcode results from Open Food Facts retain their source attribution.</p>' +
    '<div class="button-row"><a class="button subtle" href="https://fdc.nal.usda.gov/download-datasets/" target="_blank" rel="noopener noreferrer">USDA FoodData Central</a>' +
    '<a class="button subtle" href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>' +
    '<a class="button subtle" href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL 1.0</a></div></section>'
  const edit = (selector: string, action: (data: FormData) => Promise<boolean>) => {
    const form = formIn(view.root, selector)
    const draft = drafts.get(form.id)
    if (draft) {
      form.dataset.edited = ''
      for (const field of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[name]')) {
        if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = draft.has(field.name)
        else field.value = String(draft.get(field.name) ?? '')
      }
    }
    form.addEventListener('input', () => { form.dataset.edited = '' })
    submit(form, async data => {
      const edited = Object.hasOwn(form.dataset, 'edited')
      delete form.dataset.edited
      try { if (await action(data)) return }
      finally { if (edited && form.isConnected) form.dataset.edited = '' }
    })
  }
  edit('#target-form', async data => {
    const targets: Partial<Profile['targets']> = {}
    for (const key of metrics) {
      if (key === 'kcal' && profile.hideCalories) continue
      targets[key] = readRange(data, key)
    }
    return saveProfile(view, latest => ({ ...latest, targets: { ...latest.targets, ...targets } }), 'Targets saved')
  })
  edit('#display-form', async data => {
    return saveProfile(view, latest => ({ ...latest, hideCalories: data.has('hide-calories'), hideWeight: data.has('hide-weight') }), 'Display settings saved')
  })
  edit('#trainer-form', async data => {
    let trainerUrl: string
    try { trainerUrl = safeChat(textValue(data, 'url')) }
    catch { throw new Error('Enter a private https://chatgpt.com/c/ conversation link, or leave it blank.') }
    return saveProfile(view, latest => ({ ...latest, trainerUrl, trainerProfile: textValue(data, 'profile') }), 'Trainer setup saved')
  })
  edit('#reminder-form', async data => {
    const lunchReminder = textValue(data, 'lunch')
    const eveningReminder = textValue(data, 'evening')
    const changed = lunchReminder !== profile.lunchReminder || eveningReminder !== profile.eveningReminder
    return saveProfile(view, latest => ({ ...latest, lunchReminder, eveningReminder, remindersConfirmed: !changed && data.has('confirmed') }),
      changed ? 'Times saved. Edit both times in Apple Reminders, then confirm setup.' : 'Reminder preferences saved')
  })
  on(view.root, '#show-import', () => importSheet(view))
  on(view.root, '#show-export', async () => {
    try { exportSheet(await readRecords(view.db)) } catch { view.notify('Could not read local records. Try again.') }
  })
}
function saveProfile(view: View, change: (latest: Profile) => Profile, message: string) {
  return view.save(() => updateProfile(view.db, change), message)
}
function readRange(data: FormData, key: Metric) {
  const low = numberValue(data, key + '-low')
  const high = numberValue(data, key + '-high')
  if (low === null && high === null) return null
  if (low === null || high === null || low > high) throw new Error('Enter an ordered lower and upper range for ' + metricLabels[key] + '.')
  return { low, high }
}
function backupFile(records: Records) {
  return new File([JSON.stringify(createBackup(records), null, 2)], 'dayline-backup-' + localDate() + '.json', { type: 'application/json' })
}
function download(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
function exportSheet(records: Records) {
  const file = backupFile(records)
  const data = { files: [file] }
  const sharing = typeof navigator.canShare === 'function' && navigator.canShare(data)
  const dialog = sheet('Export private backup', '<p>This file includes your fitness records, trainer link and settings. Store it in private Files.</p>' +
    (sharing ? '<button class="button primary" id="share-file">Share to Files</button>' : '') +
    '<button class="button ' + (sharing ? 'secondary' : 'primary') + '" id="download-file">Download JSON</button><p class="caption" id="export-state" role="status"></p>')
  on(dialog, '#download-file', () => download(file))
  on(dialog, '#share-file', async () => {
    try { await navigator.share(data) }
    catch (error) {
      const status = dialog.querySelector('#export-state')
      if (status && (!(error instanceof DOMException) || error.name !== 'AbortError')) status.textContent = 'Sharing was unavailable. Try Download JSON.'
    }
  })
}
function importSheet(view: View) {
  const dialog = sheet('Import backup', '<p>Choose a Dayline JSON file to validate and preview.</p><form class="stack"><label>Backup file<input type="file" name="file" accept=".json,application/json" required></label>' +
    errorLine + '<button class="button primary">Preview backup</button></form>')
  submit(formIn(dialog), async data => {
    const file = data.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a JSON backup.')
    if (file.size > 30_000_000) throw new Error('Choose a backup under 30 MB.')
    let decoded: unknown
    try { decoded = JSON.parse(await file.text()) }
    catch { throw new Error('This file is not valid JSON.') }
    const records = parseBackup(decoded)
    const summary = inspectBackup(records)
    if (!dialog.open) return
    const preview = sheet('Replace local records?', '<p>' + (summary.from ? summary.from + ' to ' + summary.to : 'No dated records') + '</p><p>' +
      summary.days + ' days · ' + summary.meals + ' meals · ' + summary.sessions + ' workouts · ' + summary.sets + ' sets</p><p>' +
      summary.custom + ' custom foods · ' + summary.recipes + ' recipes · ' + summary.saved + ' usual meals · ' + summary.templates + ' templates</p>' +
      '<p>Import replaces the logs and settings on this device.</p><button class="button secondary" id="backup-first">Download current backup first</button>' +
      '<button class="button danger" id="restore-backup">Replace with this backup</button>')
    on(preview, '#backup-first', async () => {
      try { download(backupFile(await readRecords(view.db))) } catch { view.notify('Could not read local records. Try again.') }
    })
    on(preview, '#restore-backup', async () => {
      if (await view.save(() => restore(view.db, records), 'Backup restored')) preview.close()
    })
  })
}
