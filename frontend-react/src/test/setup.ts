import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { JSDOM } from 'jsdom'

// Node 22+ ships its own `localStorage` global (an inert stub without
// --localstorage-file), and vitest's jsdom environment does not override it —
// window.localStorage === globalThis.localStorage === that stub. Install a
// working jsdom storage so app code using bare `localStorage` works in tests.
const storageDom = new JSDOM('', { url: 'http://localhost/' })
Object.defineProperty(globalThis, 'localStorage', {
  value: storageDom.window.localStorage,
  configurable: true,
  writable: true,
})
// Same shadowing problem for navigator (Node's global navigator has no onLine)
// Recharts' ResponsiveContainer needs a ResizeObserver (absent in jsdom).
// Fire the callback with a fixed size so charts actually render their SVG
// instead of staying at 0×0 and rendering nothing.
if (!('ResizeObserver' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class ResizeObserverStub {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private cb: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(cb: any) {
      this.cb = cb
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    observe(target: any) {
      this.cb(
        [
          {
            target,
            contentRect: { width: 800, height: 400, x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, toJSON: () => ({}) },
          },
        ],
        this,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true })
}

Object.defineProperty(globalThis, 'navigator', {
  value: storageDom.window.navigator,
  configurable: true,
  writable: true,
})

// Radix Select/Dropdown call Element.prototype pointer-capture methods, which
// jsdom does not implement. Polyfill so userEvent clicks can open them.
for (const [m, impl] of [
  ['hasPointerCapture', () => false],
  ['setPointerCapture', () => {}],
  ['releasePointerCapture', () => {}],
  ['scrollIntoView', () => {}],
] as const) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(Element.prototype as any)[m] = impl
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  // Object.defineProperty on navigator leaks across tests (not a vi stub).
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  vi.useRealTimers()
})
