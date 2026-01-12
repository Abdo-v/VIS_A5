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
    const changed =
      next.selectedCountryIso3 !== state.selectedCountryIso3 ||
      next.selectedYear !== state.selectedYear

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
