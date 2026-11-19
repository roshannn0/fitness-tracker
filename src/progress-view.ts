import { dateLabel, shiftDate, type DateKey } from './model.js'
import { displayNumber, totals } from './nutrition.js'
import { liftHistory, week } from './progress.js'
import { updateDay } from './storage.js'
import { bindDate, dateStrip, empty, errorLine, escapeHtml as h, formIn, getDay, heading, icon, metricValue, numInput, numberValue,
  on, options, sheet, submit, type View } from './ui.js'

let liftName = ''
type Point = { date: DateKey; value: number }
function bars(title: string, points: Point[], unit: string) {
  if (points.length < 2) return '<p class="caption">Insufficient data for a trend.</p>'
  const high = Math.max(1, ...points.map(point => point.value))
  return '<div class="chart" role="img" aria-label="' + h(title) + '">' + points.map(({ date, value }) =>
    '<div class="bar-point"><div class="bar-track"><i style="--height:' + value / high * 100 + '%"></i></div><span>' +
    h(dateLabel(date, { month: 'numeric', day: 'numeric' })) + '</span><strong>' + displayNumber(value, 1) + ' ' + unit + '</strong></div>').join('') + '</div>'
}
const value = (amount: number | null, count: number, unit: string) =>
  amount !== null && count >= 2 ? displayNumber(amount, 1) + ' ' + unit : 'Insufficient data'

export function renderProgress(view: View) {
  const { data, date } = view
  const report = week(data, date)
  const prior = week(data, shiftDate(report.start, -1))
  const { hideWeight, hideCalories } = data.profile
  const tiles = [
    ...(hideWeight ? [] : [{ name: 'Average weight', amount: report.weight, previous: prior.weight, count: report.weightCount, priorCount: prior.weightCount, unit: 'kg' }]),
    { name: 'Average waist', amount: report.waist, previous: prior.waist, count: report.waistCount, priorCount: prior.waistCount, unit: 'cm' },
    { name: 'Average steps', amount: report.steps, previous: prior.steps, count: report.stepsCount, priorCount: prior.stepsCount, unit: 'steps' },
    ...(hideCalories ? [] : [{ name: 'Average energy', amount: report.energy, previous: prior.energy, count: report.energyCount, priorCount: prior.energyCount, unit: 'kcal' }]),
    { name: 'Average protein', amount: report.protein, previous: prior.protein, count: report.proteinCount, priorCount: prior.proteinCount, unit: 'g' },
  ]
  const label = (date: DateKey) => h(dateLabel(date, { month: 'short', day: 'numeric', year: 'numeric' }))
  const comparisons = report.past && prior.past
  const lifts = [...new Set(data.sessions.filter(session => session.date <= view.date).flatMap(session => session.sets
    .filter(set => !set.warmup && set.kg !== null && set.reps !== null).map(set => set.name)))].sort()
  if (!lifts.includes(liftName)) liftName = lifts[0] ?? ''
  const points = (key: 'steps' | 'weight' | 'waist') => report.rows.flatMap(row => {
    const amount = row.day?.[key]
    return amount == null ? [] : [{ date: row.date, value: amount }]
  })
  view.root.innerHTML = heading('Progress', 'Review logged days, complete intake and training history.', dateStrip(date)) +
    '<section class="panel"><div class="section-head"><div><h2>Weekly review</h2><p>' + label(report.start) + ' – ' + label(report.end) +
    '</p></div><button class="button primary" id="measure">' + icon('plus', 18) + ' Measurements</button></div><div class="button-row">' +
    '<button class="button secondary" id="prior-week">' + icon('left', 17) + ' Previous week</button><button class="button secondary" id="next-week">Next week ' +
    icon('right', 17) + '</button></div><p><strong>' + report.logged + '/7</strong> days logged · <strong>' + report.completeDays +
    '/7</strong> intake days marked complete</p><div class="stat-grid">' + tiles.map(tile => '<article class="stat"><h3>' + tile.name + '</h3><strong>' +
      value(tile.amount, tile.count, tile.unit) + '</strong><p>' + tile.count + ' logged ' + (tile.count === 1 ? 'day' : 'days') + '</p>' +
      (comparisons ? '<p>Previous week · ' + value(tile.previous, tile.priorCount, tile.unit) + ' (' + tile.priorCount + ' days)</p>' : '') + '</article>').join('') +
    '<article class="stat"><h3>Workouts completed</h3><strong>' + (report.sessions.length ? report.workouts : 'Insufficient data') + '</strong><p>' +
    report.sessions.length + ' sessions logged</p>' + (comparisons ? '<p>Previous week · ' +
      (prior.sessions.length ? prior.workouts + ' completed' : 'Insufficient data') + '</p>' : '') + '</article></div>' +
    (comparisons ? '<p class="caption">Compared with ' + label(prior.start) + ' – ' + label(prior.end) + '.</p>' :
      '<p class="caption">Select a finished Monday–Sunday week to compare it with the previous week.</p>') +
    '<details class="dated-report"><summary>Inspect the seven dates and logged values</summary><ul class="result-list">' +
    report.rows.map(row => {
      const entries = row.day?.meals.flatMap(meal => meal.entries) ?? []
      const total = totals(entries)
      const details = [
        entries.length ? (row.day?.complete ? 'Complete intake' : 'Partial intake') + ' · ' +
          (hideCalories ? '' : metricValue('kcal', total.kcal) + ' · ') + metricValue('protein', total.protein) + ' protein' : 'Food not logged',
        row.day?.steps != null ? displayNumber(row.day.steps) + ' steps' : 'Steps not logged',
        !hideWeight && row.day?.weight != null ? row.day.weight + ' kg' : '',
        row.day?.waist != null ? row.day.waist + ' cm waist' : '',
        row.sessions.length ? row.sessions.filter(session => session.complete).length + ' workouts complete' : '',
      ].filter(Boolean)
      return '<li><div class="result-title"><strong>' + label(row.date) + '</strong><span>' + h(details.join(' · ')) +
        '</span></div><button class="button subtle" data-inspect="' + row.date + '">Open day</button></li>'
    }).join('') + '</ul></details></section>' +
    '<div class="chart-grid">' + (hideWeight ? '' : '<section class="panel"><h2>Weight</h2>' + bars('Weight by logged date', points('weight'), 'kg') + '</section>') +
    '<section class="panel"><h2>Waist</h2>' + bars('Waist by logged date', points('waist'), 'cm') + '</section><section class="panel"><h2>Steps</h2>' +
    bars('Steps by logged date', points('steps'), 'steps') + '</section></div>' +
    '<section class="panel"><div class="section-head"><div><h2>Per-lift performance</h2><p>Working sets through the selected date</p></div></div>' +
    (lifts.length ? '<label>Exercise<select id="lift-name">' + options(lifts, liftName) + '</select></label><div id="lift-results"></div>' :
      empty('Insufficient data', 'Log working sets with actual weight and reps to see them here.', 'training')) + '</section>'
  bindDate(view)
  on(view.root, '#prior-week', () => view.selectDate(shiftDate(report.start, -7)))
  on(view.root, '#next-week', () => view.selectDate(shiftDate(report.start, 7)))
  on(view.root, '#measure', () => measureSheet(view))
  on(view.root, '[data-inspect]', element => {
    const date = element.dataset.inspect
    const row = report.rows.find(row => row.date === date)
    if (row) { view.selectDate(row.date); view.go('today') }
  })
  const select = view.root.querySelector<HTMLSelectElement>('#lift-name')
  select?.addEventListener('change', () => { liftName = select.value; renderLifts(view) })
  renderLifts(view)
}
function renderLifts(view: View) {
  const result = view.root.querySelector<HTMLElement>('#lift-results')
  if (!result) return
  const records = liftHistory(view.data, view.date, liftName)
  const perDay = new Map<DateKey, number>()
  for (const record of records) if (record.kg !== null) perDay.set(record.date, Math.max(perDay.get(record.date) ?? 0, record.kg))
  result.innerHTML = bars('Heaviest working set per date', [...perDay].slice(0, 7).reverse().map(([date, value]) => ({ date, value })), 'kg') +
    '<ul class="result-list">' + records.slice(0, 10).map(record => '<li><strong>' + record.date + '</strong><span>' +
      record.kg + ' kg × ' + record.reps + ' reps ' + h(record.side) + '</span></li>').join('') + '</ul>'
}
function measureSheet(view: View) {
  const day = getDay(view)
  const hide = view.data.profile.hideWeight
  const dialog = sheet('Measurements', '<p>Measurements for ' + day.date + '. Leave a field blank to clear it.</p><form class="stack">' +
    (hide ? '' : '<label>Weight (kg)' + numInput('weight', day.weight, { min: 0.01 }) + '</label>') +
    '<label>Waist (cm)' + numInput('waist', day.waist, { min: 0.01 }) + '</label>' + errorLine +
    '<button class="button primary">Save measurements</button></form>')
  submit(formIn(dialog), async data => {
    const waist = numberValue(data, 'waist')
    const weight = hide ? day.weight : numberValue(data, 'weight')
    if (waist === 0 || weight === 0) throw new Error('Measurements must be positive.')
    if (await view.save(() => updateDay(view.db, day.date, latest => ({ ...latest, waist, weight })), 'Measurements saved',
      () => updateDay(view.db, day.date, latest => ({ ...latest, waist: day.waist, weight: day.weight })))) dialog.close()
  })
}
