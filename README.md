# mpeg2toh264

[demo](https://otya128.github.io/mpeg2toh264/)
[日本語版はこちら](#日本語)

A library for playing the MPEG-2 video of MPEG transport streams, such as Japanese broadcast recordings and live streams, in a browser, with a command-line tool for the same packaging.

The transport stream is demultiplexed and cut into fragmented MP4 in WebAssembly, and the MPEG-2 video is never re-encoded. There are two ways to show the video:

- Decode: the MP4 carries only the AAC sound, which plays through Media Source Extensions and keeps the clock. The MPEG-2 pictures are decoded in WebAssembly in a Worker and handed to the WebGL deinterlacer in `packages/yadif`.
- Passthrough: the MPEG-2 video goes into the MP4 unchanged and the browser decodes it. This works only in a browser with an MPEG-2 decoder, such as Safari on Apple platforms; `supportsPassthrough()` tells.

## Command-line tool

Input may be an MPEG-2 Video elementary stream or an MPEG transport stream with 188-byte packets. For a transport stream, the first service with MPEG-2 video is selected through the PAT/PMT, with its AAC-LC sound. The output is a timestamped fragmented MP4 holding the video unchanged; elementary-stream input has no sound.

```bash
cargo build --release
./target/release/mpeg2toh264 input.ts output.mp4
./target/release/mpeg2toh264 decode input.ts output.yuv
```

```text
-r, --recovery-interval <n>   GOPs between recovery points (default: 24)
    --open-gop <mode>         recovery-point (default) or discard
-s, --split-field-samples     Put each field in its own MP4 sample (default)
    --no-split-field-samples  Keep a complementary field pair in one MP4 sample
    --audio-gain <n>          Raise the AAC sound by n steps of about 1.5 dB
    --surround-audio-gain <n> The same for sound of more than two channels
    --split-groups            Cut each GOP into fragments of one anchor picture
                              and the B pictures coded after it
-q, --quiet                   Suppress progress and summary output
-h, --help                    Show help
```

`decode` writes the pictures as planar 4:2:0 frames in display order. AAC is not re-encoded; mono and dual mono are written as stereo.

Putting both fields of a complementary pair in one MP4 sample interferes with playback of the passed-through video in Firefox on Windows, where the field pictures freeze where frame pictures give way to them, and in Safari, which raises `MEDIA_ERR_DECODE` through MSE only. Each field is therefore its own sample by default.

## WebAssembly and MSE player

`packages/player` plays a transport stream from a URL in a `<video>`: it fetches, packages in a Worker, manages the MSE buffer and seeks by byte-range requests. It decodes when it was given a deinterlacer that takes decoded pictures and the stream has AAC sound, and carries the video through when `passthrough` is set and it cannot. Otherwise the load fails with an error that says why.

```ts
import { Mpeg2TsPlayer } from "@mpeg2toh264/player";
import { Deinterlacer } from "@mpeg2toh264/yadif";

const player = new Mpeg2TsPlayer(video, {
  passthrough: false,
  deinterlace: true,
  deinterlacer: (element) => new Deinterlacer(element, { film: true }),
});
await player.load("https://example.com/video.ts");
```

Docker can run a demo that plays a selected local file or URL in the browser.

```bash
docker build -t mpeg2toh264-demo .
docker run --rm -p 8080:80 mpeg2toh264-demo
# http://localhost:8080
```

A reverse proxy can be configured when reading a transport stream from another HTTP server without CORS configuration.

```bash
docker run --rm -p 8080:80 \
  -e PROXY_UPSTREAM=http://192.168.1.3:40772 \
  mpeg2toh264-demo
```

In this example, requesting `/proxy/api/channels/GR/27/stream` forwards to `http://192.168.1.3:40772/api/channels/GR/27/stream`.

Local build:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli  # Match the wasm-bindgen version in Cargo.lock
./tools/build-wasm.sh
npm install
npm run packages:build
npm run web:dev
```

The demo uses <https://github.com/monyone/aribb24.js> to display captions and superimposed text.

## Repository layout

```text
crates/mpeg2toh264/       Transport stream demultiplexing, MPEG-2 parsing and decoding, MP4 output, and Session
crates/mpeg2toh264-cli/   CLI
crates/mpeg2toh264-wasm/  wasm-bindgen wrapper for Session and the picture decoder
packages/player/          Browser player
packages/yadif/           WebGL yadif
packages/demo/            Browser demo
testdata/                 Test data
tools/                    Table generation, WASM builds, test-data creation, and tests
```

The interface for each library is documented in the README in its directory.

The Rust crate, CLI, and player are licensed under MIT. `packages/yadif` is licensed under LGPL-2.1-or-later because it contains code derived from FFmpeg. The AAC processing approach was inspired by <https://github.com/xtne6f/tsreadex>.

---

## 日本語

日本の放送録画やライブ配信などのMPEG-TSに含まれるMPEG-2映像をブラウザーで再生するためのライブラリと、同じパッケージングを行うコマンドラインツールです。

TSはWebAssemblyで分離してfragmented MP4に切り出し、MPEG-2映像を再エンコードすることはありません。映像の表示には2つの方法があります。

- デコード: MP4にはAAC音声だけを入れ、Media Source Extensionsで再生して時計にします。MPEG-2の映像はWorker内のWebAssemblyでデコードし、`packages/yadif`のWebGLデインターレーサーへ渡します。
- パススルー: MPEG-2映像をそのままMP4へ入れ、ブラウザーにデコードさせます。MPEG-2デコーダーを持つブラウザー (AppleプラットフォームのSafariなど) でのみ動作し、`supportsPassthrough()`で判定できます。

## コマンドラインツール

入力はMPEG-2 Video ES、または188バイトパケットのMPEG-TSです。TSではPAT/PMTからMPEG-2映像を持つ最初のサービスと、そのAAC-LC音声を選びます。出力は映像をそのまま格納したタイムスタンプ付きのfragmented MP4で、ES入力には音声がありません。

```bash
cargo build --release
./target/release/mpeg2toh264 input.ts output.mp4
./target/release/mpeg2toh264 decode input.ts output.yuv
```

```text
-r, --recovery-interval <n>   リカバリーポイントのGOP間隔 (既定: 24)
    --open-gop <mode>         recovery-point (既定)、discard
-s, --split-field-samples     各フィールドを別々のMP4サンプルにする (既定)
    --no-split-field-samples  相補フィールドペアを1つのMP4サンプルにする
    --audio-gain <n>          AAC音声を約1.5 dB刻みでn段階上げる
    --surround-audio-gain <n> 3チャンネル以上の音声について同じ指定
    --split-groups            GOPをアンカーピクチャ1枚とその後に符号化された
                              Bピクチャの単位のフラグメントに分ける
-q, --quiet                   進捗と概要を表示しない
-h, --help                    ヘルプを表示
```

`decode`はピクチャを表示順のプラナー4:2:0フレームとして書き出します。AACは再エンコードせず、モノラルとデュアルモノはステレオで出力します。

フィールドペアの両ピクチャを同一のMP4サンプルに入れると、パススルーした映像の再生がWindows版FirefoxとSafariで妨げられます。Windows版Firefoxではフレームピクチャからフィールドピクチャに変わるとフィールドピクチャの映像がフリーズし、SafariではMSE経由の場合のみ`MEDIA_ERR_DECODE`となります。そのため既定では各フィールドを別サンプルにします。

## WebAssemblyとMSEプレイヤー

`packages/player`はURLのTSを`<video>`で再生します。取得、Worker内でのパッケージング、MSEバッファーの管理、Rangeリクエストによるシークを行います。デコード後のピクチャを受け取るデインターレーサーが指定されていてストリームにAAC音声がある場合はデコードし、デコードできない場合は`passthrough`が設定されていれば映像をそのまま渡します。どちらもできない場合、読み込みは理由を示すエラーで失敗します。

```ts
import { Mpeg2TsPlayer } from "@mpeg2toh264/player";
import { Deinterlacer } from "@mpeg2toh264/yadif";

const player = new Mpeg2TsPlayer(video, {
  passthrough: false,
  deinterlace: true,
  deinterlacer: (element) => new Deinterlacer(element, { film: true }),
});
await player.load("https://example.com/video.ts");
```

Dockerでは選択したローカルファイルまたはURLをブラウザーで再生するデモを起動できます。

```bash
docker build -t mpeg2toh264-demo .
docker run --rm -p 8080:80 mpeg2toh264-demo
# http://localhost:8080
```

別のHTTPサーバーにあるTSをCORS設定なしで読む場合はリバースプロキシを指定できます。

```bash
docker run --rm -p 8080:80 \
  -e PROXY_UPSTREAM=http://192.168.1.3:40772 \
  mpeg2toh264-demo
```

この場合`/proxy/api/channels/GR/27/stream`を指定すると`http://192.168.1.3:40772/api/channels/GR/27/stream`へ転送します。

ローカルビルド:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli  # Cargo.lock内のwasm-bindgenと同じバージョン
./tools/build-wasm.sh
npm install
npm run packages:build
npm run web:dev
```

デモでは <https://github.com/monyone/aribb24.js> を使って字幕と文字スーパーを表示しています。

## 構成

```text
crates/mpeg2toh264/       TSの分離、MPEG-2の解析とデコード、MP4出力、Session
crates/mpeg2toh264-cli/   CLI
crates/mpeg2toh264-wasm/  Sessionとピクチャデコーダーのwasm-bindgenラッパー
packages/player/          ブラウザープレイヤー
packages/yadif/           WebGL yadif
packages/demo/            ブラウザーデモ
testdata/                 テストデータ
tools/                    テーブル生成、WASMビルド、テストデータ作成、テスト
```

各ライブラリのインターフェースはそれぞれのディレクトリにあるREADMEに記載しています。

Rustクレート、CLI、プレイヤーはMITライセンスです。`packages/yadif`はFFmpeg由来の部分を含むためLGPL-2.1-or-laterです。
AACの処理の発想は <https://github.com/xtne6f/tsreadex> を参考にしています。
