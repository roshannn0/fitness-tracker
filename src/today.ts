import { allRecipes, soup } from './catalog.js'
import { addSaved, diaryRows, mealSheet } from './diary.js'
import { showSoup, usualSheet } from './food.js'
import { calendar, dateLabel, isDateKey, metrics, shiftDate, type DateKey, type Metric, type Records } from './model.js'
import { displayNumber, recipePortion, totals } from './nutrition.js'
import { updateDay } from './storage.js'
import { openWorkout } from './training.js'
import { trainerSummary } from './trainer.js'
import { bindDate, dateStrip, dayTitle, empty, errorLine, escapeHtml as h, formIn, getDay, heading, icon, metricLabels, metricUnit, metricValue,
  numInput, on, sheet, submit, textValue, wholeValue, type View } from './ui.js'

export function upcoming(records: Records, date: DateKey) {
  for (let offset = 0; offset <= 7; offset++) {
    const scheduledDate = shiftDate(date, offset)
    const weekday = calendar(scheduledDate).getDay()
    const template = records.profile.templates.find(item => item.weekdays.includes(weekday) &&
      !records.sessions.some(session => session.date === scheduledDate && session.template.id === item.id && session.complete))
    if (template) return { date: scheduledDate, template }
  }
}
let lastQuick = { id: '', at: 0 }
function targetTile(key: Metric, total: number | null, records: Records, hasMeals: boolean) {
  const target = records.profile.targets[key]
  const pct = target && target.high > 0 && total !== null && hasMeals ? Math.min(100, total / target.high * 100) : 0
  return '<div class="target"><span class="target-label">' + metricLabels[key] + '</span><div class="target-main">' +
    (hasMeals ? total === null ? 'Unknown' : displayNumber(total, key === 'kcal' ? 0 : 1) : '—') +
    (total !== null ? ' <span>' + metricUnit(key) + '</span>' : '') + '</div><div class="meter" aria-hidden="true"><span style="width:' +
    pct + '%"></span></div><p>' + (target ? 'Target ' + displayNumber(target.low, 1) + '–' + displayNumber(target.high, 1) + ' ' + metricUnit(key) : 'Target unset') + '</p></div>'
}
export function renderToday(view: View) {
  const day = getDay(view)
  const { profile } = view.data
  const intake = totals(day.meals.flatMap(meal => meal.entries))
  const active = view.data.sessions.find(session => session.date === view.date && !session.complete)
  const next = upcoming(view.data, view.date)
  const mealCount = day.meals.length + (day.meals.length === 1 ? ' meal' : ' meals')
  view.root.innerHTML = heading(dayTitle(view.date), '', dateStrip(view.date)) +
    '<div class="dashboard"><div class="dashboard-main"><section class="panel intake"><div class="section-head">' +
    '<h2>Daily intake</h2><div class="button-row"><span class="intake-label">' + mealCount + ' logged</span>' +
    '<button class="button primary desktop-action" data-add-food>' + icon('plus', 18) + ' Add food</button></div></div><div class="target-grid">' +
    (profile.hideCalories ? '' : targetTile('kcal', intake.kcal, view.data, !!day.meals.length)) +
    targetTile('protein', intake.protein, view.data, !!day.meals.length) + '</div><div class="intake-foot">' +
    metrics.filter(key => key !== 'kcal' && key !== 'protein').map(key => '<div><span>' + metricLabels[key] + '</span><strong>' +
      (day.meals.length ? metricValue(key, intake[key]) : '—') + '</strong></div>').join('') + '</div></section>' +
    '<div class="mobile-actions"><button class="button primary" data-add-food>' + icon('plus', 18) + ' Add food</button>' +
    '<button class="button secondary" data-open-training>' + icon('training', 18) + ' ' + (active ? 'Resume workout' : 'Start workout') + '</button></div>' +
    '<section class="panel diary"><div class="section-head"><div><h2>Meal diary</h2><p>' + (day.complete ? 'Day marked complete' : 'Estimated totals from your logged meals') +
    '</p></div></div>' +
    (profile.savedMeals.length ? '<div class="quick-meals"><p>Quick log</p><div class="chips">' + profile.savedMeals.map(meal =>
      '<button class="chip" data-quick="' + h(meal.id) + '">' + icon('plus', 16) + ' ' + h(meal.name) + '</button>').join('') + '</div></div>' : '') +
    (day.meals.length ? diaryRows(view) : empty('Your diary is empty', 'Add a meal to see its estimated nutrition here.', 'book')) +
    (day.meals.length ? '<label class="check completion"><input type="checkbox" id="complete-day"' + (day.complete ? ' checked' : '') +
      '>Mark day complete for intake averages</label>' : '') + '</section></div>' +
    '<aside class="dashboard-side"><section class="panel side-card"><div class="side-head"><span class="square green">' + icon('steps') +
    '</span><div><h2>Steps</h2><p>' + (day.steps === null ? 'From Apple Health' : 'Entered manually') + '</p></div></div>' +
    '<div class="side-stat">' + (day.steps === null ? 'Not logged' : displayNumber(day.steps)) + '</div>' +
    '<button class="button secondary full" id="steps">' + (day.steps === null ? 'Enter steps' : 'Edit steps') + '</button></section>' +
    '<section class="panel side-card"><div class="side-head"><span class="square purple">' + icon('training') + '</span><div><h2>' +
    (active ? 'In progress' : 'Next workout') + '</h2><p>' + (active ? 'Session saved' : next ? h(dateLabel(next.date, { weekday: 'short', month: 'short', day: 'numeric' })) : 'Your training schedule') +
    '</p></div></div><div class="side-stat">' + h(active?.template.name ?? next?.template.name ?? 'No workout scheduled') + '</div>' +
    '<button class="button secondary full desktop-action" data-open-training>' + (active ? 'Resume workout' : 'Start workout') + ' ' + icon('arrow', 17) + '</button></section>' +
    '<section class="panel side-card"><div class="side-head"><span class="square sand">' + icon('chat') + '</span><div><h2>Coaching</h2><p>Use your logged meals</p></div></div>' +
    '<button class="button secondary full" id="coach">Meal ideas ' + icon('arrow', 17) + '</button>' +
    '<button class="button subtle full" id="trainer">Ask my trainer ' + icon('arrow', 17) + '</button></section></aside></div>'
  bindDate(view)
  on(view.root, '[data-add-food]', () => view.go('food'))
  on(view.root, '[data-open-training]', () => { void openWorkout(view, next?.date === view.date ? next.template : undefined) })
  on(view.root, '#steps', () => stepsSheet(view))
  on(view.root, '#coach', () => coachSheet(view))
  on(view.root, '#trainer', () => trainerSheet(view))
  on(view.root, '[data-meal]', button => { const meal = day.meals.find(item => item.id === button.dataset.meal); if (meal) mealSheet(view, meal) })
  on(view.root, '[data-quick]', async button => {
    const meal = profile.savedMeals.find(item => item.id === button.dataset.quick)
    if (!meal || (meal.id === lastQuick.id && Date.now() - lastQuick.at < 650)) return
    lastQuick = { id: meal.id, at: Date.now() }
    if (!await addSaved(view, meal)) lastQuick = { id: '', at: 0 }
  })
  const complete = view.root.querySelector<HTMLInputElement>('#complete-day')
  complete?.addEventListener('change', async () => {
    const checked = complete.checked
    if (!await view.save(() => updateDay(view.db, day.date, latest => ({ ...latest, complete: checked })),
      checked ? 'Day marked complete' : 'Day reopened')) complete.checked = day.complete
  })
}
function stepsSheet(view: View) {
  const day = getDay(view)
  const dialog = sheet('Enter steps', '<p>In Apple Health, open Steps and find the total for ' + h(dateLabel(day.date)) + '.</p>' +
    '<form class="stack"><label>Daily steps' + numInput('steps', day.steps, { step: '1', required: true }) +
    '</label>' + errorLine + '<button class="button primary">Save steps</button></form>' +
    (day.steps === null ? '' : '<button class="button danger" id="clear-steps">Clear steps</button>'))
  submit(formIn(dialog), async data => {
    if (await view.save(() => updateDay(view.db, day.date, latest => ({ ...latest, steps: wholeValue(data, 'steps') })), 'Steps saved',
      () => updateDay(view.db, day.date, latest => ({ ...latest, steps: day.steps })))) dialog.close()
  })
  on(dialog, '#clear-steps', async () => {
    if (await view.save(() => updateDay(view.db, day.date, latest => ({ ...latest, steps: null })), 'Steps cleared',
      () => updateDay(view.db, day.date, latest => ({ ...latest, steps: day.steps })))) dialog.close()
  })
}
function coachSheet(view: View) {
  const day = getDay(view)
  const recipe = allRecipes(view.data.profile).slice(1).find(recipe => /soup/i.test(recipe.name)) ?? soup
  const portion = recipePortion(recipe, recipe.yield.unit === 'g' ? Math.min(250, recipe.yield.amount) : 1)
  const prototype = day.meals.some(meal => meal.slot === 'Lunch') && !day.meals.some(meal => meal.slot === 'Dinner') ? 'Lunch is logged. Dinner is still open.' :
    day.meals.length ? 'Use the portions you have logged as a starting point.' : 'Start with what you have available and how hungry you feel.'
  const plannedSnack = view.data.profile.savedMeals.find(meal => meal.slot === 'Snack')
  const total = totals(day.meals.flatMap(meal => meal.entries))
  const goal = view.data.profile.targets.protein
  const dialog = sheet('Meal ideas', '<p>' + prototype + '</p><div class="form-grid"><label>Hunger<select id="hunger"><option>Comfortable</option>' +
    '<option>Hungry</option><option>Very hungry</option><option>Not hungry yet</option></select></label><label>Coming up<select id="schedule">' +
    '<option>Free time</option><option>Class</option><option>Training</option></select></label></div><p id="coach-advice"></p>' +
    (day.meals.length ? '<p>Protein logged · ' + metricValue('protein', total.protein) + (goal ? ' · target ' + goal.low + '–' + goal.high + ' g' : '') + '</p>' : '') +
    '<p><strong>' + h(recipe.name) + '</strong><br>Estimated ' + portion.amount + ' ' + portion.unit + ' · ' +
    (view.data.profile.hideCalories ? '' : metricValue('kcal', portion.nutrients.kcal) + ' · ') + metricValue('protein', portion.nutrients.protein) +
    ' protein</p><button class="button primary" id="review-soup">Choose soup portion</button>' +
    '<p>A planned sweet snack is an option if you want one.</p><button class="button secondary" id="plan-snack">' +
    (plannedSnack ? 'Review ' + h(plannedSnack.name) : 'Find a snack in Food') + '</button>')
  const hunger = dialog.querySelector<HTMLSelectElement>('#hunger')
  const schedule = dialog.querySelector<HTMLSelectElement>('#schedule')
  const advice = dialog.querySelector<HTMLElement>('#coach-advice')
  const render = () => {
    if (!advice) return
    const appetite = hunger?.value === 'Not hungry yet' ? 'You can plan the meal now and log it when you eat.' :
      hunger?.value === 'Very hungry' || hunger?.value === 'Hungry' ? 'Choose a portion that feels satisfying and adjust after you review it.' :
      'Start with a familiar portion and review its estimate.'
    advice.textContent = appetite + (schedule?.value === 'Class' ? ' Pick something you can have before class.' :
      schedule?.value === 'Training' ? ' Choose a portion and timing that feel comfortable for your session.' : '')
  }
  hunger?.addEventListener('change', render)
  schedule?.addEventListener('change', render)
  render()
  on(dialog, '#review-soup', () => showSoup(view))
  on(dialog, '#plan-snack', () => {
    dialog.close()
    if (plannedSnack) usualSheet(view, plannedSnack)
    else view.go('food')
  })
}
export function trainerSheet(view: View) {
  const dialog = sheet('Ask my trainer', '<p>Review and edit the text before copying it. Paste it into your chat when you are ready.</p><form class="stack">' +
    '<label>Question<input name="question" placeholder="What portion would work for dinner?"></label>' +
    '<div class="form-grid"><label>Date<input name="date" type="date" value="' + view.date + '" required></label>' +
    '<label>Period<select name="range"><option value="day">Selected date</option><option value="week">Selected week</option></select></label></div>' +
    '<label class="check"><input name="sensitive" type="checkbox">Include private notes and measurements</label>' + errorLine +
    '<button class="button secondary">Generate summary</button></form><label>Editable summary<textarea id="trainer-text" rows="8"></textarea></label>' +
    '<div class="button-row"><button class="button primary" id="copy-summary">Copy summary</button>' +
    '<a class="button secondary" target="_blank" rel="noopener noreferrer" href="' + h(view.data.profile.trainerUrl || 'https://chatgpt.com/') +
    '">Open trainer chat ' + icon('arrow', 17) + '</a></div><p class="caption" id="copy-state" role="status"></p>' +
    (view.data.profile.trainerUrl ? '' : '<details><summary>Starting a new chat?</summary><p>Choose a chat in ChatGPT or copy your trainer profile into a new one.</p>' +
      '<label>Editable trainer profile<textarea id="trainer-profile" rows="4">' + h(view.data.profile.trainerProfile) +
      '</textarea></label><button class="button secondary" id="copy-profile">Copy trainer profile</button></details>'))
  const summary = dialog.querySelector<HTMLTextAreaElement>('#trainer-text')
  if (summary) summary.value = trainerSummary(view.data, view.date, 'day', '', false)
  const form = formIn(dialog)
  const generate = (data: FormData) => {
    const date = data.get('date')
    if (!isDateKey(date)) throw new Error('Choose a valid date.')
    if (summary) summary.value = trainerSummary(view.data, date, data.get('range') === 'week' ? 'week' : 'day', textValue(data, 'question'), data.has('sensitive'))
  }
  submit(form, generate)
  form.querySelector('[name=sensitive]')?.addEventListener('change', () => {
    if (summary) summary.value = ''
    const data = new FormData(form)
    if (isDateKey(data.get('date'))) generate(data)
  })
  const status = dialog.querySelector<HTMLElement>('#copy-state')
  const copy = (target?: HTMLTextAreaElement | null) => async () => {
    if (!target || !status) return
    try { await navigator.clipboard.writeText(target.value); status.textContent = 'Copied. Open your chat and paste manually.' }
    catch { target.focus(); target.select(); status.textContent = 'Copy was unavailable. Select and copy the text directly.' }
  }
  on(dialog, '#copy-summary', copy(summary))
  on(dialog, '#copy-profile', copy(dialog.querySelector('#trainer-profile')))
}
