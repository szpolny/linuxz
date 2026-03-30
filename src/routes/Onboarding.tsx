import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Monitor, Save, Settings, Shield, Info, Zap, User, Loader2, AlertTriangle } from 'lucide-react'
import { bootstrapScan, getSettings, saveSettings } from '../lib/api.ts'
import type { LaunchSettings } from '../lib/contracts.ts'
import { Input } from '../components/ui/Input.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'

function getEnvironmentBadge(condition: boolean, positive: string, negative: string) {
  return condition ? positive : negative
}

export function OnboardingRoute() {
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
      return saveSettings({
        ...form,
        onboardingCompleted: true,
      })
    },
    onSuccess: (saved) => {
      setForm(saved)
      queryClient.setQueryData(['settings'], saved)
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      navigate('/servers', { replace: true })
    },
  })

  if (bootstrapQuery.isLoading || settingsQuery.isLoading || !form || !bootstrapQuery.data) {
    return (
      <div className="onboarding-shell">
        <section className="onboarding-card">
          <div className="onboarding-hero-card">
            <div className="onboarding-header">
              <div className="stack" style={{ gap: '12px', width: '100%' }}>
                <Skeleton style={{ height: '24px', width: '120px', borderRadius: '999px' }} />
                <Skeleton style={{ height: '48px', width: '80%' }} />
                <Skeleton style={{ height: '24px', width: '60%' }} />
              </div>
            </div>
            <div className="onboarding-summary" style={{ marginTop: '32px' }}>
              {[1, 2, 3].map(i => (
                <Skeleton key={i} style={{ height: '100px', borderRadius: '18px' }} />
              ))}
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (bootstrapQuery.error || settingsQuery.error) {
    return (
      <div className="onboarding-shell">
        <section className="onboarding-card">
          <EmptyState 
            icon={AlertTriangle} 
            title="Setup failed" 
            description="Setup data could not be loaded. Please check your Steam installation." 
          />
        </section>
      </div>
    )
  }

  const bootstrap = bootstrapQuery.data

  return (
    <div className="onboarding-shell">
      <section className="onboarding-card onboarding-hero-card">
        <div className="onboarding-header">
          <div className="stack" style={{ gap: '12px' }}>
            <span className="badge badge-good">First Launch Setup</span>
            <div>
              <h1 className="onboarding-title">Finish LinuxZ setup before you browse servers.</h1>
              <p className="onboarding-subtitle">
                The launcher has already scanned Steam and DayZ on this machine. Confirm the defaults below and continue into
                the app.
              </p>
            </div>
          </div>
          <div className="onboarding-actions">
            <button
              className="button button-primary"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              type="button"
            >
              {saveMutation.isPending ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {saveMutation.isPending ? 'Saving Setup...' : 'Continue to Launcher'}
            </button>
            {saveMutation.error ? <div className="badge badge-bad">Could not save setup.</div> : null}
          </div>
        </div>

        <div className="onboarding-summary">
          <div className="onboarding-summary-card">
            <div className="muted"><Monitor size={14} inline-block /> Steam</div>
            <strong>{bootstrap.detectedSteamInstalls.length} installs detected</strong>
            <span>{getEnvironmentBadge(bootstrap.detectedSteamInstalls.length > 0, 'Ready for selection', 'No installs found yet')}</span>
          </div>
          <div className="onboarding-summary-card">
            <div className="muted"><Shield size={14} inline-block /> DayZ</div>
            <strong>{bootstrap.dayzInstall ? 'Detected' : 'Not found'}</strong>
            <span>{getEnvironmentBadge(bootstrap.compatdataReady, 'Compatdata prepared', 'Compatdata missing')}</span>
          </div>
          <div className="onboarding-summary-card">
            <div className="muted"><Zap size={14} inline-block /> Workshop</div>
            <strong>{bootstrap.workshopManifestReady ? 'Manifest available' : 'Manifest missing'}</strong>
            <span>{getEnvironmentBadge(bootstrap.warnings.length === 0, 'No launch warnings', `${bootstrap.warnings.length} warning(s)`)}</span>
          </div>
        </div>
      </section>

      <div className="grid two-column">
        <section className="card">
          <div className="card-title">
            <h2><Settings size={20} className="stat-icon" /> Initial Preferences</h2>
            <span className="badge">Saved locally</span>
          </div>
          <div className="settings-grid">
            <Input
              id="onboardingPlayerName"
              icon={User}
              label="Default Player Name"
              value={form.defaultPlayerName}
              onChange={(event) => {
                setForm({ ...form, defaultPlayerName: event.target.value })
              }}
              placeholder="survivor"
            />
            <div className="field">
              <label>Launch Mode</label>
              <input value="Direct Proton (Linux Optimized)" disabled />
            </div>
            <div className="field">
              <label htmlFor="onboardingSteamInstall">Steam Installation</label>
              <select
                id="onboardingSteamInstall"
                value={form.preferredSteamInstallId ?? ''}
                onChange={(event) => {
                  setForm({
                    ...form,
                    preferredSteamInstallId: event.target.value || null,
                  })
                }}
              >
                <option value="">Auto-select (Recommended)</option>
                {bootstrap.detectedSteamInstalls.map((install) => (
                  <option key={install.id} value={install.id}>
                    {install.kind}: {install.rootPath}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="onboardingProtonPath"
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
              <label htmlFor="onboardingCustomLaunchCommand">Custom Launch Command</label>
              <textarea
                id="onboardingCustomLaunchCommand"
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
              <label htmlFor="onboardingBattlemetrics">BattleMetrics Data</label>
              <select
                id="onboardingBattlemetrics"
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
              <label htmlFor="onboardingDzsa">DZSA Provider</label>
              <select
                id="onboardingDzsa"
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
        </section>

        <section className="card hero-card">
          <div className="card-title">
            <h2><Monitor size={20} className="stat-icon" /> Environment Check</h2>
            <span className={`badge ${bootstrap.dayzInstall ? 'badge-good' : 'badge-warn'}`}>
              {bootstrap.dayzInstall ? 'DayZ Detected' : 'DayZ Missing'}
            </span>
          </div>
          <div className="stack">
            <div className="details-grid">
              <div className="detail-item">
                <div className="muted">Steam installs</div>
                <div style={{ fontWeight: 600 }}>{bootstrap.detectedSteamInstalls.length}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Compatdata</div>
                <div style={{ fontWeight: 600 }}>{bootstrap.compatdataReady ? 'Initialized' : 'Missing'}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Workshop manifest</div>
                <div style={{ fontWeight: 600 }}>{bootstrap.workshopManifestReady ? 'Available' : 'Missing'}</div>
              </div>
            </div>

            {bootstrap.warnings.length > 0 ? (
              <div className="stack">
                <div className="card-title" style={{ marginBottom: '4px' }}>
                  <h3><Info size={18} style={{ color: 'var(--warn)' }} /> Needs Attention</h3>
                </div>
                {bootstrap.warnings.map((warning) => (
                  <div className="badge badge-warn onboarding-warning" key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : (
              <div className="badge badge-good onboarding-warning">Bootstrap checks completed without warnings.</div>
            )}

            {bootstrap.dayzInstall ? (
              <div className="stack">
                <div className="detail-item">
                  <div className="muted">Game directory</div>
                  <div className="onboarding-path">{bootstrap.dayzInstall.gamePath}</div>
                </div>
                <div className="detail-item">
                  <div className="muted">Workshop manifest</div>
                  <div className="onboarding-path">{bootstrap.dayzInstall.workshopManifestPath}</div>
                </div>
              </div>
            ) : (
              <EmptyState 
                description="Install DayZ in Steam or point LinuxZ at the correct Steam library, then reopen Settings later if needed." 
              />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
