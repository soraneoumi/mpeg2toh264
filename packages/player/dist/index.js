const A = 33554432;
const T = 8, D = 10;
const h = globalThis.ManagedMediaSource;
function l(n = !1) {
  const e = typeof MediaSource > "u" ? null : MediaSource;
  return n && h ? h : e ?? h ?? null;
}
function S(n, e = !1) {
  return l(e)?.isTypeSupported(n) ?? !1;
}
function k(n = !1) {
  return l(n)?.canConstructInDedicatedWorker === !0;
}
function R() {
  return h !== void 0;
}
function L() {
  return typeof MediaSource > "u" && h !== void 0;
}
class y {
  #e = !0;
  #r = [];
  get open() {
    return this.#e;
  }
  /** Returns whether this changed anything. */
  set(e) {
    return e === this.#e ? !1 : (this.#e = e, e && this.#n(), !0);
  }
  wait() {
    return this.#e ? Promise.resolve() : new Promise((e) => {
      this.#r.push(e);
    });
  }
  /** Let everyone through whatever the state is, for teardown. */
  abandon() {
    this.#n();
  }
  #n() {
    const e = this.#r;
    this.#r = [];
    for (const t of e) t();
  }
}
class b {
  /**
   * Made in the constructor rather than in `open`, because a caller needs
   * something to attach before the codec is known: the worker sends
   * `mediaSource.handle` across the moment a load starts, and `sourceopen`
   * does not fire until the page has put it on the element -- long before the
   * first init fragment.
   */
  mediaSource;
  /**
   * Whether that is a Managed Media Source, which a media element takes in its
   * own way. See the player's `#createSink`.
   */
  managed;
  /** The one the source was made from, and the one that answers for codecs. */
  #e;
  #r;
  #n;
  #t = null;
  /** What the `SourceBuffer` was opened with, or last changed to. */
  #g = "";
  /** A codec to move the `SourceBuffer` to before the next append. */
  #o = null;
  #h = [];
  #S = 0;
  #a = null;
  #u = !1;
  /**
   * Whether a managed source wants data at the moment.
   *
   * True until told otherwise, and always true for an unmanaged source, which
   * takes whatever it is given. A managed one starts out not streaming and
   * asks once it is attached and playing, so waiting for permission before the
   * initialization segment would mean waiting for a player that never starts:
   * this holds the door open until `endstreaming` closes it.
   */
  #f = !0;
  /** The last thing said about there being no room, so it is said once. */
  #k = !1;
  /** Whether everything buffered is waiting to be thrown away; see `reset`. */
  #y = !1;
  /** Which stretch of timeline is being filled. Bumped by every `reset`. */
  #d = 0;
  /** A duration to put on the MediaSource as soon as it will take one. */
  #I = null;
  /** Media times a decoder can start from, in order; see #evict. */
  #l = [];
  /** Whether the playhead has been put where the media starts; see #startAtMedia. */
  #b = !1;
  /** Seconds of media to collect before the first append; see `holdStart`. */
  #i = 0;
  #T = 0;
  #c = !1;
  #D = !1;
  #s = new y();
  #R = [];
  constructor(e) {
    this.#r = e;
    const t = l(e.preferManaged);
    if (!t) throw new Error("this browser has no Media Source Extensions");
    this.#e = t, this.mediaSource = new t(), this.managed = t === h, this.managed && (this.mediaSource.addEventListener(
      "startstreaming",
      this.#N
    ), this.mediaSource.addEventListener("endstreaming", this.#C)), this.#n = new Promise((i) => {
      this.mediaSource.addEventListener(
        "sourceopen",
        () => {
          e.onMark?.("sourceopen"), i();
        },
        { once: !0 }
      );
    });
  }
  ready() {
    return this.#s.wait();
  }
  /**
   * Open the stream, or -- for the initialization segment a seek brings with
   * it -- re-open the one already running.
   */
  async open(e, t) {
    if (!this.#e.isTypeSupported(e))
      throw new Error(`unsupported codec: ${e}`);
    if (await this.#n, !this.#c) {
      if (this.#t)
        e !== this.#g && (this.#o = e);
      else {
        const i = this.mediaSource.addSourceBuffer(e);
        i.mode = "segments", i.addEventListener("updateend", this.#L), i.addEventListener("error", this.#W), this.#t = i, this.#g = e;
      }
      this.#M({ data: t, init: !0 }), this.#_();
    }
  }
  push(e, t, i) {
    this.#c || (i && this.#l.push(t), this.#M({ data: e, init: !1, start: t }));
  }
  /**
   * Keep the first media fragments queued until they span this many seconds,
   * then append them together.
   *
   * Playback begins as soon as anything is buffered. A live stream arrives no
   * faster than it plays, so whatever is buffered at that moment is all the
   * margin playback will ever have. Has no effect once media has been appended.
   */
  holdStart(e) {
    this.#b || (this.#i = e);
  }
  /** Whether the first media is still being collected. Ends the hold when not. */
  #U() {
    if (this.#i === 0) return !1;
    const e = this.#h.filter((i) => !i.init);
    return (e.length > 0 ? e[e.length - 1].start - e[0].start : 0) < this.#i && !this.#D ? !0 : (this.#i = 0, !1);
  }
  /**
   * How long the whole presentation is.
   *
   * Without this the media element has no timeline to offer a viewer: it is
   * what turns `seekable` into the length of the file rather than the length
   * of what has been converted so far.
   */
  setDuration(e) {
    this.#I = e, this.#_();
  }
  /**
   * Throw away everything buffered and everything queued.
   *
   * A seek lands somewhere the buffer does not reach, and what follows it is
   * a different part of the file: keeping the old media would leave the
   * timeline with a hole in the middle and the eviction bookkeeping describing
   * bytes that are no longer there.
   */
  reset() {
    this.#c || (this.#d++, this.#h = [], this.#S = 0, this.#l = [], this.#b = !1, this.#D = !1, this.#u = !1, this.#v(), this.#t && (this.#y = !0), this.#B(!0), this.#p(), this.#E());
  }
  async finish() {
    if (this.#D = !0, this.#c || !this.#t) return;
    const e = this.#d;
    await new Promise((t) => {
      this.#R.push(t), this.#E();
    }), !(this.#c || this.#d !== e) && this.mediaSource.readyState === "open" && this.mediaSource.endOfStream();
  }
  close() {
    this.#c || (this.#c = !0, this.managed && (this.mediaSource.removeEventListener(
      "startstreaming",
      this.#N
    ), this.mediaSource.removeEventListener(
      "endstreaming",
      this.#C
    )), this.#t?.removeEventListener("updateend", this.#L), this.#t?.removeEventListener("error", this.#W), this.#t = null, this.#h = [], this.#S = 0, this.#l = [], this.#s.abandon(), this.#B(!0));
  }
  /** Tell the sink where playback has got to, so it can evict what is behind. */
  setCurrentTime(e) {
    this.#T = e, this.#H(), this.#p(), this.#E();
  }
  #M(e) {
    this.#h.push(e), this.#S += e.data.byteLength, this.#p(), this.#E();
  }
  #E() {
    const e = this.#t;
    if (this.#c || !e || e.updating || this.#a)
      return;
    if (this.#y) {
      this.#a = { type: "clear" };
      try {
        e.remove(0, Number.POSITIVE_INFINITY);
      } catch (i) {
        this.#a = null, this.#y = !1, this.#P(i);
      }
      return;
    }
    if (this.#u) return;
    const t = this.#h[0];
    if (!t) {
      this.#B(!1);
      return;
    }
    if (!(!t.init && this.#U())) {
      if (this.#o !== null) {
        const i = this.#o;
        this.#o = null;
        try {
          e.changeType(i), this.#g = i;
        } catch (s) {
          this.#P(s);
          return;
        }
      }
      this.#a = { type: "append", pending: t, epoch: this.#d };
      try {
        e.appendBuffer(t.data);
      } catch (i) {
        this.#a = null, i instanceof DOMException && i.name === "QuotaExceededError" ? (this.#u = !0, this.#p(), this.#v(), this.#H()) : this.#P(i);
      }
    }
  }
  #L = () => {
    const e = this.#a;
    if (e?.type === "append") {
      if (e.epoch === this.#d && this.#h[0] === e.pending) {
        const t = this.#h.shift();
        this.#S -= t.data.byteLength, t.init || this.#F(t.start);
      }
    } else e?.type === "remove" ? (this.#u = !1, this.#v()) : e?.type === "clear" && (this.#y = !1);
    this.#a = null, this.#_(), this.#H(), this.#p(), this.#E();
  };
  /**
   * The managed source asking for data again, which is the only thing that
   * reopens the door `endstreaming` closed.
   */
  #N = () => {
    this.#f = !0, this.#p(), this.#v();
  };
  /**
   * The managed source saying it has enough.
   *
   * What is already queued still goes in -- it was converted, and a few
   * fragments are cheaper to append than to convert again -- but nothing more
   * is taken until it asks. This is the whole point of the managed source: it
   * knows what the radio and the battery are doing and the page does not.
   */
  #C = () => {
    this.#f = !1, this.#p(), this.#v();
  };
  #W = () => {
    this.#P(new Error("the SourceBuffer rejected what was appended"));
  };
  /**
   * Put the playhead where the media begins, which is not zero.
   *
   * The timeline keeps the distance the transport stream put between the two
   * tracks, so it opens with only the earlier one on it -- audio alone for over
   * 0.7 s where a recording starts mid-GOP, and at least one frame even when
   * they start together, because the muxer needs somewhere to put the first
   * decode time. buffered is the intersection of the two track buffers, so it
   * begins after that, and nothing is ever appended at zero. Chrome moves the
   * playhead into the first buffered range by itself; Firefox waits at zero for
   * data that is not coming.
   *
   * An element given the sound alone, for pictures decoded beside it, buffers
   * from where the sound begins. The pictures begin where the first fragment
   * does, and the playhead goes to the later of the two, where the tracks of
   * muxed media would have both begun.
   */
  #F(e) {
    const t = this.#t?.buffered;
    this.#b || !t || t.length === 0 || (this.#b = !0, this.#r.onMark?.("appended"), this.#r.seek(Math.max(t.start(0), e)));
  }
  /**
   * Put the length of the file on the MediaSource, once it will take one.
   *
   * The setter only exists while the stream is open and nothing is updating,
   * so this runs again after every operation until it finds its moment. A
   * duration shorter than what is already buffered would evict the difference,
   * so what is buffered wins: it is the file speaking for itself.
   */
  #_() {
    const e = this.#I;
    if (e === null || this.#c || this.mediaSource.readyState !== "open" || this.#a || this.#t?.updating) return;
    const t = this.#t?.buffered, i = t && t.length > 0 ? t.end(t.length - 1) : 0;
    this.#I = null;
    try {
      this.mediaSource.duration = Math.max(e, i);
    } catch (s) {
      this.#P(s);
    }
  }
  /**
   * Drop what is behind the playhead, once a browser has said it is out of
   * room.
   *
   * Only some of them say so. Chrome and Safari throw `QuotaExceededError` and
   * hand the decision back; Firefox keeps its own ceiling and evicts by itself,
   * from its own bookkeeping, and does not need help. Removing anyway would
   * only be another chance to remove the wrong thing.
   */
  #H() {
    const e = this.#t;
    if (!this.#u || !e || e.updating || this.#a || this.#y || e.buffered.length === 0) return;
    const t = this.#T - this.#r.keepBehindSeconds;
    let i = 0;
    for (const r of this.#l) {
      if (r > t) break;
      i = r;
    }
    const s = i - 1e-3;
    if (!(s <= 0)) {
      for (; this.#l.length > 0 && this.#l[0] < i; )
        this.#l.shift();
      this.#a = { type: "remove" }, e.remove(0, s);
    }
  }
  /** How far past the playhead the buffer reaches, in seconds. */
  #G() {
    const e = this.#t?.buffered;
    return !e || e.length === 0 ? 0 : e.end(e.length - 1) - this.#T;
  }
  #p() {
    const e = !this.#u && this.#f && this.#G() < this.#r.maxAheadSeconds && this.#S < this.#r.queueHighWaterMark && // The fragment limit would stop the input before a start hold fills.
    (this.#i > 0 || this.#h.length < 2);
    this.#s.set(e) && this.#r.onReadyChange?.(e);
  }
  /**
   * Say whether conversion is waiting on the buffer, whichever of the two
   * reasons it is: no room left, or a managed source that wants nothing for
   * now. Both look the same from where the conversion sits.
   */
  #v() {
    const e = this.#u || !this.#f;
    e !== this.#k && (this.#k = e, this.#r.onBlocked?.(e));
  }
  /** Wake `finish`, either because everything is appended or because we gave up. */
  #B(e) {
    if (!e && (!this.#D || this.#h.length > 0 || this.#a))
      return;
    const t = this.#R;
    this.#R = [];
    for (const i of t) i();
  }
  #P(e) {
    this.#r.onError?.(
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
const w = "" + new URL("assets/worker-ByEefXv0.js", import.meta.url).href, M = w, u = 0.1, f = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting"
], p = ["seeked", "play", "ratechange"];
function m(n = !1) {
  return k(n);
}
const _ = 'video/mp4; codecs="mp4v.61"';
function P(n = !1) {
  return S(_, n);
}
function o(n) {
  return n instanceof Error ? n : new Error(String(n));
}
function a() {
  return performance.timeOrigin + performance.now();
}
class I extends EventTarget {
  video;
  #e;
  #r;
  #n = null;
  /** Which load messages belong to. Bumped by every load and every stop. */
  #t = 0;
  #g = "idle";
  /** The sink, when the page owns the MediaSource. */
  #o = null;
  #h = null;
  /** The `<source>` child a Managed Media Source needs; see #attachManaged. */
  #S = null;
  /** Whether remote playback was turned off here, and so is ours to turn back. */
  #a = !1;
  #u = null;
  #f = null;
  /** How long the input is, when it turned out to be one that can be seeked. */
  #k = null;
  /**
   * A start hold the worker asked for. It arrives before the first
   * initialization segment, which is what creates the sink.
   */
  #y = 0;
  /** Source video properties indexed by presentation time. */
  #d = [];
  /** What sound the programme last said it was carrying. See `AudioTracks`. */
  #I = null;
  /** When `load()` was called, as epoch milliseconds; every mark counts from it. */
  #l = 0;
  /** When the last mark was, so each one can say what it cost on its own. */
  #b = 0;
  /** Built the first time deinterlacing is turned on, and kept after that. */
  #i = null;
  /** Whether deinterlacing was asked for. */
  #T = !1;
  #c = !1;
  /** What the current load was asked for, so it can be loaded again. */
  #D = "";
  /** Whether the current load decodes the pictures here. */
  #s = !1;
  /**
   * Whether the deinterlacer has been handed a picture. From then on it
   * shows only the pictures handed to it, so a load that passes the video
   * through needs another one.
   */
  #R = !1;
  /**
   * Which run of pictures is wanted: a seek, or the worker throwing away
   * what it holds, starts another, and pictures of an older one are not
   * shown.
   */
  #U = 0;
  /**
   * Where the sink last put the playhead, until the `seeking` that follows:
   * one that finds the playhead there is that move, not the viewer's.
   */
  #M = null;
  #E = null;
  #L = null;
  constructor(e, t = {}) {
    super(), this.video = e, this.#e = t;
    const i = t.mediaSource ?? "auto";
    this.#r = i === "auto" ? m(t.preferManagedMediaSource) ? "worker" : "main" : i, this.video.addEventListener("seeking", this.#q);
    for (const s of p)
      this.video.addEventListener(s, this.#v);
    for (const s of f)
      this.video.addEventListener(s, this.#K);
    t.deinterlace && (this.deinterlace = !0);
  }
  get state() {
    return this.#g;
  }
  /**
   * How long the input is, or null while it is a stream that plays as it
   * arrives. The same number reaches the media element as its duration.
   */
  get duration() {
    return this.#k;
  }
  /**
   * What sound the programme is carrying and which of it is being taken, or
   * null before its program map has been read. See `AudioTracks`.
   */
  get audio() {
    return this.#I;
  }
  /**
   * Take the sound from another of the service's streams from here on.
   *
   * From here on, and no further back: the fragments already converted carry
   * the sound they were made with and are in the buffer being played, so the
   * change arrives when the playhead reaches what is being converted now --
   * a few seconds on a live stream, and however far ahead the buffer has run
   * on a recording. Emptying the buffer to make it immediate would take the
   * picture with it.
   *
   * The PID is one of `audio.available`. One the program map has yet to name
   * is remembered until it does, so a page restoring a viewer's choice may
   * call this before the map arrives.
   */
  selectAudio(e) {
    this.#n?.postMessage({
      type: "audio",
      id: this.#t,
      pid: e,
      dualMonoSub: null
    });
  }
  /**
   * The same choice inside a dual-mono stream, where the two services are the
   * two channels of one stream rather than two streams.
   *
   * A bilingual broadcast in Japan is carried either way, and which way is not
   * the viewer's business: `audio.dualMono` says which control to offer. This
   * one describes nothing anew, so the change costs no restart point.
   */
  selectDualMono(e) {
    this.#n?.postMessage({
      type: "audio",
      id: this.#t,
      pid: null,
      dualMonoSub: e
    });
  }
  /** Which side of the wire ended up owning the MediaSource. */
  get mediaSourceOwner() {
    return this.#r;
  }
  /**
   * Whether the current load decodes the pictures in the worker and hands
   * them to the deinterlacer. The element then has no video track.
   */
  get softwareDecoding() {
    return this.#s;
  }
  /**
   * The size the picture is shown at, after its sample aspect ratio, or
   * null before the first one. Where the pictures are decoded here this is
   * what `video.videoWidth` and `videoHeight` would say; otherwise it is
   * them.
   */
  get videoSize() {
    if (this.#s) return this.#L;
    const { videoWidth: e, videoHeight: t } = this.video;
    return e > 0 && t > 0 ? { width: e, height: t } : null;
  }
  /**
   * Whether the picture is being deinterlaced, which is not quite the same as
   * having asked for it: a source that says it is progressive is left alone,
   * and starts being filtered again the moment it says otherwise. Assigning
   * turns it on or off where it stands, so the two can be compared on the
   * frame; a browser that cannot run it stays false.
   */
  get deinterlace() {
    const e = this.#i;
    return e?.running ? !this.#s || e.enabled && (e.scan?.interlaced ?? !0) : !1;
  }
  /** Whether deinterlacing was asked for, whatever the source turned out to be. */
  get deinterlaceWanted() {
    return this.#T;
  }
  /**
   * The deinterlacer itself, once there has been one, for the settings that
   * are its own -- the field order, and whether a picture goes up per field
   * or per frame. Null until `deinterlace` has been turned on.
   */
  get deinterlacer() {
    return this.#i;
  }
  set deinterlace(e) {
    this.#T = e, this.#N();
  }
  /**
   * Run the filter where it is both wanted and called for.
   *
   * A progressive source has one moment per frame and nothing to rebuild, so
   * filtering it can only soften it. Until the source has said which it is --
   * before the first fragment of a load -- what was asked for is what happens,
   * since an interlaced picture left unfiltered is the more visible mistake of
   * the two.
   */
  #N() {
    if (!this.#c)
      try {
        !this.#i && this.#e.deinterlacer && (this.#i = this.#e.deinterlacer(this.video)), this.#i && (this.#i.videoTimeline = this.#d, this.#i.enabled = this.#T);
      } catch (e) {
        this.#m("error", { error: o(e) });
      }
  }
  #C(e, t, i) {
    e <= 0 || t <= 0 || this.#F({ start: i, codedSize: { width: e, height: t } });
  }
  /** Add source metadata now, but apply it only when its picture is shown. */
  #W(e) {
    for (const { start: t, interlaced: i, topFieldFirst: s } of e)
      this.#F({
        start: t,
        scan: { interlaced: i, topFieldFirst: s }
      });
  }
  #F(e) {
    const t = this.#d.at(-1), i = {
      start: e.start,
      codedSize: e.codedSize ?? t?.codedSize,
      scan: e.scan ?? t?.scan
    };
    if (t?.start === i.start) this.#d.pop();
    else if (t?.codedSize?.width === i.codedSize?.width && t?.codedSize?.height === i.codedSize?.height && t?.scan?.interlaced === i.scan?.interlaced && t?.scan?.topFieldFirst === i.scan?.topFieldFirst)
      return;
    if (this.#d.push(i), this.video.buffered.length > 0) {
      const s = this.video.buffered.start(0);
      let r = 0;
      for (; r + 1 < this.#d.length && this.#d[r + 1].start <= s; )
        r++;
      r > 0 && this.#d.splice(0, r);
    }
    this.#i && (this.#i.videoTimeline = this.#d);
  }
  #_() {
    this.#d = [], this.#i && (this.#i.videoTimeline = []);
  }
  load(e) {
    return this.#c ? Promise.reject(new Error("the player has been destroyed")) : this.#r === "worker" && !m(this.#e.preferManagedMediaSource) ? Promise.reject(
      new Error("this browser cannot construct a MediaSource in a worker")
    ) : (this.stop(), this.#H(String(e), !0));
  }
  /**
   * Start a load. `decodable` is false to pass the video through whatever the
   * deinterlacer takes, which is how a stream decode mode cannot play is
   * loaded again.
   */
  #H(e, t) {
    const i = this.#t;
    this.#D = e, this.#k = null, this.#M = null, this.#y = 0, this.#_(), this.#N();
    const s = this.#i?.decodedVideo ?? null;
    if (this.#s = t && this.#e.softwareDecode !== !1 && s !== null, !this.#s && !this.#e.passthrough) {
      const d = new Error(
        this.#e.softwareDecode === !1 ? "the video cannot be decoded because softwareDecode is false, and passthrough is off" : "the video cannot be decoded because no deinterlacer with a decodedVideo input was given, and passthrough is off"
      ), c = new Promise((E, v) => {
        this.#f = { resolve: E, reject: v };
      });
      return queueMicrotask(() => {
        i === this.#t && this.#w(d);
      }), c;
    }
    !this.#s && this.#R && (this.#i?.destroy(), this.#i = null, this.#R = !1, this.#N()), this.#L = null, this.#l = a(), this.#b = this.#l;
    const r = this.#P(), g = new Promise((d, c) => {
      this.#f = { resolve: d, reject: c };
    });
    return this.#A("loading"), r.postMessage({
      type: "load",
      id: i,
      url: e,
      wasmUrl: this.#e.wasmUrl === void 0 ? null : String(this.#e.wasmUrl),
      recoveryInterval: this.#e.recoveryInterval,
      openGopRecovery: this.#e.openGopRecovery,
      splitFieldSamples: this.#e.splitFieldSamples,
      audioGainSteps: this.#e.audioGainSteps ?? 0,
      surroundAudioGainSteps: this.#e.surroundAudioGainSteps ?? this.#e.audioGainSteps ?? 0,
      video: this.#s ? "decode" : "passthrough",
      serviceId: this.#e.serviceId ?? null,
      sink: this.#r,
      preferManagedMediaSource: this.#e.preferManagedMediaSource ?? !1,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10
    }), this.#X(), this.#s && s && (s.onrelease = this.#G, this.#p(), this.#E = setInterval(this.#v, 40)), g;
  }
  /** Give a picture's buffer back to the worker that made it. */
  #G = (e) => {
    !this.#s || e.byteLength === 0 || this.#n?.postMessage(
      { type: "recycle", id: this.#t, data: e },
      [e]
    );
  };
  /** Forget the pictures held and ask for the ones at the playhead. */
  #p() {
    this.#U++, this.#i?.decodedVideo?.reset(), this.#v();
  }
  /** Ask for the pictures from the playhead to a little past it. */
  #v = () => {
    if (!this.#s) return;
    const e = this.video.currentTime, t = e + 0.3 * Math.max(1, this.video.playbackRate);
    this.#n?.postMessage({
      type: "need",
      id: this.#t,
      epoch: this.#U,
      from: e,
      until: t
    });
  };
  /** Show a picture of the current run, and hand back one of an older run. */
  #B(e, t) {
    const i = this.#i?.decodedVideo;
    if (e !== this.#U || !i) {
      this.#G(t.data);
      return;
    }
    const s = this.#L;
    (s?.width !== t.displayWidth || s?.height !== t.displayHeight) && (this.#L = {
      width: t.displayWidth,
      height: t.displayHeight
    }), this.#R = !0;
    try {
      i.push(t);
    } catch (r) {
      this.#m("error", { error: o(r) });
    }
  }
  /** Abandon the current load. The player stays usable. */
  stop() {
    const e = this.#t;
    this.#t++, this.#M = null, this.#n?.postMessage({ type: "stop", id: e }), this.#Y(), this.#V(new Error("the load was stopped")), this.#A("idle");
  }
  /** Stop, and give up the worker. The player cannot be loaded again. */
  destroy() {
    if (!this.#c) {
      this.stop(), this.#c = !0, this.video.removeEventListener("seeking", this.#q);
      for (const e of p)
        this.video.removeEventListener(e, this.#v);
      for (const e of f)
        this.video.removeEventListener(e, this.#K);
      this.#i?.destroy(), this.#i = null, this.#n?.terminate(), this.#n = null;
    }
  }
  addEventListener(e, t, i) {
    super.addEventListener(e, t, i);
  }
  removeEventListener(e, t, i) {
    super.removeEventListener(e, t, i);
  }
  #P() {
    if (!this.#n) {
      const e = new Worker(
        this.#e.workerUrl ?? M,
        {
          type: "module"
        }
      );
      e.onmessage = this.#$, e.onerror = (t) => this.#w(new Error(t.message || "the worker failed")), this.#n = e;
    }
    return this.#n;
  }
  #$ = (e) => {
    const t = e.data;
    if (t.id === this.#t)
      switch (t.type) {
        case "handle":
          t.managed && this.#z(), this.video.srcObject = t.handle, this.#O("attached", a());
          break;
        case "open":
          this.#J(t.mimeCodec, t.data);
          break;
        case "video-config":
          this.#s || this.#C(
            t.width,
            t.height,
            t.start
          );
          break;
        case "fragment":
          this.#o?.push(
            t.data,
            t.start,
            t.randomAccess
          );
          break;
        case "opened":
          this.#A("converting"), this.#V(null);
          break;
        case "seekable":
          this.#k = t.duration, this.#o?.setDuration(t.duration), this.#m("seekable", { duration: t.duration });
          break;
        case "reset":
          this.#_(), this.#o?.reset(), this.#s && this.#p();
          break;
        case "picture":
          this.#B(t.epoch, t.picture);
          break;
        case "pictures-end":
          this.#s && t.epoch === this.#U && this.#i?.decodedVideo?.finish();
          break;
        case "no-aac-audio":
          this.#ne();
          break;
        case "scans":
          this.#W(t.scans);
          break;
        case "services":
          this.#m("services", t.services);
          break;
        case "audio":
          this.#I = t.audio, this.#m("audio", t.audio);
          break;
        case "private_stream_1":
        case "private_stream_2":
          this.#m(t.type, t.stream);
          break;
        case "mark":
          this.#O(t.name, t.at);
          break;
        case "seek":
          this.#j(t.time);
          break;
        case "hold":
          this.#y = t.seconds, this.#o?.holdStart(t.seconds);
          break;
        case "progress":
          this.#m("progress", {
            bytesRead: t.bytesRead,
            totalBytes: t.totalBytes
          });
          break;
        case "stats":
          this.#m("stats", t.stats);
          break;
        case "blocked":
          this.#A(t.blocked ? "buffer-full" : "converting");
          break;
        case "finish":
          this.#te();
          break;
        case "completed":
          this.#A("completed"), this.#r === "worker" && this.#x();
          break;
        case "error":
          this.#w(new Error(t.message));
          break;
      }
  };
  /** Open a MediaSource here, for browsers that cannot have one in a worker. */
  #J(e, t) {
    const i = this.#t;
    let s;
    try {
      s = this.#o ?? this.#Z(i), s.holdStart(this.#y);
    } catch (r) {
      this.#w(o(r));
      return;
    }
    s.open(e, t).then(
      // The worker is waiting on flow to know the open succeeded. Going
      // through ready() rather than saying true covers the case where the
      // append filled the queue on its own.
      () => s.ready().then(() => this.#Q(i, { type: "flow", id: i, ready: !0 })),
      (r) => {
        i === this.#t && this.#w(o(r));
      }
    );
  }
  #Z(e) {
    const t = new b({
      preferManaged: this.#e.preferManagedMediaSource,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10,
      seek: (i) => this.#j(i),
      onMark: (i) => this.#O(i, a()),
      onReadyChange: (i) => this.#Q(e, { type: "flow", id: e, ready: i }),
      onBlocked: (i) => {
        e === this.#t && this.#A(i ? "buffer-full" : "converting");
      },
      onError: (i) => {
        e === this.#t && this.#w(i);
      }
    });
    return this.#o = t, this.#h = URL.createObjectURL(t.mediaSource), t.managed ? this.#ee(this.#h) : this.video.src = this.#h, this.#O("attached", a()), this.#k !== null && t.setDuration(this.#k), t;
  }
  /**
   * Put a Managed Media Source on the element, which takes more than a `src`.
   *
   * Safari leaves one closed until the element has given up remote playback --
   * AirPlay has nowhere to send a source the page is feeding, so the two are
   * mutually exclusive -- and until the URL is on a `<source>` child rather
   * than the attribute. Neither is optional: miss one and `sourceopen` never
   * arrives and the load waits for a stream that has not begun.
   */
  #ee(e) {
    this.video.removeAttribute("src"), this.#z();
    const t = document.createElement("source");
    t.type = "video/mp4", t.src = e, this.video.append(t), this.#S = t, this.video.load();
  }
  /**
   * Rule out AirPlay, which a managed source cannot be sent over and which
   * Safari will not open one until the element has given up. The element
   * belongs to whoever made it, so it is put back on the way out -- unless it
   * was already off, and theirs to keep.
   */
  #z() {
    this.video.disableRemotePlayback || (this.video.disableRemotePlayback = !0, this.#a = !0);
  }
  #te() {
    const e = this.#t, t = this.#o;
    t && t.finish().then(
      () => {
        e === this.#t && this.#x();
      },
      (i) => {
        e === this.#t && this.#w(o(i));
      }
    );
  }
  /**
   * Put the playhead forward to where the media begins, for the sink. That is
   * no seek of the viewer's: the pictures sent for the request at the old
   * position begin there, so the run they belong to goes on, and the sound
   * held back for them has not been let into the element any earlier.
   */
  #j(e) {
    this.video.currentTime >= e || (this.video.currentTime = e, this.#M = this.video.currentTime);
  }
  /**
   * Answer the viewer moving the playhead somewhere the buffer does not reach.
   *
   * The correction #startAtMedia asks for is not the viewer's and stops here.
   * Any other move starts a new run of pictures. Everything inside a buffered
   * range is Media Source Extensions' own affair beyond that. What is left is
   * a real seek: the worker throws the buffer away and reads the input again
   * from where the viewer asked to be.
   */
  #q = () => {
    const e = this.#M === this.video.currentTime;
    if (this.#M = null, e || this.#g === "idle" || this.#g === "error" || (this.#s && this.#p(), this.#k === null)) return;
    const t = this.video.currentTime;
    this.#se(t) || (this.#A("seeking"), this.#_(), this.#X(), this.#n?.postMessage({
      type: "seek",
      id: this.#t,
      time: t
    }));
  };
  #K = (e) => {
    this.#g !== "idle" && (this.#O(e.type, a()), e.type === "waiting" && this.#ie());
  };
  /**
   * Move the playhead over a hole in the media, where playback has stopped at
   * one.
   *
   * The conversion leaves the media where the source put it, so a recording
   * joined from two takes has a real gap between them rather than one closed up
   * -- closing it would move everything after it, and the captions, which carry
   * the source's own timestamps, would be out by the length of the gap for the
   * rest of the stream. A browser stops at a gap and waits, so somebody has to
   * step over it, and it is this side: it is the one that knows the playhead.
   *
   * Only where media is already buffered past the hole, which is what
   * distinguishes a hole from the ordinary wait for the converter to catch up.
   *
   * Read from the media element rather than from the sink: what stops playback
   * is the element's own view, which is the tracks' ranges taken together, and
   * it is the one reading available whether the `MediaSource` is here or in the
   * worker.
   */
  #ie() {
    if (this.video.seeking) return;
    const e = this.video.currentTime, t = this.video.buffered;
    let i = null;
    for (let s = 0; s < t.length; s++) {
      const r = t.start(s);
      if (e >= r - u && e < t.end(s) - u)
        return;
      r > e + u && (i === null || r < i) && (i = r);
    }
    i !== null && (this.video.currentTime = i);
  }
  /**
   * Report where a step of the load fell on the clock `load()` started.
   *
   * The worker's marks arrive as epoch milliseconds because that is the only
   * reading the two contexts share; what a caller wants is how long it waited,
   * which is measured from here.
   */
  #O(e, t) {
    if (this.#l === 0) return;
    const i = t - this.#l, s = Math.max(0, t - this.#b);
    this.#b = Math.max(this.#b, t), this.#m("timing", { name: e, sinceLoad: i, sincePrevious: s });
  }
  #se(e) {
    const t = this.video.buffered;
    for (let i = 0; i < t.length; i++)
      if (e >= t.start(i) && e < t.end(i))
        return !0;
    return !1;
  }
  /**
   * Tell whoever holds the buffer where playback is, so it can drop what is
   * behind. This cannot ride on `timeupdate`: that event stops firing exactly
   * when playback stalls, which is when eviction matters most.
   */
  #re = () => {
    const e = this.video.currentTime;
    this.#r === "main" ? this.#o?.setCurrentTime(e) : this.#n?.postMessage({
      type: "time",
      id: this.#t,
      currentTime: e
    });
  };
  #Q(e, t) {
    e === this.#t && this.#n?.postMessage(t);
  }
  #X() {
    this.#u === null && (this.#u = setInterval(
      this.#re,
      200
    ));
  }
  #x() {
    this.#u !== null && (clearInterval(this.#u), this.#u = null);
  }
  /**
   * Load the same input again with the video passed through, for a stream
   * that decode mode cannot play, or fail the load where passthrough is off.
   * The load's promise settles as the new one does.
   */
  #ne() {
    if (!this.#s) {
      this.#w(
        new Error("the worker refused to decode a load it passes through")
      );
      return;
    }
    if (!this.#e.passthrough) {
      this.#w(
        new Error(
          "the video cannot be decoded because the stream has no AAC sound, which decoding needs, and passthrough is off"
        )
      );
      return;
    }
    const e = this.#f;
    this.#f = null, this.stop(), this.#H(this.#D, !1).then(e?.resolve, (i) => e?.reject(i));
  }
  #Y() {
    this.#x(), this.#E !== null && clearInterval(this.#E), this.#E = null;
    const e = this.#s;
    this.#s = !1, e && this.#i?.decodedVideo?.reset(), this.#_(), this.#o?.close(), this.#o = null, this.#h && URL.revokeObjectURL(this.#h), this.#h = null, this.#S?.remove(), this.#S = null, this.#a && (this.video.disableRemotePlayback = !1, this.#a = !1), this.video.removeAttribute("src"), this.video.srcObject = null, this.video.load();
  }
  #w(e) {
    this.#Y(), this.#A("error"), this.#V(e), this.#m("error", { error: e });
  }
  #V(e) {
    const t = this.#f;
    t && (this.#f = null, e ? t.reject(e) : t.resolve());
  }
  #A(e) {
    this.#g !== e && (this.#g = e, this.#m("statechange", { state: e }));
  }
  #m(e, t) {
    this.dispatchEvent(new CustomEvent(e, { detail: t }));
  }
}
export {
  D as DEFAULT_KEEP_BEHIND_SECONDS,
  T as DEFAULT_MAX_AHEAD_SECONDS,
  A as DEFAULT_QUEUE_HIGH_WATER_MARK,
  I as Mpeg2TsPlayer,
  L as requiresManagedMediaSource,
  R as supportsManagedMediaSource,
  P as supportsPassthrough,
  m as supportsWorkerMediaSource
};
//# sourceMappingURL=index.js.map
