# ClipFlow ロードマップ

## 現在の状態（v1.0.0）

### 実装済み機能

- セグメントベースの動画構成
- 3種類のレイアウト（メインのみ、左右分割、上下分割）
- クリップのトリミング・クロップ・ズーム
- メイン/サブ音声のバランス・音量調整
- BGM追加（フェードイン/アウト対応）
- MP4エクスポート（H.264/AAC）
- ドラッグ&ドロップでのファイル読み込み

### 未完成機能

- PiP（ワイプ）レイアウト: バックエンド実装済み、UI未対応

---

## Phase 1: 基本機能の完成（推奨: 次のステップ）

### 1.1 PiPレイアウトのUI対応

**概要**: 既に実装済みのワイプ機能をUIから利用可能にする

**実装内容**:
```typescript
// SegmentEditor.tsx のレイアウト選択に追加
(['single-main', 'split-h', 'split-v', 'pip'] as LayoutType[])
```

**追加機能**:
- ワイプ位置の選択（右下/左下/右上/左上）
- ワイプサイズの調整（1/4, 1/3, 1/5）

**工数**: 小（UI変更のみ）

---

### 1.2 プロジェクト保存/読み込み

**概要**: 作業状態を保存して後から再開できるようにする

**データ構造**:
```typescript
interface ProjectFile {
  version: string
  createdAt: string
  updatedAt: string
  state: {
    mainLane: Lane
    subLane: Lane
    segments: Segment[]
    aspectRatio: AspectRatio
    audioBalance: number
    mainVolume: number
    subVolume: number
    bgm: BgmConfig | null
  }
}
```

**実装内容**:
1. `project:save` IPCハンドラー追加
2. `project:load` IPCハンドラー追加
3. ヘッダーに保存/読み込みボタン追加
4. ファイル形式: `.clipflow` (JSON)

**注意点**:
- ファイルパスはそのまま保存（相対パス変換はしない）
- 存在しないファイルの検出とエラー表示

**工数**: 中

---

### 1.3 セグメントの並べ替え

**概要**: セグメントの順序をドラッグ&ドロップで変更

**実装内容**:
1. `@dnd-kit/core` または `react-beautiful-dnd` の導入
2. セグメントタイムラインでのドラッグ対応
3. `reorderSegments` アクションの呼び出し

**工数**: 小〜中

---

## Phase 2: UX改善

### 2.1 Undo/Redo機能

**概要**: 操作の取り消し・やり直し

**実装方法**:
```typescript
// zustand middleware を使用
import { temporal } from 'zundo'

const useEditorStore = create(
  temporal(
    (set, get) => ({
      // ... existing state
    }),
    { limit: 50 }
  )
)
```

**ショートカット**:
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z` or `Ctrl+Y`: Redo

**工数**: 中

---

### 2.2 キーボードショートカットの拡充

| キー | 動作 |
|------|------|
| `Space` | 再生/一時停止 |
| `Ctrl+S` | プロジェクト保存 |
| `Ctrl+O` | プロジェクト読み込み |
| `Ctrl+E` | エクスポート |
| `Delete` | 選択中のセグメント/クリップ削除 |
| `←` `→` | 1秒シーク |
| `Shift+←` `Shift+→` | 10秒シーク |
| `Home` | 先頭へ移動 |
| `End` | 末尾へ移動 |

**工数**: 小

---

### 2.3 プレビューの改善

**実装内容**:
1. フルスクリーンプレビュー
2. 再生速度の変更（0.5x, 1x, 1.5x, 2x）
3. フレーム単位のシーク
4. 現在のセグメント表示

**工数**: 中

---

## Phase 3: 高度な編集機能

### 3.1 トランジション効果

**対応トランジション**:
- フェード（黒/白）
- クロスフェード
- ワイプ（左→右、上→下など）

**データ構造**:
```typescript
interface Segment {
  // ... existing fields
  transitionIn?: {
    type: 'fade' | 'crossfade' | 'wipe'
    duration: number
    direction?: 'left' | 'right' | 'up' | 'down'
  }
}
```

**FFmpegフィルター**:
```
xfade=transition=fade:duration=1:offset=5
```

**工数**: 大

---

### 3.2 テキストオーバーレイ

**機能**:
- テキスト追加（タイトル、字幕）
- フォント、サイズ、色の設定
- 位置の調整（9箇所プリセット + 自由配置）
- 表示時間の設定

**データ構造**:
```typescript
interface TextOverlay {
  id: string
  text: string
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor?: string
  position: 'top-left' | 'top-center' | ... | 'custom'
  x?: number
  y?: number
  startTime: number
  endTime: number
}
```

**FFmpegフィルター**:
```
drawtext=text='Hello':fontfile=font.ttf:fontsize=48:fontcolor=white:x=(w-tw)/2:y=h-th-50
```

**工数**: 大

---

### 3.3 エクスポート設定の拡張

**設定項目**:

| 項目 | 選択肢 |
|------|--------|
| 解像度 | 720p (1280x720), 1080p (1920x1080), 4K (3840x2160) |
| 品質 | 高速 (CRF 28), バランス (CRF 23), 高品質 (CRF 18) |
| コーデック | H.264, H.265 (HEVC) |
| フレームレート | 24, 30, 60 fps |

**工数**: 中

---

## Phase 4: 配布とサービス化

### 4.1 マルチプラットフォーム対応

**Windows** (現在対応済み):
- NSIS インストーラー

**macOS**:
```json
// package.json
"mac": {
  "target": ["dmg", "zip"],
  "icon": "build/icon.icns",
  "category": "public.app-category.video"
}
```

**Linux**:
```json
"linux": {
  "target": ["AppImage", "deb"],
  "category": "Video"
}
```

**工数**: 中

---

### 4.2 自動更新機能

**実装**:
```bash
npm install electron-updater
```

**コード例**:
```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.checkForUpdatesAndNotify()
```

**GitHub Releases** と連携して自動配布

**工数**: 中

---

### 4.3 GitHub Actions CI/CD

```yaml
# .github/workflows/release.yml
name: Build and Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            release/*.exe
            release/*.dmg
            release/*.AppImage
```

**工数**: 小〜中

---

## Phase 5: Web版（将来的なオプション）

### 5.1 WebAssembly版FFmpeg

**技術**:
- `ffmpeg.wasm` でブラウザ内処理
- サーバーレスで動作

**制限**:
- 処理速度が5-10倍遅い
- 大きなファイルは厳しい
- メモリ制限

**ユースケース**:
- 短い動画のクイック編集
- デモ/トライアル版

---

### 5.2 サーバーサイドレンダリング

**アーキテクチャ**:
```
[ブラウザUI] → [API] → [ジョブキュー] → [FFmpegワーカー] → [S3]
                           ↓
                     [進捗通知(WebSocket)]
```

**技術スタック**:
- フロント: React (現在のコードを流用)
- バックエンド: Node.js / Express
- キュー: Bull / BullMQ (Redis)
- ストレージ: AWS S3 / GCS
- ワーカー: Docker + FFmpeg

**コスト考慮**:
- 動画処理はCPU/メモリ消費大
- 従量課金が適切

---

## 推奨する次のステップ

### すぐにできること（1-2日）

1. **PiPレイアウトのUI対応** - 既存機能の有効化
2. **キーボードショートカット追加** - UX改善

### 短期（1週間）

3. **プロジェクト保存/読み込み** - 実用性向上
4. **セグメントの並べ替え** - 編集効率向上

### 中期（2-4週間）

5. **Undo/Redo** - 編集の安心感
6. **GitHub Releases配布** - ユーザーへの配布開始
7. **自動更新機能** - メンテナンス容易化

### 長期

8. **トランジション効果**
9. **テキストオーバーレイ**
10. **Web版検討**

---

## 技術的な考慮事項

### パフォーマンス

- サムネイル生成はバックグラウンドで実行
- 大きなファイルのプレビューはストリーミング
- FFmpegフィルターは可能な限り1パスで処理

### セキュリティ

- `contextIsolation: true` を維持
- ファイルパスのサニタイズ
- IPC通信の検証

### アクセシビリティ

- キーボードナビゲーション対応
- フォーカス管理
- 適切なARIAラベル

---

## 参考リンク

- [Electron公式ドキュメント](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [FFmpeg Filters](https://ffmpeg.org/ffmpeg-filters.html)
- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
