import { WebHaptics } from 'web-haptics'

export type HapticLevel = 'light' | 'medium' | 'success'

let instance: WebHaptics | null = null
let installed = false

function getHaptics(): WebHaptics {
  if (!instance) instance = new WebHaptics()
  return instance
}

export function triggerHaptic(level: HapticLevel = 'light'): void {
  try {
    const h = getHaptics()
    if (level === 'light') h.trigger('light')
    else if (level === 'medium') h.trigger('medium')
    else h.trigger('success')
  } catch { /* ignore on unsupported devices */ }
}

export function hapticLight(): void { triggerHaptic('light') }
export function hapticMedium(): void { triggerHaptic('medium') }
export function hapticSuccess(): void { triggerHaptic('success') }

function eventTargetElement(target: EventTarget | null): Element | null {
  if (!target || !(target instanceof Node)) return null
  return target.nodeType === Node.ELEMENT_NODE ? (target as Element) : target.parentElement
}

const HAPTIC_TARGET_SELECTOR = [
  'button',
  'summary',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  'a[href]',
  'select',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'label',
  '[data-haptic]',
].join(', ')

function isUserTypingSurface(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    const t = el.type
    if (t === 'button' || t === 'submit' || t === 'reset' || t === 'checkbox' || t === 'radio' || t === 'file' || t === 'hidden') {
      return false
    }
    return true
  }
  return false
}

function tryGlobalHapticFromEvent(e: Event): void {
  if (!e.isTrusted) return
  if (e instanceof MouseEvent && e.button != null && e.button !== 0) return

  const target = eventTargetElement(e.target)
  if (!target) return

  const typingHit = target.closest('input, textarea')
  if (typingHit && isUserTypingSurface(typingHit)) return

  const interactive = target.closest(HAPTIC_TARGET_SELECTOR) as HTMLElement | null
  if (!interactive) return
  if (interactive.closest('[data-no-haptic]')) return
  if (interactive instanceof HTMLButtonElement && interactive.disabled) return
  if (interactive.getAttribute('aria-disabled') === 'true') return
  if (interactive instanceof HTMLInputElement && interactive.disabled) return
  if (interactive instanceof HTMLSelectElement && interactive.disabled) return

  const href = interactive.getAttribute('href')
  if (interactive.tagName === 'A' && (href === '#' || href === '' || href?.startsWith('javascript:'))) return

  const levelAttr = interactive.getAttribute('data-haptic')
  if (levelAttr === 'medium') triggerHaptic('medium')
  else if (levelAttr === 'success') triggerHaptic('success')
  else triggerHaptic('light')
}

export function installGlobalTapHaptics(): void {
  if (typeof document === 'undefined' || installed) return
  installed = true

  document.addEventListener('touchstart', (e) => tryGlobalHapticFromEvent(e), { capture: true, passive: true })
  document.addEventListener('click', (e) => tryGlobalHapticFromEvent(e), { capture: true, passive: true })
}
