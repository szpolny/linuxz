import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { bootstrapScan, getSettings, saveSettings } from '../lib/api.ts'
import type { LaunchSettings } from '../lib/contracts.ts'
import { Settings, Save, Cpu, Monitor, Zap, Shield, Info, Loader2, AlertTriangle, User } from 'lucide-react'
import { Input } from '../components/ui/Input.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'

export function SettingsRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
      queryClient.setQueryData(['settings'], saved)
    },
  })

  const resetOnboardingMutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error('Settings form is not ready')
      }
      return saveSettings({
        ...form,
        onboardingCompleted: false,
      })
    },
    onSuccess: (saved) => {
      setForm(saved)
      queryClient.setQueryData(['settings'], saved)
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      navigate('/onboarding')
    },
  })

  return (
    <div className="grid two-column">
      <section className="card">
        <div className="card-title">
          <h2><Settings size={20} className="stat-icon" /> Launcher Settings</h2>
          <span className={`badge ${saveMutation.isSuccess ? 'badge-good' : ''}`}>
            {saveMutation.isSuccess ? 'Settings Saved' : 'Local Configuration'}
          </span>
        </div>
        {!form ? (
          <div className="stack">
            <div className="settings-grid">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="field">
                  <Skeleton style={{ height: '14px', width: '40%', marginBottom: '8px' }} />
                  <Skeleton style={{ height: '40px', width: '100%', borderRadius: '10px' }} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {form ? (
          <div className="stack">
            <div className="settings-grid">
              <Input
                id="defaultPlayerName"
                icon={User}
                label="Default Player Name"
                value={form.defaultPlayerName}
                onChange={(event) => {
                  setForm({ ...form, defaultPlayerName: event.target.value })
                }}
                placeholder="Survivor"
              />
              <div className="field">
                <label>Launch Mode</label>
                <input value="Direct Proton (Linux Optimized)" disabled />
              </div>
              <div className="field">
                <label htmlFor="preferredSteamInstallId">Steam Installation</label>
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
                  <option value="">Auto-select (Recommended)</option>
                  {bootstrapQuery.data?.detectedSteamInstalls.map((install) => (
                    <option key={install.id} value={install.id}>
                      {install.kind}: {install.rootPath}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                id="preferredProtonPath"
                label="Proton Binary Path"
                placeholder="/path/to/proton"
                value={form.preferredProtonPath ?? ''}
                onChange={(event) => {
                  setForm({
                    ...form,
                    preferredProtonPath: event.target.value || null,
                  })
                }}
              />
              <div className="field field-wide">
                <label htmlFor="customLaunchCommand">Custom Launch Command</label>
                <textarea
                  id="customLaunchCommand"
                  rows={3}
                  placeholder="PROTON_LOG=1 MALLOC_TRIM_THRESHOLD_=0 %command% -nosplash -noPause"
                  value={form.customLaunchCommand ?? ''}
                  onChange={(event) => {
                    setForm({
                      ...form,
                      customLaunchCommand: event.target.value || null,
                    })
                  }}
                />
                <div className="muted">
                  Steam-style template. Use <code>%command%</code> to place the default game command. If omitted, values
                  starting with <code>-</code> are appended as game flags; anything else is treated as a command prefix or
                  wrapper.
                </div>
              </div>
              <div className="field">
                <label htmlFor="enableBattlemetrics">BattleMetrics Data</label>
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
                <label htmlFor="enableDzsaProvider">DZSA Provider</label>
                <select
                  id="enableDzsaProvider"
                  value={form.enableDzsaProvider ? 'enabled' : 'disabled'}
                  onChange={(event) => {
                    setForm({
                      ...form,
                      enableDzsaProvider: event.target.value === 'enabled',
                    })
                  }}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>
            <div className="button-row" style={{ marginTop: '12px' }}>
              <button 
                className="button button-primary" 
                onClick={() => saveMutation.mutate()} 
                type="button"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 size={16} className="spin" /> : (
                  <>
                    <Save size={16} /> Save Changes
                  </>
                )}
              </button>
              <button 
                className="button" 
                onClick={() => resetOnboardingMutation.mutate()} 
                type="button"
                disabled={resetOnboardingMutation.isPending}
              >
                {resetOnboardingMutation.isPending ? <Loader2 size={16} className="spin" /> : (
                  <>
                    <Settings size={16} /> Run Onboarding Again
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card hero-card">
        <div className="card-title">
          <h2><Monitor size={20} className="stat-icon" /> Environment</h2>
          {bootstrapQuery.data ? (
            <span className={`badge ${bootstrapQuery.data.dayzInstall ? 'badge-good' : 'badge-warn'}`}>
              {bootstrapQuery.data.dayzInstall ? 'DayZ Detected' : 'DayZ Missing'}
            </span>
          ) : null}
        </div>
        {bootstrapQuery.isLoading ? (
           <div className="stack">
              <div className="details-grid">
                {[1, 2, 3].map(i => (
                  <div key={i} className="detail-item">
                    <Skeleton style={{ height: '14px', width: '40%', marginBottom: '8px' }} />
                    <Skeleton style={{ height: '18px', width: '80%' }} />
                  </div>
                ))}
              </div>
           </div>
        ) : null}
        {bootstrapQuery.error ? <EmptyState icon={AlertTriangle} description="Bootstrap scan failed." /> : null}
        {bootstrapQuery.data ? (
          <div className="stack">
            <div className="details-grid">
              <div className="detail-item">
                <div className="muted"><Zap size={14} inline-block /> Steam Installs</div>
                <div style={{ fontWeight: 600 }}>{bootstrapQuery.data.detectedSteamInstalls.length} found</div>
              </div>
              <div className="detail-item">
                <div className="muted"><Shield size={14} inline-block /> Compatdata</div>
                <div style={{ fontWeight: 600 }}>{bootstrapQuery.data.compatdataReady ? 'Initialized' : 'Missing'}</div>
              </div>
              <div className="detail-item">
                <div className="muted"><Cpu size={14} inline-block /> Manifests</div>
                <div style={{ fontWeight: 600 }}>{bootstrapQuery.data.workshopManifestReady ? 'Available' : 'Missing'}</div>
              </div>
            </div>
            {bootstrapQuery.data.warnings.length > 0 ? (
              <div className="stack">
                <div className="card-title" style={{ marginBottom: '4px' }}>
                  <h3><Info size={18} style={{ color: 'var(--warn)' }} /> System Warnings</h3>
                </div>
                {bootstrapQuery.data.warnings.map((warning) => (
                  <div className="badge badge-warn" key={warning} style={{ width: '100%', justifyContent: 'flex-start' }}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            {bootstrapQuery.data.dayzInstall ? (
              <div className="stack" style={{ marginTop: '12px' }}>
                 <div className="detail-item">
                  <div className="muted">Game Directory</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{bootstrapQuery.data.dayzInstall.gamePath}</div>
                </div>
                <div className="detail-item">
                  <div className="muted">Workshop Manifest</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{bootstrapQuery.data.dayzInstall.workshopManifestPath}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
