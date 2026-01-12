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
        <div class="header-spacer" aria-hidden="true"></div>
        <div class="header-center">
          <div class="title">Austria climate-policy comparison dashboard</div>
          <div class="subtitle" id="stateText"></div>
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
    resetBtn: root.querySelector('#resetBtn'),
    scatterEl: root.querySelector('#scatter'),
    indicatorsEl: root.querySelector('#indicators'),
    discrepancyEl: root.querySelector('#discrepancy'),
    barsEl: root.querySelector('#bars'),
  }
}

export async function initDashboard(rootEl) {
  const els = buildLayout(rootEl)

  const data = await loadDashboardData()

  const store = createStore({
    selectedCountryIso3: null,
    selectedYear: null,
    indicatorWindow: 'full',
  })

  function updateHeader(state) {
    if (!state.selectedCountryIso3) {
      els.stateText.textContent = 'Comparing Austria vs World average'
      return
    }

    const name = data.countryNameByIso3.get(state.selectedCountryIso3) ?? state.selectedCountryIso3
    els.stateText.textContent = `Comparing Austria vs ${name}`
  }

  store.subscribe(updateHeader)

  els.resetBtn.addEventListener('click', () => {
    store.setState({ selectedCountryIso3: null, selectedYear: null, indicatorWindow: 'full' })
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
