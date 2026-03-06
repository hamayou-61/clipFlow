import { useRef, useEffect } from 'react'
import type { TextTelopSettings, Segment } from '../types'

interface TelopPopoverProps {
  segment: Segment
  isOpen: boolean
  onClose: () => void
  onUpdate: (updates: Partial<Segment>) => void
}

export function TelopPopover({ segment, isOpen, onClose, onUpdate }: TelopPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  const updateTelop = (updates: Partial<TextTelopSettings>) => {
    onUpdate({
      textTelop: {
        text: segment.textTelop?.text || '',
        position: segment.textTelop?.position || 'bottom',
        fontSize: segment.textTelop?.fontSize || 'medium',
        fontFamily: segment.textTelop?.fontFamily || 'sans-serif',
        color: segment.textTelop?.color || 'white',
        background: segment.textTelop?.background ?? true,
        ...updates,
      },
    })
  }

  const clearTelop = () => {
    onUpdate({ textTelop: undefined })
    onClose()
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => (isOpen ? onClose() : onClose())}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
          segment.textTelop?.text
            ? 'border-editor-accent bg-editor-accent/20 text-white'
            : 'border-editor-border text-gray-400 hover:border-gray-500'
        }`}
      >
        <span className="font-bold">Aa</span>
        <span>テロップ</span>
        {segment.textTelop?.text && <span className="text-editor-accent">✓</span>}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 p-3 bg-editor-bg border border-editor-border rounded-lg shadow-lg z-50 w-64"
        >
          <div className="text-xs text-gray-400 mb-2">テロップ</div>
          <textarea
            value={segment.textTelop?.text || ''}
            onChange={(e) => updateTelop({ text: e.target.value })}
            placeholder="テキストを入力..."
            className="w-full px-2 py-1.5 text-sm bg-editor-surface border border-editor-border rounded text-white placeholder-gray-500 resize-none focus:outline-none focus:border-editor-accent"
            rows={2}
          />

          {/* Position */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-500 w-12">位置</span>
            <div className="flex gap-1">
              {(['top', 'center', 'bottom'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => updateTelop({ position: pos })}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    (segment.textTelop?.position || 'bottom') === pos
                      ? 'border-editor-accent bg-editor-accent/20 text-white'
                      : 'border-editor-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {pos === 'top' ? '上' : pos === 'center' ? '中' : '下'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 w-12">サイズ</span>
            <div className="flex gap-1">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => updateTelop({ fontSize: size })}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    (segment.textTelop?.fontSize || 'medium') === size
                      ? 'border-editor-accent bg-editor-accent/20 text-white'
                      : 'border-editor-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 w-12">書体</span>
            <div className="flex gap-1">
              {(['sans-serif', 'serif'] as const).map((font) => (
                <button
                  key={font}
                  onClick={() => updateTelop({ fontFamily: font })}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    (segment.textTelop?.fontFamily || 'sans-serif') === font
                      ? 'border-editor-accent bg-editor-accent/20 text-white'
                      : 'border-editor-border text-gray-400 hover:border-gray-500'
                  }`}
                  style={{ fontFamily: font === 'serif' ? 'Georgia, serif' : 'sans-serif' }}
                >
                  {font === 'sans-serif' ? 'ゴシック' : '明朝'}
                </button>
              ))}
            </div>
          </div>

          {/* Color & Background */}
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">色</span>
              <div className="flex gap-1">
                {(['white', 'black'] as const).map((color) => (
                  <button
                    key={color}
                    onClick={() => updateTelop({ color })}
                    className={`w-5 h-5 rounded border-2 transition-colors ${
                      (segment.textTelop?.color || 'white') === color
                        ? 'border-editor-accent'
                        : 'border-editor-border'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">背景</span>
              <button
                onClick={() => updateTelop({ background: !(segment.textTelop?.background ?? true) })}
                className={`w-5 h-5 rounded border flex items-center justify-center text-xs transition-colors ${
                  (segment.textTelop?.background ?? true)
                    ? 'border-editor-accent bg-editor-accent text-white'
                    : 'border-editor-border text-gray-500'
                }`}
              >
                {(segment.textTelop?.background ?? true) && '✓'}
              </button>
            </div>
          </div>

          {/* Clear Button */}
          {segment.textTelop?.text && (
            <button onClick={clearTelop} className="mt-3 text-xs text-red-400 hover:text-red-300">
              クリア
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Separate button component for external toggle control
interface TelopButtonProps {
  segment: Segment
  isOpen?: boolean
  onToggle: () => void
}

export function TelopButton({ segment, onToggle }: TelopButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
        segment.textTelop?.text
          ? 'border-editor-accent bg-editor-accent/20 text-white'
          : 'border-editor-border text-gray-400 hover:border-gray-500'
      }`}
    >
      <span className="font-bold">Aa</span>
      <span>テロップ</span>
      {segment.textTelop?.text && <span className="text-editor-accent">✓</span>}
    </button>
  )
}
