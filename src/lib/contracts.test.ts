import { describe, expect, it } from 'vitest'
import { AppBootstrapSchema, ServerLibrarySchema } from './contracts.ts'

describe('AppBootstrapSchema', () => {
  it('parses a valid bootstrap payload', () => {
    const parsed = AppBootstrapSchema.parse({
      detectedSteamInstalls: [],
      selectedSteamInstallId: null,
      dayzInstall: null,
      compatdataReady: false,
      workshopManifestReady: false,
      availableLaunchModes: ['directProton'],
      settings: {
        onboardingCompleted: false,
        defaultPlayerName: 'survivor',
        launchMode: 'directProton',
        preferredSteamInstallId: null,
        preferredProtonPath: null,
        customLaunchCommand: null,
        enableBattlemetrics: true,
        enableDzsaProvider: true,
      },
      warnings: [],
    })

    expect(parsed.availableLaunchModes).toEqual(['directProton'])
  })
})

describe('ServerLibrarySchema', () => {
  it('fills activity defaults for stored server records', () => {
    const parsed = ServerLibrarySchema.parse({
      favorites: [
        {
          endpoint: '1.2.3.4:2305',
          ip: '1.2.3.4',
          queryPort: 2305,
          connectPort: 2302,
          displayName: 'Alpha',
          map: 'chernarusplus',
          players: 20,
          maxPlayers: 60,
          ping: 48,
          sourceCoverage: ['battlemetrics'],
          readiness: 'live',
          version: '1.26',
          country: 'PL',
          hasPassword: false,
          modded: true,
        },
      ],
      recents: [],
    })

    const favorite = parsed.favorites[0]!
    expect(favorite.isFavorite).toBe(false)
    expect(favorite.lastJoinedAt).toBeNull()
  })
})
