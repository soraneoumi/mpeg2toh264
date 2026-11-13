//! WebAssembly bindings for the streaming MPEG-2 packager and decoder.
//!
//! This is a translation layer and nothing else: the pipeline, and in
//! particular the timeline arithmetic that decides where each fragment sits,
//! lives in [`mpeg2toh264::Session`] where it can be tested without a browser.
//! What is here turns Rust values into the shapes JavaScript expects.

use js_sys::{Array, Object, Reflect, Uint8Array};
use mpeg2toh264::mpeg2::decode::{packed_planes, DecodedFrame, UnitDecoder};
use mpeg2toh264::{
    AudioGain, DualMono, Fragment, OpenGopRecovery, SessionOptions, VideoMode, YcbcrMatrix,
};
use wasm_bindgen::prelude::*;

/// The shape of what [`Session::push`] returns, declared so the browser sources
/// get something better than `any[]` to typecheck against.
#[wasm_bindgen(typescript_custom_section)]
const FRAGMENT_TYPESCRIPT: &str = r#"
/** One thing to hand to Media Source Extensions. */
export type Fragment =
  | {
      /**
       * An initialization segment, which comes before the media it describes.
       * Normally the only one; a stream that changes its frame size, its field
       * coding or its aspect ratio sends another, and the `SourceBuffer` takes
       * it in the same order as everything else.
       */
      kind: "init";
      data: Uint8Array;
      /** What to open the SourceBuffer with. */
      mimeCodec: string;
      width: number;
      height: number;
    }
  | {
      kind: "media";
      data: Uint8Array;
      /** Where this fragment starts on the presentation timeline, in seconds. */
      start: number;
      /** Whether a decoder can begin here, which is where eviction may stop. */
      randomAccess: boolean;
      /** PAT/PMT start from which this GOP can be demuxed in a new Session. */
      restartOffset: number | null;
      videoSamples: number;
      audioSamples: number;
      /** Picture-accurate field changes, in presentation order. */
      scans: {
        start: number;
        interlaced: boolean;
        topFieldFirst: boolean;
      }[];
    }
  | {
      /**
       * One unit of MPEG-2 to decode with `PictureDecoder`, in decode mode
       * only. It follows the `media` fragment carrying the unit's sound,
       * where the unit has any.
       */
      kind: "video";
      data: Uint8Array;
      /** Where the unit starts on the presentation timeline, in seconds. */
      start: number;
      /** References decoded before this unit must not be used. */
      restart: boolean;
      /** Whether decoding can begin here after a jump. */
      intra: boolean;
      /** The coded frames to decode, in decode order. */
      pictures: VideoPicture[];
    }
  | {
      kind: "private-stream";
      /** PES stream_id: 0xbd (private_stream_1) or 0xbf (private_stream_2). */
      streamId: number;
      pid: number;
      data: Uint8Array;
      /** Absolute 90 kHz timestamp, or null when no media clock is available. */
      pts: number | null;
    };

/** One coded frame of a `video` fragment. */
export type VideoPicture = {
  /** Index of the frame picture, or of its first field, in the unit. */
  picture: number;
  /** Index of the second field, for a frame coded as two fields. */
  secondField: number | null;
  /** Presentation time in seconds on the media element's timeline. */
  time: number;
  /** How long it is shown, in seconds. */
  duration: number;
};

/** A picture `PictureDecoder.next` decoded, and how to copy it out. */
export type DecodedPictureInfo = {
  time: number;
  duration: number;
  /** Visible luma size. */
  width: number;
  height: number;
  /** Size after the sample aspect ratio. */
  displayWidth: number;
  displayHeight: number;
  /** False when both fields are one instant (progressive_frame). */
  interlaced: boolean;
  topFieldFirst: boolean;
  repeatFirstField: boolean;
  matrix: "bt709" | "bt601";
  /** Macroblocks not decoded from the stream but concealed. */
  concealedMacroblocks: number;
  /** Bytes `copy` writes: Y, Cb and Cr, each with its coded stride. */
  byteLength: number;
  planes: [
    { offset: number; stride: number },
    { offset: number; stride: number },
    { offset: number; stride: number },
  ];
};

/**
 * One sound stream a service offers, as its program map describes it.
 *
 * All of it comes from the map, so the choice can be offered before a byte of
 * any of these streams has been read.
 */
export type AudioStream = {
  /** Elementary stream PID, which is what `selectAudio` takes. */
  pid: number;
  /**
   * The ARIB stream identifier's component tag. A broadcast names its main
   * sound 0x10 and the ones beside it 0x11 upwards, which is all that
   * distinguishes them where the languages are the same.
   */
  componentTag: number | null;
  /**
   * Whether the stream's two channels are two separate services rather than a
   * stereo pair. Choosing between those is `selectDualMono`, not this: they
   * are one stream.
   */
  dualMono: boolean;
  /**
   * The languages the descriptors name, in the order they name them, as ISO
   * 639 codes. Dual mono carries the second service's language second.
   */
  languages: string[];
};
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Fragment[]")]
    pub type FragmentArray;
    #[wasm_bindgen(typescript_type = "AudioStream[]")]
    pub type AudioStreamArray;
    #[wasm_bindgen(typescript_type = "Extract<Fragment, { kind: \"video\" }>")]
    pub type VideoFragment;
    #[wasm_bindgen(typescript_type = "DecodedPictureInfo")]
    pub type DecodedPictureInfoObject;
}

/// Streaming conversion of one transport stream to fragmented MP4.
///
/// Feed it the file in slices and append what comes back:
///
/// ```js
/// const session = new Session(undefined, undefined, undefined, undefined, "passthrough");
/// for (const fragment of session.push(chunk)) append(fragment);
/// for (const fragment of session.finish()) append(fragment);
/// ```
///
/// A slice that completes no fragment returns an empty array, which is normal.
///
/// Each fragment is a plain object, so there is nothing to free:
///
/// - `kind` -- `"init"` for an initialization segment, which comes before the
///   media it describes, or `"media"` for the media itself. There is normally
///   one init fragment; a stream that changes what its sequence header says
///   sends another, and it is appended in the order it arrives.
/// - `data` -- the bytes to append. Its `ArrayBuffer` is the worker's own, so
///   it can be transferred to the page rather than copied again.
/// - `mimeCodec` -- what to open the `SourceBuffer` with. Init fragments only.
/// - `start` -- where the fragment sits on the presentation timeline, in
///   seconds. Media fragments only.
/// - `randomAccess` -- whether a decoder can begin here. A player needs this,
///   with `start`, to evict buffered media without cutting into what is about
///   to play. Media fragments only.
/// - `videoSamples`, `audioSamples` -- how many of each the fragment carries.
#[wasm_bindgen]
pub struct Session {
    inner: mpeg2toh264::Session,
}

#[wasm_bindgen]
impl Session {
    /// Start a session.
    ///
    /// `originTicks` measures the timeline from a PES timestamp of the
    /// caller's choosing rather than from wherever this input opens, which is
    /// what makes a stream starting mid-file appendable at the time it really
    /// holds. Pass the `originTicks` an earlier session reported.
    ///
    /// `serviceId` takes one named service out of a transport stream that
    /// carries several. `undefined` takes the first that turns up with a
    /// picture in it. See `serviceIds` for what a recording is offering.
    ///
    /// `recoveryInterval` is how many groups of pictures lie between recovery
    /// boundaries, a positive integer; `undefined` takes 24. What a boundary
    /// does is `openGopRecovery`'s to say.
    ///
    /// `splitFieldSamples` gives each field of a complementary pair its own MP4
    /// sample, which `undefined` does too. `false` keeps the pair in one. Only
    /// `"passthrough"` has a video track to split.
    ///
    /// `video` is what becomes of the pictures, and has no default: anything
    /// but the two values below, `undefined` included, is an error.
    /// `"passthrough"` carries the MPEG-2 into the MP4 as it stands, for a
    /// browser whose decoder takes MPEG-2: a browser that does not decode MPEG-2
    /// plays none of it, so ask `MediaSource.isTypeSupported` with the
    /// `mimeCodec` the init fragment reports first. `"decode"` muxes only the
    /// sound and hands each unit out as a `video` fragment for
    /// `PictureDecoder`; a stream without AAC sound then fails with an error
    /// named `NoAacAudioError`.
    ///
    /// `openGopRecovery` is what a recovery boundary does with the leading
    /// pictures of an open group. `"recovery-point"`, which `undefined` takes,
    /// keeps them, and `"passthrough"` marks the fragment that opens at the
    /// boundary as a random access point; `"decode"` has no video track to
    /// mark, so there it changes nothing. `"discard"` drops them and begins
    /// again at the boundary's intra picture, as at the start of the stream:
    /// `"passthrough"` marks the fragment a random access point, and `"decode"`
    /// sends the unit with `restart` set.
    ///
    /// `splitGroups` cuts each group of pictures into fragments of one anchor
    /// picture and the B pictures coded after it, so that media reaches the
    /// player as soon as it has arrived instead of once its group has. The
    /// samples are the same either way. `undefined` sends whole groups;
    /// `"decode"` always cuts them.
    #[wasm_bindgen(constructor)]
    pub fn new(
        origin_ticks: Option<f64>,
        service_id: Option<u16>,
        recovery_interval: Option<u32>,
        split_field_samples: Option<bool>,
        video: Option<String>,
        open_gop_recovery: Option<String>,
        split_groups: Option<bool>,
    ) -> Result<Session, JsError> {
        let video = match video.as_deref() {
            Some("passthrough") => VideoMode::Passthrough,
            Some("decode") => VideoMode::Decode,
            _ => return Err(JsError::new("video must be 'passthrough' or 'decode'")),
        };
        let defaults = SessionOptions::new(video);
        let recovery_interval = recovery_interval.unwrap_or(defaults.recovery_interval as u32);
        if recovery_interval == 0 {
            return Err(JsError::new("recoveryInterval must be a positive integer"));
        }
        let origin = match origin_ticks {
            Some(ticks) if !ticks.is_finite() || ticks < 0.0 => {
                return Err(JsError::new("originTicks must be a timestamp"))
            }
            Some(ticks) => Some(ticks as u64),
            None => None,
        };
        let open_gop_recovery = match open_gop_recovery.as_deref() {
            None | Some("recovery-point") => OpenGopRecovery::RecoveryPoint,
            Some("discard") => OpenGopRecovery::Discard,
            Some(_) => {
                return Err(JsError::new(
                    "openGopRecovery must be 'recovery-point' or 'discard'",
                ))
            }
        };
        Ok(Self {
            inner: mpeg2toh264::Session::for_service(
                SessionOptions {
                    recovery_interval: recovery_interval as usize,
                    open_gop_recovery,
                    split_field_samples: split_field_samples
                        .unwrap_or(defaults.split_field_samples),
                    video,
                    split_groups: split_groups.unwrap_or(defaults.split_groups),
                },
                origin,
                service_id,
            ),
        })
    }

    /// The service the fragments are being made from, once a program map has
    /// named it, and `undefined` until then.
    #[wasm_bindgen(getter, js_name = serviceId)]
    pub fn service_id(&self) -> Option<u16> {
        self.inner.service_id()
    }

    /// Every service this transport stream has announced, in the order it
    /// announced them. Empty until the program association table arrives.
    #[wasm_bindgen(getter, js_name = serviceIds)]
    pub fn service_ids(&self) -> Vec<u16> {
        self.inner.service_ids().to_vec()
    }

    /// Every sound stream the chosen service offers, in the order its program
    /// map lists them. Empty until that map arrives.
    #[wasm_bindgen(getter, js_name = audioStreams)]
    pub fn audio_streams(&self) -> Result<AudioStreamArray, JsError> {
        let array = Array::new();
        for stream in self.inner.audio_streams() {
            let object = Object::new();
            set(&object, "pid", &(stream.pid as f64).into())?;
            set(
                &object,
                "componentTag",
                &stream
                    .component_tag
                    .map_or(JsValue::NULL, |tag| (tag as f64).into()),
            )?;
            set(&object, "dualMono", &stream.dual_mono.into())?;
            let languages = Array::new();
            for language in &stream.languages {
                languages.push(&JsValue::from_str(language));
            }
            set(&object, "languages", &languages.into())?;
            array.push(&object);
        }
        Ok(JsValue::from(array).unchecked_into())
    }

    /// Which of them the fragments are being made from, and `undefined` before
    /// the program map has named one.
    #[wasm_bindgen(getter, js_name = audioPid)]
    pub fn audio_pid(&self) -> Option<u16> {
        self.inner.audio_pid()
    }

    /// Take the sound from another of the service's streams from here on.
    ///
    /// Only from here on: the fragments already made carry the sound that was
    /// chosen when they were made and have been appended, so nothing goes back
    /// over them. Where the two streams are described differently -- a
    /// commentary in stereo beside a programme in 5.1 -- the fragment the
    /// change lands in carries an initialization segment of its own, exactly as
    /// a programme boundary that changes the sound does.
    #[wasm_bindgen(js_name = selectAudio)]
    pub fn select_audio(&mut self, pid: u16) {
        self.inner.select_audio(pid);
    }

    /// Whether the sound being read carries two services in one stream rather
    /// than a stereo pair, as the frames read so far had it.
    ///
    /// `audioStreams` says so too, from the program map, and says it before a
    /// frame has arrived. This is the stream itself, which is what a broadcast
    /// that turns dual mono on within a programme leaves the map disagreeing
    /// with.
    #[wasm_bindgen(getter, js_name = audioIsDualMono)]
    pub fn audio_is_dual_mono(&self) -> bool {
        self.inner.audio_is_dual_mono()
    }

    /// Take the sound of a dual-mono stream from the second service rather than
    /// the first, from here on.
    ///
    /// Both are rebuilt into the same two-channel configuration, so nothing is
    /// described anew and the frames on either side of the change play one
    /// after the other. A stream with one service in it is unaffected.
    #[wasm_bindgen(js_name = selectDualMono)]
    pub fn select_dual_mono(&mut self, sub: bool) {
        self.inner
            .select_dual_mono(if sub { DualMono::Sub } else { DualMono::Main });
    }

    /// Raise the sound of every audio frame read from here on, in steps of
    /// 2^(1/4) -- about 1.5 dB -- so that 4 doubles it. `surround` is the step
    /// for sound of more than two channels, which a stereo listener hears
    /// downmixed; mono and dual mono count as stereo, as they are handed out.
    ///
    /// Only each channel's `global_gain` changes: nothing is decoded or
    /// re-encoded, and a frame the step would take out of range for a decoder
    /// keeps its own level.
    #[wasm_bindgen(js_name = setAudioGain)]
    pub fn set_audio_gain(&mut self, stereo: f64, surround: f64) -> Result<(), JsError> {
        let steps = |value: f64| {
            (value.fract() == 0.0 && (0.0..=255.0).contains(&value)).then_some(value as u8)
        };
        let (Some(stereo), Some(surround)) = (steps(stereo), steps(surround)) else {
            return Err(JsError::new(
                "audio gain steps must be integers from 0 to 255",
            ));
        };
        self.inner.set_audio_gain(AudioGain { stereo, surround });
        Ok(())
    }

    /// The PES timestamp presentation time zero stands for, once the first
    /// fragment has fixed it, and `undefined` until then.
    #[wasm_bindgen(getter, js_name = originTicks)]
    pub fn origin_ticks(&self) -> Option<f64> {
        self.inner.origin_ticks().map(|ticks| ticks as f64)
    }

    #[wasm_bindgen(getter)]
    pub fn dropped(&self) -> f64 {
        self.inner.dropped() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn scrambled(&self) -> f64 {
        self.inner.scrambled() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn errors(&self) -> f64 {
        self.inner.errors() as f64
    }

    /// Feed the next slice of the transport stream.
    pub fn push(&mut self, chunk: &[u8]) -> Result<FragmentArray, JsError> {
        to_js_array(self.inner.push(chunk).map_err(to_js_error)?)
    }

    /// Flush everything held back, at end of input.
    pub fn finish(&mut self) -> Result<FragmentArray, JsError> {
        to_js_array(self.inner.finish().map_err(to_js_error)?)
    }
}

/// Decodes the `video` fragments of a session in decode mode.
///
/// Units go in in the order the session made them, each with `begin`, and
/// their pictures come out one `next` at a time, so that a caller decides how
/// much to decode and when:
///
/// ```js
/// const decoder = new PictureDecoder();
/// decoder.begin(unit);
/// for (const picture of unit.pictures) {
///   const info = decoder.next(true);
///   if (info) decoder.copy(buffer.subarray(0, info.byteLength));
/// }
/// ```
///
/// References carry from one unit to the next. After `reset`, or a unit or
/// picture that failed, nothing is decoded until a unit that opens with an
/// intra picture; a B picture is decoded only with both references.
#[wasm_bindgen]
pub struct PictureDecoder {
    inner: UnitDecoder,
    /// The unit's bytes, copied out of the fragment into storage kept from
    /// one unit to the next.
    data: Vec<u8>,
    /// Times of the unit's frames, as the fragment gave them.
    timing: Vec<(f64, f64)>,
    next: usize,
    /// The picture `next` returned last, until `copy` or the next call.
    shown: Option<DecodedFrame>,
}

#[wasm_bindgen]
impl PictureDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: UnitDecoder::new(),
            data: Vec::new(),
            timing: Vec::new(),
            next: 0,
            shown: None,
        }
    }

    /// Forget the references, for a jump.
    pub fn reset(&mut self) {
        self.inner.reset();
        self.timing.clear();
        self.next = 0;
        self.shown = None;
    }

    /// Take a `video` fragment and return how many frames it names. Throws
    /// when the fragment is malformed or the unit does not parse.
    pub fn begin(&mut self, unit: &VideoFragment) -> Result<u32, JsError> {
        self.timing.clear();
        self.next = 0;
        self.shown = None;
        let unit: &JsValue = unit;
        let data: Uint8Array = get(unit, "data")?
            .dyn_into()
            .map_err(|_| JsError::new("a video fragment's data is a Uint8Array"))?;
        let restart = get(unit, "restart")?
            .as_bool()
            .ok_or_else(|| JsError::new("a video fragment says whether it restarts"))?;
        let pictures: Array = get(unit, "pictures")?
            .dyn_into()
            .map_err(|_| JsError::new("a video fragment's pictures are an array"))?;
        let mut frames = Vec::with_capacity(pictures.length() as usize);
        for item in pictures.iter() {
            let picture = index(&get(&item, "picture")?)?;
            let second_field = match get(&item, "secondField")? {
                field if field.is_null() => None,
                field => Some(index(&field)?),
            };
            frames.push((picture, second_field));
            self.timing.push((
                number(&get(&item, "time")?)?,
                number(&get(&item, "duration")?)?,
            ));
        }
        self.data.resize(data.length() as usize, 0);
        data.copy_to(&mut self.data);
        let count = self
            .inner
            .begin(&self.data, restart, frames)
            .map_err(|error| {
                self.timing.clear();
                to_js_error(error)
            })?;
        Ok(count as u32)
    }

    /// Decode the unit's next frame. `show` is false for a picture needed
    /// only as a reference. Returns the picture to show, or `undefined` when
    /// there is none: not asked for, or skipped for want of references.
    /// Throws on a picture the decoder refuses.
    pub fn next(&mut self, show: bool) -> Result<Option<DecodedPictureInfoObject>, JsError> {
        self.shown = None;
        let Some(&(time, duration)) = self.timing.get(self.next) else {
            return Err(JsError::new("the unit has no frames left to decode"));
        };
        self.next += 1;
        let Some(shown) = self.inner.next(show).map_err(to_js_error)? else {
            return Ok(None);
        };
        let frame = &shown.frame;
        let info = frame.info();
        let object = Object::new();
        set(&object, "time", &time.into())?;
        set(&object, "duration", &duration.into())?;
        set(&object, "width", &(info.width as f64).into())?;
        set(&object, "height", &(info.height as f64).into())?;
        set(
            &object,
            "displayWidth",
            &f64::from(shown.display_width).into(),
        )?;
        set(
            &object,
            "displayHeight",
            &f64::from(shown.display_height).into(),
        )?;
        set(&object, "interlaced", &(!info.progressive_frame).into())?;
        set(&object, "topFieldFirst", &info.top_field_first.into())?;
        set(&object, "repeatFirstField", &info.repeat_first_field.into())?;
        set(
            &object,
            "matrix",
            &match shown.matrix {
                YcbcrMatrix::Bt709 => "bt709",
                YcbcrMatrix::Bt601 => "bt601",
            }
            .into(),
        )?;
        set(
            &object,
            "concealedMacroblocks",
            &(info.concealed_macroblocks as f64).into(),
        )?;
        let planes = packed_planes(frame);
        let last = planes[2];
        set(
            &object,
            "byteLength",
            &((last.offset + last.len) as f64).into(),
        )?;
        let layout = Array::new_with_length(3);
        for (component, plane) in planes.iter().enumerate() {
            let item = Object::new();
            set(&item, "offset", &(plane.offset as f64).into())?;
            set(&item, "stride", &(plane.stride as f64).into())?;
            layout.set(component as u32, item.into());
        }
        set(&object, "planes", &layout.into())?;
        self.shown = Some(shown.frame);
        Ok(Some(JsValue::from(object).unchecked_into()))
    }

    /// Copy the planes of the picture `next` returned last into `target`,
    /// which holds at least its `byteLength`.
    pub fn copy(&self, target: &Uint8Array) -> Result<(), JsError> {
        let Some(frame) = &self.shown else {
            return Err(JsError::new("no decoded picture to copy"));
        };
        let planes = packed_planes(frame);
        let last = planes[2];
        if (target.length() as usize) < last.offset + last.len {
            return Err(JsError::new("the target is smaller than the picture"));
        }
        for (component, plane) in planes.iter().enumerate() {
            let start = plane.offset as u32;
            target
                .subarray(start, start + plane.len as u32)
                .copy_from(&frame.plane(component).data[..plane.len]);
        }
        Ok(())
    }
}

impl Default for PictureDecoder {
    fn default() -> Self {
        Self::new()
    }
}

fn get(object: &JsValue, key: &str) -> Result<JsValue, JsError> {
    Reflect::get(object, &key.into())
        .map_err(|_| JsError::new(&format!("could not read '{key}' of a video fragment")))
}

fn number(value: &JsValue) -> Result<f64, JsError> {
    value
        .as_f64()
        .filter(|value| value.is_finite())
        .ok_or_else(|| JsError::new("a video picture's time and duration are numbers"))
}

fn index(value: &JsValue) -> Result<usize, JsError> {
    value
        .as_f64()
        .filter(|value| value.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(value))
        .map(|value| value as usize)
        .ok_or_else(|| JsError::new("a video picture's indices are integers"))
}

/// The last presentation timestamp in a slice of transport stream, in 90 kHz
/// units, or `undefined` when it carries none.
///
/// Handed the tail of a file, this is how long the file is: the distance from
/// the `originTicks` a [`Session`] reported to what comes back here is the
/// duration a player can put on its timeline.
#[wasm_bindgen(js_name = lastTimestamp)]
pub fn last_timestamp(data: &[u8]) -> Option<f64> {
    mpeg2toh264::last_pts(data).map(|ticks| ticks as f64)
}

/// The first presentation timestamp in a slice of transport stream, in 90 kHz
/// units, or `undefined` when it carries none.
///
/// This is what time it is at the byte the slice was read from. A player
/// seeking in a file with no index asks this of a slice at the byte its
/// estimate points to, and asks again nearer the mark, which costs a hundred
/// kilobytes where playing through the file to find out costs seconds of video.
#[wasm_bindgen(js_name = firstTimestamp)]
pub fn first_timestamp(data: &[u8]) -> Option<f64> {
    mpeg2toh264::first_pts(data).map(|ticks| ticks as f64)
}

fn to_js_array(fragments: Vec<Fragment>) -> Result<FragmentArray, JsError> {
    let array = Array::new_with_length(fragments.len() as u32);
    for (index, fragment) in fragments.into_iter().enumerate() {
        array.set(index as u32, to_js_fragment(fragment)?);
    }
    Ok(JsValue::from(array).unchecked_into())
}

fn to_js_fragment(fragment: Fragment) -> Result<JsValue, JsError> {
    let object = Object::new();
    match fragment {
        Fragment::Init {
            data,
            mime_codec,
            width,
            height,
        } => {
            set(&object, "kind", &"init".into())?;
            set(&object, "data", &copy_out(&data))?;
            set(&object, "mimeCodec", &mime_codec.into())?;
            set(&object, "width", &(width as f64).into())?;
            set(&object, "height", &(height as f64).into())?;
        }
        Fragment::Media {
            data,
            start,
            random_access,
            restart_offset,
            video_samples,
            audio_samples,
            scans,
        } => {
            set(&object, "kind", &"media".into())?;
            set(&object, "data", &copy_out(&data))?;
            set(&object, "start", &start.into())?;
            set(&object, "randomAccess", &random_access.into())?;
            set(
                &object,
                "restartOffset",
                &restart_offset.map_or(JsValue::NULL, |offset| (offset as f64).into()),
            )?;
            set(&object, "videoSamples", &(video_samples as f64).into())?;
            set(&object, "audioSamples", &(audio_samples as f64).into())?;
            let js_scans = Array::new_with_length(scans.len() as u32);
            for (index, scan) in scans.into_iter().enumerate() {
                let item = Object::new();
                set(&item, "start", &scan.start.into())?;
                set(&item, "interlaced", &scan.scan.interlaced.into())?;
                set(&item, "topFieldFirst", &scan.scan.top_field_first.into())?;
                js_scans.set(index as u32, item.into());
            }
            set(&object, "scans", &js_scans.into())?;
        }
        Fragment::Video {
            data,
            start,
            restart,
            intra,
            pictures,
        } => {
            set(&object, "kind", &"video".into())?;
            set(&object, "data", &copy_out(&data))?;
            set(&object, "start", &start.into())?;
            set(&object, "restart", &restart.into())?;
            set(&object, "intra", &intra.into())?;
            let js_pictures = Array::new_with_length(pictures.len() as u32);
            for (index, picture) in pictures.iter().enumerate() {
                let item = Object::new();
                set(&item, "picture", &(picture.picture as f64).into())?;
                set(
                    &item,
                    "secondField",
                    &picture
                        .second_field
                        .map_or(JsValue::NULL, |field| (field as f64).into()),
                )?;
                set(&item, "time", &picture.time.into())?;
                set(&item, "duration", &picture.duration.into())?;
                js_pictures.set(index as u32, item.into());
            }
            set(&object, "pictures", &js_pictures.into())?;
        }
        Fragment::PrivateStream {
            stream_id,
            pid,
            data,
            pts,
        } => {
            set(&object, "kind", &"private-stream".into())?;
            set(&object, "streamId", &(stream_id as f64).into())?;
            set(&object, "pid", &(pid as f64).into())?;
            set(&object, "data", &copy_out(&data))?;
            set(
                &object,
                "pts",
                &pts.map_or(JsValue::NULL, |ticks| (ticks as f64).into()),
            )?;
        }
    }
    Ok(object.into())
}

/// Copy the bytes into a JavaScript-owned buffer.
///
/// A view into the WebAssembly heap would be cheaper, but it would also be
/// invalidated by the next allocation and could not be transferred to the page.
/// The copy is what makes the result an ordinary `Uint8Array`.
fn copy_out(data: &[u8]) -> JsValue {
    Uint8Array::from(data).into()
}

fn set(object: &Object, key: &str, value: &JsValue) -> Result<(), JsError> {
    Reflect::set(object, &key.into(), value)
        .map(|_| ())
        .map_err(|_| JsError::new("could not build the fragment object"))
}

/// Every failure here is "this stream is not something we can handle", so the
/// message is the whole of what a caller can act on -- except for a stream
/// decode mode cannot play, which is named so that a caller can fall back to
/// another mode.
fn to_js_error(error: mpeg2toh264::Error) -> JsError {
    let js_error = JsError::new(&error.to_string());
    if error.is_no_aac_audio() {
        let value = JsValue::from(js_error.clone());
        // Failing to name it leaves an ordinary error, which is still one.
        let _ = Reflect::set(&value, &"name".into(), &"NoAacAudioError".into());
    }
    js_error
}
