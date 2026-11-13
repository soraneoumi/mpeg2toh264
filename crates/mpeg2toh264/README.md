# mpeg2toh264 core

MPEG-TSの分離、MPEG-2 Videoのパース、AAC-LCの処理、fragmented MP4の生成、MPEG-2 Videoのソフトウェアデコードを行うコアクレートです。

## ストリーミング

`Session`はMPEG-TSのチャンクを受け取り、MSEへ追加できるfragmented MP4を返します。分離、GOP分割、AAC処理、多重化、音声と映像のタイムライン調整を内部で行います。映像の扱いは`SessionOptions::video`で必ず指定します。既定のモードはありません。

```rust
use mpeg2toh264::{Fragment, Session, SessionOptions, VideoMode};

let mut session = Session::new(SessionOptions::new(VideoMode::Passthrough));
for chunk in input.chunks(1 << 20) {
    for fragment in session.push(chunk)? {
        match fragment {
            Fragment::Init { data, mime_codec, width, height } =>
                open(&mime_codec, data, width, height),
            Fragment::Media { data, start, random_access, scans, .. } =>
                append(data, start, random_access, scans),
            Fragment::Video { data, start, restart, intra, pictures } =>
                decode(data, start, restart, intra, pictures),
            Fragment::PrivateStream { stream_id, pid, data, pts } =>
                dispatch(stream_id, pid, data, pts),
        }
    }
}
for fragment in session.finish()? {
    // 同様に処理
}
```

ファイルの途中から再開するときは、最初のセッションが返した`origin_ticks()`を`Session::anchored`へ渡します。`first_pts()`と`last_pts()`は、TSの一部分からシーク位置や再生時間を見積もるためのヘルパーです。

複数サービスを含むTSからサービスを指定する場合は`Session::for_service`を使います。

## オプション

`SessionOptions::new(video)`は指定した`video`に、以下の既定値を組み合わせたオプションを返します。各フィールドは公開されているので、構造体更新構文で変更できます。

- `video`: `VideoMode::Passthrough`か`VideoMode::Decode`
- `recovery_interval`: リカバリー境界を置くGOPの間隔（既定24）。32 MiBのメディアが出るまでランダムアクセスポイントがなければ、間隔に関わらず境界が来ます。0にするとこの上限だけが残ります
- `open_gop_recovery`: リカバリー境界でOpen GOPの先頭Bピクチャをどうするか。`OpenGopRecovery::RecoveryPoint`（既定）は先頭Bピクチャを保持します。パススルーでは、境界で始まるフラグメントがイントラピクチャで始まる場合にランダムアクセスポイントとして印を付けます。デコードモードには印を付ける映像トラックがないため、何も変わりません。`OpenGopRecovery::Discard`は先頭Bピクチャを捨て、境界のイントラピクチャからストリームの先頭と同じように始めます。パススルーではそのフラグメントがランダムアクセスポイントになり、デコードモードでは`Fragment::Video`の`restart`が立ちます
- `split_field_samples`: 相補フィールドペアの各フィールドを別々のMP4サンプルにするか（既定`true`）。パススルーだけが参照します。デコードモードにはMP4の映像トラックがなく、ペアはデコードする側から見て1枚のピクチャだからです
- `split_groups`: GOPをアンカーピクチャ1枚とその後に符号化されたBピクチャの単位に分け、それぞれを別のフラグメントにするか（既定`false`）。ピクチャとタイミングは変わらず、フラグメントの境界だけが動きます。デコードモードは常に分けます

## パススルー

`VideoMode::Passthrough`では、`Session`はMPEG-2映像を変換せずそのままMP4へ格納します。映像は放送のビットそのままで、MPEG-2デコーダーを持つプレイヤーでしか再生できません。`Fragment::Init`の`mime_codec`は`video/mp4; codecs="mp4v.61"`になります。

## デコード

`VideoMode::Decode`では、MP4には音声だけを入れ、MPEG-2映像は`Fragment::Video`として単位ごとに渡します。音声がメディア要素の時計になるため、AAC音声のないストリームは`Error::is_no_aac_audio()`が真のエラーになります。`mpeg2::decode`の`UnitDecoder`が`Fragment::Video`をデコードし、`StreamDecoder`はエレメンタリーストリームをそのままデコードします。

## コンテナー関数

- `extract_mpeg2_video_es`: MPEG-TSからMPEG-2 Videoを取り出す
- `mpeg2_video_timeline`: MPEG-2の表示順と各サンプルの時刻を復元する
- `mpeg2_passthrough_unit`: 同じ表示順に加えて、各サンプルのバイト範囲を返す
- `mpeg2_to_fmp4` / `mpeg2_gop_to_fmp4`: MPEG-2をそのままfragmented MP4に格納する。`mpeg2_gop_to_fmp4`はGOP単位でAACと一緒にMSE向けフラグメントにする
- `mpeg2_decode_unit_to_fmp4`: 音声だけのフラグメントと、各ピクチャの表示時刻を返す
- `first_pts` / `last_pts`: TS断片の先頭・末尾のPESタイムスタンプを読む

詳細な型とエラー条件は公開項目のrustdocを参照してください。
