import './style.css'
import { renderFood } from './food.js'
import { localDate } from './model.js'
import { renderSettings } from './settings.js'
import { openStorage, readRecords } from './storage.js'
import { renderToday } from './today.js'
import { refreshRestClock, renderTraining } from './training.js'
import { icon, on, type Route, type View } from './ui.js'
import { offline } from './offline.js'

const app = document.querySelector<HTMLElement>('#app')
if (!app) throw new Error('App container missing')
const pages = { today: 'Today', food: 'Food', training: 'Training', progress: 'Progress', settings: 'Settings' }
const tabs = ['today', 'food', 'training', 'progress'] as const
let route: Route = getRoute()
let undoAction: (() => Promise<unknown>) | undefined
let pending = false
let writeTime = 0
let revision = 0
let lastToday = localDate()

function getRoute(): Route {
  const candidate = location.hash.slice(1).toLowerCase()
  return tabs.find(tab => tab === candidate) ?? (candidate === 'settings' ? 'settings' : 'today')
}
async function open(container: HTMLElement) {
  const db = await openStorage()
  const data = await readRecords(db)
  container.innerHTML = '<a class="skip-link" href="#main">Skip to content</a><header class="app-header"><div class="header-inner">' +
    '<a class="brand" href="#today" aria-label="Dayline home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>' +
    '<span>dayline<span class="brand-sub">FITNESS JOURNAL</span></span></a>' +
    '<div class="header-right"><span id="offline-state" class="offline-state" role="status"><i></i><span>Local storage</span></span>' +
    '<a class="icon-button settings-link" href="#settings" aria-label="Settings">' + icon('settings', 20) + '</a></div></div></header>' +
    '<div class="app-body"><div id="update-notice" hidden><p>Dayline has an update. Save any open edits before reloading.</p>' +
    '<button class="button secondary" id="apply-update">Reload and update</button></div><main id="main" tabindex="-1"></main></div>' +
    '<footer class="app-footer"><nav aria-label="Main navigation">' + tabs.map(tab =>
      '<a class="nav-link" href="#' + tab + '">' + icon(tab, 22) + '<span>' + pages[tab] + '</span></a>').join('') +
    '</nav></footer><div id="toasts"><p id="notice" role="status"></p><button class="button subtle" id="undo" hidden>Undo</button></div>'
  const root = container.querySelector<HTMLElement>('main')
  if (!root) throw new Error('App view missing')
  const notice = container.querySelector('#notice')
  const undoButton = container.querySelector<HTMLButtonElement>('#undo')
  const view: View = {
    db, data, date: lastToday, root,
    render: () => { void render(view) },
    go: next => {
      if (next === route) return
      location.hash = next
    },
    selectDate: date => {
      view.date = date
      view.render()
    },
    save: async (work, message, undo) => {
      if (pending) return false
      pending = true
      try {
        await work()
      } catch (error) {
        pending = false
        const detail = error instanceof Error && !(error instanceof DOMException) ? ' ' + error.message : ''
        showStatus('Could not save locally. Try again.' + detail, true)
        return false
      }
      writeTime = Date.now()
      undoAction = undo
      if (undoButton) undoButton.hidden = !undo
      try {
        view.data = await readRecords(db)
        view.render()
        showStatus(message + ' · Saved on this iPhone')
      } catch {
        showStatus('Saved on this iPhone. Reopen Dayline to refresh the view.', true)
      } finally { pending = false }
      return true
    },
    notify: message => showStatus(message),
  }
  function showStatus(message: string, failure = false) {
    if (notice) notice.textContent = message
    if (failure) {
      const dialog = document.querySelector('dialog[open]')
      if (dialog) {
        let local = dialog.querySelector<HTMLElement>('.save-error')
        if (!local) {
          local = document.createElement('p')
          local.className = 'form-error save-error'
          local.setAttribute('role', 'alert')
          dialog.querySelector('.sheet-inner')?.append(local)
        }
        local.textContent = message
      }
    }
  }
  on(container, '.skip-link', element => element.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); root.focus() }
  }))
  container.querySelector('.skip-link')?.addEventListener('click', event => { event.preventDefault(); root.focus() })
  on(container, '#undo', async () => {
    if (!undoAction || pending) return
    const undo = undoAction
    await view.save(undo, 'Change undone')
  })
  window.addEventListener('hashchange', () => {
    route = getRoute()
    document.querySelector<HTMLDialogElement>('dialog[open]')?.close()
    window.scrollTo(0, 0)
    void render(view, true)
  })
  const resume = async () => {
    refreshRestClock(root)
    if (document.hidden || pending || document.querySelector('dialog[open],form[data-edited]')) return
    const today = localDate()
    const rolledOver = today !== lastToday && view.date === lastToday
    if (rolledOver) view.date = today
    lastToday = today
    const before = writeTime
    try {
      const latest = await readRecords(db)
      if (!pending && writeTime === before && !document.querySelector('dialog[open],form[data-edited]') &&
        (rolledOver || JSON.stringify(latest) !== JSON.stringify(view.data))) {
        view.data = latest
        view.render()
      }
    } catch {
      if (!pending && writeTime === before) showStatus('Could not refresh local records.', true)
    }
  }
  window.addEventListener('pageshow', event => { if (event.persisted) void resume() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void resume() })
  window.setInterval(() => { if (!document.hidden) refreshRestClock(root) }, 500)
  await render(view)
  void offline(container, () => pending || !!document.querySelector('dialog[open],form[data-edited]'))
}
async function render(view: View, focus = false) {
  const current = ++revision
  document.title = pages[route] + ' · Dayline'
  document.querySelectorAll<HTMLAnchorElement>('.nav-link,.settings-link').forEach(link => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  if (route === 'today') renderToday(view)
  else if (route === 'food') renderFood(view)
  else if (route === 'training') renderTraining(view)
  else if (route === 'settings') renderSettings(view)
  else {
    const { renderProgress } = await import('./progress-view.js')
    if (current !== revision) return
    renderProgress(view)
  }
  if (focus) view.root.querySelector('h1')?.focus({ preventScroll: true })
}
open(app).catch(() => {
  app.innerHTML = '<main class="boot-error"><h1>Dayline couldn’t open</h1><p>Local storage is unavailable. Open the app in Safari or from its Home Screen icon and try again.</p><button class="button primary" id="retry">Retry</button></main>'
  on(app, '#retry', () => location.reload())
})

