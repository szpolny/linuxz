import { z } from 'zod'

export const LaunchModeSchema = z.literal('directProton')

export const SteamInstallSchema = z.object({
  id: z.string(),
  kind: z.string(),
  rootPath: z.string(),
  libraryPaths: z.array(z.string()),
  hasDayz: z.boolean(),
  hasWorkshopManifest: z.boolean(),
})

export const DayzInstallSchema = z.object({
  gamePath: z.string(),
  appManifestPath: z.string(),
  workshopManifestPath: z.string(),
  compatDataPath: z.string(),
  documentsPath: z.string(),
  launcherPresetPath: z.string(),
})

export const LaunchSettingsSchema = z.object({
  onboardingCompleted: z.boolean(),
  defaultPlayerName: z.string(),
  launchMode: LaunchModeSchema,
  preferredSteamInstallId: z.string().nullable(),
  preferredProtonPath: z.string().nullable(),
  customLaunchCommand: z.string().nullable(),
  enableBattlemetrics: z.boolean(),
  enableDzsaProvider: z.boolean(),
})

export const AppBootstrapSchema = z.object({
  detectedSteamInstalls: z.array(SteamInstallSchema),
  selectedSteamInstallId: z.string().nullable(),
  dayzInstall: DayzInstallSchema.nullable(),
  compatdataReady: z.boolean(),
  workshopManifestReady: z.boolean(),
  availableLaunchModes: z.array(LaunchModeSchema),
  settings: LaunchSettingsSchema,
  warnings: z.array(z.string()),
})

export const ServerRecordSchema = z.object({
  endpoint: z.string(),
  ip: z.string(),
  queryPort: z.number().int().nonnegative(),
  connectPort: z.number().int().nonnegative().nullable(),
  displayName: z.string(),
  map: z.string(),
  players: z.number().int().nonnegative(),
  maxPlayers: z.number().int().nonnegative(),
  ping: z.number().int().nonnegative().nullable(),
  sourceCoverage: z.array(z.string()),
  readiness: z.string(),
  version: z.string().nullable(),
  country: z.string().nullable(),
  hasPassword: z.boolean(),
  modded: z.boolean(),
  official: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  lastJoinedAt: z.string().nullable().default(null),
})

export const ServerSortSchema = z.enum(['players', 'ping'])

export const RequiredModSchema = z.object({
  workshopId: z.string(),
  displayName: z.string(),
  source: z.string(),
  installedState: z.string(),
  downloadState: z.string(),
})

export const ServerDetailsSchema = z.object({
  server: ServerRecordSchema,
  rules: z.record(z.string(), z.string()),
  requiredMods: z.array(RequiredModSchema),
  warnings: z.array(z.string()),
  providerProvenance: z.array(z.string()),
  labels: z.array(z.string()),
})

export const ListServersRequestSchema = z.object({
  search: z.string(),
  moddedOnly: z.boolean(),
  officialOnly: z.boolean(),
  playerFloor: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  page: z.number().int().positive(),
  sortBy: ServerSortSchema,
})

export const PaginatedServersResponseSchema = z.object({
  items: z.array(ServerRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
})

export const ServerLibrarySchema = z.object({
  favorites: z.array(ServerRecordSchema),
  recents: z.array(ServerRecordSchema),
})

export const JoinPreparationRequestSchema = z.object({
  endpoint: z.string(),
  ip: z.string(),
  queryPort: z.number().int().nonnegative(),
  connectPort: z.number().int().nonnegative().nullable(),
  settings: LaunchSettingsSchema,
})

export const JoinPreparationResultSchema = z.object({
  jobId: z.string(),
  launchMode: LaunchModeSchema,
  launchArgs: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
  resolvedMods: z.array(RequiredModSchema),
  readyToLaunch: z.boolean(),
})

export const JoinJobStatusSchema = z.object({
  jobId: z.string(),
  phase: z.string(),
  progress: z.number(),
  message: z.string(),
  missingMods: z.array(z.string()),
  subscribedMods: z.array(z.string()),
  installedMods: z.array(z.string()),
  readyToLaunch: z.boolean(),
  warnings: z.array(z.string()),
  launchResult: z.string().nullable(),
})

export type LaunchMode = z.infer<typeof LaunchModeSchema>
export type SteamInstall = z.infer<typeof SteamInstallSchema>
export type DayzInstall = z.infer<typeof DayzInstallSchema>
export type LaunchSettings = z.infer<typeof LaunchSettingsSchema>
export type AppBootstrap = z.infer<typeof AppBootstrapSchema>
export type ServerRecord = z.infer<typeof ServerRecordSchema>
export type RequiredMod = z.infer<typeof RequiredModSchema>
export type ServerDetails = z.infer<typeof ServerDetailsSchema>
export type ServerSort = z.infer<typeof ServerSortSchema>
export type ListServersRequest = z.infer<typeof ListServersRequestSchema>
export type PaginatedServersResponse = z.infer<typeof PaginatedServersResponseSchema>
export type ServerLibrary = z.infer<typeof ServerLibrarySchema>
export type JoinPreparationRequest = z.infer<typeof JoinPreparationRequestSchema>
export type JoinPreparationResult = z.infer<typeof JoinPreparationResultSchema>
export type JoinJobStatus = z.infer<typeof JoinJobStatusSchema>

export const defaultListServersRequest: ListServersRequest = {
  search: '',
  moddedOnly: false,
  officialOnly: false,
  playerFloor: 0,
  limit: 25,
  page: 1,
  sortBy: 'players',
}
