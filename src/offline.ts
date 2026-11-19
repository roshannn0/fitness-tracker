export async function offline(root: HTMLElement, hasOpenEdits: () => boolean) {
  const label = root.querySelector('#offline-state span')
  const notice = root.querySelector<HTMLElement>('#update-notice')
  const apply = root.querySelector<HTMLButtonElement>('#apply-update')
  const set = (message: string) => { if (label) label.textContent = message }
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    set('Local storage')
    return
  }
  let applying = false
  const service = navigator.serviceWorker
  service.addEventListener('controllerchange', () => {
    if (applying) location.reload()
    else if (service.controller) set('Available offline')
  })
  try {
    set('Preparing offline')
    const registration = await service.register(new URL('./sw.js', document.baseURI), { updateViaCache: 'none' })
    const offer = () => {
      if (registration.waiting && service.controller && notice) notice.hidden = false
    }
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') offer()
        if (worker.state === 'redundant' && !service.controller) set('Offline setup unavailable')
      })
    })
    offer()
    if (service.controller) set('Available offline')
    else service.ready.then(() => { if (service.controller) set('Available offline') })
    apply?.addEventListener('click', () => {
      if (hasOpenEdits()) {
        window.alert('Save your changes and close any open editor, then reload.')
        return
      }
      if (!registration.waiting) return
      applying = true
      registration.waiting.postMessage('activate-update')
    })
  } catch { set('Offline setup unavailable') }
}
