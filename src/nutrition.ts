import { metrics, type Food, type Nutrients, type Portion, type Recipe, type Unit } from './model.js'

export function scale(nutrients: Nutrients, factor: number): Nutrients {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('Enter a positive portion or yield.')
  return {
    kcal: nutrients.kcal === null ? null : nutrients.kcal * factor,
    protein: nutrients.protein === null ? null : nutrients.protein * factor,
    carbs: nutrients.carbs === null ? null : nutrients.carbs * factor,
    fat: nutrients.fat === null ? null : nutrients.fat * factor,
    fibre: nutrients.fibre === null ? null : nutrients.fibre * factor,
  }
}
export function totals(entries: readonly { nutrients: Nutrients }[]): Nutrients {
  const result: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
  for (const { nutrients } of entries) {
    for (const key of metrics) {
      const subtotal = result[key]
      const amount = nutrients[key]
      result[key] = subtotal === null || amount === null ? null : subtotal + amount
    }
  }
  return result
}
export function foodPortion(food: Food, amount: number, unit: Unit): Portion {
  const basis = unit === food.unit ? amount : unit === 'serving' && food.serving ? amount * food.serving.amount : 0
  return { foodId: food.id, name: food.name, description: food.preparation, amount, unit,
    nutrients: scale(food.nutrients, basis / 100), estimate: food.estimate }
}
export function recipePortion(recipe: Recipe, amount: number): Portion {
  return { foodId: recipe.id, name: recipe.name, description: 'Recipe batch', amount, unit: recipe.yield.unit,
    nutrients: scale(totals(recipe.ingredients), amount / recipe.yield.amount), estimate: true }
}
export const portionLabel = ({ amount, unit }: Pick<Portion, 'amount' | 'unit'>) =>
  unit === 'serving' ? amount + (amount === 1 ? ' serving' : ' servings') : amount + ' ' + unit
export const displayNumber = (value: number | null, precision = 0) => value === null ? 'Unknown' :
  new Intl.NumberFormat(undefined, { maximumFractionDigits: precision }).format(value)
