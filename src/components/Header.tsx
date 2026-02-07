import { useEditorStore } from '../store/useEditorStore'
import type { AspectRatio } from '../types'

export function Header() {
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const setAspectRatio = useEditorStore((state) => state.setAspectRatio)

  const aspectOptions: { value: AspectRatio; label: string }[] = [
    { value: '16:9', label: '16:9 (横長)' },
    { value: '9:16', label: '9:16 (縦長)' },
  ]

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-editor-surface border-b border-editor-border">
      <h1 className="text-lg font-semibold text-white">
        ClipFlow
      </h1>

      <div className="flex items-center gap-6">
        {/* Aspect Ratio */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">アスペクト比:</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="px-3 py-1.5 text-sm bg-editor-bg border border-editor-border rounded text-white focus:outline-none focus:border-editor-accent"
          >
            {aspectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  )
}
