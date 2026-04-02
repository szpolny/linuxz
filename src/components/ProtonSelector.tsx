import { Input } from './ui/Input.tsx'
import type { ProtonInstall } from '../lib/contracts.ts'

type ProtonSelectorProps = {
  availableProtons: ProtonInstall[] | undefined
  inputId: string
  selectedPath: string | null
  selectId: string
  onPathChange: (path: string | null) => void
}

function formatProtonLabel(proton: ProtonInstall) {
  return `${proton.name} (${proton.libraryPath})`
}

export function ProtonSelector({
  availableProtons,
  inputId,
  selectedPath,
  selectId,
  onPathChange,
}: ProtonSelectorProps) {
  const protonOptions = availableProtons ?? []
  const selectedIsCustom = Boolean(
    selectedPath && protonOptions.every((proton) => proton.path !== selectedPath),
  )

  return (
    <>
      <div className="field">
        <label htmlFor={selectId}>Installed Proton</label>
        <select
          id={selectId}
          value={selectedIsCustom ? selectedPath ?? '' : selectedPath ?? ''}
          onChange={(event) => {
            onPathChange(event.target.value || null)
          }}
        >
          <option value="">Auto-select (Recommended)</option>
          {protonOptions.map((proton) => (
            <option key={proton.id} value={proton.path}>
              {formatProtonLabel(proton)}
            </option>
          ))}
          {selectedIsCustom ? <option value={selectedPath ?? ''}>Custom path</option> : null}
        </select>
        <div className="muted" style={{ marginTop: '6px' }}>
          {protonOptions.length > 0
            ? 'Pick a detected Proton runtime or leave this on auto-select.'
            : 'No installed Proton runtimes were detected for the selected Steam installation.'}
        </div>
      </div>
      <Input
        id={inputId}
        label="Proton Binary Path"
        placeholder="/path/to/proton"
        value={selectedPath ?? ''}
        onChange={(event) => {
          onPathChange(event.target.value || null)
        }}
      />
    </>
  )
}
