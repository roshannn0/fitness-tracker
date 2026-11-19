import { metrics, type DateKey, type Records } from './model.js'
import { displayNumber, totals } from './nutrition.js'
import { week } from './progress.js'

export function trainerSummary(records: Records, date: DateKey, range: 'day' | 'week', question: string, sensitive: boolean) {
  const selected = range === 'week' ? week(records, date) : null
  const dates = selected ? selected.rows.map(row => row.date) : [date]
  const labels = { kcal: 'kcal', protein: 'protein (g)', carbs: 'carbs (g)', fat: 'fat (g)', fibre: 'fibre (g)' }
  const allowed = metrics.filter(key => key !== 'kcal' || !records.profile.hideCalories)
  const goals = allowed.flatMap(key => {
    const goal = records.profile.targets[key]
    return goal ? [labels[key] + ' ' + goal.low + '–' + goal.high] : []
  })
  const lines = [
    question.trim() || 'Please help me review this fitness log.',
    '', 'Period: ' + (selected ? selected.start + ' to ' + selected.end : date),
    'Daily targets: ' + (goals.join(', ') || 'none set') + '.',
  ]
  for (const key of dates) {
    const day = records.days.find(row => row.date === key)
    const sessions = records.sessions.filter(row => row.date === key)
    lines.push('', key)
    if (day?.meals.length) {
      const total = totals(day.meals.flatMap(meal => meal.entries))
      const names = day.meals.map(meal => meal.slot + ' (' + meal.entries.map(entry => entry.name).join(', ') + ')')
      lines.push('Meals: ' + names.join('; ') + '. ' + (day.complete ? 'Day marked complete.' : 'Day not marked complete.'))
      lines.push('Estimated logged totals: ' + allowed.map(metric => labels[metric] + ' ' + displayNumber(total[metric], metric === 'kcal' ? 0 : 1)).join(', ') + '.')
    } else lines.push('Meals: no entries.')
    lines.push('Steps: ' + (day?.steps == null ? 'not logged' : day.steps + ' (entered manually)') + '.')
    if (!sessions.length) lines.push('Workouts: no entries.')
    for (const session of sessions) {
      lines.push(session.template.name + ' (' + (session.complete ? 'complete' : 'in progress') + '): ' +
        (session.sets.map(set => set.name + (set.warmup ? ' warm-up' : '') + ' ' +
          (set.reps !== null ? (set.kg === null ? '' : set.kg + ' kg × ') + set.reps + ' reps' : (set.seconds ?? '?') + ' sec') +
          (set.side ? ' ' + set.side : '') + (set.distance === null ? '' : ', ' + set.distance + ' km')).join('; ') || 'No sets logged') + '.')
      if (sensitive && session.notes) lines.push('Private session note: ' + session.notes)
      if (sensitive) for (const exercise of session.template.exercises) {
        if (exercise.notes) lines.push(exercise.name + ' note: ' + exercise.notes)
      }
    }
    if (sensitive && day?.waist != null) lines.push('Waist: ' + day.waist + ' cm.')
    if (sensitive && !records.profile.hideWeight && day?.weight != null) lines.push('Weight: ' + day.weight + ' kg.')
  }
  if (selected) {
    lines.push('', 'Logged days: ' + selected.logged + '/7. Complete intake days: ' + selected.completeDays + '/7.')
    if (!records.profile.hideCalories) lines.push('Complete-day average energy: ' +
      (selected.energy === null ? 'insufficient data' : displayNumber(selected.energy) + ' kcal across ' + selected.energyCount + ' days') + '.')
    lines.push('Complete-day average protein: ' +
      (selected.protein === null ? 'insufficient data' : displayNumber(selected.protein, 1) + ' g across ' + selected.proteinCount + ' days') + '.')
  }
  return lines.join('\n')
}
