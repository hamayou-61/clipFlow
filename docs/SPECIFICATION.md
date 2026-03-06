# ClipFlow 仕様書

> **Note**: 初期要件定義書は `/spec.md` を参照。本ドキュメントは実装済み機能の詳細仕様。

## 概要

複数の動画クリップを連結・合成して1つの動画として書き出すデスクトップアプリケーション。

### ユースケース

- 複数の動画クリップを順番につなぎ合わせて1本の動画にする
- 2つの動画を左右（または上下）に並べた分割画面を作成する
- ワイプ（PiP: Picture-in-Picture）で小窓付きの動画を作成する
- 1つの動画のみをトリミング・クロップして書き出す
- クリップごとにトリミング・クロップ・音量調整を行う
- BGMを追加してフェードイン・フェードアウトを設定する
- 画像オーバーレイを追加する
- プロジェクトを保存・読み込みする

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | React 18 + TypeScript + Vite |
| デスクトップ | Electron 28 |
| 状態管理 | Zustand |
| スタイリング | Tailwind CSS |
| 動画処理 | FFmpeg (fluent-ffmpeg) |
| パッケージング | electron-builder |

## 機能仕様

### 1. 画面レイアウト

アプリケーションは以下の領域で構成される：

```
┌─────────────────────────────────────────────────────────┐
│ ヘッダー: アスペクト比選択 / BGM設定                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│     プレビュー（動画再生・音量調整・再生コントロール）        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ セグメントタブ（タイムライン）                              │
├─────────────────────────────────────────────────────────┤
│ セグメントエディター                                      │
│ - レイアウト選択 / PiP設定 / シーン尺                      │
│ - メインクリップスロット / サブクリップリスト               │
│ - 編集タブ（再生区間 / 表示範囲 / 画像オーバーレイ）         │
├─────────────────────────────────────────────────────────┤
│ フッター: 書き出しボタン                                   │
└─────────────────────────────────────────────────────────┘
```

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
  左右分割        メインのみ       ワイプ
```

#### 3.2 レイアウトタイプ

| タイプ | 説明 | 使用レーン |
|--------|------|-----------|
| single-main | フル画面（メインのみ） | メインのみ |
| split-h | 左右分割（横並び） | メイン + サブ |
| split-v | 上下分割（縦積み） | メイン + サブ |
| pip | ワイプ（小窓付き） | メイン + サブ |

#### 3.3 セグメント属性

```typescript
interface Segment {
  id: string
  layoutType: 'split-h' | 'split-v' | 'single-main' | 'pip'
  duration: number           // セグメントの長さ（秒）※メインクリップから自動算出
  mainClipId: string | null  // メインレーンのクリップID
  subEntries: SubEntry[]     // サブクリップのリスト（最大5つ）
  mainInPoint: number        // メインクリップの開始点
  // PiP設定
  pipPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  pipSize?: '1/4' | '1/3' | '1/5'
  // 画像オーバーレイ
  mainImageOverlay?: ImageOverlay
  subImageOverlay?: ImageOverlay
}

interface SubEntry {
  clipId: string     // サブレーンのクリップID
  inPoint: number    // サブクリップ内の開始点（秒）
  duration: number   // このサブクリップの使用時間（秒）
}

interface ImageOverlay {
  filePath: string   // 画像ファイルパス
  x: number          // X位置 (-1.0〜1.0)
  y: number          // Y位置 (-1.0〜1.0)
  size: number       // 出力幅に対する比率 (0.05〜2.0)
}
```

#### 3.4 サブエントリーの尺管理

- セグメントには複数のサブエントリーを追加可能（最大5つ）
- サブエントリーの合計duration = セグメントのduration（メインクリップの尺）
- サブエントリー追加時: 全エントリーに均等配分
- サブエントリー削除時: 残りのエントリーに再配分
- メインクリップのトリム変更時: サブエントリーの尺を比例スケーリング
- 各エントリーのdurationは個別に調整可能（他エントリーが自動調整）

#### 3.5 レイアウト別の表示サイズ

**出力が16:9（1920×1080）の場合:**

| レイアウト | メインサイズ | サブサイズ |
|-----------|-------------|-----------|
| split-h | 960×1080 | 960×1080 |
| split-v | 1920×540 | 1920×540 |
| single-main | 1920×1080 | - |
| pip (1/4) | 1920×1080 | 480×270 |
| pip (1/3) | 1920×1080 | 640×360 |
| pip (1/5) | 1920×1080 | 384×216 |

**出力が9:16（1080×1920）の場合:**

| レイアウト | メインサイズ | サブサイズ |
|-----------|-------------|-----------|
| split-h | 540×1920 | 540×1920 |
| split-v | 1080×960 | 1080×960 |
| single-main | 1080×1920 | - |
| pip (1/4) | 1080×1920 | 270×480 |
| pip (1/3) | 1080×1920 | 360×640 |
| pip (1/5) | 1080×1920 | 216×384 |

#### 3.6 PiP（ワイプ）設定

| 設定 | 選択肢 | デフォルト |
|------|--------|-----------|
| 位置 | 右下 / 左下 / 右上 / 左上 | 右下 |
| サイズ | 1/4 / 1/3 / 1/5 | 1/4 |

- マージン: 40px

### 4. クリップ管理

#### 4.1 レーン構成

- **メインレーン**: 常に使用される主レーン
- **サブレーン**: 分割・ワイプレイアウト時に使用される副レーン
- 各レーン最大10クリップまで

#### 4.2 レーンとレイアウトの対応

| レイアウト | メインの位置 | サブの位置 |
|-----------|-------------|-----------|
| split-h | 左 | 右 |
| split-v | 上 | 下 |
| single-main | フル画面 | 未使用 |
| pip | フル画面（背景） | 小窓 |

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
  thumbnails: string[] // サムネイル画像（Base64、最大10枚）
  cropX: number        // クロップX位置 (-1.0〜1.0)
  cropY: number        // クロップY位置 (-1.0〜1.0)
  cropScale: number    // ズーム倍率 (0.5〜2.0)
  pitchShift: number   // 声の高さ調整（半音単位、0〜-7）
}
```

#### 4.4 対応フォーマット

- MP4
- MOV

### 5. トリミング機能

- 各クリップのイン点（開始）とアウト点（終了）を設定可能
- スライダー操作でドラッグ調整
- 数値入力での精密調整
- セグメントの長さはメインクリップの（outPoint - inPoint）から自動算出
- サブクリップはサブエントリーのdurationに連動（固定尺モード）

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

### 7. 音声機能

#### 7.1 クリップ音声

| 設定 | 範囲 | デフォルト |
|------|------|-----------|
| メイン音量 | 0%〜200% | 100% |
| サブ音量 | 0%〜200% | 100% |
| バランス | 0（メインのみ）〜 50（均等）〜 100（サブのみ） | 50 |

- プレビューとエクスポートで共通設定
- シングルレイアウトではメインの音量のみ適用

#### 7.2 声の高さ調整（ピッチシフト）

| 設定値 | 効果 |
|--------|------|
| 0 | 変更なし |
| -1〜-3 | やや低い |
| -5〜-7 | かなり低い |

- クリップごとに設定可能
- FFmpegのasetrate + atempo フィルターで実装

#### 7.3 BGM機能

```typescript
interface BgmConfig {
  filePath: string    // 音声ファイルパス
  fileName: string    // ファイル名
  duration: number    // 音声の長さ
  volume: number      // 音量（0.0〜2.0、デフォルト0.5）
  fadeIn: number      // フェードイン秒数（0〜10秒）
  fadeOut: number     // フェードアウト秒数（0〜10秒）
}
```

- 対応フォーマット: MP3, WAV, AAC, FLAC, M4A, OGG（動画ファイルからの音声抽出も可）
- 動画より短い場合はループ再生
- フェードイン/フェードアウト設定可能
- ヘッダーで設定

### 8. 画像オーバーレイ機能

- メインとサブそれぞれに画像を重ねて表示可能
- 対応フォーマット: PNG, JPG, JPEG, GIF, WebP, BMP
- 設定項目:
  - X位置: -1.0（左端）〜 0（中央）〜 1.0（右端）
  - Y位置: -1.0（上端）〜 0（中央）〜 1.0（下端）
  - サイズ: 出力幅に対する比率（5%〜200%）

### 9. プレビュー機能

#### 9.1 再生コントロール

- 再生/一時停止ボタン
- シークバーでの位置移動
- スペースキーで再生/一時停止

#### 9.2 表示

- 現在位置のセグメントに応じたレイアウトで表示
- セグメントが変わると自動的にレイアウトも切り替わる

### 10. プロジェクト保存・読み込み機能

#### 10.1 ファイル形式

- 拡張子: `.veproj`（Video Editor Project）
- 形式: JSON

#### 10.2 保存データ

```typescript
interface ProjectData {
  version: number          // ファイル形式バージョン
  mainLane: Lane           // メインレーンのクリップ一覧
  subLane: Lane            // サブレーンのクリップ一覧
  segments: Segment[]      // セグメント一覧
  aspectRatio: AspectRatio // アスペクト比
  audioBalance: number     // オーディオバランス
  mainVolume: number       // メイン音量
  subVolume: number        // サブ音量
  bgm: {
    filePath: string | null
    fileName: string | null
    duration: number
    volume: number
    fadeIn: number
    fadeOut: number
  }
}
```

#### 10.3 メニュー操作

| メニュー | ショートカット | 動作 |
|---------|---------------|------|
| 新規プロジェクト | Ctrl+N | プロジェクトをリセット |
| プロジェクトを開く | Ctrl+O | .veprojファイルを読み込み |
| プロジェクトを保存 | Ctrl+S | 現在の状態を.veprojとして保存 |

### 11. 書き出し機能

#### 11.1 出力仕様

| 項目 | 値 |
|------|-----|
| コンテナ | MP4 |
| 映像コーデック | H.264 (libx264) |
| 映像品質 | CRF 23, preset fast |
| 音声コーデック | AAC |
| 音声ビットレート | 192kbps |

#### 11.2 書き出しフロー

1. 書き出しボタンクリック
2. 保存先選択ダイアログ（デフォルト: `split_YYYYMMDD_HHMMSS.mp4`）
3. 進捗表示（FFmpegからのprogress通知）
4. 完了通知

#### 11.3 キャンセル機能

- 書き出し中にキャンセル可能
- FFmpegプロセスをSIGKILLで終了

### 12. FFmpegフィルター構成

**各クリップの処理:**
```
[入力] → trim → setpts → scale → crop → pad → setsar → [出力]
```

- **trim**: イン点〜アウト点の切り出し
- **setpts**: タイムスタンプリセット
- **scale**: ズームとアスペクト比に基づくスケーリング
- **crop**: クロップ位置に基づく切り取り
- **pad**: 黒帯追加（必要な場合）
- **setsar**: ピクセルアスペクト比を1:1に設定

**音声処理:**
```
[入力] → atrim → asetpts → [ピッチシフト] → [出力]
```

- **atrim**: 音声のイン点〜アウト点切り出し
- **asetpts**: タイムスタンプリセット
- **ピッチシフト**: asetrate → aresample → atempo（設定時のみ）

**レイアウト合成:**

| レイアウト | フィルター |
|-----------|-----------|
| split-h | hstack=inputs=2 |
| split-v | vstack=inputs=2 |
| pip | overlay=位置計算 |
| single-main | 結合なし |

**画像オーバーレイ:**
```
[動画] + [画像] → scale → overlay → [出力]
```

**音声ミックス:**
- amixフィルターでメイン・サブ・BGMをミックス
- 各チャンネルにvolume適用
- BGMにはafadeでフェード効果

### 13. ローカル動画プロトコル

Electronのカスタムプロトコル `local-video://` でローカル動画ファイルを配信。

- HTTP Range requestsをサポート（シーク対応）
- Content-Type: video/mp4 または video/quicktime または image/*
- Accept-Ranges: bytes
- ストリーミング再生対応（highWaterMark: 64KB）

## 状態管理

### Zustand Store

```typescript
interface EditorState {
  // レーン管理
  mainLane: Lane
  subLane: Lane

  // セグメント管理
  segments: Segment[]
  selectedSegmentId: string | null

  // 選択状態
  selectedClipId: string | null
  selectedLaneId: 'main' | 'sub' | null

  // プレビュー
  previewPosition: number

  // 出力設定
  aspectRatio: '16:9' | '9:16'
  audioBalance: number     // 0-100
  mainVolume: number       // 0.0-2.0
  subVolume: number        // 0.0-2.0

  // BGM
  bgmFilePath: string | null
  bgmFileName: string | null
  bgmDuration: number
  bgmVolume: number        // 0.0-2.0
  bgmFadeIn: number        // 秒
  bgmFadeOut: number       // 秒

  // エクスポート状態
  isExporting: boolean
  exportProgress: number

  // アクション
  addClip, removeClip, updateClip, reorderClips, selectClip
  addSegment, removeSegment, updateSegment, reorderSegments, selectSegment
  addSubEntry, removeSubEntry, updateSubEntry, reorderSubEntries
  setAspectRatio, setAudioBalance, setMainVolume, setSubVolume
  setBgm, setBgmVolume, setBgmFadeIn, setBgmFadeOut
  getProjectData, loadProjectData, resetProject
  ...
}
```

## ファイル構成

```
video-editor/
├── electron/
│   ├── main.ts              # Electronメインプロセス・FFmpeg処理・IPC
│   └── preload.ts           # IPC ブリッジ
├── src/
│   ├── components/
│   │   ├── Header.tsx       # アスペクト比・BGM設定
│   │   ├── Preview.tsx      # プレビュー・再生・音量
│   │   ├── SegmentPanel.tsx # セグメント編集（統合コンポーネント）
│   │   ├── SegmentTabs.tsx  # セグメントタブ（タイムライン）
│   │   ├── ClipSlot.tsx     # クリップスロット
│   │   ├── ClipCard.tsx     # クリップカード
│   │   ├── SubClipList.tsx  # サブクリップリスト
│   │   ├── PipSettings.tsx  # PiP設定
│   │   ├── ImageOverlaySettings.tsx  # 画像オーバーレイ設定
│   │   ├── VolumeControls.tsx # 音量コントロール
│   │   ├── PlaybackControls.tsx # 再生コントロール
│   │   ├── ExportModal.tsx  # 書き出しモーダル
│   │   ├── Footer.tsx       # フッター
│   │   └── index.ts         # エクスポート
│   ├── store/
│   │   └── useEditorStore.ts  # Zustand状態管理
│   ├── types/
│   │   └── index.ts         # 型定義
│   ├── utils/
│   │   ├── format.ts        # フォーマットユーティリティ
│   │   ├── videoLoader.ts   # 動画読み込み
│   │   └── cropCalculation.ts # クロップ計算
│   ├── App.tsx
│   └── main.tsx
├── docs/
│   ├── SPECIFICATION.md     # 本仕様書
│   ├── ROADMAP.md           # ロードマップ
│   └── ...
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## IPC チャンネル

| チャンネル | 方向 | 用途 |
|-----------|------|------|
| dialog:openFile | invoke | 動画ファイル選択ダイアログ |
| dialog:openAudioFile | invoke | 音声ファイル選択ダイアログ |
| dialog:openImage | invoke | 画像ファイル選択ダイアログ |
| dialog:saveFile | invoke | 保存先選択ダイアログ |
| dialog:saveProject | invoke | プロジェクト保存ダイアログ |
| dialog:openProject | invoke | プロジェクト読み込みダイアログ |
| project:save | invoke | プロジェクトをJSONで保存 |
| project:load | invoke | プロジェクトをJSONから読み込み |
| video:getMetadata | invoke | 動画メタデータ取得 |
| video:generateThumbnails | invoke | サムネイル生成（Base64） |
| video:export | invoke | 動画書き出し |
| audio:getDuration | invoke | 音声ファイルの長さ取得 |
| export:progress | send | 書き出し進捗通知 |
| export:cancel | on | 書き出しキャンセル |
| menu:newProject | send | 新規プロジェクト（メニュー） |
| menu:openProject | send | プロジェクトを開く（メニュー） |
| menu:saveProject | send | プロジェクトを保存（メニュー） |
| menu:deleteSegment | send | セグメント削除（メニュー） |

## キーボードショートカット

| キー | 動作 |
|------|------|
| Space | 再生/一時停止 |
| Ctrl+N | 新規プロジェクト |
| Ctrl+O | プロジェクトを開く |
| Ctrl+S | プロジェクトを保存 |
| Delete | 選択中のセグメントを削除 |
| F11 | フルスクリーン切り替え |
| F12 | 開発者ツール |

## 制限事項

- 各レーン最大10クリップ
- 各セグメント最大5サブエントリー
- 対応動画フォーマット: MP4, MOV
- 対応画像フォーマット: PNG, JPG, JPEG, GIF, WebP, BMP
- 対応音声フォーマット: MP3, WAV, AAC, FLAC, M4A, OGG
- 音量ブースト: 最大200%
- サムネイル: 各クリップ最大10枚
- ピッチシフト: 0〜-7半音

## 動作環境

- Windows (NSIS インストーラー)
- macOS / Linux: 設定追加で対応可能

---
