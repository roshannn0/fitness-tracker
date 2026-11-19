export const metrics = ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const
export type Metric = typeof metrics[number]
export type Nutrients = Record<Metric, number | null>
export type DateKey = string & { readonly __brand: 'DateKey' }
export type Unit = 'g' | 'ml' | 'serving'
export const mealSlots = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const
export type Slot = typeof mealSlots[number]
export interface Food {
  id: string
  name: string
  preparation: string
  aliases: string[]
  unit: 'g' | 'ml'
  serving: { name: string; amount: number } | null
  nutrients: Nutrients
  estimate: boolean
  source: { kind: 'usda'; fdc: number; description: string; release: string } | { kind: 'label' } | { kind: 'off'; barcode: string }
}
export interface Portion { foodId: string; name: string; description: string; amount: number; unit: Unit; nutrients: Nutrients; estimate: boolean }
export interface Recipe { id: string; name: string; ingredients: Portion[]; yield: { unit: 'g' | 'serving'; amount: number } }
export interface SavedMeal { id: string; name: string; slot: Slot; entries: Portion[] }
export interface Meal extends SavedMeal { time: string; created: string }
export interface Day {
  date: DateKey; meals: Meal[]; steps: number | null; complete: boolean
  weight: number | null; waist: number | null
}
export interface Exercise {
  id: string; name: string; alternatives: string[]; kind: 'lift' | 'timed' | 'cardio'
  warmups: number; sets: number; reps: string; rest: number; pairing: string; notes: string
}
export interface Template { id: string; name: string; weekdays: number[]; exercises: Exercise[] }
export interface SetLog {
  id: string; exerciseId: string; name: string; warmup: boolean; kg: number | null
  reps: number | null; seconds: number | null; distance: number | null; side: string; created: string
}
export interface Session {
  id: string; date: DateKey; template: Template; sets: SetLog[]; complete: boolean
  restUntil: number | null; notes: string; created: string
}
export interface Profile {
  targets: Record<Metric, { low: number; high: number } | null>
  foods: Food[]; recipes: Recipe[]; savedMeals: SavedMeal[]; templates: Template[]; favourites: string[]
  preferredUnits: Record<string, Unit>; hideWeight: boolean; hideCalories: boolean
  trainerUrl: string; trainerProfile: string; lunchReminder: string; eveningReminder: string; remindersConfirmed: boolean
}
export interface Records { profile: Profile; days: Day[]; sessions: Session[] }
export const uuid = () => crypto.randomUUID()
export const timestamp = () => new Date().toISOString()
const pad = (value: number) => String(value).padStart(2, '0')
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value
}
export function localDate(now = new Date()): DateKey {
  const date = [String(now.getFullYear()).padStart(4, '0'), pad(now.getMonth() + 1), pad(now.getDate())].join('-')
  if (!isDateKey(date)) throw new Error('Invalid calendar date')
  return date
}
export const clockTime = () => { const time = new Date(); return pad(time.getHours()) + ':' + pad(time.getMinutes()) }
export const calendar = (date: DateKey) => new Date(date + 'T12:00:00')
export function shiftDate(date: DateKey, delta: number) {
  const day = calendar(date)
  day.setDate(day.getDate() + delta)
  return localDate(day)
}
export const monday = (date: DateKey) => shiftDate(date, -((calendar(date).getDay() + 6) % 7))
export const dateLabel = (date: DateKey, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  new Intl.DateTimeFormat(undefined, options).format(calendar(date))
export const blankDay = (date: DateKey): Day => ({ date, meals: [], steps: null, complete: false, weight: null, waist: null })
export function safeChat(value: string): string {
  if (!value.trim()) return ''
  const url = new URL(value.trim())
  if (url.origin !== 'https://chatgpt.com' || url.username || url.password || url.search || url.hash || !/^\/c\/[a-z0-9-]+\/?$/i.test(url.pathname)) {
    throw new Error('Enter a private ChatGPT conversation link from chatgpt.com/c/.')
  }
  return url.href
}
function exercise(id: string, name: string, alternatives: string[], sets = 3, reps = '8–12'): Exercise {
  return { id, name, alternatives, kind: 'lift', warmups: 1, sets, reps, rest: 90, pairing: '', notes: '' }
}
export function newProfile(): Profile {
  return {
    targets: { kcal: null, protein: null, carbs: null, fat: null, fibre: null },
    foods: [], recipes: [], savedMeals: [], favourites: [], preferredUnits: {},
    templates: [
      { id: 'upper-a', name: 'Upper A', weekdays: [], exercises: [
        exercise('press', 'Dumbbell bench press', ['Machine chest press']),
        exercise('supported-row', 'Chest-supported row', ['Seated cable row']),
        exercise('overhead-extension', 'Overhead cable extension', ['Cable pushdown'], 2, '10–15'),
      ] },
      { id: 'lower-core', name: 'Lower & core', weekdays: [], exercises: [
        exercise('leg-press', 'Leg press', ['Belt squat']),
        exercise('leg-curl', 'Seated leg curl', ['Lying leg curl']),
        { ...exercise('plank', 'Plank', ['Side plank'], 2, '20–40 sec'), kind: 'timed' },
      ] },
      { id: 'upper-b', name: 'Upper B', weekdays: [], exercises: [
        exercise('pulldown', 'Lat pulldown', ['Assisted pull-up']),
        exercise('incline-press', 'Incline dumbbell press', ['Incline machine press']),
        exercise('pushdown', 'Cable pushdown', ['Band pushdown'], 2, '10–15'),
      ] },
      { id: 'cardio', name: 'Walk or run', weekdays: [], exercises: [
        { ...exercise('walk', 'Walk', ['Run'], 1, 'Enter minutes'), kind: 'cardio', warmups: 0, rest: 0 },
      ] },
    ],
    hideWeight: false, hideCalories: false, trainerUrl: '',
    trainerProfile: 'Help me review my own fitness and meal records. Use the numbers and goals I supply, call out missing data, and offer practical portion and training options. Keep suggestions flexible and ask before assuming a goal.',
    lunchReminder: '12:30', eveningReminder: '20:00', remindersConfirmed: false,
  }
}

