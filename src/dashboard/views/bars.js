import * as d3 from 'd3'
import { createTooltip } from '../tooltip.js'
import { formatPercent } from '../format.js'
import { getSeriesForCountryOrWorld, getValueAtYear } from '../data.js'

const AUSTRIA_ISO3 = 'AUT'

function pickDefaultYear({ taxesSeries, expSeries }) {
  const years = new Set()
  for (const d of taxesSeries) years.add(d.year)
  for (const d of expSeries) years.add(d.year)

  const sorted = Array.from(years).sort((a, b) => b - a)
  for (const y of sorted) {
    const t = getValueAtYear(taxesSeries, y)
    const e = getValueAtYear(expSeries, y)
    if (t != null && e != null) return y
  }
  return null
}

export function createBarsView({ el, data, store, countryNameByIso3 }) {
  const tooltip = createTooltip()

  el.innerHTML = ''
  el.classList.add('with-topbar')

  const topBar = document.createElement('div')
  topBar.className = 'indicators-topbar'
  topBar.innerHTML = `
    <div class="indicators-legend" id="barsLegend">
      <span class="legend-item"><span class="swatch" style="background: var(--color-tax)"></span>Taxes</span>
      <span class="legend-item"><span class="swatch" style="background: var(--color-exp)"></span>Expenditures</span>
    </div>
  `
  el.appendChild(topBar)

  const chartHost = document.createElement('div')
  chartHost.className = 'chart-host'
  el.appendChild(chartHost)

  const svg = d3.select(chartHost).append('svg').attr('class', 'chart')
  const g = svg.append('g')

  const title = svg.append('text').attr('class', 'chart-title').attr('text-anchor', 'middle')
  const xAxisG = g.append('g').attr('class', 'axis')
  const yAxisG = g.append('g').attr('class', 'axis')

  const xLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')

  function render(state) {
    const width = chartHost.clientWidth
    const height = chartHost.clientHeight
    const margin = { top: 28, right: 16, bottom: 44, left: 54 }

    svg.attr('width', width).attr('height', height)
    g.attr('transform', `translate(${margin.left},${margin.top})`)

    const innerW = Math.max(10, width - margin.left - margin.right)
    const innerH = Math.max(10, height - margin.top - margin.bottom)

    const selected = state.selectedCountryIso3
    const compName = selected ? (countryNameByIso3.get(selected) ?? selected) : 'World average'

    const aTaxes = data.metrics.taxes.get(AUSTRIA_ISO3)?.series ?? []
    const aExp = data.metrics.expenditures.get(AUSTRIA_ISO3)?.series ?? []

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

    const defaultYear = pickDefaultYear({ taxesSeries: aTaxes, expSeries: aExp })
    const year = state.selectedYear ?? defaultYear

    title.text(`Detail: Taxes vs Expenditures (${year ?? 'N/A'})`).attr('x', width / 2).attr('y', 18)

    const rows = [
      {
        group: 'Austria',
        seriesKey: 'AUT',
        taxes: getValueAtYear(aTaxes, year),
        expenditures: getValueAtYear(aExp, year),
      },
      {
        group: compName,
        seriesKey: selected || 'WORLD',
        taxes: getValueAtYear(cTaxes, year),
        expenditures: getValueAtYear(cExp, year),
      },
    ]

    const barData = rows.flatMap((r) => [
      { group: r.group, seriesKey: r.seriesKey, metric: 'Taxes', value: r.taxes, color: 'var(--color-tax)' },
      {
        group: r.group,
        seriesKey: r.seriesKey,
        metric: 'Expenditures',
        value: r.expenditures,
        color: 'var(--color-exp)',
      },
    ])

    const maxY = d3.max(barData, (d) => (d.value == null ? 0 : d.value)) ?? 1

    const x0 = d3.scaleBand().domain(rows.map((r) => r.group)).range([0, innerW]).paddingInner(0.25)
    const x1 = d3.scaleBand().domain(['Taxes', 'Expenditures']).range([0, x0.bandwidth()]).padding(0.2)

    const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0])

    xAxisG.attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x0).tickSizeOuter(0))
    yAxisG.call(d3.axisLeft(y).ticks(5))

    xLabel.text('Comparison group').attr('x', margin.left + innerW / 2).attr('y', height - 10)
    yLabel
      .text('% of GDP')
      .attr('transform', `translate(14,${margin.top + innerH / 2}) rotate(-90)`) // absolute-ish

    const yPos = (d) => (d.value == null ? innerH : y(d.value))
    const barHeight = (d) => (d.value == null ? 0 : innerH - y(d.value))

    const bars = g.selectAll('rect.bar').data(barData, (d) => `${d.seriesKey}-${d.metric}`)

    bars
      .join(
        (enter) =>
          enter
            .append('rect')
            .attr('class', 'bar')
            .attr('x', (d) => x0(d.group) + x1(d.metric))
            .attr('width', x1.bandwidth())
            .attr('y', innerH)
            .attr('height', 0)
            .attr('fill', (d) => d.color)
            .on('mouseenter', (event, d) => {
              tooltip.show(
                `<div class="tt-title">${d.group}</div>
                 <div>Year: ${year}</div>
                 <div>${d.metric}: ${formatPercent(d.value)}</div>`,
                event.clientX,
                event.clientY,
              )
            })
            .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
            .on('mouseleave', () => tooltip.hide())
            .call((sel) =>
              sel
                .transition()
                .duration(350)
                .attr('y', yPos)
                .attr('height', barHeight),
            ),
        (update) =>
          update
            .transition()
            .duration(350)
            .attr('x', (d) => x0(d.group) + x1(d.metric))
            .attr('width', x1.bandwidth())
            .attr('y', yPos)
            .attr('height', barHeight),
        (exit) => exit.remove(),
      )

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
