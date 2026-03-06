import type { LayoutType } from '../types'

export interface LayoutOption {
  type: LayoutType
  label: string
  icon: JSX.Element
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    type: 'single-main',
    label: 'メインのみ',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="4" width="18" height="16" rx="1" />
      </svg>
    ),
  },
  {
    type: 'split-h',
    label: '左右分割',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="4" width="9" height="16" rx="1" />
        <rect x="13" y="4" width="9" height="16" rx="1" />
      </svg>
    ),
  },
  {
    type: 'split-v',
    label: '上下分割',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="2" width="16" height="9" rx="1" />
        <rect x="4" y="13" width="16" height="9" rx="1" />
      </svg>
    ),
  },
  {
    type: 'split-3h',
    label: '3分割',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="1" y="4" width="6" height="16" rx="1" />
        <rect x="9" y="4" width="6" height="16" rx="1" />
        <rect x="17" y="4" width="6" height="16" rx="1" />
      </svg>
    ),
  },
  {
    type: 'pip',
    label: 'ワイプ',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="4" width="18" height="16" rx="1" opacity="0.6" />
        <rect x="13" y="12" width="7" height="6" rx="1" />
      </svg>
    ),
  },
]
