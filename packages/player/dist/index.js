const b = 33554432;
const y = 8, M = 10;
const h = globalThis.ManagedMediaSource;
function u(n = !1) {
  const e = typeof MediaSource > "u" ? null : MediaSource;
  return n && h ? h : e ?? h ?? null;
}
function p(n, e = !1) {
  return u(e)?.isTypeSupported(n) ?? !1;
}
function m(n = !1) {
  return u(n)?.canConstructInDedicatedWorker === !0;
}
function w() {
  return h !== void 0;
}
function A() {
  return typeof MediaSource > "u" && h !== void 0;
}
class g {
  #e = !0;
  #s = [];
  get open() {
    return this.#e;
  }
  /** Returns whether this changed anything. */
  set(e) {
    return e === this.#e ? !1 : (this.#e = e, e && this.#r(), !0);
  }
  wait() {
    return this.#e ? Promise.resolve() : new Promise((e) => {
      this.#s.push(e);
    });
  }
  /** Let everyone through whatever the state is, for teardown. */
  abandon() {
    this.#r();
  }
  #r() {
    const e = this.#s;
    this.#s = [];
    for (const t of e) t();
  }
}
class S {
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
  #s;
  #r;
  #t = null;
  /** What the `SourceBuffer` was opened with, or last changed to. */
  #p = "";
  /** A codec to move the `SourceBuffer` to before the next append. */
  #h = null;
  #n = [];
  #m = 0;
  #a = null;
  #d = !1;
  /**
   * Whether a managed source wants data at the moment.
   *
   * True until told otherwise, and always true for an unmanaged source, which
   * takes whatever it is given. A managed one starts out not streaming and
   * asks once it is attached and playing, so waiting for permission before the
   * initialization segment would mean waiting for a player that never starts:
   * this holds the door open until `endstreaming` closes it.
   */
  #v = !0;
  /** The last thing said about there being no room, so it is said once. */
  #g = !1;
  /** Whether everything buffered is waiting to be thrown away; see `reset`. */
  #o = !1;
  /** Which stretch of timeline is being filled. Bumped by every `reset`. */
  #E = 0;
  /** A duration to put on the MediaSource as soon as it will take one. */
  #k = null;
  /** Media times a decoder can start from, in order; see #evict. */
  #c = [];
  /** Whether the playhead has been put where the media starts; see #startAtMedia. */
  #i = !1;
  /** Seconds of media to collect before the first append; see `holdStart`. */
  #S = 0;
  #b = 0;
  #l = !1;
  #_ = !1;
  #P = new g();
  #T = [];
  constructor(e) {
    this.#s = e;
    const t = u(e.preferManaged);
    if (!t) throw new Error("this browser has no Media Source Extensions");
    this.#e = t, this.mediaSource = new t(), this.managed = t === h, this.managed && (this.mediaSource.addEventListener(
      "startstreaming",
      this.#N
    ), this.mediaSource.addEventListener("endstreaming", this.#W)), this.#r = new Promise((i) => {
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
    return this.#P.wait();
  }
  /**
   * Open the stream, or -- for the initialization segment a seek brings with
   * it -- re-open the one already running.
   */
  async open(e, t) {
    if (!this.#e.isTypeSupported(e))
      throw new Error(`unsupported codec: ${e}`);
    if (await this.#r, !this.#l) {
      if (this.#t)
        e !== this.#p && (this.#h = e);
      else {
        const i = this.mediaSource.addSourceBuffer(e);
        i.mode = "segments", i.addEventListener("updateend", this.#O), i.addEventListener("error", this.#I), this.#t = i, this.#p = e;
      }
      this.#H({ data: t, init: !0 }), this.#R();
    }
  }
  push(e, t, i) {
    this.#l || (i && this.#c.push(t), this.#H({ data: e, init: !1, start: t }));
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
    this.#i || (this.#S = e);
  }
  /** Whether the first media is still being collected. Ends the hold when not. */
  #L() {
    if (this.#S === 0) return !1;
    const e = this.#n.filter((i) => !i.init);
    return (e.length > 0 ? e[e.length - 1].start - e[0].start : 0) < this.#S && !this.#_ ? !0 : (this.#S = 0, !1);
  }
  /**
   * How long the whole presentation is.
   *
   * Without this the media element has no timeline to offer a viewer: it is
   * what turns `seekable` into the length of the file rather than the length
   * of what has been converted so far.
   */
  setDuration(e) {
    this.#k = e, this.#R();
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
    this.#l || (this.#E++, this.#n = [], this.#m = 0, this.#c = [], this.#i = !1, this.#_ = !1, this.#d = !1, this.#A(), this.#t && (this.#o = !0), this.#B(!0), this.#u(), this.#w());
  }
  async finish() {
    if (this.#_ = !0, this.#l || !this.#t) return;
    const e = this.#E;
    await new Promise((t) => {
      this.#T.push(t), this.#w();
    }), !(this.#l || this.#E !== e) && this.mediaSource.readyState === "open" && this.mediaSource.endOfStream();
  }
  close() {
    this.#l || (this.#l = !0, this.managed && (this.mediaSource.removeEventListener(
      "startstreaming",
      this.#N
    ), this.mediaSource.removeEventListener(
      "endstreaming",
      this.#W
    )), this.#t?.removeEventListener("updateend", this.#O), this.#t?.removeEventListener("error", this.#I), this.#t = null, this.#n = [], this.#m = 0, this.#c = [], this.#P.abandon(), this.#B(!0));
  }
  /** Tell the sink where playback has got to, so it can evict what is behind. */
  setCurrentTime(e) {
    this.#b = e, this.#D(), this.#u(), this.#w();
  }
  #H(e) {
    this.#n.push(e), this.#m += e.data.byteLength, this.#u(), this.#w();
  }
  #w() {
    const e = this.#t;
    if (this.#l || !e || e.updating || this.#a)
      return;
    if (this.#o) {
      this.#a = { type: "clear" };
      try {
        e.remove(0, Number.POSITIVE_INFINITY);
      } catch (i) {
        this.#a = null, this.#o = !1, this.#y(i);
      }
      return;
    }
    if (this.#d) return;
    const t = this.#n[0];
    if (!t) {
      this.#B(!1);
      return;
    }
    if (!(!t.init && this.#L())) {
      if (this.#h !== null) {
        const i = this.#h;
        this.#h = null;
        try {
          e.changeType(i), this.#p = i;
        } catch (s) {
          this.#y(s);
          return;
        }
      }
      this.#a = { type: "append", pending: t, epoch: this.#E };
      try {
        e.appendBuffer(t.data);
      } catch (i) {
        this.#a = null, i instanceof DOMException && i.name === "QuotaExceededError" ? (this.#d = !0, this.#u(), this.#A(), this.#D()) : this.#y(i);
      }
    }
  }
  #O = () => {
    const e = this.#a;
    if (e?.type === "append") {
      if (e.epoch === this.#E && this.#n[0] === e.pending) {
        const t = this.#n.shift();
        this.#m -= t.data.byteLength, t.init || this.#F();
      }
    } else e?.type === "remove" ? (this.#d = !1, this.#A()) : e?.type === "clear" && (this.#o = !1);
    this.#a = null, this.#R(), this.#D(), this.#u(), this.#w();
  };
  /**
   * The managed source asking for data again, which is the only thing that
   * reopens the door `endstreaming` closed.
   */
  #N = () => {
    this.#v = !0, this.#u(), this.#A();
  };
  /**
   * The managed source saying it has enough.
   *
   * What is already queued still goes in -- it was converted, and a few
   * fragments are cheaper to append than to convert again -- but nothing more
   * is taken until it asks. This is the whole point of the managed source: it
   * knows what the radio and the battery are doing and the page does not.
   */
  #W = () => {
    this.#v = !1, this.#u(), this.#A();
  };
  #I = () => {
    this.#y(new Error("the SourceBuffer rejected what was appended"));
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
   */
  #F() {
    const e = this.#t?.buffered;
    this.#i || !e || e.length === 0 || (this.#i = !0, this.#s.onMark?.("appended"), this.#s.seek(e.start(0)));
  }
  /**
   * Put the length of the file on the MediaSource, once it will take one.
   *
   * The setter only exists while the stream is open and nothing is updating,
   * so this runs again after every operation until it finds its moment. A
   * duration shorter than what is already buffered would evict the difference,
   * so what is buffered wins: it is the file speaking for itself.
   */
  #R() {
    const e = this.#k;
    if (e === null || this.#l || this.mediaSource.readyState !== "open" || this.#a || this.#t?.updating) return;
    const t = this.#t?.buffered, i = t && t.length > 0 ? t.end(t.length - 1) : 0;
    this.#k = null;
    try {
      this.mediaSource.duration = Math.max(e, i);
    } catch (s) {
      this.#y(s);
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
  #D() {
    const e = this.#t;
    if (!this.#d || !e || e.updating || this.#a || this.#o || e.buffered.length === 0) return;
    const t = this.#b - this.#s.keepBehindSeconds;
    let i = 0;
    for (const r of this.#c) {
      if (r > t) break;
      i = r;
    }
    const s = i - 1e-3;
    if (!(s <= 0)) {
      for (; this.#c.length > 0 && this.#c[0] < i; )
        this.#c.shift();
      this.#a = { type: "remove" }, e.remove(0, s);
    }
  }
  /** How far past the playhead the buffer reaches, in seconds. */
  #G() {
    const e = this.#t?.buffered;
    return !e || e.length === 0 ? 0 : e.end(e.length - 1) - this.#b;
  }
  #u() {
    const e = !this.#d && this.#v && this.#G() < this.#s.maxAheadSeconds && this.#m < this.#s.queueHighWaterMark && // The fragment limit would stop the input before a start hold fills.
    (this.#S > 0 || this.#n.length < 2);
    this.#P.set(e) && this.#s.onReadyChange?.(e);
  }
  /**
   * Say whether conversion is waiting on the buffer, whichever of the two
   * reasons it is: no room left, or a managed source that wants nothing for
   * now. Both look the same from where the conversion sits.
   */
  #A() {
    const e = this.#d || !this.#v;
    e !== this.#g && (this.#g = e, this.#s.onBlocked?.(e));
  }
  /** Wake `finish`, either because everything is appended or because we gave up. */
  #B(e) {
    if (!e && (!this.#_ || this.#n.length > 0 || this.#a))
      return;
    const t = this.#T;
    this.#T = [];
    for (const i of t) i();
  }
  #y(e) {
    this.#s.onError?.(
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
const v = "" + new URL("assets/worker-Bi5J1m1z.js", import.meta.url).href, E = v, d = 0.1, c = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting"
];
function l(n = !1) {
  return m(n);
}
const k = 'video/mp4; codecs="mp4v.61"';
function _(n = !1) {
  return p(k, n);
}
function o(n) {
  return n instanceof Error ? n : new Error(String(n));
}
function a() {
  return performance.timeOrigin + performance.now();
}
class T extends EventTarget {
  video;
  #e;
  #s;
  #r = null;
  /** Which load messages belong to. Bumped by every load and every stop. */
  #t = 0;
  #p = "idle";
  /** The sink, when the page owns the MediaSource. */
  #h = null;
  #n = null;
  /** The `<source>` child a Managed Media Source needs; see #attachManaged. */
  #m = null;
  /** Whether remote playback was turned off here, and so is ours to turn back. */
  #a = !1;
  #d = null;
  #v = null;
  /** How long the input is, when it turned out to be one that can be seeked. */
  #g = null;
  /** Source video properties indexed by presentation time. */
  #o = [];
  /** What sound the programme last said it was carrying. See `AudioTracks`. */
  #E = null;
  /** When `load()` was called, as epoch milliseconds; every mark counts from it. */
  #k = 0;
  /** When the last mark was, so each one can say what it cost on its own. */
  #c = 0;
  /** Built the first time deinterlacing is turned on, and kept after that. */
  #i = null;
  /** Whether deinterlacing was asked for. */
  #S = !1;
  #b = !1;
  constructor(e, t = {}) {
    super(), this.video = e, this.#e = t;
    const i = t.mediaSource ?? "auto";
    this.#s = i === "auto" ? l(t.preferManagedMediaSource) ? "worker" : "main" : i, this.video.addEventListener("seeking", this.#R);
    for (const s of c)
      this.video.addEventListener(s, this.#D);
    t.deinterlace && (this.deinterlace = !0);
  }
  get state() {
    return this.#p;
  }
  /**
   * How long the input is, or null while it is a stream that plays as it
   * arrives. The same number reaches the media element as its duration.
   */
  get duration() {
    return this.#g;
  }
  /**
   * What sound the programme is carrying and which of it is being taken, or
   * null before its program map has been read. See `AudioTracks`.
   */
  get audio() {
    return this.#E;
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
    this.#r?.postMessage({
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
    this.#r?.postMessage({
      type: "audio",
      id: this.#t,
      pid: null,
      dualMonoSub: e
    });
  }
  /** Which side of the wire ended up owning the MediaSource. */
  get mediaSourceOwner() {
    return this.#s;
  }
  /**
   * Whether the picture is being deinterlaced, which is not quite the same as
   * having asked for it: a source that says it is progressive is left alone,
   * and starts being filtered again the moment it says otherwise. Assigning
   * turns it on or off where it stands, so the two can be compared on the
   * frame; a browser that cannot run it stays false.
   */
  get deinterlace() {
    return this.#i?.running ?? !1;
  }
  /** Whether deinterlacing was asked for, whatever the source turned out to be. */
  get deinterlaceWanted() {
    return this.#S;
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
    this.#S = e, this.#l();
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
  #l() {
    if (!this.#b)
      try {
        !this.#i && this.#e.deinterlacer && (this.#i = this.#e.deinterlacer(this.video)), this.#i && (this.#i.videoTimeline = this.#o, this.#i.enabled = this.#S);
      } catch (e) {
        this.#f("error", { error: o(e) });
      }
  }
  #_(e, t, i) {
    e <= 0 || t <= 0 || this.#T({ start: i, codedSize: { width: e, height: t } });
  }
  /** Add source metadata now, but apply it only when its picture is shown. */
  #P(e) {
    for (const { start: t, interlaced: i, topFieldFirst: s } of e)
      this.#T({
        start: t,
        scan: { interlaced: i, topFieldFirst: s }
      });
  }
  #T(e) {
    const t = this.#o.at(-1), i = {
      start: e.start,
      codedSize: e.codedSize ?? t?.codedSize,
      scan: e.scan ?? t?.scan
    };
    if (t?.start === i.start) this.#o.pop();
    else if (t?.codedSize?.width === i.codedSize?.width && t?.codedSize?.height === i.codedSize?.height && t?.scan?.interlaced === i.scan?.interlaced && t?.scan?.topFieldFirst === i.scan?.topFieldFirst)
      return;
    if (this.#o.push(i), this.video.buffered.length > 0) {
      const s = this.video.buffered.start(0);
      let r = 0;
      for (; r + 1 < this.#o.length && this.#o[r + 1].start <= s; )
        r++;
      r > 0 && this.#o.splice(0, r);
    }
    this.#i && (this.#i.videoTimeline = this.#o);
  }
  #L() {
    this.#o = [], this.#i && (this.#i.videoTimeline = []);
  }
  load(e) {
    if (this.#b)
      return Promise.reject(new Error("the player has been destroyed"));
    if (this.#s === "worker" && !l(this.#e.preferManagedMediaSource))
      return Promise.reject(
        new Error("this browser cannot construct a MediaSource in a worker")
      );
    this.stop();
    const t = this.#t;
    this.#g = null, this.#L(), this.#l(), this.#k = a(), this.#c = this.#k;
    const i = this.#H(), s = new Promise((r, f) => {
      this.#v = { resolve: r, reject: f };
    });
    return this.#M("loading"), i.postMessage({
      type: "load",
      id: t,
      url: String(e),
      wasmUrl: this.#e.wasmUrl === void 0 ? null : String(this.#e.wasmUrl),
      oversample: this.#e.oversample,
      recoveryInterval: this.#e.recoveryInterval,
      openGopRecovery: this.#e.openGopRecovery,
      splitFieldSamples: this.#e.splitFieldSamples,
      audioGainSteps: this.#e.audioGainSteps ?? 0,
      surroundAudioGainSteps: this.#e.surroundAudioGainSteps ?? this.#e.audioGainSteps ?? 0,
      passthrough: this.#e.passthrough ?? !1,
      pictureWorkers: this.#e.pictureWorkers,
      serviceId: this.#e.serviceId ?? null,
      sink: this.#s,
      encodedVideo: this.#i?.encodedVideo != null,
      preferManagedMediaSource: this.#e.preferManagedMediaSource ?? !1,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10
    }), this.#C(), s;
  }
  /** Abandon the current load. The player stays usable. */
  stop() {
    const e = this.#t;
    this.#t++, this.#r?.postMessage({ type: "stop", id: e }), this.#j(), this.#V(new Error("the load was stopped")), this.#M("idle");
  }
  /** Stop, and give up the worker. The player cannot be loaded again. */
  destroy() {
    if (!this.#b) {
      this.stop(), this.#b = !0, this.video.removeEventListener("seeking", this.#R);
      for (const e of c)
        this.video.removeEventListener(e, this.#D);
      this.#i?.destroy(), this.#i = null, this.#r?.terminate(), this.#r = null;
    }
  }
  addEventListener(e, t, i) {
    super.addEventListener(e, t, i);
  }
  removeEventListener(e, t, i) {
    super.removeEventListener(e, t, i);
  }
  #H() {
    if (!this.#r) {
      const e = new Worker(
        this.#e.workerUrl ?? E,
        {
          type: "module"
        }
      );
      e.onmessage = this.#w, e.onerror = (t) => this.#U(new Error(t.message || "the worker failed")), this.#r = e;
    }
    return this.#r;
  }
  #w = (e) => {
    const t = e.data;
    if (t.id === this.#t)
      switch (t.type) {
        case "handle":
          t.managed && this.#I(), this.video.srcObject = t.handle, this.#u("attached", a());
          break;
        case "open":
          this.#i?.encodedVideo?.append(t.data), this.#O(t.mimeCodec, t.data);
          break;
        case "video-config":
          this.#_(
            t.width,
            t.height,
            t.start
          );
          break;
        case "fragment":
          this.#i?.encodedVideo?.append(t.data), this.#h?.push(
            t.data,
            t.start,
            t.randomAccess
          );
          break;
        case "opened":
          this.#M("converting"), this.#V(null);
          break;
        case "seekable":
          this.#g = t.duration, this.#h?.setDuration(t.duration), this.#f("seekable", { duration: t.duration });
          break;
        case "reset":
          this.#i?.encodedVideo?.reset(), this.#L(), this.#h?.reset();
          break;
        case "scans":
          this.#P(t.scans);
          break;
        case "workers":
          this.#f("workers", {
            pictureWorkers: t.pictureWorkers
          });
          break;
        case "services":
          this.#f("services", t.services);
          break;
        case "audio":
          this.#E = t.audio, this.#f("audio", t.audio);
          break;
        case "private_stream_1":
        case "private_stream_2":
          this.#f(t.type, t.stream);
          break;
        case "mark":
          this.#u(t.name, t.at);
          break;
        case "seek":
          this.video.currentTime < t.time && (this.video.currentTime = t.time);
          break;
        case "hold":
          this.#h?.holdStart(t.seconds);
          break;
        case "progress":
          this.#f("progress", {
            bytesRead: t.bytesRead,
            totalBytes: t.totalBytes
          });
          break;
        case "stats":
          this.#f("stats", t.stats);
          break;
        case "blocked":
          this.#M(t.blocked ? "buffer-full" : "converting");
          break;
        case "finish":
          this.#F();
          break;
        case "completed":
          this.#i?.encodedVideo?.finish(), this.#M("completed"), this.#s === "worker" && this.#x();
          break;
        case "video-data":
          t.data === null ? this.#i?.encodedVideo?.reset() : this.#i?.encodedVideo?.append(t.data);
          break;
        case "error":
          this.#U(new Error(t.message));
          break;
      }
  };
  /** Open a MediaSource here, for browsers that cannot have one in a worker. */
  #O(e, t) {
    const i = this.#t;
    let s;
    try {
      s = this.#h ?? this.#N(i);
    } catch (r) {
      this.#U(o(r));
      return;
    }
    s.open(e, t).then(
      // The worker is waiting on flow to know the open succeeded. Going
      // through ready() rather than saying true covers the case where the
      // append filled the queue on its own.
      () => s.ready().then(() => this.#y(i, { type: "flow", id: i, ready: !0 })),
      (r) => {
        i === this.#t && this.#U(o(r));
      }
    );
  }
  #N(e) {
    const t = new S({
      preferManaged: this.#e.preferManagedMediaSource,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10,
      seek: (i) => {
        this.video.currentTime < i && (this.video.currentTime = i);
      },
      onMark: (i) => this.#u(i, a()),
      onReadyChange: (i) => this.#y(e, { type: "flow", id: e, ready: i }),
      onBlocked: (i) => {
        e === this.#t && this.#M(i ? "buffer-full" : "converting");
      },
      onError: (i) => {
        e === this.#t && this.#U(i);
      }
    });
    return this.#h = t, this.#n = URL.createObjectURL(t.mediaSource), t.managed ? this.#W(this.#n) : this.video.src = this.#n, this.#u("attached", a()), this.#g !== null && t.setDuration(this.#g), t;
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
  #W(e) {
    this.video.removeAttribute("src"), this.#I();
    const t = document.createElement("source");
    t.type = "video/mp4", t.src = e, this.video.append(t), this.#m = t, this.video.load();
  }
  /**
   * Rule out AirPlay, which a managed source cannot be sent over and which
   * Safari will not open one until the element has given up. The element
   * belongs to whoever made it, so it is put back on the way out -- unless it
   * was already off, and theirs to keep.
   */
  #I() {
    this.video.disableRemotePlayback || (this.video.disableRemotePlayback = !0, this.#a = !0);
  }
  #F() {
    const e = this.#t, t = this.#h;
    t && t.finish().then(
      () => {
        e === this.#t && this.#x();
      },
      (i) => {
        e === this.#t && this.#U(o(i));
      }
    );
  }
  /**
   * Answer the viewer moving the playhead somewhere the buffer does not reach.
   *
   * Everything inside a buffered range is Media Source Extensions' own affair,
   * including the correction #startAtMedia asks for, so those go no further.
   * What is left is a real seek: the worker throws the buffer away and reads
   * the input again from where the viewer asked to be.
   */
  #R = () => {
    if (this.#g === null || this.#p === "idle" || this.#p === "error") return;
    const e = this.video.currentTime;
    this.#A(e) || (this.#M("seeking"), this.#L(), this.#C(), this.#r?.postMessage({
      type: "seek",
      id: this.#t,
      time: e
    }));
  };
  #D = (e) => {
    this.#p !== "idle" && (this.#u(e.type, a()), e.type === "waiting" && this.#G());
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
  #G() {
    if (this.video.seeking) return;
    const e = this.video.currentTime, t = this.video.buffered;
    let i = null;
    for (let s = 0; s < t.length; s++) {
      const r = t.start(s);
      if (e >= r - d && e < t.end(s) - d)
        return;
      r > e + d && (i === null || r < i) && (i = r);
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
  #u(e, t) {
    if (this.#k === 0) return;
    const i = t - this.#k, s = Math.max(0, t - this.#c);
    this.#c = Math.max(this.#c, t), this.#f("timing", { name: e, sinceLoad: i, sincePrevious: s });
  }
  #A(e) {
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
  #B = () => {
    const e = this.video.currentTime;
    this.#s === "main" ? this.#h?.setCurrentTime(e) : this.#r?.postMessage({
      type: "time",
      id: this.#t,
      currentTime: e
    });
  };
  #y(e, t) {
    e === this.#t && this.#r?.postMessage(t);
  }
  #C() {
    this.#d === null && (this.#d = setInterval(
      this.#B,
      200
    ));
  }
  #x() {
    this.#d !== null && (clearInterval(this.#d), this.#d = null);
  }
  #j() {
    this.#x(), this.#i?.encodedVideo?.reset(), this.#L(), this.#h?.close(), this.#h = null, this.#n && URL.revokeObjectURL(this.#n), this.#n = null, this.#m?.remove(), this.#m = null, this.#a && (this.video.disableRemotePlayback = !1, this.#a = !1), this.video.removeAttribute("src"), this.video.srcObject = null, this.video.load();
  }
  #U(e) {
    this.#j(), this.#M("error"), this.#V(e), this.#f("error", { error: e });
  }
  #V(e) {
    const t = this.#v;
    t && (this.#v = null, e ? t.reject(e) : t.resolve());
  }
  #M(e) {
    this.#p !== e && (this.#p = e, this.#f("statechange", { state: e }));
  }
  #f(e, t) {
    this.dispatchEvent(new CustomEvent(e, { detail: t }));
  }
}
export {
  M as DEFAULT_KEEP_BEHIND_SECONDS,
  y as DEFAULT_MAX_AHEAD_SECONDS,
  b as DEFAULT_QUEUE_HIGH_WATER_MARK,
  T as Mpeg2TsPlayer,
  A as requiresManagedMediaSource,
  w as supportsManagedMediaSource,
  _ as supportsPassthrough,
  l as supportsWorkerMediaSource
};
//# sourceMappingURL=index.js.map
