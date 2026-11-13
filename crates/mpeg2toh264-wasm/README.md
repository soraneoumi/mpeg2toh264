# mpeg2toh264-wasm

`mpeg2toh264::Session`をブラウザーから使うための`wasm-bindgen`ラッパーです。パッケージングとタイムライン計算はコアクレートにあり、このクレートはJavaScriptとの値の受け渡しだけを行います。

```ts
import init, { Session } from './mpeg2toh264_wasm.js';

await init({
  module_or_path: new URL('./mpeg2toh264_wasm_bg.wasm', import.meta.url),
});

const session = new Session(undefined, undefined, undefined, undefined, 'passthrough');
for (const fragment of session.push(chunk)) {
  if (fragment.kind === 'init') {
    openSourceBuffer(fragment.mimeCodec, fragment.data);
  } else if (fragment.kind === 'media') {
    append(fragment.data, fragment.start, fragment.randomAccess);
  } else {
    handlePrivateStream(fragment.streamId, fragment.pid, fragment.data, fragment.pts);
  }
}
for (const fragment of session.finish()) {
  // 同様に処理
}
```

`Session`のコンストラクターは、`originTicks`、`serviceId`、`recoveryInterval`、`splitFieldSamples`、`video`、`openGopRecovery`、`splitGroups`をこの順に省略可能な引数として受け取ります。ただし`video`には既定値がなく、`"passthrough"`か`"decode"`のどちらかを必ず渡します。`undefined`やそれ以外の値はエラーです。`"passthrough"`はMPEG-2映像を変換せずそのまま格納し、`mimeCodec`は`video/mp4; codecs="mp4v.61"`になります。`"decode"`を渡すとMP4には音声だけを入れ、映像は`kind: "video"`のフラグメントとして渡します。これは`PictureDecoder`でデコードします。`openGopRecovery`は`"recovery-point"`（既定）か`"discard"`で、リカバリー境界でOpen GOPの先頭Bピクチャを保持するか捨てるかを決めます。`recoveryInterval`は正の整数でなければなりません。各オプションの意味はコアクレートの`SessionOptions`を参照してください。返されるフラグメントは通常のJavaScriptオブジェクトで、明示的な`free()`は不要です。

`firstTimestamp(data)`と`lastTimestamp(data)`は、TS断片内のPESタイムスタンプを90 kHz単位で返します。

ビルドには`Cargo.lock`内のcrateと同じバージョンの`wasm-bindgen-cli`が必要です。

```bash
./tools/build-wasm.sh
```
