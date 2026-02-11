import React, { useState } from 'react'
import { formatTime } from '../utils/format'
import type { Segment } from '../types'

interface SegmentTabsProps {
  segments: Segment[]
  selectedSegmentId: string | null
  onSelectSegment: (id: string) => void
  onAddSegment: () => void
  onRemoveSegment: (id: string) => void
  onReorderSegments: (fromIndex: number, toIndex: number) => void
  getSegmentDuration: (segment: Segment) => number
  outputDuration: number
}

export function SegmentTabs({
  segments,
  selectedSegmentId,
  onSelectSegment,
  onAddSegment,
  onRemoveSegment,
  onReorderSegments,
  getSegmentDuration,
  outputDuration,
}: SegmentTabsProps) {
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null)
  const [dragOverSegmentId, setDragOverSegmentId] = useState<string | null>(null)

  const getLayoutLabel = (layoutType: string) => {
    switch (layoutType) {
      case 'single-main': return 'メイン'
      case 'split-h': return '左右'
      case 'split-v': return '上下'
      case 'pip': return 'ワイプ'
      default: return ''
    }
  }

  return (
    <div className="flex items-center gap-1 px-4 pt-2 overflow-x-auto">
      {segments.map((seg, index) => (
        <React.Fragment key={seg.id}>
          <button
            draggable
            onClick={() => onSelectSegment(seg.id)}
            onDragStart={(e) => {
              setDraggedSegmentId(seg.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              setDraggedSegmentId(null)
              setDragOverSegmentId(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (draggedSegmentId && draggedSegmentId !== seg.id) {
                setDragOverSegmentId(seg.id)
              }
            }}
            onDragLeave={() => {
              setDragOverSegmentId(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggedSegmentId && draggedSegmentId !== seg.id) {
                const fromIndex = segments.findIndex((s) => s.id === draggedSegmentId)
                const toIndex = segments.findIndex((s) => s.id === seg.id)
                if (fromIndex !== -1 && toIndex !== -1) {
                  onReorderSegments(fromIndex, toIndex)
                }
              }
              setDraggedSegmentId(null)
              setDragOverSegmentId(null)
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm transition-colors whitespace-nowrap cursor-grab active:cursor-grabbing ${
              draggedSegmentId === seg.id
                ? 'opacity-50'
                : dragOverSegmentId === seg.id
                ? 'bg-editor-accent/30 text-white'
                : selectedSegmentId === seg.id
                ? 'bg-editor-bg text-white'
                : 'text-gray-500 hover:text-gray-300 bg-editor-surface hover:bg-editor-bg/50 border border-b-0 border-editor-border'
            }`}
          >
            <span className="w-5 h-5 flex items-center justify-center bg-gray-600 rounded text-xs text-white">
              {index + 1}
            </span>
            <span>{getLayoutLabel(seg.layoutType)}</span>
            <span className="text-xs text-gray-500">
              {getSegmentDuration(seg) > 0 ? formatTime(getSegmentDuration(seg)) : '--:--'}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                onRemoveSegment(seg.id)
              }}
              className="ml-1 text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
              title="シーンを削除"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          </button>
          {index < segments.length - 1 && (
            <span className="text-gray-600 text-sm">→</span>
          )}
        </React.Fragment>
      ))}
      <button
        onClick={onAddSegment}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <span className="w-5 h-5 flex items-center justify-center border border-dashed border-gray-500 rounded text-xs">+</span>
        <span>追加</span>
      </button>
      <div className="ml-auto text-xs text-gray-500 whitespace-nowrap">
        出力尺: {formatTime(outputDuration)}
      </div>
    </div>
  )
}
