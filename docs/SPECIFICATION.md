# Split Video Editor 仕様書

## 概要

2つの動画を左右（または上下）に並べて1つの動画として書き出すデスクトップアプリケーション。

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite
- **デスクトップ**: Electron
- **状態管理**: Zustand
- **スタイリング**: Tailwind CSS
- **動画処理**: FFmpeg (fluent-ffmpeg)

## 機能仕様

### 1. レイアウト構成

アプリケーションは以下の領域で構成される：

- **ヘッダー**: アスペクト比の選択
- **プレビュー**: 動画プレビューと再生コントロール、音量調整
- **クロップエディター**: 選択中クリップの切り取り位置調整
- **タイムライン**: 左右レーンのクリップ管理

### 2. アスペクト比

| 設定 | 出力解像度 | レイアウト | 各動画サイズ |
|------|-----------|-----------|-------------|
| 16:9（横長） | 1920×1080 | 左右並び | 960×1080 (8:9) |
| 9:16（縦長） | 1080×1920 | 上下積み | 1080×960 (9:8) |

- デフォルト: 16:9（横長）
- ヘッダーのドロップダウンで変更可能

### 3. クリップ管理

#### 3.1 レーン構成
- **左レーン（上レーン）**: 横長時は左側、縦長時は上側に配置
- **右レーン（下レーン）**: 横長時は右側、縦長時は下側に配置
- 各レーンに最大5クリップまで追加可能

#### 3.2 クリップ属性
```typescript
interface Clip {
  id: string           // 一意識別子
  filePath: string     // ファイルパス
  fileName: string     // ファイル名
  duration: number     // 元動画の長さ（秒）
  width: number        // 元動画の幅
  height: number       // 元動画の高さ
  fps: number          // フレームレート
  inPoint: number      // トリム開始点（秒）
  outPoint: number     // トリム終了点（秒）
  thumbnails: string[] // サムネイル画像（Base64）
  cropX: number        // クロップX位置 (-1.0〜1.0)
  cropY: number        // クロップY位置 (-1.0〜1.0)
  cropScale: number    // ズーム倍率 (0.5〜2.0)
}
```

#### 3.3 対応フォーマット
- MP4
- MOV

### 4. トリミング機能

- 各クリップのイン点（開始）とアウト点（終了）を設定可能
- 左レーンのクリップをトリミングすると、対応する右レーンのクリップも同じ長さに自動調整
- 出力尺は左右レーンの短い方に合わせる

### 5. クロップ機能

#### 5.1 位置調整
- ドラッグで映像の表示位置を調整
- cropX: -1.0（左端）〜 0（中央）〜 1.0（右端）
- cropY: -1.0（上端）〜 0（中央）〜 1.0（下端）

#### 5.2 ズーム調整
- スライダーで50%〜200%の範囲で調整
- 100%がデフォルト（カバーモード）
- 100%未満: ズームアウト（黒帯が出る可能性あり）
- 100%超: ズームイン

#### 5.3 ソース動画のアスペクト比対応
- **横長ソース**: 幅100%でカバー（上下がクロップされる）
- **縦長ソース**: 高さ100%で表示（左右に黒帯）

### 6. プレビュー機能

#### 6.1 再生コントロール
- 再生/一時停止ボタン
- シークバーでの位置移動
- スペースキーで再生/一時停止

#### 6.2 音量調整
プレビュー下部に以下のコントロールを配置：

- **左(上)音量スライダー**: 0%〜200%
- **バランススライダー**: L〜R（左右の音量バランス）
- **右(下)音量スライダー**: 0%〜200%

音量設定はプレビューとエクスポートで共通。

### 7. 書き出し機能

#### 7.1 書き出し設定モーダル
- 出力尺（表示のみ）
- アスペクト比（表示のみ）
- 保存先選択
- 書き出し進捗表示

#### 7.2 出力仕様
- **コンテナ**: MP4
- **映像コーデック**: H.264 (libx264)
- **映像品質**: CRF 23, preset fast
- **音声コーデック**: AAC
- **音声ビットレート**: 192kbps

#### 7.3 音声処理
- audioBalance: 0（左のみ）〜 50（均等）〜 100（右のみ）
- 各チャンネルに個別のボリューム倍率を適用
- amixフィルターでミックス

### 8. FFmpegフィルター構成

```
[入力] → trim → setpts → scale → crop → pad → setsar → [出力]
```

- **trim**: イン点〜アウト点の切り出し
- **scale**: ズームとアスペクト比に基づくスケーリング
  - 縦長ソース: `force_original_aspect_ratio=decrease`（高さ優先）
  - 横長ソース: `force_original_aspect_ratio=increase`（カバー）
- **crop**: クロップ位置に基づく切り取り
- **pad**: 黒帯追加（必要な場合）
- **hstack/vstack**: 左右または上下に結合

### 9. ローカル動画プロトコル

Electronのカスタムプロトコル `local-video://` でローカル動画ファイルを配信。

- HTTP Range requestsをサポート（シーク対応）
- Content-Type: video/mp4 または video/quicktime
- Accept-Ranges: bytes

## 状態管理

### Zustand Store

```typescript
interface EditorState {
  // レーン
  leftLane: Lane
  rightLane: Lane

  // 選択状態
  selectedClipId: string | null
  selectedLaneId: 'left' | 'right' | null

  // プレビュー
  previewPosition: number

  // 出力設定
  aspectRatio: '16:9' | '9:16'
  audioBalance: number      // 0-100
  leftVolume: number        // 0.0-2.0+
  rightVolume: number       // 0.0-2.0+

  // エクスポート状態
  isExporting: boolean
  exportProgress: number
}
```

## ファイル構成

```
video-editor/
├── electron/
│   ├── main.ts          # Electronメインプロセス
│   └── preload.ts       # プリロードスクリプト
├── src/
│   ├── components/
│   │   ├── Header.tsx       # ヘッダー（アスペクト比選択）
│   │   ├── Preview.tsx      # プレビュー・再生・音量
│   │   ├── CropEditor.tsx   # クロップ調整UI
│   │   ├── Timeline.tsx     # タイムライン
│   │   ├── Lane.tsx         # レーンコンポーネント
│   │   ├── ClipItem.tsx     # クリップアイテム
│   │   ├── TrimEditor.tsx   # トリム調整UI
│   │   └── ExportModal.tsx  # 書き出しモーダル
│   ├── store/
│   │   └── useEditorStore.ts  # Zustand状態管理
│   ├── types/
│   │   └── index.ts         # 型定義
│   ├── utils/
│   │   └── format.ts        # フォーマットユーティリティ
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## キーボードショートカット

| キー | 動作 |
|------|------|
| Space | 再生/一時停止 |

## 制限事項

- 各レーン最大5クリップ
- 対応フォーマット: MP4, MOV
- 音量ブースト: 最大200%（プレビュー）/ 300%（エクスポート）

## 今後の拡張可能性

- クリップの並べ替え（ドラッグ&ドロップ）
- トランジション効果
- テキストオーバーレイ
- プロジェクトの保存/読み込み
