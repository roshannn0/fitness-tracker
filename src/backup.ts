import { z } from 'zod'
import { isDateKey, mealSlots, safeChat, timestamp, type DateKey, type Records } from './model.js'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const line = z.string().min(1)
const nonnegative = z.number().finite().nonnegative()
const positive = z.number().finite().positive()
const date = z.custom<DateKey>(isDateKey, 'Invalid local calendar date')
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
const instant = z.iso.datetime()
const unit = z.enum(['g', 'ml', 'serving'])
const basis = z.enum(['g', 'ml'])
const slot = z.enum(mealSlots)
const nutrients = z.object({ kcal: nonnegative.nullable(), protein: nonnegative.nullable(), carbs: nonnegative.nullable(), fat: nonnegative.nullable(), fibre: nonnegative.nullable() })
const food = z.object({
  id, name: line, preparation: z.string(), aliases: z.array(z.string()), unit: basis,
  serving: z.object({ name: line, amount: positive }).nullable(),
  nutrients, estimate: z.boolean(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('usda'), fdc: positive.int(), description: line, release: line }),
    z.object({ kind: z.literal('label') }),
    z.object({ kind: z.literal('off'), barcode: z.string().regex(/^\d{8}$|^\d{12,14}$/) }),
  ]),
})
const portion = z.object({
  foodId: id, name: line, description: z.string(), amount: positive, unit, nutrients, estimate: z.boolean(),
})
const portions = z.array(portion).min(1)
const recipe = z.object({ id, name: line, ingredients: portions, yield: z.object({ unit: z.enum(['g', 'serving']), amount: positive }) })
const savedMeal = z.object({ id, name: line, slot, entries: portions })
const meal = savedMeal.extend({ time, created: instant })
const exercise = z.object({
  id, name: line, alternatives: z.array(line), kind: z.enum(['lift', 'timed', 'cardio']),
  warmups: nonnegative.int(), sets: positive.int(), reps: line, rest: nonnegative.int(), pairing: z.string(), notes: z.string(),
})
function unique<T>(schema: z.ZodType<T>, key: (row: T) => string) {
  return z.array(schema).refine(rows => new Set(rows.map(key)).size === rows.length, 'Duplicate record identifiers')
}
const template = z.object({ id, name: line, weekdays: z.array(z.number().int().min(0).max(6)), exercises: unique(exercise, row => row.id).refine(rows => rows.length > 0) })
const loggedSet = z.object({
  id, exerciseId: id, name: line, warmup: z.boolean(), kg: nonnegative.nullable(), reps: positive.int().nullable(),
  seconds: positive.nullable(), distance: nonnegative.nullable(), side: z.enum(['', 'Left', 'Right', 'Both']), created: instant,
})
const session = z.object({
  id, date, template, sets: unique(loggedSet, row => row.id), complete: z.boolean(),
  restUntil: nonnegative.nullable(), notes: z.string(), created: instant,
}).refine(row => row.sets.every(set => {
  const prescription = row.template.exercises.find(ex => ex.id === set.exerciseId)
  return prescription && (prescription.kind === 'lift' ? set.reps !== null : set.seconds !== null)
}), 'A set must match its exercise prescription')
const day = z.object({
  date, meals: unique(meal, row => row.id), steps: nonnegative.int().nullable(), complete: z.boolean(),
  weight: positive.nullable(), waist: positive.nullable(),
})
const range = z.object({ low: nonnegative, high: nonnegative }).refine(value => value.low <= value.high).nullable()
const chat = z.string().refine(value => { try { return safeChat(value) === value } catch { return false } }, 'Invalid trainer conversation URL')
const profile = z.object({
  targets: z.object({ kcal: range, protein: range, carbs: range, fat: range, fibre: range }),
  foods: unique(food, row => row.id), recipes: unique(recipe, row => row.id), savedMeals: unique(savedMeal, row => row.id),
  templates: unique(template, row => row.id), favourites: z.array(id), preferredUnits: z.record(id, unit),
  hideWeight: z.boolean(), hideCalories: z.boolean(), trainerUrl: chat, trainerProfile: z.string(),
  lunchReminder: time, eveningReminder: time, remindersConfirmed: z.boolean(),
})
const backup = z.object({ schemaVersion: z.literal(1), exportedAt: instant, profile, days: unique(day, row => row.date), sessions: unique(session, row => row.id) })
export function parseBackup(value: unknown) {
  const header = z.object({ schemaVersion: z.number() }).safeParse(value)
  if (header.success && header.data.schemaVersion > 1) throw new Error('This backup requires a newer version of Dayline.')
  const result = backup.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error('Invalid Dayline backup at ' + (issue?.path.join('.') || 'root') + '.')
  }
  return result.data
}
export const createBackup = (records: Records) => ({ schemaVersion: 1, exportedAt: timestamp(), ...records })
export function inspectBackup(records: Records) {
  const dates = [...records.days.map(day => day.date), ...records.sessions.map(session => session.date)].sort()
  return {
    from: dates.at(0), to: dates.at(-1), days: records.days.length,
    meals: records.days.reduce((count, day) => count + day.meals.length, 0),
    sessions: records.sessions.length, sets: records.sessions.reduce((count, session) => count + session.sets.length, 0),
    custom: records.profile.foods.length, recipes: records.profile.recipes.length,
    saved: records.profile.savedMeals.length, templates: records.profile.templates.length,
  }
}

