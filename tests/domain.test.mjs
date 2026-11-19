import test from 'node:test'
import assert from 'node:assert/strict'
import { blankDay, isDateKey, localDate, monday, newProfile, safeChat } from '../.test-build/model.js'
import { displayNumber, foodPortion, recipePortion, totals } from '../.test-build/nutrition.js'
import { starterFoods } from '../.test-build/catalog-data.js'
import { createBackup, parseBackup } from '../.test-build/backup.js'
import { week } from '../.test-build/progress.js'
import { trainerSummary } from '../.test-build/trainer.js'

const rice = starterFoods.find(food => food.id === 'fdc-169757')
const dry = starterFoods.find(food => food.id === 'fdc-169756')
const fixture = { ...rice, nutrients: { ...rice.nutrients, kcal: 130, fibre: null } }
const date = '2026-11-16'
function meal(entry = foodPortion(fixture, 150, 'g')) {
  return { id: 'meal-1', slot: 'Lunch', name: 'Synthetic lunch', time: '12:00', created: '2026-11-16T04:00:00.000Z', entries: [entry] }
}
const records = () => ({ profile: newProfile(), days: [], sessions: [] })

test('verified foods keep distinct cooked and dry entries with source IDs and serving weights', () => {
  assert.equal(starterFoods.length, 74)
  assert.equal(new Set(starterFoods.map(food => food.source.fdc)).size, 74)
  assert.ok(starterFoods.every(food => food.nutrients.kcal !== null && food.source.release === '2018-04'))
  assert.equal(rice.nutrients.kcal, 130)
  assert.ok(dry.nutrients.kcal > rice.nutrients.kcal)
  assert.ok(rice.aliases.includes('nasi putih'))
  assert.ok(rice.serving.amount > 0)
})
test('150 g at 130 kcal yields 195 and keeps null fibre through aggregates', () => {
  const portion = foodPortion(fixture, 150, 'g')
  assert.equal(displayNumber(portion.nutrients.kcal), '195')
  assert.equal(totals([portion, portion]).kcal, 390)
  assert.equal(totals([portion, portion]).fibre, null)
  assert.throws(() => foodPortion(rice, -100, 'g'))
})
test('servings use recorded weights and millilitres do not convert into grams', () => {
  const size = rice.serving.amount
  assert.deepEqual(foodPortion(rice, 2, 'serving').nutrients, foodPortion(rice, size * 2, 'g').nutrients)
  const milk = { ...fixture, unit: 'ml' }
  assert.equal(foodPortion(milk, 100, 'ml').nutrients.kcal, 130)
  assert.throws(() => foodPortion(milk, 100, 'g'))
})
test('recipe portions divide by finished weight or explicit servings', () => {
  const part = foodPortion(fixture, 150, 'g')
  const recipe = { id: 'recipe', name: 'Synthetic soup', ingredients: [part, part], yield: { unit: 'g', amount: 600 } }
  assert.equal(recipePortion(recipe, 150).nutrients.kcal, 97.5)
  const served = { ...recipe, yield: { unit: 'serving', amount: 3 } }
  assert.equal(recipePortion(served, 1).nutrients.kcal, 130)
  assert.equal(recipePortion(served, 1).nutrients.fibre, null)
  assert.throws(() => recipePortion({ ...recipe, yield: { unit: 'g', amount: 0 } }, 1))
})
test('reports and trainer summaries share totals and exclude incomplete days from averages', () => {
  const now = '2026-11-30'
  const complete = { ...blankDay(date), complete: true, meals: [meal()] }
  const partial = { ...blankDay('2026-11-17'), meals: [meal(foodPortion(fixture, 300, 'g'))] }
  const source = { ...records(), days: [complete, partial, blankDay('2026-11-18')] }
  const report = week(source, date, now)
  assert.equal(report.logged, 2)
  assert.equal(report.completeDays, 1)
  assert.equal(report.energy, 195)
  assert.equal(report.past, true)
  const prompt = trainerSummary(source, date, 'week', 'What should I plan?', false)
  assert.match(prompt, /average energy: 195 kcal/)
  assert.match(prompt, /Day not marked complete/)
  assert.match(prompt, /Meals: no entries/)
  source.profile.hideCalories = true
  assert.doesNotMatch(trainerSummary(source, date, 'week', '', false), /kcal/)
})
test('private links are restricted to HTTPS ChatGPT conversation paths', () => {
  assert.equal(safeChat('https://chatgpt.com/c/chat-123'), 'https://chatgpt.com/c/chat-123')
  for (const url of ['http://chatgpt.com/c/id', 'https://chatgpt.com.evil.test/c/id', 'https://chatgpt.com/share/id',
    'https://chatgpt.com/c/id?message=private', 'https://a@chatgpt.com/c/id', 'https://chatgpt.com:444/c/id', 'https://chatgpt.com/c/id#private']) {
    assert.throws(() => safeChat(url))
  }
})
test('backup validates nested records, rejects duplicates and later schemas', () => {
  const data = { ...records(), days: [{ ...blankDay(date), meals: [meal()] }] }
  const file = createBackup(data)
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(file))), file)
  assert.throws(() => parseBackup({ ...file, schemaVersion: 2 }), /newer/)
  assert.throws(() => parseBackup({ ...file, days: [data.days[0], data.days[0]] }), /days/)
  const corrupt = structuredClone(file)
  corrupt.days[0].meals[0].entries[0].amount = -20
  assert.throws(() => parseBackup(corrupt), /amount/)
})
test('date keys use calendar days and reject dates that roll into another month', () => {
  assert.equal(localDate(new Date(2026, 10, 19, 0, 15)), '2026-11-19')
  assert.equal(monday('2026-11-22'), '2026-11-16')
  assert.equal(isDateKey('2024-02-29'), true)
  assert.equal(isDateKey('2026-02-29'), false)
})
