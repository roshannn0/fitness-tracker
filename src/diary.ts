import { clockTime, isDateKey, timestamp, uuid, type DateKey, type Meal, type Portion, type SavedMeal, type Slot, type Unit } from './model.js'
import { portionLabel, scale, totals } from './nutrition.js'
import { logDay, updateDay, updateProfile } from './storage.js'
import { errorLine, escapeHtml as h, formIn, getDay, macroList, metricValue, numInput, on, positiveValue, readSlot, sheet, slots, submit, textValue, type View } from './ui.js'

export async function addMeal(view: View, input: { name: string; slot: Slot; entries: Portion[]; combine?: boolean; date?: DateKey; preferred?: { id: string; unit: Unit } }) {
  const date = input.date ?? view.date
  const record: Meal = { id: uuid(), name: input.name, slot: input.slot, entries: input.entries, time: clockTime(), created: timestamp() }
  let previous: Meal | undefined
  let changed = record.id
  let wasComplete = false
  const nutrition = totals(record.entries)
  const summary = (view.data.profile.hideCalories ? '' : metricValue('kcal', nutrition.kcal) + ' · ') + metricValue('protein', nutrition.protein) + ' protein'
  return view.save(() => logDay(view.db, date, day => {
    previous = input.combine ? day.meals.filter(meal => meal.slot === input.slot && meal.name === input.slot).at(-1) : undefined
    changed = previous?.id ?? record.id
    wasComplete = day.complete
    return { ...day, complete: false, meals: previous ?
      day.meals.map(meal => meal.id === previous?.id ? { ...meal, entries: [...meal.entries, ...record.entries] } : meal) :
      [...day.meals, record] }
  }, input.preferred), 'Added to ' + input.slot.toLowerCase() + ' · Est. ' + summary, () => updateDay(view.db, date, day => ({
    ...day, complete: wasComplete, meals: previous ? day.meals.map(meal => meal.id === changed ? previous ?? meal : meal) : day.meals.filter(meal => meal.id !== changed),
  })))
}
export const addSaved = (view: View, meal: SavedMeal) => addMeal(view, meal)

export function mealSheet(view: View, meal: Meal) {
  const date = view.date
  let wasComplete = getDay(view).complete
  const dialog = sheet('Edit ' + meal.name, '<form class="stack"><div class="form-grid">' +
    '<label>Meal name<input name="name" required maxlength="120" value="' + h(meal.name) + '"></label><label>Meal type<select name="slot">' +
    slots(meal.slot) + '</select></label></div><label>Time<input name="time" type="time" required value="' + meal.time +
    '"></label><fieldset><legend>Foods as logged</legend>' + meal.entries.map((entry, index) =>
      '<div class="entry-edit"><label>' + h(entry.name) + ' · ' + entry.unit + numInput('amount-' + index, entry.amount, { min: 0.01, required: true }) +
      '</label><label class="check"><input type="checkbox" name="remove-' + index + '">Remove</label></div>').join('') +
    '</fieldset>' + errorLine + '<button class="button primary">Save meal</button></form>' +
    '<div class="button-row"><button class="button secondary" id="save-usual">Save to usual meals</button><button class="button secondary" id="duplicate-meal">Duplicate meal</button>' +
    '<button class="button danger" id="delete-meal">Delete meal</button></div>')
  submit(formIn(dialog), async form => {
    const entries = meal.entries.flatMap((entry, index) => {
      if (form.has('remove-' + index)) return []
      const amount = positiveValue(form, 'amount-' + index)
      return [{ ...entry, amount, nutrients: scale(entry.nutrients, amount / entry.amount) }]
    })
    if (!entries.length) throw new Error('Keep at least one food or delete the meal.')
    const name = textValue(form, 'name')
    if (!name) throw new Error('Enter a meal name.')
    const record = { ...meal, name, slot: readSlot(textValue(form, 'slot')), time: textValue(form, 'time'), entries }
    const saved = await view.save(() => updateDay(view.db, date, day => {
      wasComplete = day.complete
      return { ...day, complete: false, meals: day.meals.map(item => item.id === record.id ? record : item) }
    }), 'Meal updated', () => updateDay(view.db, date, day => ({
      ...day, complete: wasComplete, meals: day.meals.map(item => item.id === meal.id ? meal : item),
    })))
    if (saved) dialog.close()
  })
  on(dialog, '#save-usual', () => {
    const usual = sheet('Save a usual meal', '<form class="stack"><label>Name<input required maxlength="120" name="name" value="' + h(meal.name) +
      '"></label><p>Uses the portions currently saved in the diary.</p>' + errorLine + '<button class="button primary">Save usual meal</button></form>')
    submit(formIn(usual), async form => {
      const name = textValue(form, 'name')
      if (!name) throw new Error('Enter a meal name.')
      const saved = { id: uuid(), name, slot: meal.slot, entries: meal.entries }
      if (await view.save(() => updateProfile(view.db, profile => ({ ...profile, savedMeals: [...profile.savedMeals, saved] })), 'Usual meal saved')) usual.close()
    })
  })
  on(dialog, '#duplicate-meal', () => {
    const duplicate = sheet('Duplicate meal', '<form class="stack"><label>Copy to date<input type="date" required name="date" value="' +
      date + '"></label><label>Meal type<select name="slot">' + slots(meal.slot) + '</select></label>' + errorLine + '<button class="button primary">Copy meal</button></form>')
    submit(formIn(duplicate), async form => {
      const target = textValue(form, 'date')
      if (!isDateKey(target)) throw new Error('Choose a valid date.')
      if (await addMeal(view, { ...meal, slot: readSlot(textValue(form, 'slot')), date: target })) duplicate.close()
    })
  })
  on(dialog, '#delete-meal', () => {
    const confirmation = sheet('Delete this meal?', '<p>' + h(meal.name) + ' will be removed from ' + date + '.</p><button class="button danger" id="confirm-delete">Delete meal</button>')
    on(confirmation, '#confirm-delete', async () => {
      const saved = await view.save(() => updateDay(view.db, date, day => {
        wasComplete = day.complete
        return { ...day, complete: false, meals: day.meals.filter(item => item.id !== meal.id) }
      }), 'Meal deleted', () => updateDay(view.db, date, day => ({ ...day, complete: wasComplete, meals: [...day.meals.filter(item => item.id !== meal.id), meal] })))
      if (saved) confirmation.close()
    })
  })
}
export function diaryRows(view: View) {
  return getDay(view).meals.slice().sort((a, b) => a.time.localeCompare(b.time) || a.created.localeCompare(b.created)).map(meal =>
    '<article class="meal-row"><div class="meal-top"><div><p class="eyebrow">' + h(meal.time) + ' · ' + h(meal.slot) +
    '</p><h3>' + h(meal.name) + '</h3></div><button class="button subtle" data-meal="' + h(meal.id) + '" aria-label="Edit meal ' + h(meal.name) +
    '">Edit</button></div><ul class="entry-list">' + meal.entries.map(entry => '<li><span>' + h(entry.name) + (entry.estimate ? ' <small>Estimate</small>' : '') +
    '</span><span>' + portionLabel(entry) + '</span></li>').join('') + '</ul>' + macroList(totals(meal.entries), view.data.profile.hideCalories) + '</article>').join('')
}
