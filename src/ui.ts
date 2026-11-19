import { blankDay, dateLabel, isDateKey, localDate, mealSlots, metrics, shiftDate, type DateKey, type Metric, type Nutrients, type Records, type Slot } from './model.js'
import { displayNumber } from './nutrition.js'

export type Route = 'today' | 'food' | 'training' | 'progress' | 'settings'
export interface View {
  db: IDBDatabase
  data: Records
  date: DateKey
  root: HTMLElement
  render(): void
  go(route: Route): void
  selectDate(date: DateKey): void
  save(action: () => Promise<unknown>, message: string, undo?: () => Promise<unknown>): Promise<boolean>
  notify(message: string): void
}
export const escapeHtml = (value: string | number | null | undefined) => String(value ?? '').replace(/[&<>"']/g, char => {
  switch (char) { case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; default: return '&#39;' }
})
const glyphs = {
  today: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  food: '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18m13 0V3c-3 1-5 5-5 9h5"/>',
  training: '<path d="M6 5v14m12-14v14M3 8v8m18-8v8M6 12h12"/>',
  progress: '<path d="M3 3v18h18M7 16l4-5 4 2 5-7"/><path d="M16 6h4v4"/>',
  settings: '<path d="M5 4v16m7-16v16m7-16v16"/><path d="M2 9h6m1 6h6m1-7h6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  steps: '<path d="M9 17.5c-2 2-5 2-6 0-1-2 1-5 3-5 1.5 0 4 3 3 5Zm6-11c2-2 5-2 6 0 1 2-1 5-3 5-1.5 0-4-3-3-5ZM8 9l1-1m6 8 1-1"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.6-3A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 10h7m-7 4h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  star: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9L12 3Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M5 4h14v16H7a2 2 0 0 1-2-2V4Zm0 13a2 2 0 0 1 2-2h12"/>',
} as const
export type Icon = keyof typeof glyphs
export function icon(name: Icon, size = 21) {
  return '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + glyphs[name] + '</svg>'
}
export const metricLabels: Record<Metric, string> = { kcal: 'Energy', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre' }
export const metricUnit = (key: Metric) => key === 'kcal' ? 'kcal' : 'g'
export const metricValue = (key: Metric, value: number | null) =>
  value === null ? 'Unknown' : displayNumber(value, key === 'kcal' ? 0 : 1) + ' ' + metricUnit(key)
export const getDay = (view: View) => view.data.days.find(day => day.date === view.date) ?? blankDay(view.date)
export const options = (items: readonly string[], selected = '') => items.map(value =>
  '<option' + (value === selected ? ' selected' : '') + '>' + escapeHtml(value) + '</option>').join('')
export const slots = (selected: Slot = 'Lunch') => options(mealSlots, selected)
export function readSlot(value: string): Slot {
  const slot = mealSlots.find(item => item === value)
  if (!slot) throw new Error('Choose a meal type.')
  return slot
}
export const textValue = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
export function numberValue(form: FormData, key: string) {
  const text = textValue(form, key)
  if (text === '') return null
  const number = Number(text)
  if (!Number.isFinite(number) || number < 0) throw new Error('Enter a valid non-negative number.')
  return number
}
export function positiveValue(form: FormData, key: string) {
  const value = numberValue(form, key)
  if (value === null || value <= 0) throw new Error('Enter a value larger than zero.')
  return value
}
export function wholeValue(form: FormData, key: string, fallback = 0) {
  const value = numberValue(form, key) ?? fallback
  if (!Number.isSafeInteger(value)) throw new Error('Enter a whole number.')
  return value
}
export function numInput(name: string, value: number | null = null, config: { min?: number; step?: string; required?: boolean; placeholder?: string } = {}) {
  const { min = 0, step = 'any', required = false, placeholder = '' } = config
  return '<input name="' + name + '" type="number" inputmode="' + (step === '1' ? 'numeric' : 'decimal') + '" min="' + min +
    '" step="' + step + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder) + '"' + (required ? ' required' : '') + '>'
}
export function macroList(nutrients: Nutrients, hideCalories: boolean) {
  return '<dl class="macros">' + metrics.filter(key => key !== 'kcal' || !hideCalories).map(key =>
    '<div><dt>' + metricLabels[key] + '</dt><dd>' + metricValue(key, nutrients[key]) + '</dd></div>').join('') + '</dl>'
}
export function dateStrip(date: DateKey) {
  return '<div class="date-strip"><button class="icon-button" id="previous-day" aria-label="Previous day">' + icon('left', 19) + '</button>' +
    '<button class="button subtle date-value" id="pick-date" aria-label="Choose log date, ' + escapeHtml(dateLabel(date)) + '">' +
    escapeHtml(dateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' })) + '</button>' +
    '<button class="icon-button" id="next-day" aria-label="Next day">' + icon('right', 19) + '</button></div>'
}
export function bindDate(view: View) {
  on(view.root, '#previous-day', () => view.selectDate(shiftDate(view.date, -1)))
  on(view.root, '#next-day', () => view.selectDate(shiftDate(view.date, 1)))
  on(view.root, '#pick-date', () => {
    const dialog = sheet('Choose log date', '<form class="stack"><label>Log date<input type="date" name="date" required value="' + view.date +
      '"></label>' + errorLine + '<button class="button primary">Open selected date</button></form>')
    submit(formIn(dialog), data => {
      const date = data.get('date')
      if (!isDateKey(date)) throw new Error('Choose a valid date.')
      dialog.close()
      view.selectDate(date)
    })
  })
}
export function on(root: ParentNode, selector: string, action: (element: HTMLElement) => void) {
  root.querySelectorAll<HTMLElement>(selector).forEach(element => element.addEventListener('click', () => action(element)))
}
export function submit(form: HTMLFormElement, action: (data: FormData) => unknown | Promise<unknown>) {
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (form.dataset.pending) return
    const status = form.querySelector<HTMLElement>('.form-error')
    try {
      form.dataset.pending = 'true'
      if (status) status.textContent = ''
      await action(new FormData(form, event.submitter))
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : 'Unable to complete this action.'
    } finally {
      delete form.dataset.pending
    }
  })
}
export const errorLine = '<p class="form-error" role="alert"></p>'
export function sheet(title: string, content: string) {
  document.querySelector('dialog[data-sheet]')?.remove()
  const dialog = document.createElement('dialog')
  dialog.dataset.sheet = ''
  dialog.setAttribute('aria-labelledby', 'sheet-title')
  dialog.innerHTML = '<div class="sheet-inner"><div class="sheet-head"><h2 id="sheet-title">' + escapeHtml(title) +
    '</h2><button type="button" class="icon-button close-sheet" aria-label="Close dialog">×</button></div>' + content + '</div>'
  document.body.append(dialog)
  on(dialog, '.close-sheet', () => dialog.close())
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
  dialog.showModal()
  return dialog
}
export function formIn(root: ParentNode, selector = 'form') {
  const form = root.querySelector(selector)
  if (!(form instanceof HTMLFormElement)) throw new Error('Form unavailable.')
  return form
}
export function heading(title: string, subtitle: string, action = '') {
  return '<div class="page-head"><div><h1 tabindex="-1">' + title + '</h1>' + (subtitle ? '<p>' + subtitle + '</p>' : '') + '</div>' + action + '</div>'
}
export const dayTitle = (date: DateKey) => date === localDate() ? 'Today' : dateLabel(date, { weekday: 'long' })
export const empty = (title: string, body: string, symbol: Icon) =>
  '<div class="empty"><span class="empty-icon">' + icon(symbol) + '</span><div><strong>' + title + '</strong><p>' + body + '</p></div></div>'

