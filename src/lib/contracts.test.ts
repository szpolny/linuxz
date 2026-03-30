import { describe, expect, it } from 'vitest'
import { AppBootstrapSchema } from './contracts.ts'

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
