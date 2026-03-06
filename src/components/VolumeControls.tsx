import { useState } from 'react'

interface VolumeControlsProps {
  mainVolume: number
  subVolume: number
  audioBalance: number
  onMainVolumeChange: (volume: number) => void
  onSubVolumeChange: (volume: number) => void
  onAudioBalanceChange: (balance: number) => void
}

export function VolumeControls({
  mainVolume,
  subVolume,
  audioBalance,
  onMainVolumeChange,
  onSubVolumeChange,
  onAudioBalanceChange,
}: VolumeControlsProps) {
  const [showControls, setShowControls] = useState(false)

  return (
    <div className="relative flex items-center gap-3 text-xs">
      <button
        onClick={() => setShowControls(!showControls)}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${showControls ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className="font-medium">動画音量</span>
        <span className="text-gray-600">
          (メイン {Math.round(mainVolume * 100)}% / サブ {Math.round(subVolume * 100)}%)
        </span>
      </button>

      {showControls && (
        <div className="absolute top-full left-0 mt-2 p-3 bg-editor-bg rounded-lg border border-editor-border shadow-lg z-50 w-[500px]">
          <div className="flex items-center gap-4 text-xs">
            {/* Main Volume */}
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-500 flex-shrink-0">メイン</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={mainVolume}
                onChange={(e) => onMainVolumeChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(mainVolume / 2) * 100}%, #3a3a3a ${(mainVolume / 2) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-10 text-right">{Math.round(mainVolume * 100)}%</span>
            </div>

            {/* Balance */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">M</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={audioBalance}
                onChange={(e) => onAudioBalanceChange(parseInt(e.target.value))}
                className="w-16 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${audioBalance}%, #3a3a3a ${audioBalance}%)`
                }}
              />
              <span className="text-gray-500">S</span>
            </div>

            {/* Sub Volume */}
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-500 flex-shrink-0">サブ</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={subVolume}
                onChange={(e) => onSubVolumeChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(subVolume / 2) * 100}%, #3a3a3a ${(subVolume / 2) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-10 text-right">{Math.round(subVolume * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
