import { z } from 'zod'
import { starterFoods } from './catalog-data.js'
import { type Food, type Profile, type Recipe } from './model.js'
import { foodPortion } from './nutrition.js'

export const allFoods = (profile: Profile) => [...starterFoods, ...profile.foods]
export const searchText = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
export const byQuery = (query: string, text: string) => searchText(query).split(/\s+/).every(word => searchText(text).includes(word))
const aliasIndex = new WeakMap<Food, string>()
export function findFoods(profile: Profile, query: string) {
  const words = searchText(query.trim()).split(/\s+/)
  return allFoods(profile).filter(food => {
    let text = aliasIndex.get(food)
    if (text === undefined) {
      text = searchText([food.name, food.preparation, ...food.aliases].join(' '))
      aliasIndex.set(food, text)
    }
    return words.every(word => text.includes(word))
  })
}

const ingredients = [
  ['fdc-171054', 200], ['fdc-169757', 240], ['fdc-170391', 150],
  ['fdc-174277', 16], ['fdc-172336', 6], ['fdc-169231', 6],
] satisfies Array<[string, number]>
export const soup: Recipe = {
  id: 'starter-soy-soup', name: 'Soy chicken & rice soup', yield: { unit: 'g', amount: 1000 },
  ingredients: ingredients.map(([id, grams]) => {
    const food = starterFoods.find(item => item.id === id)
    if (!food) throw new Error('Missing starter recipe ingredient')
    return foodPortion(food, grams, 'g')
  }),
}
export const allRecipes = (profile: Profile) => [soup, ...profile.recipes]

const offProduct = z.object({ status: z.literal('success'), product: z.object({
  product_name: z.string().trim().min(1), brands: z.string().optional(),
  nutrition: z.object({ aggregated_set: z.object({
    per: z.enum(['100g', '100ml']), preparation: z.literal('as_sold'),
    nutrients: z.record(z.string(), z.unknown()),
  }) }),
}) })
const offNutrient = z.object({ value: z.number().finite().nonnegative(), unit: z.string() })
let lastLookup = 0
export async function barcodeFood(code: string): Promise<Food> {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) throw new Error('Enter an 8-, 12-, 13- or 14-digit exact barcode.')
  if (!navigator.onLine) throw new Error('You are offline. Enter the package label instead.')
  if (Date.now() - lastLookup < 5000) throw new Error('Wait a few seconds before trying again.')
  lastLookup = Date.now()
  const url = new URL('https://world.openfoodfacts.org/api/v3.6/product/' + code + '.json')
  url.searchParams.set('fields', 'product_name,brands,nutrition')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 7000)
  try {
    const res = await fetch(url, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'X-User-Agent': 'Dayline/1.0 (' + new URL('./', location.href).href + ')' },
    })
    if (!res.ok) throw new Error('Product unavailable')
    const raw: unknown = await res.json()
    const { product } = offProduct.parse(raw)
    const result = product.nutrition.aggregated_set
    const read = (name: string, unit = 'g') => {
      const amount = offNutrient.safeParse(result.nutrients[name])
      return amount.success && amount.data.unit === unit ? amount.data.value : null
    }
    const nutrients = { kcal: read('energy-kcal', 'kcal'), protein: read('proteins'), carbs: read('carbohydrates'), fat: read('fat'), fibre: read('fiber') }
    if (nutrients.kcal === null) throw new Error('Energy unavailable')
    return { id: 'off-' + code, name: product.product_name, preparation: (product.brands ? product.brands + ' · ' : '') + 'Open Food Facts',
      aliases: [code], unit: result.per === '100ml' ? 'ml' : 'g', serving: null, nutrients, estimate: true,
      source: { kind: 'off', barcode: code } }
  } catch {
    throw new Error('No usable barcode result. Check the package and enter its label.')
  } finally {
    window.clearTimeout(timeout)
  }
}
