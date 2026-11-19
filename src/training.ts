import { isDateKey, timestamp, uuid, type Exercise, type Session, type SetLog, type Template } from './model.js'
import { liftHistory } from './progress.js'
import { updateProfile, updateSession } from './storage.js'
import { bindDate, dateStrip, empty, errorLine, escapeHtml as h, formIn, heading, icon, numInput, numberValue, on, options,
  positiveValue, sheet, submit, textValue, wholeValue, type View } from './ui.js'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
let currentSession = ''
const sides = ['', 'Left', 'Right', 'Both'] as const
const kinds = ['lift', 'timed', 'cardio'] as const
const setText = (set: SetLog) => [
  set.warmup ? 'Warm-up' : 'Working', set.name,
  set.reps === null ? (set.seconds ?? 0) / (set.distance === null ? 1 : 60) + (set.distance === null ? ' sec' : ' min') :
    (set.kg === null ? '' : set.kg + ' kg × ') + set.reps + ' reps',
  set.distance === null ? '' : set.distance + ' km', set.side,
].filter(Boolean).join(' · ')
export const restRemaining = (restUntil: number | null, now = Date.now()) => Math.max(0, Math.ceil(((restUntil ?? now) - now) / 1000))
export async function openWorkout(view: View, scheduled?: Template) {
  const active = view.data.sessions.find(session => session.date === view.date && !session.complete)
  if (active) currentSession = active.id
  else if (scheduled && !await startSession(view, scheduled)) return
  view.go('training')
}
async function startSession(view: View, template: Template) {
  const existing = view.data.sessions.find(item => item.date === view.date && item.template.id === template.id && !item.complete)
  if (existing) { currentSession = existing.id; view.render(); return true }
  const session: Session = {
    id: uuid(), date: view.date, template, sets: [], complete: false, restUntil: null, notes: '', created: timestamp(),
  }
  currentSession = session.id
  return view.save(() => updateSession(view.db, session.id, latest => latest ?? session), 'Workout started')
}

export function renderTraining(view: View) {
  const sessions = view.data.sessions.filter(session => session.date === view.date)
  const active = sessions.find(session => session.id === currentSession) ?? sessions.find(session => !session.complete)
  view.root.innerHTML = heading('Training', 'Log a session and keep your working sets together.', dateStrip(view.date)) +
    (active ? sessionCard(active) : '') +
    '<section class="panel"><div class="section-head"><div><h2>Workout templates</h2><p>Set your own schedule and exercise order.</p></div>' +
    '<button class="button secondary" id="new-template">' + icon('plus', 17) + ' New template</button></div><div class="template-grid">' +
    (view.data.profile.templates.length ? view.data.profile.templates.map(template =>
      '<article class="template"><div class="side-head"><span class="square purple">' + icon('training') + '</span><div><h3>' + h(template.name) +
      '</h3><p>' + template.exercises.length + ' exercises · ' + (template.weekdays.length ? template.weekdays.map(day => weekdays[day]).join(', ') : 'No schedule') +
      '</p></div></div><div class="button-row"><button class="button primary" data-start="' + h(template.id) + '">Start</button>' +
      '<button class="button secondary" data-template="' + h(template.id) + '">Edit template</button></div></article>').join('') :
      empty('No workout templates', 'Create a template to start a session.', 'training')) + '</div></section>' +
    '<section class="panel"><div class="section-head"><h2>Sessions on this date</h2></div>' +
    (sessions.length ? '<ul class="result-list">' + sessions.slice().reverse().map(session =>
      '<li><div class="result-title"><strong>' + h(session.template.name) + '</strong><span>' +
      (session.complete ? 'Complete' : 'In progress') + ' · ' + session.sets.length + ' records</span></div>' +
      '<button class="button subtle" data-open-session="' + h(session.id) + '">' + (session.complete ? 'View' : 'Resume') + '</button></li>').join('') +
      '</ul>' : empty('No training logged', 'Choose a workout template to start.', 'training')) + '</section>'
  bindDate(view)
  bindSession(view, active)
  on(view.root, '#new-template', () => templateSheet(view))
  on(view.root, '[data-template]', button => {
    const template = view.data.profile.templates.find(item => item.id === button.dataset.template)
    if (template) templateSheet(view, template)
  })
  on(view.root, '[data-start]', async button => {
    const template = view.data.profile.templates.find(item => item.id === button.dataset.start)
    if (!template) return
    if (await startSession(view, template)) view.root.querySelector<HTMLElement>('#session-title')?.focus()
  })
  on(view.root, '[data-open-session]', button => {
    currentSession = button.dataset.openSession ?? ''
    view.render()
    view.root.querySelector<HTMLElement>('#session-title')?.focus()
  })
}
function sessionCard(session: Session) {
  const timer = restRemaining(session.restUntil)
  return '<section class="panel session"><div class="section-head"><div><p class="eyebrow">' + (session.complete ? 'COMPLETE' : 'IN PROGRESS') +
    '</p><h2 tabindex="-1" id="session-title">' + h(session.template.name) + '</h2></div>' +
    '<button class="button secondary" id="session-options">Session options</button></div>' +
    (session.restUntil !== null && !session.complete ? '<div class="rest-strip" data-rest-until="' + session.restUntil + '"><div>' + icon('clock') +
      '<strong>Rest timer</strong></div><span role="timer" aria-label="Rest remaining" id="rest-clock">' + restLabel(timer) + '</span>' +
      '<button class="button subtle" id="clear-rest">Dismiss timer</button></div>' : '') +
    session.template.exercises.map(exercise => {
      const sets = session.sets.filter(set => set.exerciseId === exercise.id)
      const activeCount = sets.filter(set => !set.warmup).length
      const warmups = sets.length - activeCount
      return '<div class="exercise-row"><div class="section-head"><div><h3>' + h(exercise.name) + '</h3><p>' +
        h(exercise.kind === 'cardio' ? 'Time and optional distance' : exercise.sets + ' × ' + exercise.reps +
        (exercise.rest ? ' · ' + exercise.rest + ' sec rest' : '')) + '</p></div>' +
        (session.complete ? '' : '<button class="button secondary" data-exercise="' + h(exercise.id) + '">' + icon('plus', 16) +
          (exercise.kind === 'cardio' ? ' Log activity' : ' Log set') + '</button>') + '</div>' +
        '<p class="caption">' + (exercise.warmups ? warmups + '/' + exercise.warmups + ' warm-up · ' : '') + activeCount + '/' + exercise.sets +
        ' working' + (exercise.pairing ? ' · Pair with ' + h(exercise.pairing) : '') + '</p>' +
        (exercise.notes || exercise.alternatives.length ? '<details><summary>Alternatives and notes</summary><p>' + h(exercise.alternatives.join(', ')) +
          '</p><p>' + h(exercise.notes) + '</p></details>' : '') +
        (sets.length ? '<ul class="entry-list">' + sets.map(set => '<li><span>' + h(trainingSetText(set, exercise)) + '</span><button class="button subtle" data-edit-set="' +
          h(set.id) + '">Edit</button></li>').join('') + '</ul>' : '') + '</div>'
    }).join('') +
    (session.complete ? '' : '<button class="button primary" id="finish-session">Finish workout</button>') + '</section>'
}
function trainingSetText(set: SetLog, exercise: Exercise) {
  if (exercise.kind !== 'cardio' || set.distance !== null) return setText(set)
  return set.name + ' · ' + (set.seconds ?? 0) / 60 + ' min'
}
function restLabel(value: number) {
  return value ? Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0') : 'Rest complete'
}
export function refreshRestClock(root: ParentNode) {
  const timer = root.querySelector<HTMLElement>('[data-rest-until]')
  const clock = timer?.querySelector('#rest-clock')
  if (timer && clock) {
    const label = restLabel(restRemaining(Number(timer.dataset.restUntil)))
    if (clock.textContent !== label) clock.textContent = label
  }
}
function bindSession(view: View, session?: Session) {
  if (!session) return
  on(view.root, '#session-options', () => sessionOptions(view, session))
  on(view.root, '#clear-rest', () => changeSession(view, session, latest => ({ ...latest, restUntil: null }), 'Rest timer cleared'))
  on(view.root, '#finish-session', () => {
    if (!session.sets.length) { view.notify('Log a set or activity before finishing.'); return }
    changeSession(view, session, latest => ({ ...latest, complete: true, restUntil: null }), 'Workout complete')
  })
  on(view.root, '[data-exercise]', button => {
    const exercise = session.template.exercises.find(item => item.id === button.dataset.exercise)
    if (exercise) setSheet(view, session, exercise)
  })
  on(view.root, '[data-edit-set]', button => {
    const set = session.sets.find(item => item.id === button.dataset.editSet)
    const exercise = session.template.exercises.find(item => item.id === set?.exerciseId)
    if (set && exercise) setSheet(view, session, exercise, set)
  })
}
function changeSession(view: View, session: Session, change: (latest: Session) => Session, message: string, undo?: () => Promise<unknown>) {
  return view.save(() => updateSession(view.db, session.id, latest => {
    if (!latest) throw new Error('This session is no longer available.')
    return change(latest)
  }), message, undo)
}
function sessionOptions(view: View, session: Session) {
  const dialog = sheet('Session options', '<form class="stack"><label>Session date<input type="date" name="date" value="' + session.date +
    '" required></label><label>Private comfort or exercise notes<textarea name="notes" rows="4">' + h(session.notes) +
    '</textarea></label>' + errorLine + '<button class="button primary">Save session</button></form>' +
    (session.complete ? '<button class="button secondary" id="reopen">Reopen workout</button>' : ''))
  submit(formIn(dialog), async data => {
    const date = data.get('date')
    if (!isDateKey(date)) throw new Error('Choose a valid date.')
    if (await changeSession(view, session, latest => ({ ...latest, date, notes: textValue(data, 'notes') }), 'Session saved')) {
      dialog.close()
      if (date !== view.date) view.selectDate(date)
    }
  })
  on(dialog, '#reopen', async () => {
    if (await changeSession(view, session, latest => ({ ...latest, complete: false }), 'Workout reopened')) dialog.close()
  })
}
function setSheet(view: View, session: Session, exercise: Exercise, existing?: SetLog) {
  const cardio = exercise.kind === 'cardio'
  const lift = exercise.kind === 'lift'
  const chosen = existing?.name ?? exercise.name
  const warmup = existing?.warmup ?? session.sets.filter(set => set.exerciseId === exercise.id && set.warmup).length < exercise.warmups
  const dialog = sheet(existing ? 'Edit training log' : 'Log ' + exercise.name, '<form class="stack"><label>Exercise<select name="name">' +
    options([exercise.name, ...exercise.alternatives], chosen) + '</select></label><p id="last-set" class="hint"></p><div class="form-grid">' +
    (lift ? '<label>Actual kg' + numInput('kg', existing?.kg ?? null) + '</label><label>Reps' + numInput('reps', existing?.reps ?? null, { min: 1, step: '1', required: true }) + '</label>' :
      '<label>' + (cardio ? 'Minutes' : 'Seconds') + numInput('duration', existing?.seconds == null ? null : existing.seconds / (cardio ? 60 : 1), { min: 0.01, required: true }) + '</label>' +
      (cardio ? '<label>Distance (km, optional)' + numInput('distance', existing?.distance) + '</label>' : '')) +
    '</div>' + (cardio ? '' : '<label>Side<select name="side">' + sides.map(side => '<option value="' + side + '"' +
      (existing?.side === side ? ' selected' : '') + '>' + (side || 'Unspecified') + '</option>').join('') +
      '</select></label><label class="check"><input type="checkbox" name="warmup"' + (warmup ? ' checked' : '') + '>Warm-up</label>') +
    errorLine + '<button class="button primary">' + (cardio ? 'Save activity' : 'Save set') + '</button></form>' +
    (existing ? '<button class="button danger" id="delete-set">Delete log</button>' : ''))
  const form = formIn(dialog)
  const select = form.querySelector<HTMLSelectElement>('[name=name]')
  const last = dialog.querySelector<HTMLElement>('#last-set')
  const updateHint = () => {
    if (!last || !lift) return
    const previous = liftHistory(view.data, session.date, select?.value ?? chosen).find(set => set.id !== existing?.id)
    last.textContent = previous ? 'Last working set · ' + previous.kg + ' kg × ' + previous.reps + ' reps' + (previous.side ? ' · ' + previous.side : '') : 'No previous working weight logged'
  }
  select?.addEventListener('change', updateHint)
  updateHint()
  submit(form, async data => {
    const name = textValue(data, 'name')
    if (![exercise.name, ...exercise.alternatives].includes(name)) throw new Error('Choose an exercise.')
    const set: SetLog = {
      id: existing?.id ?? uuid(), exerciseId: exercise.id, name, warmup: data.has('warmup'),
      kg: lift ? numberValue(data, 'kg') : null, reps: lift ? wholeValue(data, 'reps') : null,
      seconds: lift ? null : positiveValue(data, 'duration') * (cardio ? 60 : 1),
      distance: cardio ? numberValue(data, 'distance') : null, side: sides.find(side => side === data.get('side')) ?? '',
      created: existing?.created ?? timestamp(),
    }
    const save = await changeSession(view, session, latest => ({
      ...latest, restUntil: !existing && exercise.rest > 0 ? Date.now() + exercise.rest * 1000 : latest.restUntil,
      sets: existing ? latest.sets.map(item => item.id === set.id ? set : item) : [...latest.sets.filter(item => item.id !== set.id), set],
    }), cardio ? 'Activity saved' : 'Set saved', () => updateSession(view.db, session.id, latest => {
      if (!latest) throw new Error('Session unavailable.')
      return { ...latest, restUntil: session.restUntil, sets: existing ? latest.sets.map(item => item.id === set.id ? existing : item) :
        latest.sets.filter(item => item.id !== set.id) }
    }))
    if (save) dialog.close()
  })
  on(dialog, '#delete-set', () => {
    if (!existing) return
    const confirmation = sheet('Delete this training log?', '<button class="button danger" id="confirm-delete-set">Delete log</button>')
    on(confirmation, '#confirm-delete-set', async () => {
      if (await changeSession(view, session, latest => ({ ...latest, sets: latest.sets.filter(item => item.id !== existing.id) }), 'Training log deleted',
        () => updateSession(view.db, session.id, latest => {
          if (!latest) throw new Error('Session unavailable.')
          return { ...latest, sets: [...latest.sets.filter(item => item.id !== existing.id), existing].sort((a, b) => a.created.localeCompare(b.created)) }
        }))) confirmation.close()
    })
  })
}
function templateSheet(view: View, template?: Template) {
  const dialog = sheet(template ? 'Edit workout template' : 'New workout template',
    '<form class="stack"><label>Template name<input required name="name" maxlength="120" value="' + h(template?.name) + '"></label><fieldset><legend>Scheduled days</legend>' +
    '<div class="weekday-grid">' + weekdays.map((day, i) => '<label class="check"><input type="checkbox" name="day-' + i + '"' +
      (template?.weekdays.includes(i) ? ' checked' : '') + '>' + day + '</label>').join('') + '</div></fieldset><div id="exercise-editor"></div>' +
    '<button type="button" class="button secondary" id="new-exercise">Add exercise</button>' + errorLine +
    '<button class="button primary">Save template</button></form>' +
    (template ? '<button class="button danger" id="delete-template">Delete template</button>' : ''))
  const form = formIn(dialog)
  const target = form.querySelector('#exercise-editor')
  const insert = (exercise: Exercise) => {
    const item = document.createElement('fieldset')
    const pre = exercise.id + '-'
    item.dataset.exerciseId = exercise.id
    item.innerHTML = '<legend>Exercise</legend><label>Name<input name="' + h(pre) + 'name" value="' + h(exercise.name) +
      '" required maxlength="120"></label><label>Alternatives, separated by commas<input name="' + pre + 'alternatives" value="' + h(exercise.alternatives.join(', ')) +
      '"></label><div class="form-grid"><label>Type<select name="' + pre + 'kind">' + options(kinds, exercise.kind) + '</select></label>' +
      '<label>Rep or time range<input name="' + pre + 'reps" required value="' + h(exercise.reps) + '"></label><label>Warm-ups' + numInput(pre + 'warmups', exercise.warmups, { step: '1' }) +
      '</label><label>Working sets' + numInput(pre + 'sets', exercise.sets, { step: '1', min: 1, required: true }) + '</label><label>Rest seconds' + numInput(pre + 'rest', exercise.rest, { step: '1' }) +
      '</label><label>Pair with<input name="' + pre + 'pairing" value="' + h(exercise.pairing) + '"></label></div>' +
      '<label>Private notes<textarea name="' + pre + 'notes" rows="2">' + h(exercise.notes) +
      '</textarea></label><div class="button-row"><button type="button" class="button subtle up">Move up</button><button type="button" class="button subtle down">Move down</button>' +
      '<button type="button" class="button subtle remove">Remove exercise</button></div>'
    on(item, '.up', () => { if (item.previousElementSibling) item.previousElementSibling.before(item) })
    on(item, '.down', () => item.nextElementSibling?.after(item))
    on(item, '.remove', () => item.remove())
    target?.append(item)
  }
  const draft = (): Exercise => ({ id: uuid(), name: '', alternatives: [], kind: 'lift', warmups: 1, sets: 3, reps: '8–12', rest: 90, pairing: '', notes: '' })
  for (const exercise of template?.exercises ?? [draft()]) insert(exercise)
  on(dialog, '#new-exercise', () => insert(draft()))
  submit(form, async data => {
    const exercises = [...form.querySelectorAll<HTMLElement>('[data-exercise-id]')].map(row => {
      const id = row.dataset.exerciseId ?? uuid()
      const pre = id + '-'
      const name = textValue(data, pre + 'name')
      const reps = textValue(data, pre + 'reps')
      if (!name || !reps) throw new Error('Enter each exercise name and rep or time range.')
      return { id, name, reps, kind: kinds.find(kind => kind === data.get(pre + 'kind')) ?? 'lift',
        alternatives: [...new Set(textValue(data, pre + 'alternatives').split(',').map(part => part.trim()).filter(part => part && part !== name))],
        warmups: wholeValue(data, pre + 'warmups'), sets: wholeValue(data, pre + 'sets', 1), rest: wholeValue(data, pre + 'rest'),
        pairing: textValue(data, pre + 'pairing'), notes: textValue(data, pre + 'notes') }
    })
    const name = textValue(data, 'name')
    if (!name || !exercises.length) throw new Error('Enter a template name and at least one exercise.')
    const record: Template = { id: template?.id ?? uuid(), name, exercises, weekdays: weekdays.flatMap((_, index) => data.has('day-' + index) ? [index] : []) }
    if (await view.save(() => updateProfile(view.db, profile => ({
      ...profile, templates: template ? profile.templates.map(item => item.id === template.id ? record : item) : [...profile.templates, record],
    })), 'Template saved')) dialog.close()
  })
  on(dialog, '#delete-template', () => {
    const confirmation = sheet('Delete this workout template?', '<p>Existing sessions retain their workout instructions.</p><button class="button danger" id="confirm-delete-template">Delete template</button>')
    on(confirmation, '#confirm-delete-template', async () => {
      if (await view.save(() => updateProfile(view.db, profile => ({ ...profile, templates: profile.templates.filter(item => item.id !== template?.id) })), 'Template deleted')) confirmation.close()
    })
  })
}
