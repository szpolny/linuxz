import { defaultListServersRequest, type ListServersRequest } from '../lib/contracts.ts'

export function parseBrowserFilters(params: URLSearchParams): ListServersRequest {
  const playerFloorValue = params.get('playerFloor')
  const limitValue = params.get('limit')
  const pageValue = params.get('page')
  const playerFloor = playerFloorValue ? Number(playerFloorValue) : defaultListServersRequest.playerFloor
  const limit = limitValue ? Number(limitValue) : defaultListServersRequest.limit
  const page = pageValue ? Number(pageValue) : defaultListServersRequest.page

  return {
    search: params.get('search') ?? defaultListServersRequest.search,
    moddedOnly: params.get('moddedOnly') === 'true',
    playerFloor: Number.isFinite(playerFloor) ? Math.max(0, Math.trunc(playerFloor)) : defaultListServersRequest.playerFloor,
    limit: Number.isFinite(limit) ? Math.max(10, Math.trunc(limit)) : defaultListServersRequest.limit,
    page: Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : defaultListServersRequest.page,
    sortBy: params.get('sortBy') === 'ping' ? 'ping' : defaultListServersRequest.sortBy,
  }
}

export function toBrowserSearchParams(filters: ListServersRequest): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search) {
    params.set('search', filters.search)
  }
  if (filters.moddedOnly) {
    params.set('moddedOnly', 'true')
  }
  if (filters.playerFloor > 0) {
    params.set('playerFloor', String(filters.playerFloor))
  }
  if (filters.limit !== defaultListServersRequest.limit) {
    params.set('limit', String(filters.limit))
  }
  if (filters.page !== defaultListServersRequest.page) {
    params.set('page', String(filters.page))
  }
  if (filters.sortBy !== defaultListServersRequest.sortBy) {
    params.set('sortBy', filters.sortBy)
  }
  return params
}
