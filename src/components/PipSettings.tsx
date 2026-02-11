import type { PipPosition, PipSize } from '../types'

const PIP_POSITION_LABELS: Record<PipPosition, string> = {
  'bottom-right': '右下',
  'bottom-left': '左下',
  'top-right': '右上',
  'top-left': '左上',
}

const PIP_SIZE_LABELS: Record<PipSize, string> = {
  '1/4': '1/4',
  '1/3': '1/3',
  '1/5': '1/5',
}

interface PipSettingsProps {
  pipPosition: PipPosition
  pipSize: PipSize
  onPositionChange: (position: PipPosition) => void
  onSizeChange: (size: PipSize) => void
}

export function PipSettings({
  pipPosition,
  pipSize,
  onPositionChange,
  onSizeChange,
}: PipSettingsProps) {
  return (
    <>
      {/* Position selector */}
      <div>
        <div className="text-xs text-gray-500 mb-2">ワイプ位置</div>
        <div className="grid grid-cols-2 gap-1 w-20">
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as PipPosition[]).map((pos) => (
            <button
              key={pos}
              onClick={() => onPositionChange(pos)}
              className={`w-9 h-7 rounded border transition-colors flex items-center justify-center ${
                pipPosition === pos
                  ? 'border-editor-accent bg-editor-accent/20'
                  : 'border-editor-border hover:border-gray-500'
              }`}
              title={PIP_POSITION_LABELS[pos]}
            >
              <div
                className={`w-2 h-1.5 rounded-sm ${
                  pipPosition === pos
                    ? 'bg-editor-accent'
                    : 'bg-gray-500'
                }`}
                style={{
                  marginTop: pos.startsWith('top') ? '-4px' : '4px',
                  marginLeft: pos.endsWith('left') ? '-6px' : '6px',
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Size selector */}
      <div>
        <div className="text-xs text-gray-500 mb-2">ワイプサイズ</div>
        <div className="flex gap-1">
          {(['1/5', '1/4', '1/3'] as PipSize[]).map((size) => (
            <button
              key={size}
              onClick={() => onSizeChange(size)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                pipSize === size
                  ? 'border-editor-accent bg-editor-accent/20 text-white'
                  : 'border-editor-border text-gray-400 hover:border-gray-500'
              }`}
            >
              {PIP_SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
