import * as d3 from 'd3'
import { createTooltip } from '../tooltip.js'
import { formatNumberShort, formatPercent } from '../format.js'
import { getSeriesForCountryOrWorld } from '../data.js'

const AUSTRIA_ISO3 = 'AUT'

function extentYears(series) {
  if (!series || series.length === 0) return null
  const years = series.map((d) => d.year)
  return [d3.min(years), d3.max(years)]
}

function clipSeriesToWindow(series, minYear) {
  if (!series || series.length === 0 || minYear == null) return series
  return series.filter((d) => d.year >= minYear)
}

function computeRecentWindowStart({ aSeries, bSeries, innerWidth, innerHeight, mode }) {
  const aExt = extentYears(aSeries)
  const bExt = extentYears(bSeries)
  if (!aExt && !bExt) return null

  const maxYear = d3.max([aExt?.[1], bExt?.[1]].filter((d) => d != null))
  const minYear = d3.min([aExt?.[0], bExt?.[0]].filter((d) => d != null))
  if (maxYear == null || minYear == null) return null

  // Backwards-compat: old 'auto' behaves like '30y'
  if (mode === 'auto') mode = '30y'

  if (mode === 'full') return null

  if (mode === '20y') return Math.max(minYear, maxYear - 20)
  if (mode === '30y') return Math.max(minYear, maxYear - 30)
  if (mode === '35y') return Math.max(minYear, maxYear - 35)

  return null
}

function buildLineChart({
  container,
  title,
  yLabel,
  valueFormatter,
  getSeriesPair,
  colorA,
  colorB,
}) {
  const tooltip = createTooltip()
  const svg = d3.select(container).append('svg').attr('class', 'chart chart-sm')
  const g = svg.append('g')

  const titleEl = svg.append('text').attr('class', 'chart-title')
  const xAxisG = g.append('g').attr('class', 'axis')
  const yAxisG = g.append('g').attr('class', 'axis')
  const lineG = g.append('g')

  const yLabelEl = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')

  function render(state, data, showXAxis) {
    const width = container.clientWidth
    const height = container.clientHeight
    const margin = { top: 24, right: 12, bottom: showXAxis ? 26 : 10, left: 48 }

    svg.attr('width', width).attr('height', height)
    g.attr('transform', `translate(${margin.left},${margin.top})`)

    const innerW = Math.max(10, width - margin.left - margin.right)
    const innerH = Math.max(10, height - margin.top - margin.bottom)

    titleEl.text(title).attr('x', margin.left).attr('y', 16)

    const selected = state.selectedCountryIso3

    const [austriaSeries, compSeries, compName] = getSeriesPair({ state, data })

    const startYear = computeRecentWindowStart({
      aSeries: austriaSeries,
      bSeries: compSeries,
      innerWidth: innerW,
      innerHeight: innerH,
      mode: state.indicatorWindow ?? 'full',
    })

    const aSeriesClipped = clipSeriesToWindow(austriaSeries, startYear)
    const cSeriesClipped = clipSeriesToWindow(compSeries, startYear)

    const all = [...aSeriesClipped, ...cSeriesClipped]
    const xDomain = d3.extent(all, (d) => d.year)
    const yDomain = d3.extent(all, (d) => d.value)

    const x = d3.scaleLinear().domain(xDomain ?? [2000, 2024]).range([0, innerW])
    // A tiny padding prevents the stroke from being clipped when it hits the bounds.
    const y = d3.scaleLinear().domain(yDomain ?? [0, 1]).nice().range([innerH - 1, 1])

    if (showXAxis) {
      const tickCount = Math.max(3, Math.min(7, Math.floor(innerW / 120)))
      xAxisG
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(tickCount).tickFormat(d3.format('d')))
    } else {
      xAxisG.selectAll('*').remove()
    }

    yAxisG.call(d3.axisLeft(y).ticks(4))

    yLabelEl
      .text(yLabel)
      .attr('transform', `translate(14,${margin.top + innerH / 2}) rotate(-90)`) // absolute-ish

    const line = d3
      .line()
      .defined((d) => d.value != null)
      .x((d) => x(d.year))
      .y((d) => y(d.value))

    const paths = [
      { key: 'AUT', label: 'Austria', color: colorA, series: aSeriesClipped },
      { key: selected || 'WORLD', label: compName, color: colorB, series: cSeriesClipped },
    ]

    const pathSel = lineG.selectAll('path').data(paths, (d) => d.key)
    pathSel
      .join(
        (enter) => enter.append('path').attr('fill', 'none').attr('stroke-width', 2).attr('d', (d) => line(d.series)),
        (update) => update.transition().duration(250).attr('d', (d) => line(d.series)),
      )
      .attr('stroke', (d) => d.color)

    // Points for hover (sparse: only existing values)
    const points = paths.flatMap((p) =>
      p.series.map((d) => ({ ...d, seriesKey: p.key, label: p.label, color: p.color })),
    )

    const pt = lineG.selectAll('circle').data(points, (d) => `${d.seriesKey}-${d.year}`)
    pt.join(
      (enter) =>
        enter
          .append('circle')
          .attr('r', 3)
          .attr('fill', (d) => d.color)
          .attr('cx', (d) => x(d.year))
          .attr('cy', (d) => y(d.value))
          .attr('opacity', 0)
          .on('mouseenter', (event, d) => {
            tooltip.show(
              `<div class="tt-title">${d.label}</div>
               <div>Year: ${d.year}</div>
               <div>Value: ${valueFormatter(d.value)}</div>`,
              event.clientX,
              event.clientY,
            )
          })
          .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
          .on('mouseleave', () => tooltip.hide()),
      (update) => update.transition().duration(250).attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.value)),
      (exit) => exit.remove(),
    )

  }

  return { render, svg }
}

export function createSmallMultiplesView({ el, data, store, countryNameByIso3 }) {
  const blocks = [
    {
      key: 'temperature',
      title: 'Temperature anomaly (°C)',
      yLabel: '°C',
      valueFormatter: (v) => (v == null ? 'No data' : `${formatNumberShort(v)} °C`),
      getSeriesPair: ({ state, data }) => {
        const selected = state.selectedCountryIso3
        const austria = data.metrics.temperature.get(AUSTRIA_ISO3)?.series ?? []
        const comp = getSeriesForCountryOrWorld({
          metricByIso3: data.metrics.temperature,
          worldSeries: data.world.temperature,
          iso3: selected,
        })
        const compName = selected ? (countryNameByIso3.get(selected) ?? selected) : 'World average'
        return [austria, comp, compName]
      },
    },
    {
      key: 'disasters',
      title: 'Climate disaster frequency (#/year)',
      yLabel: '#/year',
      valueFormatter: (v) => (v == null ? 'No data' : formatNumberShort(v)),
      getSeriesPair: ({ state, data }) => {
        const selected = state.selectedCountryIso3
        const austria = data.metrics.disasters.get(AUSTRIA_ISO3)?.series ?? []
        const comp = getSeriesForCountryOrWorld({
          metricByIso3: data.metrics.disasters,
          worldSeries: data.world.disasters,
          iso3: selected,
        })
        const compName = selected ? (countryNameByIso3.get(selected) ?? selected) : 'World average'
        return [austria, comp, compName]
      },
    },
    {
      key: 'taxes',
      title: 'Environmental taxes (% of GDP)',
      yLabel: '% of GDP',
      valueFormatter: (v) => formatPercent(v),
      getSeriesPair: ({ state, data }) => {
        const selected = state.selectedCountryIso3
        const austria = data.metrics.taxes.get(AUSTRIA_ISO3)?.series ?? []
        const comp = getSeriesForCountryOrWorld({
          metricByIso3: data.metrics.taxes,
          worldSeries: data.world.taxes,
          iso3: selected,
        })
        const compName = selected ? (countryNameByIso3.get(selected) ?? selected) : 'World average'
        return [austria, comp, compName]
      },
    },
  ]

  el.innerHTML = ''

  const topBar = document.createElement('div')
  topBar.className = 'indicators-topbar'
  topBar.innerHTML = `
    <div class="indicators-legend" id="indLegend"></div>
    <div class="btn-group" id="winGroup">
      <button type="button" data-win="20y">20y</button>
      <button type="button" data-win="30y">30y</button>
      <button type="button" data-win="35y">35y</button>
      <button type="button" data-win="full">Full</button>
    </div>
  `
  el.appendChild(topBar)

  const legendEl = topBar.querySelector('#indLegend')
  const winGroup = topBar.querySelector('#winGroup')

  const containers = blocks.map(() => {
    const div = document.createElement('div')
    div.className = 'sm-block'
    el.appendChild(div)
    return div
  })

  const charts = blocks.map((b, idx) =>
    buildLineChart({
      container: containers[idx],
      title: b.title,
      yLabel: b.yLabel,
      valueFormatter: b.valueFormatter,
      getSeriesPair: b.getSeriesPair,
      colorA: 'var(--color-austria)',
      colorB: 'var(--color-selected)',
    }),
  )

  function render(state) {
    // Update legend text (kept outside SVG so it never overlaps axes)
    const selected = state.selectedCountryIso3
    const compName = selected ? (countryNameByIso3.get(selected) ?? selected) : 'World average'

    legendEl.innerHTML = `
      <span class="legend-item"><span class="swatch" style="background: var(--color-austria)"></span>Austria</span>
      <span class="legend-item"><span class="swatch" style="background: var(--color-selected)"></span>${compName}</span>
    `

    // Update active window button
    let mode = state.indicatorWindow ?? 'full'
    if (mode === 'auto') mode = '30y'
    winGroup.querySelectorAll('button[data-win]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.win === mode)
    })

    charts.forEach((c, i) => c.render(state, data, i === charts.length - 1))
  }

  winGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-win]')
    if (!btn) return
    store.setState({ indicatorWindow: btn.dataset.win })
  })

  const unsub = store.subscribe(render)
  window.addEventListener('resize', () => render(store.getState()))

  return {
    destroy() {
      unsub()
      charts.forEach((c) => c.svg.remove())
    },
  }
}
