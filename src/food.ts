import { allFoods, allRecipes, barcodeFood, byQuery, findFoods, soup } from './catalog.js'
import { addMeal, addSaved } from './diary.js'
import { metrics, uuid, type Food, type Portion, type Recipe, type SavedMeal, type Unit } from './model.js'
import { foodPortion, portionLabel, recipePortion, scale, totals } from './nutrition.js'
import { updateProfile } from './storage.js'
import { bindDate, dateStrip, empty, errorLine, escapeHtml as h, formIn, heading, icon, macroList, metricLabels, metricUnit, metricValue,
  numberValue, numInput, on, positiveValue, readSlot, sheet, slots, submit, textValue, type View } from './ui.js'

const pageSize = 16
let query = ''
let filter = 'All foods'
let limit = pageSize

export function renderFood(view: View) {
  view.root.innerHTML = heading('Food', 'Find a food, log a portion or save a meal for later.', dateStrip(view.date)) +
    '<section class="panel catalog"><div class="section-head"><h2>Food library</h2><button class="button secondary" id="new-label">' + icon('plus', 17) +
    ' Custom food</button></div><label class="search">' + icon('search') + '<input type="search" id="food-search" placeholder="Search foods or meals" aria-label="Search foods or meals" autocomplete="off" value="' +
    h(query) + '"></label><div class="chips" aria-label="Food filters">' + ['All foods', 'Favourites', 'Recent', 'Usual meals', 'Recipes'].map(item =>
      '<button class="chip" data-filter="' + item + '" aria-pressed="' + (item === filter) + '">' + item + '</button>').join('') +
    '</div><div id="food-results"></div></section><section class="panel narrow-panel"><div class="section-head"><div><h2>Package barcode</h2>' +
    '<p>Optional online lookup. Only the barcode is sent to Open Food Facts.</p></div><button class="button secondary" id="barcode">Look up</button></div></section>'
  bindDate(view)
  const search = view.root.querySelector<HTMLInputElement>('#food-search')
  search?.addEventListener('input', () => { query = search.value; limit = pageSize; renderResults(view) })
  on(view.root, '[data-filter]', element => {
    filter = element.dataset.filter ?? 'All foods'
    limit = pageSize
    view.root.querySelectorAll<HTMLElement>('[data-filter]').forEach(chip => chip.setAttribute('aria-pressed', String(chip === element)))
    renderResults(view)
  })
  on(view.root, '#new-label', () => labelSheet(view))
  on(view.root, '#barcode', () => barcodeSheet(view))
  renderResults(view)
}
function renderResults(view: View) {
  const target = view.root.querySelector<HTMLElement>('#food-results')
  if (!target) return
  const { profile, days } = view.data
  const recent = filter === 'Recent' ? [...new Set(days.slice().reverse().flatMap(day =>
    day.meals.slice().reverse().flatMap(meal => meal.entries.slice().reverse().map(entry => entry.foodId))))] : []
  const foods = findFoods(profile, query)
  const recipes = allRecipes(profile).filter(recipe => byQuery(query, recipe.name))
  const savedMeals = profile.savedMeals.filter(meal => byQuery(query, [meal.name, ...meal.entries.map(entry => entry.name)].join(' ')))
  const selectedFoods = filter === 'Favourites' ? foods.filter(food => profile.favourites.includes(food.id)) :
    filter === 'Recent' ? recent.flatMap(id => foods.filter(food => food.id === id)) : filter === 'All foods' ? foods : []
  const selectedRecipes = filter === 'Recipes' || (filter === 'All foods' && query.trim()) ? recipes : []
  const selectedMeals = filter === 'Usual meals' || (filter === 'All foods' && query.trim()) ? savedMeals : []
  const rows = [
    ...selectedMeals.map(meal => listRow(meal.name, 'Usual meal · ' + meal.entries.length + ' foods', 'saved', meal.id)),
    ...selectedRecipes.map(recipe => listRow(recipe.name, 'Recipe batch · estimate', 'recipe', recipe.id)),
    ...selectedFoods.map(food => {
      const portion = foodPortion(food, food.serving?.amount ?? 100, food.unit)
      const summary = portionLabel(portion) + (profile.hideCalories ? '' : ' · ' + metricValue('kcal', portion.nutrients.kcal))
      return listRow(food.name, food.preparation + ' · ' + summary + (food.estimate && !food.preparation.includes('estimate') ? ' · Estimate' : ''),
        'food', food.id, profile.favourites.includes(food.id))
    }),
  ]
  target.innerHTML = '<p class="result-count" aria-live="polite">' + rows.length + ' ' + (rows.length === 1 ? 'result' : 'results') + '</p>' +
    (rows.length ? '<ul class="result-list">' + rows.slice(0, limit).join('') + '</ul>' : empty('No matching foods', 'Try another search or add a custom food.', 'search')) +
    (rows.length > limit ? '<button class="button secondary" id="load-more">Show more foods</button>' : '') +
    (filter === 'Recipes' ? '<button class="button secondary" id="new-recipe">Create recipe batch</button>' : '')
  on(target, '[data-food]', button => { const food = foods.find(item => item.id === button.dataset.food); if (food) portionSheet(view, food) })
  on(target, '[data-favourite]', async button => {
    const id = button.dataset.favourite
    if (!id) return
    const removing = profile.favourites.includes(id)
    await view.save(() => updateProfile(view.db, latest => ({ ...latest,
      favourites: removing ? latest.favourites.filter(item => item !== id) : [...new Set([...latest.favourites, id])],
    })), removing ? 'Removed from favourites' : 'Added to favourites')
  })
  on(target, '[data-recipe]', button => { const recipe = recipes.find(item => item.id === button.dataset.recipe); if (recipe) recipeSheet(view, recipe) })
  on(target, '[data-saved]', button => { const meal = savedMeals.find(item => item.id === button.dataset.saved); if (meal) usualSheet(view, meal) })
  on(target, '#load-more', () => { limit += pageSize; renderResults(view) })
  on(target, '#new-recipe', () => recipeEditor(view))
}
function listRow(name: string, detail: string, kind: string, id: string, favourite?: boolean) {
  return '<li><div class="result-title"><strong>' + h(name) + '</strong><span>' + h(detail) + '</span></div><div class="row-actions">' +
    (favourite === undefined ? '' : '<button class="icon-button favourite" aria-label="' + (favourite ? 'Remove favourite ' : 'Favourite ') +
      h(name) + '" aria-pressed="' + favourite + '" data-favourite="' + h(id) + '">' + icon('star', 19) + '</button>') +
    '<button class="icon-button row-add" data-' + kind + '="' + h(id) + '" aria-label="Add ' + h(name) + '">' + icon('plus', 19) + '</button></div></li>'
}
export function portionSheet(view: View, food: Food) {
  const preferred = view.data.profile.preferredUnits[food.id]
  const unit = preferred === 'serving' && food.serving ? 'serving' : food.unit
  const initial = unit === 'serving' ? 1 : food.serving?.amount ?? 100
  const dialog = sheet(food.name, '<p>' + h(food.preparation) + (food.estimate ? ' · Estimated values' : '') + '</p><form class="stack"><div class="form-grid">' +
    '<label>Portion' + numInput('amount', initial, { min: 0.01, required: true }) + '</label><label>Unit<select name="unit">' +
    '<option value="' + food.unit + '"' + (unit === food.unit ? ' selected' : '') + '>' + (food.unit === 'g' ? 'Grams' : 'Millilitres') + '</option>' +
    (food.serving ? '<option value="serving"' + (unit === 'serving' ? ' selected' : '') + '>' + h(food.serving.name) + ' (' + food.serving.amount + ' ' + food.unit + ')</option>' : '') +
    '</select></label></div><label>Meal type<select name="slot">' + slots() + '</select></label><div id="portion-preview"></div>' +
    errorLine + '<button class="button primary">Add to diary</button></form>' + sourceDetails(food) +
    (food.source.kind !== 'usda' ? '<button class="button secondary" id="edit-food">Edit ' + (food.source.kind === 'off' ? 'label values' : 'custom food') + '</button>' : ''))
  const form = formIn(dialog)
  const preview = dialog.querySelector<HTMLElement>('#portion-preview')
  const portion = (data: FormData) => {
    const unit = textValue(data, 'unit')
    if (unit !== food.unit && unit !== 'serving') throw new Error('Choose a valid unit.')
    return foodPortion(food, positiveValue(data, 'amount'), unit)
  }
  const update = () => {
    if (!preview) return
    try { preview.innerHTML = macroList(portion(new FormData(form)).nutrients, view.data.profile.hideCalories) }
    catch { preview.textContent = 'Enter a positive portion to see the totals.' }
  }
  form.addEventListener('input', update)
  const unitSelect = form.querySelector<HTMLSelectElement>('[name=unit]')
  unitSelect?.addEventListener('change', () => {
    const amount = form.querySelector<HTMLInputElement>('[name=amount]')
    if (amount) amount.value = String(unitSelect.value === 'serving' ? 1 : food.serving?.amount ?? 100)
    update()
  })
  update()
  submit(form, async data => {
    const slot = readSlot(textValue(data, 'slot'))
    const entry = portion(data)
    if (await addMeal(view, { name: slot, slot, entries: [entry], combine: true, preferred: { id: food.id, unit: entry.unit } })) dialog.close()
  })
  on(dialog, '#edit-food', () => labelSheet(view, food))
}
function sourceDetails(food: Food) {
  const source = food.source
  if (source.kind === 'label') return '<p class="caption">Source · Package label or personal estimate</p>'
  if (source.kind === 'off') return '<p class="caption">Source · <a target="_blank" rel="noopener noreferrer" href="https://world.openfoodfacts.org/product/' +
    h(source.barcode) + '">Open Food Facts</a> · <a target="_blank" rel="noopener noreferrer" href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>. Check your package label.</p>'
  return '<details><summary>Food source and preparation</summary><p>' + h(source.description) + '</p><p><a target="_blank" rel="noopener noreferrer" href="https://fdc.nal.usda.gov/food-details/' +
    source.fdc + '/nutrients">USDA FoodData Central #' + source.fdc + '</a> · SR Legacy ' + h(source.release) + ' · per 100 g edible weight</p></details>'
}
function labelSheet(view: View, food?: Food) {
  const dialog = sheet(food ? 'Edit food' : 'Custom food', '<form class="stack"><label>Name<input required name="name" maxlength="120" value="' +
    h(food?.name) + '"></label><label>Brand or preparation<input name="prep" maxlength="120" value="' + h(food?.preparation) +
    '"></label><label>Nutrition basis<select name="unit"><option value="g">Per 100 g</option><option value="ml"' + (food?.unit === 'ml' ? ' selected' : '') +
    '>Per 100 ml</option></select></label><p>Enter values in the selected basis. Leave unknown values blank.</p><div class="form-grid">' +
    metrics.filter(key => key !== 'kcal' || !view.data.profile.hideCalories).map(key => '<label>' + metricLabels[key] + ' (' + metricUnit(key) + ')' + numInput(key, food?.nutrients[key]) + '</label>').join('') +
    '<label>Serving size in g or ml' + numInput('serving', food?.serving?.amount ?? null, { min: 0.01 }) +
    '</label></div><label class="check"><input type="checkbox" name="estimate"' + (food?.estimate ? ' checked' : '') +
    '>Mixed dish, restaurant meal or other estimate</label>' + errorLine + '<button class="button primary">Save food</button></form>' +
    (food ? '<button class="button danger" id="remove-food">Delete custom food</button>' : ''))
  submit(formIn(dialog), async form => {
    const name = textValue(form, 'name')
    if (!name) throw new Error('Enter a food name.')
    const unit = textValue(form, 'unit') === 'ml' ? 'ml' : 'g'
    const serving = numberValue(form, 'serving')
    const record: Food = { id: food?.id ?? uuid(), name, preparation: textValue(form, 'prep') || 'Package label',
      aliases: food?.aliases ?? [], unit, serving: serving ? { name: food?.serving?.name ?? '1 serving', amount: serving } : null,
      nutrients: { kcal: view.data.profile.hideCalories ? food?.nutrients.kcal ?? null : numberValue(form, 'kcal'), protein: numberValue(form, 'protein'),
        carbs: numberValue(form, 'carbs'), fat: numberValue(form, 'fat'), fibre: numberValue(form, 'fibre') },
      estimate: form.has('estimate') || food?.source.kind === 'off', source: food?.source ?? { kind: 'label' },
    }
    if (await view.save(() => updateProfile(view.db, profile => ({ ...profile, foods: [...profile.foods.filter(item => item.id !== record.id), record] })), 'Food saved')) dialog.close()
  })
  on(dialog, '#remove-food', () => {
    if (!food) return
    deleteFromProfile(view, 'Delete custom food?', profile => ({ ...profile, foods: profile.foods.filter(item => item.id !== food.id) }))
  })
}
function barcodeSheet(view: View) {
  const dialog = sheet('Exact barcode lookup', '<form class="stack"><label>Barcode<input name="code" inputmode="numeric" maxlength="14" required></label>' +
    '<p>This optional search sends the barcode to Open Food Facts. You can also enter the label offline.</p>' + errorLine +
    '<button class="button primary">Find product</button></form><button class="button secondary" id="use-label">Enter package label</button>')
  on(dialog, '#use-label', () => labelSheet(view))
  submit(formIn(dialog), async data => {
    const code = textValue(data, 'code')
    const cached = view.data.profile.foods.find(food => food.source.kind === 'off' && food.source.barcode === code)
    if (cached) { portionSheet(view, cached); return }
    const food = await barcodeFood(code)
    if (!dialog.open) return
    const result = sheet(food.name, '<p>' + h(food.preparation) + ' · Estimate. Compare against the package.</p>' + macroList(food.nutrients, view.data.profile.hideCalories) +
      sourceDetails(food) + '<button class="button primary" id="cache-food">Save to library</button><button class="button secondary" id="use-label">Enter package label</button>')
    on(result, '#cache-food', async () => {
      const saved = await view.save(() => updateProfile(view.db, profile => ({
        ...profile, foods: [...profile.foods.filter(item => item.id !== food.id), food],
      })), 'Barcode food saved')
      if (saved) portionSheet(view, food)
    })
    on(result, '#use-label', () => labelSheet(view))
  })
}
function recipeSheet(view: View, recipe: Recipe) {
  const dialog = sheet(recipe.name, '<p>Estimated values from the batch ingredients.</p><details><summary>Ingredients and yield</summary><ul>' +
    recipe.ingredients.map(item => '<li>' + h(item.name) + ' · ' + portionLabel(item) + '</li>').join('') +
    '</ul><p>Yield · ' + portionLabel(recipe.yield) + '</p>' + (recipe.id === soup.id ? '<p>Add water to bring the finished soup to 1,000 g.</p>' : '') +
    '</details><form class="stack"><label>Portion (' + recipe.yield.unit + ')' + numInput('portion', recipe.yield.unit === 'g' ? Math.min(250, recipe.yield.amount) : 1, { min: 0.01, required: true }) +
    '</label><label>Meal type<select name="slot">' + slots('Dinner') + '</select></label><div id="recipe-macros"></div>' + errorLine +
    '<button class="button primary">Add recipe portion</button></form><div class="button-row"><button class="button secondary" id="edit-recipe">' +
    (recipe.id === soup.id ? 'Save an editable copy' : 'Edit recipe') + '</button>' +
    (recipe.id === soup.id ? '' : '<button class="button danger" id="delete-recipe">Delete recipe</button>') + '</div>')
  const form = formIn(dialog)
  const target = dialog.querySelector<HTMLElement>('#recipe-macros')
  const show = () => {
    if (!target) return
    try { target.innerHTML = macroList(recipePortion(recipe, positiveValue(new FormData(form), 'portion')).nutrients, view.data.profile.hideCalories) }
    catch { target.textContent = 'Choose a positive portion.' }
  }
  show()
  form.addEventListener('input', show)
  submit(form, async data => {
    const slot = readSlot(textValue(data, 'slot'))
    if (await addMeal(view, { name: slot, slot, entries: [recipePortion(recipe, positiveValue(data, 'portion'))], combine: true })) dialog.close()
  })
  on(dialog, '#edit-recipe', () => recipeEditor(view, recipe.id === soup.id ? { ...recipe, id: uuid() } : recipe))
  on(dialog, '#delete-recipe', () => deleteFromProfile(view, 'Delete recipe?', profile => ({ ...profile, recipes: profile.recipes.filter(item => item.id !== recipe.id) })))
}
export function showSoup(view: View) {
  recipeSheet(view, view.data.profile.recipes.find(recipe => byQuery('soup', recipe.name)) ?? soup)
}
function recipeEditor(view: View, recipe?: Recipe) {
  const foods = allFoods(view.data.profile)
  const ingredients = [...(recipe?.ingredients ?? [])]
  const dialog = sheet('Recipe batch', '<form id="recipe-main" class="stack"><label>Recipe name<input name="name" required maxlength="120" value="' +
    h(recipe?.name) + '"></label><div class="form-grid"><label>Final batch yield' + numInput('yield', recipe?.yield.amount, { min: 0.01, required: true }) +
    '</label><label>Yield unit<select name="unit"><option value="g">Grams</option><option value="serving"' + (recipe?.yield.unit === 'serving' ? ' selected' : '') +
    '>Servings</option></select></label></div></form><div id="ingredients"></div><form id="recipe-ingredient" class="stack"><fieldset><legend>Add ingredient</legend>' +
    '<label>Food<select name="food">' + foods.map(food => '<option value="' + h(food.id) + '">' + h(food.name + ' · ' + food.preparation) + '</option>').join('') +
    '</select></label><label id="ingredient-quantity">Edible grams' + numInput('amount', null, { min: 0.01, required: true }) + '</label>' +
    errorLine + '<button class="button secondary">Add ingredient</button></fieldset></form><p>Include any oil used and weigh the finished batch if logging by grams.</p>' +
    '<p class="form-error" role="alert" id="recipe-error"></p><button form="recipe-main" class="button primary">Save recipe batch</button>')
  const display = dialog.querySelector<HTMLElement>('#ingredients')
  const show = () => {
    if (!display) return
    display.innerHTML = ingredients.map((part, i) => '<div class="list-line"><span>' + h(part.name) + ' · ' + portionLabel(part) +
      '</span><button type="button" class="button subtle" data-remove="' + i + '">Remove</button></div>').join('')
    on(display, '[data-remove]', button => { ingredients.splice(Number(button.dataset.remove), 1); show() })
  }
  show()
  const add = formIn(dialog, '#recipe-ingredient')
  const select = add.querySelector<HTMLSelectElement>('select')
  select?.addEventListener('change', () => {
    const label = dialog.querySelector('#ingredient-quantity')?.firstChild
    if (label) label.textContent = foods.find(food => food.id === select.value)?.unit === 'ml' ? 'Millilitres' : 'Edible grams'
  })
  submit(add, data => {
    const food = foods.find(item => item.id === textValue(data, 'food'))
    if (!food) throw new Error('Choose an ingredient.')
    ingredients.push(foodPortion(food, positiveValue(data, 'amount'), food.unit))
    show()
    const amount = add.querySelector<HTMLInputElement>('[name=amount]')
    if (amount) amount.value = ''
  })
  const main = formIn(dialog, '#recipe-main')
  const error = dialog.querySelector('#recipe-error')
  if (error) main.append(error)
  submit(main, async data => {
    const name = textValue(data, 'name')
    if (!name || !ingredients.length) throw new Error('Enter a name and add at least one ingredient.')
    const record: Recipe = { id: recipe?.id ?? uuid(), name, ingredients: [...ingredients],
      yield: { amount: positiveValue(data, 'yield'), unit: textValue(data, 'unit') === 'serving' ? 'serving' : 'g' } }
    if (await view.save(() => updateProfile(view.db, profile => ({ ...profile, recipes: [...profile.recipes.filter(item => item.id !== record.id), record] })), 'Recipe saved')) dialog.close()
  })
}
export function usualSheet(view: View, meal: SavedMeal) {
  const dialog = sheet(meal.name, '<form class="stack"><label>Meal name<input name="name" required maxlength="120" value="' + h(meal.name) +
    '"></label><label>Meal type<select name="slot">' + slots(meal.slot) + '</select></label>' +
    meal.entries.map((entry, i) => '<label>' + h(entry.name) + ' (' + entry.unit + ')' + numInput('portion-' + i, entry.amount, { min: 0.01, required: true }) + '</label>').join('') +
    '<div id="usual-macros"></div>' + errorLine + '<button class="button primary">Add to diary</button>' +
    '<button class="button secondary" type="submit" name="action" value="save">Update usual meal</button></form>' +
    '<button class="button danger" id="delete-usual">Delete usual meal</button>')
  const form = formIn(dialog)
  const adjusted = (data: FormData) => {
    const entries = meal.entries.map((entry, i) => {
      const amount = positiveValue(data, 'portion-' + i)
      return { ...entry, amount, nutrients: scale(entry.nutrients, amount / entry.amount) }
    })
    return { ...meal, name: textValue(data, 'name'), slot: readSlot(textValue(data, 'slot')), entries }
  }
  const display = dialog.querySelector<HTMLElement>('#usual-macros')
  const show = () => {
    if (!display) return
    try { display.innerHTML = macroList(totals(adjusted(new FormData(form)).entries), view.data.profile.hideCalories) }
    catch { display.textContent = 'Enter positive portions to preview totals.' }
  }
  show()
  form.addEventListener('input', show)
  submit(form, async data => {
    const record = adjusted(data)
    if (!record.name) throw new Error('Enter a meal name.')
    const saved = textValue(data, 'action') === 'save' ?
      await view.save(() => updateProfile(view.db, profile => ({ ...profile, savedMeals: profile.savedMeals.map(item => item.id === record.id ? record : item) })), 'Usual meal updated') :
      await addSaved(view, record)
    if (saved) dialog.close()
  })
  on(dialog, '#delete-usual', () => deleteFromProfile(view, 'Delete usual meal?', profile => ({ ...profile, savedMeals: profile.savedMeals.filter(item => item.id !== meal.id) })))
}
function deleteFromProfile(view: View, title: string, change: Parameters<typeof updateProfile>[1]) {
  const dialog = sheet(title, '<p>Existing diary entries keep their original values.</p><button id="confirm-removal" class="button danger">Confirm delete</button>')
  on(dialog, '#confirm-removal', async () => { if (await view.save(() => updateProfile(view.db, change), 'Deleted')) dialog.close() })
}
