import { loadDashboardData } from './data.js'
import { createStore } from './state.js'
import { createScatterView } from './views/scatter.js'
import { createSmallMultiplesView } from './views/smallMultiples.js'
import { createDiscrepancyView } from './views/discrepancy.js'
import { createBarsView } from './views/bars.js'

const AUSTRIA_ISO3 = 'AUT'

function buildLayout(root) {
  root.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="header-left">
          <div class="country-search" id="countrySearch">
            <input
              id="countrySearchInput"
              class="country-search-input"
              type="text"
              placeholder="Select a country"
              autocomplete="off"
              aria-label="Select a country"
            />
            <div class="country-search-popover" id="countrySearchPopover" role="listbox" aria-label="Country suggestions"></div>
          </div>
        </div>
        <div class="header-center">
          <div class="title">Austria climate-policy comparison dashboard</div>
          <div class="subtitle" id="stateText"></div>
          <div class="hint" id="hintText">
            Tip: search/select a country (top-left) or click a dot · click the discrepancy chart to select a year
          </div>
        </div>
        <div class="header-actions">
          <button id="resetBtn" type="button">Reset</button>
        </div>
      </header>

      <main class="grid">
        <section class="panel">
          <div class="panel-title">Relation between fossil fuel subsidies and environmental taxation</div>
          <div class="panel-body" id="scatter"></div>
        </section>

        <section class="panel">
          <div class="panel-title">Climate indicators (Austria vs comparison)</div>
          <div class="panel-body" id="indicators"></div>
        </section>

        <section class="panel">
          <div class="panel-title">Taxation-Expenditure discrepancy</div>
          <div class="panel-body" id="discrepancy"></div>
        </section>

        <section class="panel">
          <div class="panel-title">Taxes vs Expenditures (detail)</div>
          <div class="panel-body" id="bars"></div>
        </section>
      </main>

      <footer class="footer">
        <div class="note">
          Units: taxes/expenditures/subsidies shown as % of GDP (for cross-country comparability).
        </div>
      </footer>
    </div>
  `

  return {
    stateText: root.querySelector('#stateText'),
    hintText: root.querySelector('#hintText'),
    resetBtn: root.querySelector('#resetBtn'),
    countrySearchInput: root.querySelector('#countrySearchInput'),
    countrySearchPopover: root.querySelector('#countrySearchPopover'),
    scatterEl: root.querySelector('#scatter'),
    indicatorsEl: root.querySelector('#indicators'),
    discrepancyEl: root.querySelector('#discrepancy'),
    barsEl: root.querySelector('#bars'),
  }
}

function normalizeText(s) {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildSearchOptions(data) {
  const year = data.scatterYear
  const out = []

  // Keep options aligned with the dot plot (countries with both values for the scatter year)
  for (const [iso3, taxRow] of data.metrics.taxes.entries()) {
    const subRow = data.metrics.subsidies.get(iso3)
    if (!subRow) continue

    // We don't import getValueAtYear here; data.js already pre-parsed series into numbers.
    const tax = taxRow.series?.find((d) => d.year === year)?.value
    const sub = subRow.series?.find((d) => d.year === year)?.value
    if (tax == null || sub == null) continue

    const name = taxRow.country
    out.push({ iso3, name, norm: normalizeText(name) })
  }

  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export async function initDashboard(rootEl) {
  const els = buildLayout(rootEl)

  const data = await loadDashboardData()

  const searchOptions = buildSearchOptions(data)

  const store = createStore({
    selectedCountryIso3: null,
    selectedYear: null,
    indicatorWindow: 'full',
  })

  function updateHeader(state) {
    if (!state.selectedCountryIso3) {
      els.stateText.textContent = 'Comparing Austria vs World average'
      els.hintText.textContent =
        'Tip: search/select a country (top-left) or click a dot · click the discrepancy chart to select a year'
      els.countrySearchInput.value = ''
      return
    }

    const name = data.countryNameByIso3.get(state.selectedCountryIso3) ?? state.selectedCountryIso3
    els.stateText.textContent = `Comparing Austria vs ${name}`
    els.hintText.textContent = 'Tip: click the discrepancy chart to select a year · Reset clears selection'
    els.countrySearchInput.value = name
  }

  store.subscribe(updateHeader)

  els.resetBtn.addEventListener('click', () => {
    store.setState({ selectedCountryIso3: null, selectedYear: null, indicatorWindow: 'full' })
  })

  let hidePopoverTimer = null

  function hidePopover() {
    els.countrySearchPopover.classList.remove('open')
    els.countrySearchPopover.innerHTML = ''
  }

  function showPopover(items) {
    if (!items || items.length === 0) {
      hidePopover()
      return
    }

    els.countrySearchPopover.classList.add('open')
    els.countrySearchPopover.innerHTML = items
      .map(
        (d) =>
          `<button type="button" class="country-suggestion" role="option" data-iso3="${d.iso3}">${d.name}</button>`,
      )
      .join('')
  }

  function updateSuggestions() {
    const q = normalizeText(els.countrySearchInput.value)
    if (!q) {
      hidePopover()
      return
    }

    const matches = []
    for (const opt of searchOptions) {
      if (opt.norm.includes(q)) matches.push(opt)
      if (matches.length >= 8) break
    }

    showPopover(matches)
  }

  els.countrySearchInput.addEventListener('input', updateSuggestions)
  els.countrySearchInput.addEventListener('focus', updateSuggestions)
  els.countrySearchInput.addEventListener('blur', () => {
    // Allow click on a suggestion before hiding.
    hidePopoverTimer = window.setTimeout(hidePopover, 120)
  })

  els.countrySearchPopover.addEventListener('mousedown', (e) => {
    // Prevent input blur from hiding the popover before click.
    e.preventDefault()
  })

  els.countrySearchPopover.addEventListener('click', (e) => {
    const btn = e.target.closest('button.country-suggestion')
    if (!btn) return
    const iso3 = btn.dataset.iso3
    if (!iso3) return
    if (hidePopoverTimer) window.clearTimeout(hidePopoverTimer)
    hidePopover()
    store.setState({ selectedCountryIso3: iso3 })
  })

  // Views
  const scatter = createScatterView({ el: els.scatterEl, data, store })
  const sm = createSmallMultiplesView({
    el: els.indicatorsEl,
    data,
    store,
    countryNameByIso3: data.countryNameByIso3,
  })
  const discrepancy = createDiscrepancyView({
    el: els.discrepancyEl,
    data,
    store,
    countryNameByIso3: data.countryNameByIso3,
  })
  const bars = createBarsView({
    el: els.barsEl,
    data,
    store,
    countryNameByIso3: data.countryNameByIso3,
  })

  // Ensure Austria is always present as a reference
  if (!data.metrics.temperature.has(AUSTRIA_ISO3)) {
    // No-op; just a guard for data issues.
    console.warn('Austria series missing in temperature dataset')
  }

  return {
    destroy() {
      scatter.destroy()
      sm.destroy()
      discrepancy.destroy()
      bars.destroy()
    },
  }
}
