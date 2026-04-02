import { invoke } from '@tauri-apps/api/core'
import {
  AppBootstrapSchema,
  type AppBootstrap,
  JoinJobStatusSchema,
  JoinPreparationRequestSchema,
  JoinPreparationResultSchema,
  type JoinJobStatus,
  type JoinPreparationRequest,
  type JoinPreparationResult,
  ProtonDiscoveryRequestSchema,
  ProtonInstallSchema,
  type ProtonInstall,
  LaunchSettingsSchema,
  type LaunchSettings,
  ListServersRequestSchema,
  type ListServersRequest,
  PaginatedServersResponseSchema,
  RequiredModSchema,
  ServerRecordSchema,
  ServerLibrarySchema,
  ServerDetailsSchema,
  type PaginatedServersResponse,
  type RequiredMod,
  type ServerDetails,
  type ServerLibrary,
  type ServerRecord,
} from './contracts.ts'

async function typedInvoke<TInput, TOutput>(
  command: string,
  payload: TInput,
  schema: { parse: (value: unknown) => TOutput },
): Promise<TOutput> {
  const result = await invoke(command, payload as Record<string, unknown>)
  return schema.parse(result)
}

export async function bootstrapScan(): Promise<AppBootstrap> {
  return typedInvoke('bootstrap_scan', {}, AppBootstrapSchema)
}

export async function getSettings(): Promise<LaunchSettings> {
  return typedInvoke('get_settings', {}, LaunchSettingsSchema)
}

export async function saveSettings(settings: LaunchSettings): Promise<LaunchSettings> {
  const payload = LaunchSettingsSchema.parse(settings)
  return typedInvoke('save_settings', { settings: payload }, LaunchSettingsSchema)
}

export async function listInstalledProtons(preferredSteamInstallId: string | null): Promise<ProtonInstall[]> {
  const request = ProtonDiscoveryRequestSchema.parse({ preferredSteamInstallId })
  return typedInvoke('list_installed_protons', { request }, ProtonInstallSchema.array())
}

export async function listServers(request: ListServersRequest): Promise<PaginatedServersResponse> {
  const payload = ListServersRequestSchema.parse(request)
  const result = await invoke('list_servers', { request: payload })
  return PaginatedServersResponseSchema.parse(result)
}

export async function getServerDetails(endpoint: string): Promise<ServerDetails> {
  return typedInvoke('get_server_details', { lookup: { endpoint } }, ServerDetailsSchema)
}

export async function getServerLibrary(): Promise<ServerLibrary> {
  return typedInvoke('get_server_library', {}, ServerLibrarySchema)
}

export async function saveServerFavorite(server: ServerRecord, favorite: boolean): Promise<ServerRecord> {
  return typedInvoke('save_server_favorite', { server, favorite }, ServerRecordSchema)
}

export async function listDetectedMods(): Promise<RequiredMod[]> {
  const result = await invoke('list_detected_mods')
  return RequiredModSchema.array().parse(result)
}

export async function prepareJoin(request: JoinPreparationRequest): Promise<JoinPreparationResult> {
  const payload = JoinPreparationRequestSchema.parse(request)
  return typedInvoke('prepare_join', { request: payload }, JoinPreparationResultSchema)
}

export async function launchServer(request: JoinPreparationRequest): Promise<JoinJobStatus> {
  const payload = JoinPreparationRequestSchema.parse(request)
  return typedInvoke('launch_server', { request: payload }, JoinJobStatusSchema)
}

export async function getJobStatus(jobId: string): Promise<JoinJobStatus> {
  return typedInvoke('get_job_status', { lookup: { jobId } }, JoinJobStatusSchema)
}
