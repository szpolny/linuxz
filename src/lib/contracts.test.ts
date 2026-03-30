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
      availableLaunchModes: ['steamHandoff'],
      settings: {
        defaultPlayerName: 'survivor',
        launchMode: 'steamHandoff',
        preferredSteamInstallId: null,
        preferredProtonPath: null,
        enableBattlemetrics: true,
        enableDzsaExperimental: false,
      },
      warnings: [],
    })

    expect(parsed.availableLaunchModes).toEqual(['steamHandoff'])
  })
})
