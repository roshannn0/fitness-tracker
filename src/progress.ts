import { localDate, monday, shiftDate, type DateKey, type Day, type Records } from './model.js'
import { totals } from './nutrition.js'

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const known = (values: Array<number | null>) => values.filter(value => value !== null)
export function week(records: Records, date: DateKey, today = localDate()) {
  const start = monday(date)
  const end = shiftDate(start, 6)
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(start, index))
  const logged = records.days.filter(day => day.date >= start && day.date <= end && hasLog(day))
  const sessions = records.sessions.filter(session => session.date >= start && session.date <= end)
  const completeDays = logged.filter(day => day.complete && day.meals.length > 0)
  const intakes = completeDays.map(day => totals(day.meals.flatMap(meal => meal.entries)))
  const rows = dates.map(date => ({
    date, day: logged.find(day => day.date === date), sessions: sessions.filter(session => session.date === date),
  }))
  const weights = known(logged.map(day => day.weight))
  const waists = known(logged.map(day => day.waist))
  const steps = known(logged.map(day => day.steps))
  const energy = known(intakes.map(intake => intake.kcal))
  const protein = known(intakes.map(intake => intake.protein))
  return { start, end, past: end < today, rows, sessions, workouts: sessions.filter(session => session.complete).length,
    logged: rows.filter(row => row.day || row.sessions.length).length, completeDays: completeDays.length,
    weight: mean(weights), weightCount: weights.length, waist: mean(waists), waistCount: waists.length,
    steps: mean(steps), stepsCount: steps.length, energy: mean(energy), energyCount: energy.length,
    protein: mean(protein), proteinCount: protein.length }
}
export function hasLog(day: Day) {
  return day.meals.length > 0 || day.steps !== null || day.weight !== null || day.waist !== null || day.complete
}
export function liftHistory(records: Records, date: DateKey, name: string) {
  const normalized = name.toLocaleLowerCase()
  return records.sessions.filter(session => session.date <= date).flatMap(session => session.sets
    .filter(set => !set.warmup && set.name.toLocaleLowerCase() === normalized && set.kg !== null && set.reps !== null)
    .map(set => ({ ...set, date: session.date }))).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created))
}
