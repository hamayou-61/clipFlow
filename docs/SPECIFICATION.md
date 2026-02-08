# ClipFlow 仕様書

## 概要

複数の動画クリップを連結・合成して1つの動画として書き出すデスクトップアプリケーション。

### ユースケース

- 複数の動画クリップを順番につなぎ合わせて1本の動画にする
- 2つの動画を左右（または上下）に並べた分割画面を作成する
- 1つの動画のみをトリミング・クロップして書き出す
- クリップごとにトリミング・クロップ・音量調整を行う

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite
- **デスクトップ**: Electron
- **状態管理**: Zustand
- **スタイリング**: Tailwind CSS
- **動画処理**: FFmpeg (fluent-ffmpeg)

## 機能仕様

### 1. 画面レイアウト

アプリケーションは以下の領域で構成される：

- **ヘッダー**: 出力アスペクト比の選択
- **プレビュー**: 動画プレビューと再生コントロール、音量調整
- **クロップエディター**: 選択中クリップの切り取り位置調整
- **タイムライン**:
  - クリップエリア: メイン/サブレーンのクリップ管理
  - セグメントエリア: 出力構成の編集

### 2. 出力設定

#### 2.1 出力アスペクト比
| 設定 | 出力解像度 |
|------|-----------|
| 16:9（横長） | 1920×1080 |
| 9:16（縦長） | 1080×1920 |

- プロジェクト全体で統一
- ヘッダーで選択

### 3. セグメントとレイアウト

動画はセグメント単位で構成され、各セグメントごとにレイアウトを設定できる。

#### 3.1 セグメント構成
```
[セグメント1] → [セグメント2] → [セグメント3] → ...
  16:9分割      シングル(左)     9:16分割
```

#### 3.2 レイアウトタイプ

| タイプ | 説明 | 使用レーン |
|--------|------|-----------|
| split-h | 左右分割（横並び） | メイン + サブ |
| split-v | 上下分割（縦積み） | メイン + サブ |
| single-main | フル画面（メインレーン） | メインのみ |
| single-sub | フル画面（サブレーン） | サブのみ |

#### 3.3 セグメント属性
```typescript
interface Segment {
  id: string
  layoutType: 'split-h' | 'split-v' | 'single-main' | 'single-sub'
  duration: number        // セグメントの長さ（秒）
  mainClipId: string      // メインレーンのクリップID
  subClipId: string | null // サブレーンのクリップID（シングル時はnull）
  mainInPoint: number     // メインクリップの開始点
  subInPoint: number      // サブクリップの開始点
}
```

#### 3.4 使用例
```
出力: 16:9（横長）

セグメント1: split-h（左右分割）  0:00-0:30
  ├─ 左: interview_A.mp4
  └─ 右: interview_B.mp4

セグメント2: single-main（フル画面） 0:30-0:45
  └─ メイン: interview_A.mp4（続き）

セグメント3: split-v（上下分割）  0:45-1:15
  ├─ 上: interview_A.mp4
  └─ 下: interview_B.mp4

セグメント4: single-sub（フル画面） 1:15-1:30
  └─ サブ: interview_B.mp4（続き）
```

#### 3.5 レイアウト別の表示サイズ

**出力が16:9（1920×1080）の場合:**
| レイアウト | メインサイズ | サブサイズ |
|-----------|-------------|-----------|
| split-h | 960×1080 | 960×1080 |
| split-v | 1920×540 | 1920×540 |
| single-main | 1920×1080 | - |
| single-sub | - | 1920×1080 |

**出力が9:16（1080×1920）の場合:**
| レイアウト | メインサイズ | サブサイズ |
|-----------|-------------|-----------|
| split-h | 540×1920 | 540×1920 |
| split-v | 1080×960 | 1080×960 |
| single-main | 1080×1920 | - |
| single-sub | - | 1080×1920 |

### 4. クリップ管理

#### 4.1 レーン構成
- **メインレーン**: 常に使用される主レーン
- **サブレーン**: 分割レイアウト時に使用される副レーン
- 各レーンに最大10クリップまで追加可能

#### 4.2 レーンとレイアウトの対応
| レイアウト | メインの位置 | サブの位置 |
|-----------|-------------|-----------|
| split-h | 左 | 右 |
| split-v | 上 | 下 |
| single-main | フル画面 | 未使用 |
| single-sub | 未使用 | フル画面 |

#### 4.3 クリップ属性
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

#### 4.4 対応フォーマット
- MP4
- MOV

### 5. トリミング機能

- 各クリップのイン点（開始）とアウト点（終了）を設定可能
- セグメント作成時に、使用するクリップの範囲を指定

### 6. クロップ機能

#### 6.1 位置調整
- ドラッグで映像の表示位置を調整
- cropX: -1.0（左端）〜 0（中央）〜 1.0（右端）
- cropY: -1.0（上端）〜 0（中央）〜 1.0（下端）

#### 6.2 ズーム調整
- スライダーで50%〜200%の範囲で調整
- 100%がデフォルト（カバーモード）
- 100%未満: ズームアウト（黒帯が出る可能性あり）
- 100%超: ズームイン

#### 6.3 ソース動画のアスペクト比対応
- **横長ソース**: 幅100%でカバー（上下がクロップされる）
- **縦長ソース**: 高さ100%で表示（左右に黒帯）

### 7. プレビュー機能

#### 7.1 再生コントロール
- 再生/一時停止ボタン
- シークバーでの位置移動
- スペースキーで再生/一時停止

#### 7.2 音量調整
プレビュー下部に以下のコントロールを配置：

- **メイン音量スライダー**: 0%〜200%
- **バランススライダー**: メイン〜サブ（分割レイアウト時のみ有効）
- **サブ音量スライダー**: 0%〜200%

音量設定はプレビューとエクスポートで共通。
シングルレイアウトのセグメントでは、使用されるレーンの音量のみ適用。

### 8. 書き出し機能

#### 8.1 書き出し設定モーダル
- 出力尺（表示のみ）
- アスペクト比（表示のみ）
- 保存先選択
- 書き出し進捗表示

#### 8.2 出力仕様
- **コンテナ**: MP4
- **映像コーデック**: H.264 (libx264)
- **映像品質**: CRF 23, preset fast
- **音声コーデック**: AAC
- **音声ビットレート**: 192kbps

#### 8.3 音声処理
- audioBalance: 0（メインのみ）〜 50（均等）〜 100（サブのみ）
- 各レーンに個別のボリューム倍率を適用
- amixフィルターでミックス
- シングルレイアウトのセグメントでは使用レーンの音声のみ出力

### 9. FFmpegフィルター構成

**各クリップの処理:**
```
[入力] → trim → setpts → scale → crop → pad → setsar → [出力]
```

- **trim**: イン点〜アウト点の切り出し
- **scale**: ズームとアスペクト比に基づくスケーリング
  - 縦長ソース: `force_original_aspect_ratio=decrease`（高さ優先）
  - 横長ソース: `force_original_aspect_ratio=increase`（カバー）
- **crop**: クロップ位置に基づく切り取り
- **pad**: 黒帯追加（必要な場合）

**レイアウト合成:**
- **分割モード**: hstack（左右結合）または vstack（上下結合）
- **シングルモード**: 結合処理なし（そのまま出力）

**クリップ連結:**
- **concat**: 複数クリップを時系列で連結

### 10. ローカル動画プロトコル

Electronのカスタムプロトコル `local-video://` でローカル動画ファイルを配信。

- HTTP Range requestsをサポート（シーク対応）
- Content-Type: video/mp4 または video/quicktime
- Accept-Ranges: bytes

## 状態管理

### Zustand Store

```typescript
type LayoutType = 'split-h' | 'split-v' | 'single-main' | 'single-sub'
type AspectRatio = '16:9' | '9:16'

interface Segment {
  id: string
  layoutType: LayoutType
  duration: number
  mainClipId: string
  subClipId: string | null
  mainInPoint: number
  subInPoint: number
}

interface EditorState {
  // クリップ管理
  mainLane: Lane           // メインレーン
  subLane: Lane            // サブレーン

  // セグメント管理
  segments: Segment[]      // タイムライン上のセグメント
  selectedSegmentId: string | null

  // 選択状態
  selectedClipId: string | null
  selectedLaneId: 'main' | 'sub' | null

  // プレビュー
  previewPosition: number

  // 出力設定
  aspectRatio: AspectRatio // 出力アスペクト比
  audioBalance: number     // 0-100
  mainVolume: number       // 0.0-2.0+
  subVolume: number        // 0.0-2.0+

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
│   │   ├── SegmentEditor.tsx # セグメント編集UI
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

- 各レーン最大10クリップ
- 対応フォーマット: MP4, MOV
- 音量ブースト: 最大200%（プレビュー）/ 300%（エクスポート）

## UI構成

### タイムライン
```
[クリップエリア]
  メインレーン: [Clip A] [Clip B] [Clip C] ...
  サブレーン:   [Clip X] [Clip Y] ...

[セグメントエリア]
  [Seg1: split-h] [Seg2: single-main] [Seg3: split-v] ...
```

### セグメント編集
- セグメントをクリックで選択
- レイアウトタイプを変更可能
- 使用するクリップと範囲を指定
- ドラッグで長さを調整

### プレビュー
- 現在位置のセグメントに応じたレイアウトで表示
- セグメントが変わると自動的にレイアウトも切り替わる

## 今後の拡張可能性

- クリップの並べ替え（ドラッグ&ドロップ）
- トランジション効果
- テキストオーバーレイ
- プロジェクトの保存/読み込み
