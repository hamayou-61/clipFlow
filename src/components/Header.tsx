import { useCallback, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { VolumeControls } from './VolumeControls'
import type { AspectRatio } from '../types'

export function Header() {
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const setAspectRatio = useEditorStore((state) => state.setAspectRatio)
  const segments = useEditorStore((state) => state.segments)
  const mainVolume = useEditorStore((state) => state.mainVolume)
  const subVolume = useEditorStore((state) => state.subVolume)
  const audioBalance = useEditorStore((state) => state.audioBalance)
  const setMainVolume = useEditorStore((state) => state.setMainVolume)
  const setSubVolume = useEditorStore((state) => state.setSubVolume)
  const setAudioBalance = useEditorStore((state) => state.setAudioBalance)
  const bgmFileName = useEditorStore((state) => state.bgmFileName)
  const bgmVolume = useEditorStore((state) => state.bgmVolume)
  const bgmFadeIn = useEditorStore((state) => state.bgmFadeIn)
  const bgmFadeOut = useEditorStore((state) => state.bgmFadeOut)
  const setBgm = useEditorStore((state) => state.setBgm)
  const setBgmVolume = useEditorStore((state) => state.setBgmVolume)
  const setBgmFadeIn = useEditorStore((state) => state.setBgmFadeIn)
  const setBgmFadeOut = useEditorStore((state) => state.setBgmFadeOut)

  const [isBgmLoading, setIsBgmLoading] = useState(false)
  const [showBgmDetail, setShowBgmDetail] = useState(false)

  const hasSegments = segments.length > 0

  const aspectOptions: { value: AspectRatio; label: string }[] = [
    { value: '16:9', label: '16:9 (横長)' },
    { value: '9:16', label: '9:16 (縦長)' },
  ]

  const handleSelectBgm = useCallback(async () => {
    if (!window.electronAPI || isBgmLoading) return
    setIsBgmLoading(true)
    try {
      const filePath = await window.electronAPI.openAudioFileDialog()
      if (!filePath) return
      const duration = await window.electronAPI.getAudioDuration(filePath)
      const fileName = filePath.split(/[/\\]/).pop() || 'audio'
      setBgm(filePath, fileName, duration)
    } catch (error) {
      console.error('Failed to load BGM:', error)
    } finally {
      setIsBgmLoading(false)
    }
  }, [isBgmLoading, setBgm])

  const handleRemoveBgm = useCallback(() => {
    setBgm(null, null, 0)
  }, [setBgm])

  return (
    <header className="flex items-center justify-between px-6 py-2 bg-editor-surface border-b border-editor-border">
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

      <div className="flex items-center gap-6">
        {/* Volume Controls */}
        {hasSegments && (
          <VolumeControls
            mainVolume={mainVolume}
            subVolume={subVolume}
            audioBalance={audioBalance}
            onMainVolumeChange={setMainVolume}
            onSubVolumeChange={setSubVolume}
            onAudioBalanceChange={setAudioBalance}
          />
        )}

        {/* BGM */}
        <div className="relative flex items-center gap-3 text-xs">
        <span className="text-gray-400 font-medium flex-shrink-0">BGM</span>
        {bgmFileName ? (
          <>
            <span className="text-white truncate max-w-[120px]" title={bgmFileName}>{bgmFileName}</span>
            <button
              onClick={handleRemoveBgm}
              className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
              title="BGMを削除"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={bgmVolume}
              onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
              className="w-24 h-1.5 rounded-lg cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 ${(bgmVolume / 2) * 100}%, #3a3a3a ${(bgmVolume / 2) * 100}%)`
              }}
            />
            <span className="text-gray-400 w-10 text-right flex-shrink-0">{Math.round(bgmVolume * 100)}%</span>
            <button
              onClick={() => setShowBgmDetail(!showBgmDetail)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="フェード設定"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showBgmDetail ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Fade dropdown */}
            {showBgmDetail && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-editor-bg border border-editor-border rounded-lg shadow-lg z-50 w-72">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-gray-500 flex-shrink-0">フェードイン</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={bgmFadeIn}
                      onChange={(e) => setBgmFadeIn(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 rounded-lg cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 ${(bgmFadeIn / 10) * 100}%, #3a3a3a ${(bgmFadeIn / 10) * 100}%)`
                      }}
                    />
                    <span className="text-gray-400 w-8 text-right">{bgmFadeIn.toFixed(1)}s</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs mt-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-gray-500 flex-shrink-0">フェードアウト</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={bgmFadeOut}
                      onChange={(e) => setBgmFadeOut(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 rounded-lg cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 ${(bgmFadeOut / 10) * 100}%, #3a3a3a ${(bgmFadeOut / 10) * 100}%)`
                      }}
                    />
                    <span className="text-gray-400 w-8 text-right">{bgmFadeOut.toFixed(1)}s</span>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleSelectBgm}
            disabled={isBgmLoading}
            className="px-2 py-1 text-xs bg-editor-bg border border-editor-border rounded hover:border-gray-500 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            {isBgmLoading ? '読込中...' : 'ファイルを選択'}
          </button>
        )}
        </div>
      </div>
    </header>
  )
}
