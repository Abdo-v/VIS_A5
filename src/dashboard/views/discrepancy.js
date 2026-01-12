import * as d3 from 'd3'
import { createTooltip } from '../tooltip.js'
import { formatPercent, formatSignedNumberShort } from '../format.js'
import { getSeriesForCountryOrWorld } from '../data.js'

const AUSTRIA_ISO3 = 'AUT'

function computeDiscrepancySeries({ taxesSeries, expSeries }) {
  const taxByYear = new Map(taxesSeries.map((d) => [d.year, d.value]))
  const expByYear = new Map(expSeries.map((d) => [d.year, d.value]))

  const years = Array.from(new Set([...taxByYear.keys(), ...expByYear.keys()])).sort((a, b) => a - b)

  const out = []
  for (const year of years) {
    const t = taxByYear.get(year)
    const e = expByYear.get(year)
    if (t == null || e == null) continue
    out.push({ year, value: t - e, taxes: t, expenditures: e })
  }
  return out
}

export function createDiscrepancyView({ el, data, store, countryNameByIso3 }) {
  const tooltip = createTooltip()

  el.innerHTML = ''
  el.classList.add('with-topbar')

  const topBar = document.createElement('div')
  topBar.className = 'indicators-topbar'
  topBar.innerHTML = `<div class="indicators-legend" id="discLegend"></div>`
  el.appendChild(topBar)
  const legendEl = topBar.querySelector('#discLegend')

  const svg = d3.select(el).append('svg').attr('class', 'chart')
  const g = svg.append('g')

  const xAxisG = g.append('g').attr('class', 'axis')
  const yAxisG = g.append('g').attr('class', 'axis')

  const title = svg.append('text').attr('class', 'chart-title').attr('text-anchor', 'middle')

  const xLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')

  const baseline = g.append('line').attr('class', 'zero-line')
  const marker = g.append('line').attr('class', 'year-marker')

  const lineG = g.append('g')

  function render(state) {
    const width = el.clientWidth
    const height = el.clientHeight
    const margin = { top: 28, right: 16, bottom: 44, left: 60 }

    svg.attr('width', width).attr('height', height)
    g.attr('transform', `translate(${margin.left},${margin.top})`)

    const innerW = Math.max(10, width - margin.left - margin.right)
    const innerH = Math.max(10, height - margin.top - margin.bottom)

    title.text('Taxation–Expenditure discrepancy').attr('x', width / 2).attr('y', 18)

    const selected = state.selectedCountryIso3
    const compName = selected ? (countryNameByIso3.get(selected) ?? selected) : 'World average'

    legendEl.innerHTML = `
      <span class="legend-item"><span class="swatch" style="background: var(--color-austria)"></span>Austria</span>
      <span class="legend-item"><span class="swatch" style="background: var(--color-selected)"></span>${compName}</span>
    `

    const aTaxes = data.metrics.taxes.get(AUSTRIA_ISO3)?.series ?? []
    const aExp = data.metrics.expenditures.get(AUSTRIA_ISO3)?.series ?? []
    const aDisc = computeDiscrepancySeries({ taxesSeries: aTaxes, expSeries: aExp })

    const cTaxes = getSeriesForCountryOrWorld({
      metricByIso3: data.metrics.taxes,
      worldSeries: data.world.taxes,
      iso3: selected,
    })
    const cExp = getSeriesForCountryOrWorld({
      metricByIso3: data.metrics.expenditures,
      worldSeries: data.world.expenditures,
      iso3: selected,
    })
    const cDisc = computeDiscrepancySeries({ taxesSeries: cTaxes, expSeries: cExp })

    const all = [...aDisc, ...cDisc]
    const xDomain = d3.extent(all, (d) => d.year)
    const yDomain = d3.extent(all, (d) => d.value)

    const x = d3.scaleLinear().domain(xDomain ?? [1995, 2022]).range([0, innerW])
    const y = d3.scaleLinear().domain(yDomain ?? [-1, 1]).nice().range([innerH, 0])

    xAxisG.attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(7).tickFormat(d3.format('d')))
    yAxisG.call(d3.axisLeft(y).ticks(5))

    xLabel.text('Year').attr('x', margin.left + innerW / 2).attr('y', height - 10)

    yLabel
      .text('Taxes – Expenditure (% of GDP)')
      .attr('transform', `translate(16,${margin.top + innerH / 2}) rotate(-90)`) // absolute-ish

    baseline
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', y(0))
      .attr('y2', y(0))

    const line = d3
      .line()
      .defined((d) => d.value != null)
      .x((d) => x(d.year))
      .y((d) => y(d.value))

    const lines = [
      { key: 'AUT', label: 'Austria', color: 'var(--color-austria)', series: aDisc },
      { key: selected || 'WORLD', label: compName, color: 'var(--color-selected)', series: cDisc },
    ]

    const pathSel = lineG.selectAll('path').data(lines, (d) => d.key)
    pathSel
      .join(
        (enter) => enter.append('path').attr('fill', 'none').attr('stroke-width', 2).attr('d', (d) => line(d.series)),
        (update) => update.transition().duration(250).attr('d', (d) => line(d.series)),
        (exit) => exit.remove(),
      )
      .attr('stroke', (d) => d.color)

    // Year marker
    if (state.selectedYear === null) {
      marker.attr('display', 'none')
    } else {
      marker
        .attr('display', null)
        .attr('x1', x(state.selectedYear))
        .attr('x2', x(state.selectedYear))
        .attr('y1', 0)
        .attr('y2', innerH)
    }

    // Click overlay for selecting year
    const overlay = g.selectAll('rect.overlay').data([null])
    overlay
      .join((enter) => enter.append('rect').attr('class', 'overlay'))
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event)
        const year = Math.round(x.invert(mx))

        // Find closest data point for Austria for tooltip reference.
        const a = aDisc.reduce(
          (best, d) => {
            if (!best) return d
            return Math.abs(d.year - year) < Math.abs(best.year - year) ? d : best
          },
          null,
        )

        if (!a) return

        tooltip.show(
          `<div class="tt-title">Discrepancy</div>
           <div>Year: ${a.year}</div>
           <div>Austria: ${formatSignedNumberShort(a.value)} (${formatPercent(a.value)})</div>
           <div>Taxes: ${formatPercent(a.taxes)} | Expenditure: ${formatPercent(a.expenditures)}</div>`,
          event.clientX,
          event.clientY,
        )
      })
      .on('mouseleave', () => tooltip.hide())
      .on('click', (event) => {
        const [mx] = d3.pointer(event)
        const year = Math.round(x.invert(mx))
        store.setState({ selectedYear: year })
      })

  }

  const unsub = store.subscribe(render)
  window.addEventListener('resize', () => render(store.getState()))

  return {
    destroy() {
      unsub()
      svg.remove()
    },
  }
}
