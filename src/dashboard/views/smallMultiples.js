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

function computeRecentWindowStart({ aSeries, bSeries, innerWidth, innerHeight }) {
  const aExt = extentYears(aSeries)
  const bExt = extentYears(bSeries)
  if (!aExt && !bExt) return null

  const maxYear = d3.max([aExt?.[1], bExt?.[1]].filter((d) => d != null))
  const minYear = d3.min([aExt?.[0], bExt?.[0]].filter((d) => d != null))
  if (maxYear == null || minYear == null) return null

  // If the chart is small, shorten the time window to keep the line readable.
  const cramped = innerWidth < 420 || innerHeight < 105
  const yearsToShow = cramped ? 20 : 35
  const start = Math.max(minYear, maxYear - yearsToShow)

  return start
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
    })

    const aSeriesClipped = clipSeriesToWindow(austriaSeries, startYear)
    const cSeriesClipped = clipSeriesToWindow(compSeries, startYear)

    const all = [...aSeriesClipped, ...cSeriesClipped]
    const xDomain = d3.extent(all, (d) => d.year)
    const yDomain = d3.extent(all, (d) => d.value)

    const x = d3.scaleLinear().domain(xDomain ?? [2000, 2024]).range([0, innerW])
    const y = d3.scaleLinear().domain(yDomain ?? [0, 1]).nice().range([innerH, 0])

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

    // Tiny legend text
    svg
      .selectAll('text.sm-legend')
      .data([
        { label: 'Austria', color: colorA },
        { label: compName, color: colorB },
      ])
      .join((enter) => enter.append('text').attr('class', 'sm-legend'), (update) => update)
      .attr('x', (d, i) => margin.left + i * 140)
      .attr('y', height - 6)
      .text((d) => d.label)
      .attr('fill', (d) => d.color)
      .style('font-size', '11px')
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
    charts.forEach((c, i) => c.render(state, data, i === charts.length - 1))
  }

  const unsub = store.subscribe(render)
  window.addEventListener('resize', () => render(store.getState()))

  return {
    destroy() {
      unsub()
      charts.forEach((c) => c.svg.remove())
    },
  }
}
