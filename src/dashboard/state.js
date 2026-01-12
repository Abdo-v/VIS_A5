/**
 * Minimal global state store for linking charts.
 * State:
 * - selectedCountryIso3: string | null
 * - selectedYear: number | null
 */

export function createStore(initialState) {
  let state = { ...initialState }
  const listeners = new Set()

  function getState() {
    return state
  }

  function setState(patch) {
    const next = { ...state, ...patch }
    const changed = Object.keys(next).some((k) => next[k] !== state[k])

    state = next
    if (changed) {
      for (const listener of listeners) listener(state)
    }
  }

  function subscribe(listener) {
    listeners.add(listener)
    listener(state)
    return () => listeners.delete(listener)
  }

  return { getState, setState, subscribe }
}
