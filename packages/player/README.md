# @mpeg2toh264/player

MPEG-2 TSを再生するMSEプレイヤーです。Worker内でTSをfMP4へパッケージングし、`<video>`で再生します。取得、パッケージング、バッファー管理、Rangeリクエストによるシークをまとめて扱います。

映像は次の2通りで再生します。

- デコード: 音声だけをMP4に入れて`<video>`で再生し、映像のMPEG-2はWorkerのWebAssemblyでデコードして、`decodedVideo`入力を持つデインターレーサーへ渡します。
- パススルー: MPEG-2映像をMP4へそのまま入れ、ブラウザーのデコーダーで再生します。

```ts
import { Mpeg2TsPlayer } from '@mpeg2toh264/player';

const player = new Mpeg2TsPlayer(document.querySelector('video')!, {
  passthrough: true,
});
player.addEventListener('error', (event) => console.error(event.detail.error));
await player.load('https://example.com/video.ts');
```

`load()`はメディアソースが要素へ接続され、最初のデータが入った時点で完了します。パッケージングはその後もWorker内で続きます。`stop()`は現在の読み込みだけを中止し、`destroy()`はWorkerを含めて破棄します。

## 映像の再生方法

次の3条件がそろう場合にデコードで再生します。

- `decodedVideo`入力を持つデインターレーサーを`deinterlacer`で指定している
- `softwareDecode`が`false`ではない
- ストリームにAAC音声がある（音声が再生位置の基準になるため）

そろわない場合は、`passthrough`が`true`ならパススルーで再生します。`passthrough`が`false`または未指定なら読み込みは失敗し、`load()`が拒否され、理由を示すメッセージで`error`イベントが発生します。暗黙の切り替えや既定の方式はありません。

- デインターレーサーがない、または`decodedVideo`入力を持たない場合、あるいは`softwareDecode`が`false`の場合は、`load()`の呼び出し時点で失敗します。
- AAC音声のないストリームは、読み込み開始後にデコードできないと分かります。`passthrough`が`true`なら同じ入力をパススルーで読み込み直し、そうでなければ失敗します。

読み込みが失敗してもプレイヤーは次の`load()`に使えます。

オプションの値が不正な場合（`mediaSource`、`openGopRecovery`の未知の値、正の整数でない`recoveryInterval`など）は、コンストラクターが例外を投げます。

## オプション

`Mpeg2TsPlayer`の第2引数で次を指定できます。

- `wasmUrl`: WASMファイルのURL
- `workerUrl`: モジュール Worker の URL。既定ではパッケージと同時に出力された Worker を使う
- `mediaSource`: MSEを`worker`と`main`のどちらで動かすか。既定の`auto`はブラウザー機能から選ぶ
- `preferManagedMediaSource`: `MediaSource`と`ManagedMediaSource`の両方があるブラウザーで後者を使う。`MediaSource`がないiPhoneではこの指定によらず`ManagedMediaSource`を使うため、指定は主に他の環境での動作確認用。`requiresManagedMediaSource()`でそのブラウザーに`ManagedMediaSource`しかないかを判定できる
- `passthrough`: デコードできない場合にMPEG-2映像をそのままMP4へ入れてブラウザーに再生させる。MPEG-2をデコードできるブラウザー (AppleプラットフォームのSafari) のみ。`supportsPassthrough()`で判定できる
- `softwareDecode`: `false`でデコードを使わない。既定はデコードを使う
- `recoveryInterval`: リカバリー境界を置くGOP数の間隔（正の整数、既定は24）
- `openGopRecovery`: リカバリー境界でOpen GOPの先頭Bピクチャを保持する`recovery-point`（既定）か、捨てて境界のIピクチャから始める`discard`
- `splitFieldSamples`: 相補フィールド対の各フィールドを別のMP4サンプルにする（既定は`true`）。映像トラックを持つパススルーにだけ作用する
- `audioGainSteps` / `surroundAudioGainSteps`: AACの`global_gain`を2^(1/4)刻みで上げる段数（0から255の整数）。後者は3チャンネル以上の音声用で、既定は前者と同じ値
- `serviceId`: 複数サービスを含むTSから再生するサービス
- `queueHighWaterMark`: 追加待ちデータの上限
- `maxAheadSeconds`: 再生位置より先にパッケージングして保持する秒数
- `keepBehindSeconds`: 再生済み範囲を保持する秒数
- `deinterlace` / `deinterlacer`: 差し替え可能なデインターレーサー

`deinterlacer` を指定すると、フィルターは読み込み時に構築され、`deinterlace` に従って描画を開始・停止します。  
フィルターが `decodedVideo` 入力（`push()`、`reset()`、`finish()`、`onrelease`）を公開している場合、デコードした映像をそこへ渡します。  
パススルーでは、フィルターは`<video>`要素から映像を取得します。  
プレイヤー自体はデコード処理や YADIF に依存しません。

## イベント

- `statechange`: `idle`、`loading`、`converting`などの状態変化
- `progress`: 取得の進捗
- `stats`: 処理速度などの統計
- `audio`: 音声ストリームの一覧と現在の選択
- `services`: TSが含むサービスと現在の選択
- `seekable`: Rangeシーク可能な入力の再生時間
- `private_stream_1` / `private_stream_2`: 選択サービスのprivate PES
- `timing`: 読み込み開始から各段階までの所要時間
- `error`: 読み込み中を含むすべてのエラー
