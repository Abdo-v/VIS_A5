import * as d3 from 'd3'

export const formatYear = d3.format('d')

export function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return 'No data'
  return `${d3.format('.2f')(value)}%`
}

export function formatNumberShort(value) {
  if (value == null || Number.isNaN(value)) return 'No data'

  const abs = Math.abs(value)
  if (abs >= 1e9) return `${d3.format('.2f')(value / 1e9)}B`
  if (abs >= 1e6) return `${d3.format('.2f')(value / 1e6)}M`
  if (abs >= 1e3) return `${d3.format('.2f')(value / 1e3)}K`
  if (abs >= 10) return d3.format('.1f')(value)
  return d3.format('.2f')(value)
}

export function formatSignedNumberShort(value) {
  if (value == null || Number.isNaN(value)) return 'No data'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumberShort(value)}`
}

export function parseMaybeNumber(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (trimmed === '') return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}
