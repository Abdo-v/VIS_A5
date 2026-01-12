import * as d3 from 'd3'
import { createTooltip } from '../tooltip.js'
import { formatNumberShort, formatPercent } from '../format.js'
import { getValueAtYear } from '../data.js'

const AUSTRIA_ISO3 = 'AUT'

function dotClass(iso3, selected) {
  if (iso3 === AUSTRIA_ISO3) return 'dot dot-austria'
  if (iso3 === selected) return 'dot dot-selected'
  return 'dot'
}

function dotRadius(iso3, selected) {
  return iso3 === AUSTRIA_ISO3 || iso3 === selected ? 6 : 4
}

function titleText(d, formatNumberShort) {
  return `${d.country} — subsidies ${formatNumberShort(d.x)}, taxes ${formatNumberShort(d.y)}`
}

export function createScatterView({ el, data, store }) {
  const tooltip = createTooltip()

  const svg = d3.select(el).append('svg').attr('class', 'chart')
  const g = svg.append('g')

  const xAxisG = g.append('g').attr('class', 'axis')
  const yAxisG = g.append('g').attr('class', 'axis')

  const xLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')

  const subtitle = svg.append('text').attr('class', 'chart-subtitle').attr('text-anchor', 'middle')

  const pointsG = g.append('g')

  function render(state) {
    const width = el.clientWidth
    const height = el.clientHeight
    const margin = { top: 28, right: 18, bottom: 48, left: 54 }

    svg.attr('width', width).attr('height', height)
    g.attr('transform', `translate(${margin.left},${margin.top})`)

    const innerW = Math.max(10, width - margin.left - margin.right)
    const innerH = Math.max(10, height - margin.top - margin.bottom)

    const year = data.scatterYear
    subtitle.text(`Year: ${year ?? 'N/A'} (latest common year)`).attr('x', width / 2).attr('y', 18)

    const rows = []

    for (const [iso3, taxRow] of data.metrics.taxes.entries()) {
      const subRow = data.metrics.subsidies.get(iso3)
      if (!subRow) continue

      const tax = getValueAtYear(taxRow.series, year)
      const sub = getValueAtYear(subRow.series, year)
      if (tax == null || sub == null) continue

      rows.push({
        iso3,
        country: taxRow.country,
        x: sub,
        y: tax,
      })
    }

    const x = d3
      .scaleLinear()
      .domain(d3.extent(rows, (d) => d.x) ?? [0, 1])
      .nice()
      .range([0, innerW])

    const y = d3
      .scaleLinear()
      .domain(d3.extent(rows, (d) => d.y) ?? [0, 1])
      .nice()
      .range([innerH, 0])

    xAxisG.attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5))
    yAxisG.call(d3.axisLeft(y).ticks(5))

    xLabel
      .text('Fossil fuel subsidies (% of GDP)')
      .attr('x', margin.left + innerW / 2)
      .attr('y', height - 10)

    yLabel
      .text('Environmental taxes (% of GDP)')
      .attr('transform', `translate(14,${margin.top + innerH / 2}) rotate(-90)`) // absolute-ish

    const selected = state.selectedCountryIso3

    const dots = pointsG.selectAll('circle').data(rows, (d) => d.iso3)

    const joined = dots
      .join(
        (enter) =>
          enter
            .append('circle')
            .attr('r', 4)
            .attr('cx', (d) => x(d.x))
            .attr('cy', (d) => y(d.y))
            .attr('tabindex', 0)
            .on('mouseenter', (event, d) => {
              tooltip.show(
                `<div class="tt-title">${d.country}</div>
                 <div>Year: ${year}</div>
                 <div>Subsidies: ${formatPercent(d.x)}</div>
                 <div>Taxes: ${formatPercent(d.y)}</div>`,
                event.clientX,
                event.clientY,
              )
            })
            .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
            .on('mouseleave', () => tooltip.hide())
            .on('click', (_event, d) => store.setState({ selectedCountryIso3: d.iso3 })),
        (update) =>
          update
            .transition()
            .duration(250)
            .attr('cx', (d) => x(d.x))
            .attr('cy', (d) => y(d.y)),
        (exit) => exit.remove(),
      )
      .attr('class', (d) => dotClass(d.iso3, selected))
      .attr('r', (d) => dotRadius(d.iso3, selected))

    joined.selectAll('title').remove()
    joined.append('title').text((d) => titleText(d, formatNumberShort))
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
