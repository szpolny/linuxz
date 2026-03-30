import { describe, expect, it } from 'vitest'
import { parseBrowserFilters, toBrowserSearchParams } from './filters.ts'

describe('browser filters', () => {
  it('round-trips meaningful filter fields', () => {
    const params = toBrowserSearchParams({
      search: 'chernarus',
      moddedOnly: true,
      officialOnly: false,
      playerFloor: 30,
      limit: 40,
      page: 3,
      sortBy: 'ping',
    })

    expect(parseBrowserFilters(params)).toEqual({
      search: 'chernarus',
      moddedOnly: true,
      officialOnly: false,
      playerFloor: 30,
      limit: 40,
      page: 3,
      sortBy: 'ping',
    })
  })
})
