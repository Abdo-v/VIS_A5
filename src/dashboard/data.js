import * as d3 from 'd3'
import { parseMaybeNumber } from './format.js'

function assetUrl(path) {
  const base = import.meta.env.BASE_URL ?? '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = String(path ?? '').replace(/^\//, '')
  return `${normalizedBase}${normalizedPath}`
}

const ISO3_RE = /^[A-Z]{3}$/

function isCountryRow(row) {
  const iso3 = String(row.ISO3 ?? '').trim()
  return ISO3_RE.test(iso3)
}

function extractYearColumns(row) {
  return Object.keys(row)
    .filter((k) => /^\d{4}$/.test(k))
    .map(Number)
    .sort((a, b) => a - b)
}

function rowToSeries(row) {
  const years = extractYearColumns(row)
  const series = years
    .map((year) => ({ year, value: parseMaybeNumber(row[String(year)]) }))
    .filter((d) => d.value != null)

  return series
}

async function loadWideSeries({ url, indicatorMatch, unitMatch, extraFilter }) {
  const rows = await d3.csv(url)

  const matched = rows.filter((row) => {
    if (!isCountryRow(row)) return false

    const indicator = String(row.Indicator ?? '').trim()
    const unit = String(row.Unit ?? '').trim()

    if (indicatorMatch && indicator !== indicatorMatch) return false
    if (unitMatch && unit !== unitMatch) return false

    if (extraFilter && !extraFilter(row)) return false

    return true
  })

  const byIso3 = new Map()
  const countryNameByIso3 = new Map()

  for (const row of matched) {
    const iso3 = String(row.ISO3).trim()
    const iso2 = String(row.ISO2 ?? '').trim()
    const country = String(row.Country ?? '').trim()

    countryNameByIso3.set(iso3, country)

    // Some files can have duplicates. Prefer the row with more datapoints.
    const series = rowToSeries(row)
    const existing = byIso3.get(iso3)
    if (!existing || series.length > existing.series.length) {
      byIso3.set(iso3, {
        iso3,
        iso2,
        country,
        indicator: String(row.Indicator ?? '').trim(),
        unit: String(row.Unit ?? '').trim(),
        series,
      })
    }
  }

  return { byIso3, countryNameByIso3 }
}

function seriesToYearMap(series) {
  const m = new Map()
  for (const d of series) m.set(d.year, d.value)
  return m
}

function computeWorldAverage(metricByIso3) {
  const allYears = new Set()
  for (const { series } of metricByIso3.values()) {
    for (const { year } of series) allYears.add(year)
  }

  const years = Array.from(allYears).sort((a, b) => a - b)
  const worldSeries = []

  for (const year of years) {
    let sum = 0
    let count = 0
    for (const { series } of metricByIso3.values()) {
      const val = seriesToYearMap(series).get(year)
      if (val != null) {
        sum += val
        count += 1
      }
    }
    if (count > 0) {
      worldSeries.push({ year, value: sum / count })
    }
  }

  return worldSeries
}

function collectYears(metricByIso3) {
  const years = new Set()
  for (const { series } of metricByIso3.values()) {
    for (const d of series) years.add(d.year)
  }
  return years
}

function countCountriesWithBoth({ taxesByIso3, subsidiesByIso3, year }) {
  let count = 0
  for (const [iso3, t] of taxesByIso3.entries()) {
    const s = subsidiesByIso3.get(iso3)
    if (!s) continue

    const tVal = seriesToYearMap(t.series).get(year)
    const sVal = seriesToYearMap(s.series).get(year)
    if (tVal != null && sVal != null) count += 1
  }
  return count
}

function pickScatterYear({ taxesByIso3, subsidiesByIso3 }) {
  const taxesYears = collectYears(taxesByIso3)
  const subsYears = collectYears(subsidiesByIso3)

  const candidates = Array.from(taxesYears)
    .filter((y) => subsYears.has(y))
    .sort((a, b) => a - b)

  if (candidates.length === 0) return null

  let bestYear = candidates[0]
  let bestCount = -1

  for (const year of candidates) {
    const count = countCountriesWithBoth({ taxesByIso3, subsidiesByIso3, year })
    if (count > bestCount || (count === bestCount && year > bestYear)) {
      bestYear = year
      bestCount = count
    }
  }

  return bestYear
}

export async function loadDashboardData() {
  // NOTE: Using % of GDP for taxes/expenditure/subsidies so values are comparable across countries.

  const [taxes, expenditures, subsidies, disasters, temperature] = await Promise.all([
    loadWideSeries({
      url: assetUrl('data/07_Environmental_Taxes.csv'),
      indicatorMatch: 'Environmental Taxes',
      unitMatch: 'Percent of GDP',
    }),
    loadWideSeries({
      url: assetUrl('data/08_Environmental_Protection_Expenditures.csv'),
      indicatorMatch: 'Expenditure on environment protection',
      unitMatch: 'Percent of GDP',
    }),
    loadWideSeries({
      url: assetUrl('data/09_Fossil_Fuel_Subsidies.csv'),
      indicatorMatch: 'Fossil Fuel Subsidies - Total Implicit and Explicit',
      unitMatch: 'Percent of GDP',
    }),
    loadWideSeries({
      url: assetUrl('data/14_Climate-related_Disasters_Frequency.csv'),
      indicatorMatch: 'Climate related disasters frequency, Number of Disasters: TOTAL',
      unitMatch: 'Number of',
    }),
    loadWideSeries({
      url: assetUrl('data/23_Annual_Surface_Temperature_Change.csv'),
      indicatorMatch:
        'Temperature change with respect to a baseline climatology, corresponding to the period 1951-1980',
      unitMatch: 'Degree Celsius',
    }),
  ])

  // Merge country names; taxes has broad coverage.
  const countryNameByIso3 = new Map([...(taxes.countryNameByIso3 ?? []), ...(temperature.countryNameByIso3 ?? [])])

  const world = {
    taxes: computeWorldAverage(taxes.byIso3),
    expenditures: computeWorldAverage(expenditures.byIso3),
    subsidies: computeWorldAverage(subsidies.byIso3),
    disasters: computeWorldAverage(disasters.byIso3),
    temperature: computeWorldAverage(temperature.byIso3),
  }

  const scatterYear = pickScatterYear({ taxesByIso3: taxes.byIso3, subsidiesByIso3: subsidies.byIso3 })

  return {
    metrics: {
      taxes: taxes.byIso3,
      expenditures: expenditures.byIso3,
      subsidies: subsidies.byIso3,
      disasters: disasters.byIso3,
      temperature: temperature.byIso3,
    },
    world,
    countryNameByIso3,
    scatterYear,
  }
}

export function getSeriesForCountryOrWorld({ metricByIso3, worldSeries, iso3 }) {
  if (!iso3) return worldSeries
  const row = metricByIso3.get(iso3)
  return row?.series ?? []
}

export function getValueAtYear(series, year) {
  if (!year) return null
  for (const d of series) {
    if (d.year === year) return d.value
  }
  return null
}
