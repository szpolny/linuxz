import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { bootstrapScan, getSettings, saveSettings } from '../lib/api.ts'
import type { LaunchMode, LaunchSettings } from '../lib/contracts.ts'

export function SettingsRoute() {
  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap'],
    queryFn: bootstrapScan,
  })
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })
  const [form, setForm] = useState<LaunchSettings | null>(null)

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data)
    }
  }, [settingsQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error('Settings form is not ready')
      }
      return saveSettings(form)
    },
    onSuccess: (saved) => {
      setForm(saved)
    },
  })

  return (
    <div className="grid two-column">
      <section className="card">
        <div className="card-title">
          <h2>Launcher Settings</h2>
          <span className="badge">{saveMutation.isSuccess ? 'Saved' : 'Local prototype'}</span>
        </div>
        {!form ? <div className="empty">Loading current launcher settings.</div> : null}
        {form ? (
          <div className="stack">
            <div className="settings-grid">
              <div className="field">
                <label htmlFor="defaultPlayerName">Default launch name</label>
                <input
                  id="defaultPlayerName"
                  value={form.defaultPlayerName}
                  onChange={(event) => {
                    setForm({ ...form, defaultPlayerName: event.target.value })
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="launchMode">Launch mode</label>
                <select
                  id="launchMode"
                  value={form.launchMode}
                  onChange={(event) => {
                    setForm({ ...form, launchMode: event.target.value as LaunchMode })
                  }}
                >
                  <option value="steamHandoff">Steam handoff</option>
                  <option value="directProton">Direct Proton</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="preferredSteamInstallId">Preferred Steam install</label>
                <select
                  id="preferredSteamInstallId"
                  value={form.preferredSteamInstallId ?? ''}
                  onChange={(event) => {
                    setForm({
                      ...form,
                      preferredSteamInstallId: event.target.value || null,
                    })
                  }}
                >
                  <option value="">Auto-select</option>
                  {bootstrapQuery.data?.detectedSteamInstalls.map((install) => (
                    <option key={install.id} value={install.id}>
                      {install.kind}: {install.rootPath}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="preferredProtonPath">Preferred Proton binary</label>
                <input
                  id="preferredProtonPath"
                  placeholder="/path/to/proton"
                  value={form.preferredProtonPath ?? ''}
                  onChange={(event) => {
                    setForm({
                      ...form,
                      preferredProtonPath: event.target.value || null,
                    })
                  }}
                />
                <small>Required only for direct Proton exec.</small>
              </div>
              <div className="field">
                <label htmlFor="enableBattlemetrics">BattleMetrics provider</label>
                <select
                  id="enableBattlemetrics"
                  value={form.enableBattlemetrics ? 'enabled' : 'disabled'}
                  onChange={(event) => {
                    setForm({
                      ...form,
                      enableBattlemetrics: event.target.value === 'enabled',
                    })
                  }}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="enableDzsaExperimental">DZSA enrichment</label>
                <select
                  id="enableDzsaExperimental"
                  value={form.enableDzsaExperimental ? 'enabled' : 'disabled'}
                  onChange={(event) => {
                    setForm({
                      ...form,
                      enableDzsaExperimental: event.target.value === 'enabled',
                    })
                  }}
                >
                  <option value="disabled">Disabled</option>
                  <option value="enabled">Enabled</option>
                </select>
              </div>
            </div>
            <div className="button-row">
              <button className="button button-primary" onClick={() => saveMutation.mutate()} type="button">
                Save Settings
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card hero-card">
        <div className="card-title">
          <h2>Environment Scan</h2>
          {bootstrapQuery.data ? (
            <span className={`badge ${bootstrapQuery.data.dayzInstall ? 'badge-good' : 'badge-warn'}`}>
              {bootstrapQuery.data.dayzInstall ? 'DayZ detected' : 'DayZ missing'}
            </span>
          ) : null}
        </div>
        {bootstrapQuery.isLoading ? <div className="empty">Scanning local Steam layouts and DayZ install paths.</div> : null}
        {bootstrapQuery.error ? <div className="empty">Bootstrap scan failed.</div> : null}
        {bootstrapQuery.data ? (
          <div className="stack">
            <div className="details-grid">
              <div className="detail-item">
                <div className="muted">Detected Steam installs</div>
                <div>{bootstrapQuery.data.detectedSteamInstalls.length}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Compatdata ready</div>
                <div>{bootstrapQuery.data.compatdataReady ? 'Yes' : 'No'}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Workshop manifest ready</div>
                <div>{bootstrapQuery.data.workshopManifestReady ? 'Yes' : 'No'}</div>
              </div>
            </div>
            {bootstrapQuery.data.warnings.length > 0 ? (
              <div className="stack">
                {bootstrapQuery.data.warnings.map((warning) => (
                  <div className="badge badge-warn" key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            {bootstrapQuery.data.dayzInstall ? (
              <div className="detail-list">
                <div className="detail-item">
                  <div className="muted">Game path</div>
                  <div>{bootstrapQuery.data.dayzInstall.gamePath}</div>
                </div>
                <div className="detail-item">
                  <div className="muted">Workshop manifest</div>
                  <div>{bootstrapQuery.data.dayzInstall.workshopManifestPath}</div>
                </div>
                <div className="detail-item">
                  <div className="muted">Documents path</div>
                  <div>{bootstrapQuery.data.dayzInstall.documentsPath}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
