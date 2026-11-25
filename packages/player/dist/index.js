const ct = 33554432;
const lt = 8, ft = 10;
const f = globalThis.ManagedMediaSource;
function k(h = !1) {
  const t = typeof MediaSource > "u" ? null : MediaSource;
  return h && f ? f : t ?? f ?? null;
}
function F(h, t = !1) {
  return k(t)?.isTypeSupported(h) ?? !1;
}
function U(h = !1) {
  return k(h)?.canConstructInDedicatedWorker === !0;
}
function pt() {
  return f !== void 0;
}
function mt() {
  return typeof MediaSource > "u" && f !== void 0;
}
class C {
  #e = !0;
  #s = [];
  get open() {
    return this.#e;
  }
  /** Returns whether this changed anything. */
  set(t) {
    return t === this.#e ? !1 : (this.#e = t, t && this.#r(), !0);
  }
  wait() {
    return this.#e ? Promise.resolve() : new Promise((t) => {
      this.#s.push(t);
    });
  }
  /** Let everyone through whatever the state is, for teardown. */
  abandon() {
    this.#r();
  }
  #r() {
    const t = this.#s;
    this.#s = [];
    for (const e of t) e();
  }
}
class x {
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
  #o = "";
  /** A codec to move the `SourceBuffer` to before the next append. */
  #n = null;
  #a = [];
  #g = 0;
  #u = null;
  #c = !1;
  /**
   * Whether a managed source wants data at the moment.
   *
   * True until told otherwise, and always true for an unmanaged source, which
   * takes whatever it is given. A managed one starts out not streaming and
   * asks once it is attached and playing, so waiting for permission before the
   * initialization segment would mean waiting for a player that never starts:
   * this holds the door open until `endstreaming` closes it.
   */
  #l = !0;
  /** The last thing said about there being no room, so it is said once. */
  #d = !1;
  /** Whether everything buffered is waiting to be thrown away; see `reset`. */
  #p = !1;
  /** Which stretch of timeline is being filled. Bumped by every `reset`. */
  #m = 0;
  /** A duration to put on the MediaSource as soon as it will take one. */
  #y = null;
  /** Media times a decoder can start from, in order; see #evict. */
  #E = [];
  /** Whether the playhead has been put where the media starts; see #startAtMedia. */
  #S = !1;
  /** Seconds of media to collect before the first append; see `holdStart`. */
  #i = 0;
  #b = 0;
  #v = !1;
  #w = !1;
  #f = new C();
  #I = [];
  constructor(t) {
    this.#s = t;
    const e = k(t.preferManaged);
    if (!e) throw new Error("this browser has no Media Source Extensions");
    this.#e = e, this.mediaSource = new e(), this.managed = e === f, this.managed && (this.mediaSource.addEventListener(
      "startstreaming",
      this.#h
    ), this.mediaSource.addEventListener("endstreaming", this.#k)), this.#r = new Promise((s) => {
      this.mediaSource.addEventListener(
        "sourceopen",
        () => {
          t.onMark?.("sourceopen"), s();
        },
        { once: !0 }
      );
    });
  }
  ready() {
    return this.#f.wait();
  }
  /**
   * Open the stream, or -- for the initialization segment a seek brings with
   * it -- re-open the one already running.
   */
  async open(t, e) {
    if (!this.#e.isTypeSupported(t))
      throw new Error(`unsupported codec: ${t}`);
    if (await this.#r, !this.#v) {
      if (this.#t)
        t !== this.#o && (this.#n = t);
      else {
        const s = this.mediaSource.addSourceBuffer(t);
        s.mode = "segments", s.addEventListener("updateend", this.#A), s.addEventListener("error", this.#O), this.#t = s, this.#o = t;
      }
      this.#L({ data: e, init: !0 }), this.#F();
    }
  }
  push(t, e, s) {
    this.#v || (s && this.#E.push(e), this.#L({ data: t, init: !1, start: e }));
  }
  /**
   * Keep the first media fragments queued until they span this many seconds,
   * then append them together.
   *
   * Playback begins as soon as anything is buffered. A live stream arrives no
   * faster than it plays, so whatever is buffered at that moment is all the
   * margin playback will ever have. Has no effect once media has been appended.
   */
  holdStart(t) {
    this.#S || (this.#i = t);
  }
  /** Whether the first media is still being collected. Ends the hold when not. */
  #M() {
    if (this.#i === 0) return !1;
    const t = this.#a.filter((s) => !s.init);
    return (t.length > 0 ? t[t.length - 1].start - t[0].start : 0) < this.#i && !this.#w ? !0 : (this.#i = 0, !1);
  }
  /**
   * How long the whole presentation is.
   *
   * Without this the media element has no timeline to offer a viewer: it is
   * what turns `seekable` into the length of the file rather than the length
   * of what has been converted so far.
   */
  setDuration(t) {
    this.#y = t, this.#F();
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
    this.#v || (this.#m++, this.#a = [], this.#g = 0, this.#E = [], this.#S = !1, this.#w = !1, this.#c = !1, this.#U(), this.#t && (this.#p = !0), this.#P(!0), this.#_(), this.#N());
  }
  async finish() {
    if (this.#w = !0, this.#v || !this.#t) return;
    const t = this.#m;
    await new Promise((e) => {
      this.#I.push(e), this.#N();
    }), !(this.#v || this.#m !== t) && this.mediaSource.readyState === "open" && this.mediaSource.endOfStream();
  }
  close() {
    this.#v || (this.#v = !0, this.managed && (this.mediaSource.removeEventListener(
      "startstreaming",
      this.#h
    ), this.mediaSource.removeEventListener(
      "endstreaming",
      this.#k
    )), this.#t?.removeEventListener("updateend", this.#A), this.#t?.removeEventListener("error", this.#O), this.#t = null, this.#a = [], this.#g = 0, this.#E = [], this.#f.abandon(), this.#P(!0));
  }
  /** Tell the sink where playback has got to, so it can evict what is behind. */
  setCurrentTime(t) {
    this.#b = t, this.#x(), this.#_(), this.#N();
  }
  #L(t) {
    this.#a.push(t), this.#g += t.data.byteLength, this.#_(), this.#N();
  }
  #N() {
    const t = this.#t;
    if (this.#v || !t || t.updating || this.#u)
      return;
    if (this.#p) {
      this.#u = { type: "clear" };
      try {
        t.remove(0, Number.POSITIVE_INFINITY);
      } catch (s) {
        this.#u = null, this.#p = !1, this.#T(s);
      }
      return;
    }
    if (this.#c) return;
    const e = this.#a[0];
    if (!e) {
      this.#P(!1);
      return;
    }
    if (!(!e.init && this.#M())) {
      if (this.#n !== null) {
        const s = this.#n;
        this.#n = null;
        try {
          t.changeType(s), this.#o = s;
        } catch (i) {
          this.#T(i);
          return;
        }
      }
      this.#u = { type: "append", pending: e, epoch: this.#m };
      try {
        t.appendBuffer(e.data);
      } catch (s) {
        this.#u = null, s instanceof DOMException && s.name === "QuotaExceededError" ? (this.#c = !0, this.#_(), this.#U(), this.#x()) : this.#T(s);
      }
    }
  }
  #A = () => {
    const t = this.#u;
    if (t?.type === "append") {
      if (t.epoch === this.#m && this.#a[0] === t.pending) {
        const e = this.#a.shift();
        this.#g -= e.data.byteLength, e.init || this.#q(e.start);
      }
    } else t?.type === "remove" ? (this.#c = !1, this.#U()) : t?.type === "clear" && (this.#p = !1);
    this.#u = null, this.#F(), this.#x(), this.#_(), this.#N();
  };
  /**
   * The managed source asking for data again, which is the only thing that
   * reopens the door `endstreaming` closed.
   */
  #h = () => {
    this.#l = !0, this.#_(), this.#U();
  };
  /**
   * The managed source saying it has enough.
   *
   * What is already queued still goes in -- it was converted, and a few
   * fragments are cheaper to append than to convert again -- but nothing more
   * is taken until it asks. This is the whole point of the managed source: it
   * knows what the radio and the battery are doing and the page does not.
   */
  #k = () => {
    this.#l = !1, this.#_(), this.#U();
  };
  #O = () => {
    this.#T(new Error("the SourceBuffer rejected what was appended"));
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
  #q(t) {
    const e = this.#t?.buffered;
    this.#S || !e || e.length === 0 || (this.#S = !0, this.#s.onMark?.("appended"), this.#s.seek(Math.max(e.start(0), t)));
  }
  /**
   * Put the length of the file on the MediaSource, once it will take one.
   *
   * The setter only exists while the stream is open and nothing is updating,
   * so this runs again after every operation until it finds its moment. A
   * duration shorter than what is already buffered would evict the difference,
   * so what is buffered wins: it is the file speaking for itself.
   */
  #F() {
    const t = this.#y;
    if (t === null || this.#v || this.mediaSource.readyState !== "open" || this.#u || this.#t?.updating) return;
    const e = this.#t?.buffered, s = e && e.length > 0 ? e.end(e.length - 1) : 0;
    this.#y = null;
    try {
      this.mediaSource.duration = Math.max(t, s);
    } catch (i) {
      this.#T(i);
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
  #x() {
    const t = this.#t;
    if (!this.#c || !t || t.updating || this.#u || this.#p || t.buffered.length === 0) return;
    const e = this.#b - this.#s.keepBehindSeconds;
    let s = 0;
    for (const r of this.#E) {
      if (r > e) break;
      s = r;
    }
    const i = s - 1e-3;
    if (!(i <= 0)) {
      for (; this.#E.length > 0 && this.#E[0] < s; )
        this.#E.shift();
      this.#u = { type: "remove" }, t.remove(0, i);
    }
  }
  /** How far past the playhead the buffer reaches, in seconds. */
  #j() {
    const t = this.#t?.buffered;
    return !t || t.length === 0 ? 0 : t.end(t.length - 1) - this.#b;
  }
  #_() {
    const t = !this.#c && this.#l && this.#j() < this.#s.maxAheadSeconds && this.#g < this.#s.queueHighWaterMark && // The fragment limit would stop the input before a start hold fills.
    (this.#i > 0 || this.#a.length < 2);
    this.#f.set(t) && this.#s.onReadyChange?.(t);
  }
  /**
   * Say whether conversion is waiting on the buffer, whichever of the two
   * reasons it is: no room left, or a managed source that wants nothing for
   * now. Both look the same from where the conversion sits.
   */
  #U() {
    const t = this.#c || !this.#l;
    t !== this.#d && (this.#d = t, this.#s.onBlocked?.(t));
  }
  /** Wake `finish`, either because everything is appended or because we gave up. */
  #P(t) {
    if (!t && (!this.#w || this.#a.length > 0 || this.#u))
      return;
    const e = this.#I;
    this.#I = [];
    for (const s of e) s();
  }
  #T(t) {
    this.#s.onError?.(
      t instanceof Error ? t : new Error(String(t))
    );
  }
}
const V = "" + new URL("assets/worker-DPoV-j1g.js", import.meta.url).href, P = 5e-3, E = 5, H = 1 / (4 * E * E), S = 1e-3, v = 2e-3, y = P + v + S, B = 240, W = 250, G = 2e-6;
class q {
  #e;
  /** Recent refresh times, to average the period over. */
  #s = [];
  #r = 1;
  #t = Number.NEGATIVE_INFINITY;
  /** How much faster than asked the sound plays at adjust 1, as learnt from the lead. */
  #o;
  /** `drift` is what an earlier lock on the same output device learnt. */
  constructor(t, e = 0) {
    this.#e = t, this.#o = e;
  }
  /** How much faster than asked the output device plays, as learnt so far. */
  get drift() {
    return this.#o;
  }
  /** The speed factor last sent. */
  get adjust() {
    return this.#r;
  }
  /** The refresh period, in ms, or NaN until enough refreshes were seen. */
  get period() {
    const t = this.#s;
    if (t.length < 30) return Number.NaN;
    const e = t.at(-1) - t[0], s = t.slice(1).map((n, a) => n - t[a]), i = [...s].sort((n, a) => n - a)[s.length >> 1];
    let r = 0;
    for (const n of s)
      r += Math.max(1, Math.round(n / i));
    return e / r;
  }
  /**
   * The first refresh at or after `wall` on the grid of those seen, as an
   * animation frame's time; NaN while the period is not known.
   */
  refreshAfter(t) {
    const e = this.period, s = this.#s.at(-1);
    return Number.isNaN(e) || s === void 0 ? Number.NaN : s + Math.max(0, Math.ceil((t - s) / e)) * e;
  }
  /** Take one animation frame. */
  frame(t) {
    const { now: e, rate: s, step: i } = t;
    this.#s.push(e), this.#s.length > B && this.#s.shift();
    const r = this.period;
    if (i === null || Number.isNaN(r)) {
      this.#n(e, 1);
      return;
    }
    if (!t.active) return;
    const n = s * r / (i * 1e3), a = n >= 1 ? Math.round(n) : 1 / Math.round(1 / n), o = Math.abs(n / a - 1) <= P ? a * i * 1e3 / (r * s) : 1, d = t.avDifference;
    let c = 0;
    Number.isFinite(d) && (c = Math.min(
      v,
      Math.max(-v, d / E)
    ), this.#o = Math.min(
      S,
      Math.max(-S, this.#o + H * d * r / 1e3)
    ));
    const O = Math.min(
      1 + y,
      Math.max(1 - y, o * (1 - c - this.#o))
    );
    this.#n(e, O);
  }
  #n(t, e) {
    Math.abs(e - this.#r) < G || e !== 1 && t - this.#t < W || (this.#r = e, this.#t = t, this.#e(e));
  }
}
var u = /* @__PURE__ */ ((h) => (h[h.Nothing = 0] = "Nothing", h[h.Metadata = 1] = "Metadata", h[h.CurrentData = 2] = "CurrentData", h[h.FutureData = 3] = "FutureData", h[h.EnoughData = 4] = "EnoughData", h))(u || {});
const j = 250, b = 0.25, M = 4;
class m {
  #e;
  constructor(t) {
    this.#e = t;
  }
  get length() {
    return this.#e === null ? 0 : 1;
  }
  start(t) {
    return this.#s(t).start;
  }
  end(t) {
    return this.#s(t).end;
  }
  #s(t) {
    if (t !== 0 || this.#e === null)
      throw new DOMException(
        `index ${t} of ${this.length} ranges`,
        "IndexSizeError"
      );
    return this.#e;
  }
}
const z = [
  "currentTime",
  "paused",
  "play",
  "pause",
  "playbackRate",
  "volume",
  "muted",
  "duration",
  "buffered",
  "seekable",
  "played",
  "readyState",
  "seeking",
  "ended",
  "error"
];
class K {
  #e;
  #s;
  #r = !1;
  #t = !0;
  #o = !1;
  #n = !1;
  #a = 0;
  #g = !1;
  #u = !1;
  /** A readyState asked for before the duration was known; see `setReadyState`. */
  #c = null;
  /** The position while the sound is not running. */
  #l = 0;
  /** Whether the sound is playing, so that the position is the one heard. */
  #d = !1;
  #p = Number.NaN;
  #m = null;
  #y = null;
  #E;
  #S;
  #i;
  #b = null;
  constructor(t, e) {
    this.#e = t, this.#s = e, this.#E = t.playbackRate, this.#S = t.volume, this.#i = t.muted;
  }
  /** The gain the sound should have now. */
  get gain() {
    return this.#i ? 0 : this.#S;
  }
  get rate() {
    return this.#E;
  }
  get paused() {
    return this.#t;
  }
  /** Whether the sound is playing and playback is wanted. */
  get playing() {
    return this.#d && !this.#t;
  }
  get readyState() {
    return this.#a;
  }
  /** The position the element reports. */
  get currentTime() {
    if (this.#d) {
      const t = this.#s.heard();
      if (!Number.isNaN(t)) return t;
    }
    return this.#l;
  }
  install() {
    if (this.#r) return;
    this.#r = !0;
    const t = this.#e, e = (s, i) => Object.defineProperty(t, s, { configurable: !0, ...i });
    e("currentTime", {
      get: () => this.currentTime,
      set: (s) => this.#v(s)
    }), e("paused", { get: () => this.#t }), e("play", { value: () => this.#w(), writable: !0 }), e("pause", { value: () => this.#f(), writable: !0 }), e("playbackRate", {
      get: () => this.#E,
      set: (s) => this.#I(s)
    }), e("volume", {
      get: () => this.#S,
      set: (s) => this.#M(s, this.#i)
    }), e("muted", {
      get: () => this.#i,
      set: (s) => this.#M(this.#S, !!s)
    }), e("duration", { get: () => this.#p }), e("buffered", { get: () => new m(this.#m) }), e("seekable", { get: () => new m(this.#L()) }), e("played", {
      get: () => new m(
        this.#y === null ? null : { start: this.#y, end: this.currentTime }
      )
    }), e("readyState", { get: () => this.#a }), e("seeking", { get: () => this.#o }), e("ended", { get: () => this.#n }), e("error", { get: () => null });
  }
  /** Give the element its own media interface back, with the volume and speed it has now. */
  uninstall() {
    if (!this.#r) return;
    this.#r = !1, this.#A();
    const t = this.#e;
    for (const e of z) delete t[e];
    this.#e.playbackRate = this.#E, this.#e.volume = this.#S, this.#e.muted = this.#i;
  }
  /** How long the media is; Infinity for a live input, NaN before it is known. */
  setDuration(t) {
    if (Object.is(t, this.#p)) return;
    this.#p = t, this.#h("durationchange");
    const e = this.#c;
    this.#c = null, e !== null && this.setReadyState(e);
  }
  setBuffered(t) {
    this.#m = t, this.#h("progress");
  }
  /**
   * Move readyState, with the events a media element fires on the way up,
   * and `waiting` on the way down while playback is wanted. `loadedmetadata`
   * and `loadeddata` come once a load, as the element's do; the others again
   * after every fall, as after a seek.
   */
  setReadyState(t) {
    if (t >= 1 && Number.isNaN(this.#p)) {
      this.#c = t;
      return;
    }
    this.#c = null;
    const e = this.#a;
    if (t !== e) {
      if (this.#a = t, t < e) {
        t < 3 && e >= 3 && !this.#t && this.#h("waiting");
        return;
      }
      !this.#g && t >= 1 && (this.#g = !0, this.#h("loadedmetadata")), !this.#u && t >= 2 && (this.#u = !0, this.#h("loadeddata")), e < 3 && t >= 3 && this.#h("canplay"), e < 4 && t >= 4 && this.#h("canplaythrough");
    }
  }
  /** A seek's media is in place: `seeked`. */
  seeked() {
    this.#o && (this.#o = !1, this.#h("timeupdate"), this.#h("seeked"));
  }
  /** The sound started playing at media time `media`. */
  soundStarted(t) {
    this.#d || (this.#l = t, this.#d = !0, this.#y ??= t, !this.#t && (this.#h("playing"), this.#N()));
  }
  /**
   * The sound stopped at media time `media`: run out (`waiting` follows from
   * the readyState the caller sets), paused, or at the end of the media.
   */
  soundStopped(t, e) {
    this.#l = t, this.#d = !1, this.#A(), e && (this.#n = !0, this.#h("timeupdate"), this.#t || (this.#t = !0, this.#h("pause")), this.#h("ended"));
  }
  /** Where the media begins, for a load whose first media is later than zero. */
  place(t) {
    this.#d || t <= this.#l || (this.#l = t, this.#h("timeupdate"));
  }
  #v(t) {
    if (!Number.isFinite(t))
      throw new TypeError(`currentTime cannot be ${t}`);
    let e = Math.max(0, t);
    Number.isFinite(this.#p) && (e = Math.min(e, this.#p)), this.#d = !1, this.#A(), this.#n = !1, this.#o = !0, this.#l = e, this.#h("seeking"), this.#h("timeupdate"), this.#s.seek(e);
  }
  async #w() {
    if (this.#n && this.#v(0), this.#t && (this.#t = !1, this.#h("play"), this.#a < 3 && this.#h("waiting")), !await this.#s.resume())
      throw this.#t || (this.#t = !0, this.#h("pause")), new DOMException(
        "the browser does not let sound start without the viewer's gesture",
        "NotAllowedError"
      );
    this.#t || (this.#s.play(), this.#d && (this.#h("playing"), this.#N()));
  }
  #f() {
    this.#t || (this.#l = this.currentTime, this.#d = !1, this.#t = !0, this.#A(), this.#s.pause(), this.#h("timeupdate"), this.#h("pause"));
  }
  #I(t) {
    if (!(t >= b && t <= M))
      throw new DOMException(
        `playbackRate ${t} is outside ${b} to ${M}`,
        "NotSupportedError"
      );
    t !== this.#E && (this.#E = t, this.#s.rate(t), this.#h("ratechange"));
  }
  #M(t, e) {
    if (!(t >= 0 && t <= 1))
      throw new DOMException(
        `volume ${t} is outside 0 to 1`,
        "IndexSizeError"
      );
    t === this.#S && e === this.#i || (this.#S = t, this.#i = e, this.#s.volume(this.gain), this.#h("volumechange"));
  }
  #L() {
    return Number.isFinite(this.#p) ? { start: 0, end: this.#p } : this.#m;
  }
  #N() {
    this.#b === null && (this.#b = setInterval(
      () => this.#h("timeupdate"),
      j
    ));
  }
  #A() {
    this.#b !== null && (clearInterval(this.#b), this.#b = null);
  }
  /** Fire `type` on the element once the code that caused it has run, as a media element does. */
  #h(t) {
    queueMicrotask(() => {
      this.#r && this.#e.dispatchEvent(new Event(t));
    });
  }
}
const $ = "" + new URL("assets/processor-9SraeEvc.js", import.meta.url).href, X = 33, N = 4, w = 0.05, A = 2e-6, T = 5e-4, Q = 4, Y = 20, J = 60, Z = 200, tt = 32;
class et {
  #e;
  #s;
  // The block being collected: when it started and its lowest reading.
  #r = 0;
  #t = 1 / 0;
  #o = 0;
  #n = 0;
  // The mapping: context seconds at wall ms w is #offset + #slope × (w − #at) / 1000.
  #a = !1;
  #g = 0;
  #u = 0;
  #c = 1;
  // Covariance of (offset in ms, slope).
  #l = 0;
  #d = 0;
  #p = 0;
  #m = 0;
  /** Since when the readings have been off the line, or NaN. */
  #y = Number.NaN;
  /** The last `currentTime` read, and the wall time it was first read. */
  #E = Number.NaN;
  #S = 0;
  #i = [];
  constructor(t) {
    this.#e = t, this.#s = t.sampleRate;
  }
  /**
   * Feed every `position` report.
   *
   * Reports are made when the processor renders, which is ahead of the
   * speaker by the output latency and the device buffer, so a report stays
   * needed until the frame being heard has passed its successor's frame. That
   * is pruned by frame, not by count: at a speed change a report can come every
   * quantum, and with an output latency of a Bluetooth device (a few hundred
   * ms) a fixed count would drop the report for the frame still being heard.
   * While the mapping is not known, only the last `REPORTS` are kept.
   */
  report(t) {
    const e = this.#i, s = e.at(-1);
    s !== void 0 && s.epoch !== t.epoch && (e.length = 0), e.push(t);
    const i = this.frameAt(performance.now());
    if (Number.isNaN(i)) {
      e.length > tt && e.shift();
      return;
    }
    let r = 0;
    for (; r + 1 < e.length && e[r + 1].frame <= i; )
      r++;
    r > 0 && e.splice(0, r);
  }
  /**
   * Feed a reading of the context clock. `now` is the `performance.now()` at
   * which it is taken, which is what it defaults to; pass it only if it was
   * read immediately before.
   */
  sample(t = performance.now()) {
    const e = this.#e;
    if (e.state !== "running") {
      this.#w();
      return;
    }
    const s = e.currentTime;
    if (this.#m = e.outputLatency ?? 0, s !== this.#E)
      this.#E = s, this.#S = t;
    else if (t - this.#S > Y) return;
    this.#a || (this.#a = !0, this.#g = t, this.#u = s, this.#c = 1, this.#l = 400, this.#d = 0, this.#p = T * T, this.#r = t, this.#t = 1 / 0);
    const i = (s - this.#v(t)) * 1e3;
    if (i < -30 || i > J) {
      Number.isNaN(this.#y) && (this.#y = t), t - this.#y >= Z && (this.#w(), this.sample(t));
      return;
    }
    this.#y = Number.NaN, t - this.#r >= X && this.#t !== 1 / 0 && (this.#f(this.#o, this.#n), this.#r = t, this.#t = 1 / 0), i < this.#t && (this.#t = i, this.#o = t, this.#n = s);
  }
  /** Media time being heard at wall time `wall`, or NaN when not playing or not yet known. */
  at(t) {
    const e = this.frameAt(t), s = this.#b(e);
    return s === void 0 ? Number.NaN : s.state === "playing" ? s.media + (e - s.frame) * s.speed / this.#s : s.state === "starved" ? s.media : Number.NaN;
  }
  /** The processor's state as last reported; "idle" before the first report. */
  get state() {
    return this.#i.at(-1)?.state ?? "idle";
  }
  /** Wall time at which the device plays context frame `frame` (outputLatency included); NaN until known. */
  wallOfFrame(t) {
    if (!this.#a) return Number.NaN;
    const e = t / this.#s;
    return this.#g + (e - this.#u) * 1e3 / this.#c + this.#m * 1e3;
  }
  /** The context frame being heard at wall time `wall`; NaN until known. */
  frameAt(t) {
    return this.#a ? this.#v(t - this.#m * 1e3) * this.#s : Number.NaN;
  }
  /** The latest report that covers `frame`. */
  #b(t) {
    if (!Number.isNaN(t)) {
      for (let e = this.#i.length - 1; e >= 0; e--)
        if (this.#i[e].frame <= t) return this.#i[e];
    }
  }
  /** Context seconds on the mapping's line at wall ms `wall` (no latency). */
  #v(t) {
    return this.#u + this.#c * (t - this.#g) / 1e3;
  }
  #w() {
    this.#a = !1, this.#y = Number.NaN;
  }
  /** A Kalman step with the block minimum (`wall` ms, `time` s). */
  #f(t, e) {
    const s = t - this.#g, i = Math.abs(s) / 1e3;
    this.#u += this.#c * s / 1e3, this.#g = t;
    const r = this.#l + 2 * s * this.#d + s * s * this.#p, n = this.#d + s * this.#p;
    this.#l = r + w * w * i, this.#d = n, this.#p += A * A * i;
    const a = (e - this.#u) * 1e3, o = this.#l + N * N;
    if (Math.abs(a) > Q * Math.sqrt(o)) return;
    const d = this.#l / o, c = this.#d / o;
    this.#u += d * a / 1e3, this.#c += c * a, this.#p -= c * this.#d, this.#d -= d * this.#d, this.#l -= d * this.#l;
  }
}
const st = "mpeg2toh264-sound", it = $, rt = 50, R = /* @__PURE__ */ new WeakMap();
function ht(h) {
  let t = R.get(h);
  return t || (t = h.audioWorklet.addModule(it), R.set(h, t)), t;
}
class nt {
  context;
  clock;
  /** The end of the PCM channel that belongs to the decode worker. */
  workerPort;
  #e;
  #s = null;
  /** Commands given before the processor existed, in order. */
  #r = [];
  #t = !1;
  #o;
  #n = 0;
  constructor(t, e, s) {
    this.#e = s, this.context = t, this.clock = e;
    const { port1: i, port2: r } = new MessageChannel();
    this.workerPort = r, this.#o = setInterval(this.#u, rt), this.#n = requestAnimationFrame(this.#c), ht(t).then(
      () => this.#a(i),
      (n) => this.#g(n)
    );
  }
  /** Give the processor a command, now or as soon as it exists. */
  control(t) {
    this.#t || (this.#s ? this.#s.port.postMessage(t) : this.#r.push(t));
  }
  /**
   * Let the context run. A browser that wants a gesture before sound plays
   * keeps it suspended outside one; the answer is whether it runs now.
   */
  async resume() {
    if (this.context.state !== "running")
      try {
        await this.context.resume();
      } catch {
        return !1;
      }
    return this.context.state === "running";
  }
  close() {
    this.#t || (this.#t = !0, clearInterval(this.#o), cancelAnimationFrame(this.#n), this.#s?.port.close(), this.#s?.disconnect(), this.#s = null, this.#r = [], this.workerPort.close());
  }
  #a(t) {
    if (this.#t) {
      t.close();
      return;
    }
    let e;
    try {
      e = new AudioWorkletNode(this.context, st, {
        numberOfInputs: 0,
        outputChannelCount: [2]
      });
    } catch (s) {
      this.#g(s);
      return;
    }
    e.onprocessorerror = () => this.#g(new Error("the sound processor failed")), e.port.onmessage = (s) => {
      this.clock.report(s.data), this.#e.report(s.data);
    }, e.connect(this.context.destination), e.port.postMessage({ type: "pcm-port", port: t }, [
      t
    ]);
    for (const s of this.#r) e.port.postMessage(s);
    this.#r = [], this.#s = e;
  }
  #g(t) {
    this.#t || this.#e.error(
      t instanceof Error ? t : new Error(String(t))
    );
  }
  #u = () => {
    this.clock.sample();
  };
  #c = (t) => {
    this.clock.sample(), this.#e.frame(t), this.#n = requestAnimationFrame(this.#c);
  };
}
const at = 40, _ = 2, ot = 0.02, dt = V, g = 0.1, D = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting"
], I = ["seeked", "play", "ratechange"];
function L(h = !1) {
  return U(h);
}
const ut = 'video/mp4; codecs="mp4v.61"';
function gt(h = !1) {
  return F(ut, h);
}
function l(h) {
  return h instanceof Error ? h : new Error(String(h));
}
function p() {
  return performance.timeOrigin + performance.now();
}
class Et extends EventTarget {
  video;
  #e;
  #s;
  #r = null;
  /** Which load messages belong to. Bumped by every load and every stop. */
  #t = 0;
  #o = "idle";
  /** The sink, when the page owns the MediaSource. */
  #n = null;
  #a = null;
  /** The `<source>` child a Managed Media Source needs; see #attachManaged. */
  #g = null;
  /** Whether remote playback was turned off here, and so is ours to turn back. */
  #u = !1;
  #c = null;
  #l = null;
  /** How long the input is, when it turned out to be one that can be seeked. */
  #d = null;
  /**
   * A start hold the worker asked for. It arrives before the first
   * initialization segment, which is what creates the sink.
   */
  #p = 0;
  /** Source video properties indexed by presentation time. */
  #m = [];
  /** What sound the programme last said it was carrying. See `AudioTracks`. */
  #y = null;
  /** When `load()` was called, as epoch milliseconds; every mark counts from it. */
  #E = 0;
  /** When the last mark was, so each one can say what it cost on its own. */
  #S = 0;
  /** Built the first time deinterlacing is turned on, and kept after that. */
  #i = null;
  /** Whether deinterlacing was asked for. */
  #b = !1;
  #v = !1;
  /** What the current load was asked for, so it can be loaded again. */
  #w = "";
  /** Whether the current load decodes the pictures here. */
  #f = !1;
  /**
   * Whether the deinterlacer has been handed a picture. From then on it
   * shows only the pictures handed to it, so a load that passes the video
   * through needs another one.
   */
  #I = !1;
  /**
   * Which run of pictures is wanted: a seek, or the worker throwing away
   * what it holds, starts another, and pictures of an older one are not
   * shown.
   */
  #M = 0;
  /**
   * Where the sink last put the playhead, until the `seeking` that follows:
   * one that finds the playhead there is that move, not the viewer's.
   */
  #L = null;
  #N = null;
  #A = null;
  /** Decode mode: the sound's way out, and the element's media interface. */
  #h = null;
  #k = null;
  #O = null;
  /**
   * The output device's drift the last load's lock learnt (see
   * `DisplayLock`), which the next starts from: the device is the context's,
   * which stays.
   */
  #q = 0;
  /**
   * The context and the clock of what it plays, kept from load to load so
   * that the clock's mapping to wall time is settled before a load's first
   * pictures need it.
   */
  #F = null;
  #x = null;
  /** Which dual-mono service was last chosen, which a new load keeps. */
  #j = !1;
  /**
   * The step the pictures change on -- a field, or a frame of progressive
   * video -- in seconds, from the last picture pushed.
   */
  #_ = null;
  /**
   * Decode mode: where the current epoch starts, and whether each of the two
   * things playback waits for after a start or a seek is there -- the sound
   * buffered in the worklet, and the pictures of the start in the
   * deinterlacer: the one the start falls in and the one after it, with the
   * picture after that, which the deinterlacer filters the second against.
   * The worklet is told to play only once both are, so that the pictures
   * start with the sound rather than behind it.
   */
  #U = 0;
  #P = !1;
  #T = !1;
  /** Playback was asked to start and waits for a refresh it can be placed on (`#placeStart`). */
  #H = !1;
  /** A playback speed asked for while playing that the worklet has not been seen to play at yet. */
  #B = null;
  constructor(t, e = {}) {
    super(), this.video = t, this.#e = e;
    const s = e.mediaSource ?? "auto";
    this.#s = s === "auto" ? L(e.preferManagedMediaSource) ? "worker" : "main" : s, this.video.addEventListener("seeking", this.#ht);
    for (const i of I)
      this.video.addEventListener(i, this.#W);
    for (const i of D)
      this.video.addEventListener(i, this.#nt);
    e.deinterlace && (this.deinterlace = !0);
  }
  get state() {
    return this.#o;
  }
  /**
   * How long the input is, or null while it is a stream that plays as it
   * arrives. The same number reaches the media element as its duration.
   */
  get duration() {
    return this.#d;
  }
  /**
   * What sound the programme is carrying and which of it is being taken, or
   * null before its program map has been read. See `AudioTracks`.
   */
  get audio() {
    return this.#y;
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
  selectAudio(t) {
    this.#r?.postMessage({
      type: "audio",
      id: this.#t,
      pid: t,
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
  selectDualMono(t) {
    this.#j = t, this.#h?.control({ type: "dual-mono", sub: t }), this.#r?.postMessage({
      type: "audio",
      id: this.#t,
      pid: null,
      dualMonoSub: t
    });
  }
  /** Which side of the wire ended up owning the MediaSource. */
  get mediaSourceOwner() {
    return this.#s;
  }
  /**
   * Whether the current load decodes the pictures in the worker and hands
   * them to the deinterlacer. The element then has no video track.
   */
  get softwareDecoding() {
    return this.#f;
  }
  /**
   * The size the picture is shown at, after its sample aspect ratio, or
   * null before the first one. Where the pictures are decoded here this is
   * what `video.videoWidth` and `videoHeight` would say; otherwise it is
   * them.
   */
  get videoSize() {
    if (this.#f) return this.#A;
    const { videoWidth: t, videoHeight: e } = this.video;
    return t > 0 && e > 0 ? { width: t, height: e } : null;
  }
  /**
   * Whether the picture is being deinterlaced, which is not quite the same as
   * having asked for it: a source that says it is progressive is left alone,
   * and starts being filtered again the moment it says otherwise. Assigning
   * turns it on or off where it stands, so the two can be compared on the
   * frame; a browser that cannot run it stays false.
   */
  get deinterlace() {
    const t = this.#i;
    return t?.running ? !this.#f || t.enabled && (t.scan?.interlaced ?? !0) : !1;
  }
  /** Whether deinterlacing was asked for, whatever the source turned out to be. */
  get deinterlaceWanted() {
    return this.#b;
  }
  /**
   * The deinterlacer itself, once there has been one, for the settings that
   * are its own -- the field order, and whether a picture goes up per field
   * or per frame. Null until `deinterlace` has been turned on.
   */
  get deinterlacer() {
    return this.#i;
  }
  set deinterlace(t) {
    this.#b = t, this.#$();
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
  #$() {
    if (!this.#v)
      try {
        !this.#i && this.#e.deinterlacer && (this.#i = this.#e.deinterlacer(this.video)), this.#i && (this.#i.videoTimeline = this.#m, this.#i.enabled = this.#b);
      } catch (t) {
        this.#D("error", { error: l(t) });
      }
  }
  #ut(t, e, s) {
    t <= 0 || e <= 0 || this.#Y({ start: s, codedSize: { width: t, height: e } });
  }
  /** Add source metadata now, but apply it only when its picture is shown. */
  #ct(t) {
    for (const { start: e, interlaced: s, topFieldFirst: i } of t)
      this.#Y({
        start: e,
        scan: { interlaced: s, topFieldFirst: i }
      });
  }
  #Y(t) {
    const e = this.#m.at(-1), s = {
      start: t.start,
      codedSize: t.codedSize ?? e?.codedSize,
      scan: t.scan ?? e?.scan
    };
    if (e?.start === s.start) this.#m.pop();
    else if (e?.codedSize?.width === s.codedSize?.width && e?.codedSize?.height === s.codedSize?.height && e?.scan?.interlaced === s.scan?.interlaced && e?.scan?.topFieldFirst === s.scan?.topFieldFirst)
      return;
    if (this.#m.push(s), this.video.buffered.length > 0) {
      const i = this.video.buffered.start(0);
      let r = 0;
      for (; r + 1 < this.#m.length && this.#m[r + 1].start <= i; )
        r++;
      r > 0 && this.#m.splice(0, r);
    }
    this.#i && (this.#i.videoTimeline = this.#m);
  }
  #z() {
    this.#m = [], this.#i && (this.#i.videoTimeline = []);
  }
  load(t) {
    return this.#v ? Promise.reject(new Error("the player has been destroyed")) : this.#s === "worker" && !L(this.#e.preferManagedMediaSource) ? Promise.reject(
      new Error("this browser cannot construct a MediaSource in a worker")
    ) : (this.stop(), this.#J(String(t), !0));
  }
  /**
   * Start a load. `decodable` is false to pass the video through whatever the
   * deinterlacer takes, which is how a stream decode mode cannot play is
   * loaded again.
   */
  #J(t, e) {
    const s = this.#t;
    this.#w = t, this.#d = null, this.#L = null, this.#p = 0, this.#i?.decodedVideo?.rendererStatus().state === "failed" && (this.#i.destroy(), this.#i = null, this.#I = !1), this.#z(), this.#$();
    const i = this.#i?.decodedVideo ?? null;
    if (this.#f = e && this.#e.softwareDecode !== !1 && i !== null, !this.#f && !this.#e.passthrough) {
      const a = new Error(
        this.#e.softwareDecode === !1 ? "the video cannot be decoded because softwareDecode is false, and passthrough is off" : "the video cannot be decoded because no deinterlacer with a decodedVideo input was given, and passthrough is off"
      ), o = new Promise((d, c) => {
        this.#l = { resolve: d, reject: c };
      });
      return queueMicrotask(() => {
        s === this.#t && this.#R(a);
      }), o;
    }
    !this.#f && this.#I && (this.#i?.destroy(), this.#i = null, this.#I = !1, this.#$()), this.#A = null, this.#E = p(), this.#S = this.#E;
    const r = this.#vt(), n = new Promise((a, o) => {
      this.#l = { resolve: a, reject: o };
    });
    if (this.#C("loading"), r.postMessage({
      type: "load",
      id: s,
      url: t,
      wasmUrl: this.#e.wasmUrl === void 0 ? null : String(this.#e.wasmUrl),
      recoveryInterval: this.#e.recoveryInterval,
      openGopRecovery: this.#e.openGopRecovery,
      splitFieldSamples: this.#e.splitFieldSamples,
      audioGainSteps: this.#e.audioGainSteps ?? 0,
      surroundAudioGainSteps: this.#e.surroundAudioGainSteps ?? this.#e.audioGainSteps ?? 0,
      video: this.#f ? "decode" : "passthrough",
      serviceId: this.#e.serviceId ?? null,
      sink: this.#s,
      preferManagedMediaSource: this.#e.preferManagedMediaSource ?? !1,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10
    }), this.#ot(), this.#f && i) {
      i.onrelease = this.#st, i.onrendererstatus = () => {
        s === this.#t && this.#tt(i);
      };
      try {
        this.#lt(s);
      } catch (o) {
        return queueMicrotask(() => {
          s === this.#t && this.#R(l(o));
        }), n;
      }
      queueMicrotask(() => {
        s === this.#t && this.#tt(i);
      }), this.#K(), this.#Z(0);
      const a = this.#h.workerPort;
      r.postMessage(
        {
          type: "sound-port",
          id: s,
          port: a,
          epoch: this.#M,
          at: 0
        },
        [a]
      ), this.#N = setInterval(this.#W, 40);
    }
    return n;
  }
  /**
   * Decode mode: the AudioWorklet the sound plays through, and the element's
   * media interface answered from here for the length of the load.
   */
  #lt(t) {
    this.#F ??= new AudioContext(), this.#x ??= new et(this.#F);
    const e = new nt(this.#F, this.#x, {
      report: (r) => {
        t === this.#t && this.#Et(r);
      },
      error: (r) => {
        t === this.#t && this.#R(r);
      },
      frame: (r) => {
        t === this.#t && this.#ft(r);
      }
    }), s = new q(
      (r) => e.control({ type: "adjust", ratio: r }),
      this.#q
    ), i = new K(this.video, {
      play: () => this.#V(),
      pause: () => {
        this.#H = !1, e.control({ type: "pause" });
      },
      seek: (r) => this.#pt(r),
      rate: (r) => {
        this.#gt(r), this.#W();
      },
      volume: (r) => e.control({ type: "volume", gain: r }),
      heard: () => e.clock.at(performance.now()),
      resume: () => e.resume()
    });
    e.control({ type: "rate", rate: i.rate }), e.control({ type: "volume", gain: i.gain }), e.control({ type: "dual-mono", sub: this.#j }), i.install(), this.#h = e, this.#k = i, this.#O = s, this.#_ = null;
  }
  /** Hold the media clock to the display, for the refresh at `now`. */
  #ft(t) {
    const e = this.#k;
    this.#O.frame({
      now: t,
      step: this.#_,
      rate: e.rate,
      active: e.playing,
      avDifference: this.#i.decodedVideo.avDifference()
    }), this.#et();
  }
  /**
   * Start the sound's epoch at media time `at`, held: it plays once both its
   * sound and its first picture are in (`#startIfReady`).
   */
  #Z(t) {
    this.#H = !1, this.#U = t, this.#P = !1, this.#T = !1, this.#h.control({ type: "pause" }), this.#h.control({ type: "epoch", epoch: this.#M, at: t });
  }
  /** The viewer moved the playhead, in decode mode: a new epoch from `time`. */
  #pt(t) {
    if (this.#o === "idle" || this.#o === "error") return;
    const e = this.#k;
    e.readyState > u.Metadata && e.setReadyState(u.Metadata), this.#K(), this.#Z(t), this.#r?.postMessage({
      type: "seek",
      id: this.#t,
      time: t,
      epoch: this.#M
    });
  }
  /**
   * Let the sound play, where the epoch has what it waits for -- its sound,
   * its first pictures, and a renderer that can put them up on time -- and
   * playback is wanted.
   */
  #V() {
    const t = this.#k;
    !t || !this.#P || !this.#T || this.#i.decodedVideo.rendererStatus().state !== "prepared" || (t.seeked(), t.setReadyState(u.EnoughData), t.paused || this.#mt());
  }
  /**
   * The renderer is prepared, which a start waits for, or has failed, which
   * ends the load: decoded pictures have nothing else to be shown with.
   */
  #tt(t) {
    const e = t.rendererStatus();
    e.state === "failed" ? this.#R(
      new Error(`the decoded pictures cannot be shown: ${e.reason}`)
    ) : this.#V();
  }
  /**
   * Playback is to start: at the first refresh it can be placed on
   * (`#placeStart`), which every refresh tries until it can.
   */
  #mt() {
    this.#B = null, this.#H = !0, this.#et();
  }
  /**
   * Tell the worklet to play from a context frame a little ahead, heard at a
   * refresh, and the deinterlacer when that frame will be heard, so that the
   * first picture goes up at that refresh with the sound -- as mpv starts
   * video and audio together after a seek -- rather than once the
   * deinterlacer has seen the clock move, by which time the sound is a
   * reading or two ahead and the pictures in between are passed over. That
   * takes the refresh period and the sound clock's mapping to wall time,
   * which a context that has just started running does not have yet: until
   * then the start waits.
   */
  #et() {
    if (!this.#H) return;
    const t = this.#h, e = performance.now() + (t.context.outputLatency ?? 0) * 1e3 + at, s = this.#O.refreshAfter(
      e + _
    ), i = t.clock.frameAt(s - _);
    if (Number.isNaN(i)) return;
    this.#H = !1;
    const r = Math.ceil(i);
    t.control({ type: "play", at: r }), this.#i.decodedVideo.startsAt(
      this.#k.currentTime,
      t.clock.wallOfFrame(r)
    );
  }
  /**
   * A new playback speed. While playing, the deinterlacer counts on at the
   * old one and is told where the new one starts once the worklet reports
   * it: the time stretch takes a new speed at its next frame, up to a frame
   * (20 ms) after the command, which only the worklet knows -- and it reports
   * that before the sound gets to the speaker, which it renders that far
   * ahead.
   */
  #gt(t) {
    this.#h.control({ type: "rate", rate: t }), this.#B = this.#k.playing ? t : null;
  }
  /** What the worklet says it is doing, for the element and the start. */
  #Et(t) {
    const e = this.#k;
    if (!(!e || t.epoch !== this.#M))
      switch (t.state) {
        case "ready":
          if (this.#P) break;
          this.#P = !0, this.#V();
          break;
        case "playing":
          e.setReadyState(u.EnoughData), e.soundStarted(t.media), this.#B !== null && Math.abs(t.speed / this.#B - 1) < ot && (this.#B = null, this.#i.decodedVideo.startsAt(
            t.media,
            this.#h.clock.wallOfFrame(t.frame)
          ));
          break;
        case "starved":
          e.soundStopped(t.media, !1), e.setReadyState(u.CurrentData);
          break;
        case "paused":
          e.soundStopped(t.media, !1);
          break;
        case "ended":
          this.#P || (this.#P = !0, this.#V()), e.soundStopped(t.media, !0);
          break;
      }
  }
  /** Give a picture's buffer back to the worker that made it. */
  #st = (t) => {
    !this.#f || t.byteLength === 0 || this.#r?.postMessage(
      { type: "recycle", id: this.#t, data: t },
      [t]
    );
  };
  /** Forget the pictures held and ask for the ones at the playhead. */
  #K() {
    this.#M++, this.#i?.decodedVideo?.reset(), this.#W();
  }
  /** Ask for the pictures from the playhead to a little past it. */
  #W = () => {
    if (!this.#f) return;
    const t = this.video.currentTime, e = t + 0.3 * Math.max(1, this.video.playbackRate);
    this.#r?.postMessage({
      type: "need",
      id: this.#t,
      epoch: this.#M,
      from: t,
      until: e
    });
  };
  /** Show a picture of the current run, and hand back one of an older run. */
  #St(t, e) {
    const s = this.#i?.decodedVideo;
    if (t !== this.#M || !s) {
      this.#st(e.data);
      return;
    }
    const i = this.#A;
    (i?.width !== e.displayWidth || i?.height !== e.displayHeight) && (this.#A = {
      width: e.displayWidth,
      height: e.displayHeight
    }), this.#I = !0;
    try {
      s.push(e);
    } catch (n) {
      this.#D("error", { error: l(n) });
      return;
    }
    const r = e.interlaced ? e.repeatFirstField ? 3 : 2 : 1;
    if (this.#_ = e.duration / r, !this.#T && // The picture two after the one the start falls in; a millisecond
    // over, for timestamps at the start that are a tick either side.
    e.timestamp > this.#U + e.duration + 1e-3) {
      this.#T = !0;
      const n = this.#k;
      n.readyState < u.CurrentData && n.setReadyState(u.CurrentData), this.#V();
    }
  }
  /** Abandon the current load. The player stays usable. */
  stop() {
    const t = this.#t;
    this.#t++, this.#L = null, this.#r?.postMessage({ type: "stop", id: t }), this.#dt(), this.#Q(new Error("the load was stopped")), this.#C("idle");
  }
  /** Stop, and give up the worker. The player cannot be loaded again. */
  destroy() {
    if (!this.#v) {
      this.stop(), this.#v = !0, this.video.removeEventListener("seeking", this.#ht);
      for (const t of I)
        this.video.removeEventListener(t, this.#W);
      for (const t of D)
        this.video.removeEventListener(t, this.#nt);
      this.#i?.destroy(), this.#i = null, this.#r?.terminate(), this.#F?.close(), this.#F = null, this.#x = null, this.#r = null;
    }
  }
  addEventListener(t, e, s) {
    super.addEventListener(t, e, s);
  }
  removeEventListener(t, e, s) {
    super.removeEventListener(t, e, s);
  }
  #vt() {
    if (!this.#r) {
      const t = new Worker(
        this.#e.workerUrl ?? dt,
        {
          type: "module"
        }
      );
      t.onmessage = this.#kt, t.onerror = (e) => this.#R(new Error(e.message || "the worker failed")), this.#r = t;
    }
    return this.#r;
  }
  #kt = (t) => {
    const e = t.data;
    if (e.id === this.#t)
      switch (e.type) {
        case "handle":
          e.managed && this.#it(), this.video.srcObject = e.handle, this.#G("attached", p());
          break;
        case "open":
          this.#yt(e.mimeCodec, e.data);
          break;
        case "video-config":
          this.#f || this.#ut(
            e.width,
            e.height,
            e.start
          );
          break;
        case "fragment":
          this.#n?.push(
            e.data,
            e.start,
            e.randomAccess
          );
          break;
        case "opened":
          this.#C("converting"), this.#Q(null);
          break;
        case "seekable":
          this.#d = e.duration, this.#n?.setDuration(e.duration), this.#k?.setDuration(e.duration), this.#D("seekable", { duration: e.duration });
          break;
        case "buffered":
          this.#k?.setBuffered(e.range);
          break;
        case "reset":
          this.#z(), this.#n?.reset(), this.#f && this.#K();
          break;
        case "picture":
          this.#St(e.epoch, e.picture);
          break;
        case "pictures-end":
          this.#f && e.epoch === this.#M && (this.#i?.decodedVideo?.finish(), this.#T || (this.#T = !0, this.#V()));
          break;
        case "no-aac-audio":
          this.#Rt();
          break;
        case "scans":
          this.#ct(e.scans);
          break;
        case "services":
          this.#D("services", e.services);
          break;
        case "audio":
          this.#y = e.audio, this.#D("audio", e.audio);
          break;
        case "private_stream_1":
        case "private_stream_2":
          this.#D(e.type, e.stream);
          break;
        case "mark":
          this.#G(e.name, e.at);
          break;
        case "seek":
          this.#rt(e.time);
          break;
        case "hold":
          this.#p = e.seconds, this.#n?.holdStart(e.seconds);
          break;
        case "progress":
          e.totalBytes === null && this.#k?.setDuration(Number.POSITIVE_INFINITY), this.#D("progress", {
            bytesRead: e.bytesRead,
            totalBytes: e.totalBytes
          });
          break;
        case "stats":
          this.#D("stats", e.stats);
          break;
        case "blocked":
          this.#C(e.blocked ? "buffer-full" : "converting");
          break;
        case "finish":
          this.#Nt();
          break;
        case "completed":
          this.#C("completed"), this.#s === "worker" && this.#X();
          break;
        case "error":
          this.#R(new Error(e.message));
          break;
      }
  };
  /** Open a MediaSource here, for browsers that cannot have one in a worker. */
  #yt(t, e) {
    const s = this.#t;
    let i;
    try {
      i = this.#n ?? this.#bt(s), i.holdStart(this.#p);
    } catch (r) {
      this.#R(l(r));
      return;
    }
    i.open(t, e).then(
      // The worker is waiting on flow to know the open succeeded. Going
      // through ready() rather than saying true covers the case where the
      // append filled the queue on its own.
      () => i.ready().then(() => this.#at(s, { type: "flow", id: s, ready: !0 })),
      (r) => {
        s === this.#t && this.#R(l(r));
      }
    );
  }
  #bt(t) {
    const e = new x({
      preferManaged: this.#e.preferManagedMediaSource,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10,
      seek: (s) => this.#rt(s),
      onMark: (s) => this.#G(s, p()),
      onReadyChange: (s) => this.#at(t, { type: "flow", id: t, ready: s }),
      onBlocked: (s) => {
        t === this.#t && this.#C(s ? "buffer-full" : "converting");
      },
      onError: (s) => {
        t === this.#t && this.#R(s);
      }
    });
    return this.#n = e, this.#a = URL.createObjectURL(e.mediaSource), e.managed ? this.#Mt(this.#a) : this.video.src = this.#a, this.#G("attached", p()), this.#d !== null && e.setDuration(this.#d), e;
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
  #Mt(t) {
    this.video.removeAttribute("src"), this.#it();
    const e = document.createElement("source");
    e.type = "video/mp4", e.src = t, this.video.append(e), this.#g = e, this.video.load();
  }
  /**
   * Rule out AirPlay, which a managed source cannot be sent over and which
   * Safari will not open one until the element has given up. The element
   * belongs to whoever made it, so it is put back on the way out -- unless it
   * was already off, and theirs to keep.
   */
  #it() {
    this.video.disableRemotePlayback || (this.video.disableRemotePlayback = !0, this.#u = !0);
  }
  #Nt() {
    const t = this.#t, e = this.#n;
    e && e.finish().then(
      () => {
        t === this.#t && this.#X();
      },
      (s) => {
        t === this.#t && this.#R(l(s));
      }
    );
  }
  /**
   * Put the playhead forward to where the media begins, for the sink. That is
   * no seek of the viewer's: the pictures sent for the request at the old
   * position begin there, so the run they belong to goes on, and the sound
   * held back for them has not been let into the element any earlier.
   */
  #rt(t) {
    if (this.#k) {
      this.#k.place(t);
      return;
    }
    this.video.currentTime >= t || (this.video.currentTime = t, this.#L = this.video.currentTime);
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
  #ht = () => {
    if (this.#k) return;
    const t = this.#L === this.video.currentTime;
    if (this.#L = null, t || this.#o === "idle" || this.#o === "error" || (this.#f && this.#K(), this.#d === null)) return;
    const e = this.video.currentTime;
    this.#At(e) || (this.#C("seeking"), this.#z(), this.#ot(), this.#r?.postMessage({
      type: "seek",
      id: this.#t,
      time: e,
      epoch: null
    }));
  };
  #nt = (t) => {
    this.#o !== "idle" && (this.#G(t.type, p()), t.type === "waiting" && !this.#f && this.#wt());
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
  #wt() {
    if (this.video.seeking) return;
    const t = this.video.currentTime, e = this.video.buffered;
    let s = null;
    for (let i = 0; i < e.length; i++) {
      const r = e.start(i);
      if (t >= r - g && t < e.end(i) - g)
        return;
      r > t + g && (s === null || r < s) && (s = r);
    }
    s !== null && (this.video.currentTime = s);
  }
  /**
   * Report where a step of the load fell on the clock `load()` started.
   *
   * The worker's marks arrive as epoch milliseconds because that is the only
   * reading the two contexts share; what a caller wants is how long it waited,
   * which is measured from here.
   */
  #G(t, e) {
    if (this.#E === 0) return;
    const s = e - this.#E, i = Math.max(0, e - this.#S);
    this.#S = Math.max(this.#S, e), this.#D("timing", { name: t, sinceLoad: s, sincePrevious: i });
  }
  #At(t) {
    const e = this.video.buffered;
    for (let s = 0; s < e.length; s++)
      if (t >= e.start(s) && t < e.end(s))
        return !0;
    return !1;
  }
  /**
   * Tell whoever holds the buffer where playback is, so it can drop what is
   * behind. This cannot ride on `timeupdate`: that event stops firing exactly
   * when playback stalls, which is when eviction matters most.
   */
  #Tt = () => {
    const t = this.video.currentTime;
    this.#s === "main" && !this.#f ? this.#n?.setCurrentTime(t) : this.#r?.postMessage({
      type: "time",
      id: this.#t,
      currentTime: t
    });
  };
  #at(t, e) {
    t === this.#t && this.#r?.postMessage(e);
  }
  #ot() {
    this.#c === null && (this.#c = setInterval(
      this.#Tt,
      200
    ));
  }
  #X() {
    this.#c !== null && (clearInterval(this.#c), this.#c = null);
  }
  /**
   * Load the same input again with the video passed through, for a stream
   * that decode mode cannot play, or fail the load where passthrough is off.
   * The load's promise settles as the new one does.
   */
  #Rt() {
    if (!this.#f) {
      this.#R(
        new Error("the worker refused to decode a load it passes through")
      );
      return;
    }
    if (!this.#e.passthrough) {
      this.#R(
        new Error(
          "the video cannot be decoded because the stream has no AAC sound, which decoding needs, and passthrough is off"
        )
      );
      return;
    }
    const t = this.#l;
    this.#l = null, this.stop(), this.#J(this.#w, !1).then(t?.resolve, (s) => t?.reject(s));
  }
  #dt() {
    this.#X(), this.#N !== null && clearInterval(this.#N), this.#N = null;
    const t = this.#f;
    this.#f = !1, t && this.#i?.decodedVideo?.reset(), this.#z(), this.#n?.close(), this.#n = null, this.#h?.close(), this.#h = null, this.#O && (this.#q = this.#O.drift), this.#O = null, this.#k?.uninstall(), this.#k = null, this.#a && URL.revokeObjectURL(this.#a), this.#a = null, this.#g?.remove(), this.#g = null, this.#u && (this.video.disableRemotePlayback = !1, this.#u = !1), this.video.removeAttribute("src"), this.video.srcObject = null, this.video.load();
  }
  #R(t) {
    this.#dt(), this.#C("error"), this.#Q(t), this.#D("error", { error: t });
  }
  #Q(t) {
    const e = this.#l;
    e && (this.#l = null, t ? e.reject(t) : e.resolve());
  }
  #C(t) {
    this.#o !== t && (this.#o = t, this.#D("statechange", { state: t }));
  }
  #D(t, e) {
    this.dispatchEvent(new CustomEvent(t, { detail: e }));
  }
}
export {
  ft as DEFAULT_KEEP_BEHIND_SECONDS,
  lt as DEFAULT_MAX_AHEAD_SECONDS,
  ct as DEFAULT_QUEUE_HIGH_WATER_MARK,
  Et as Mpeg2TsPlayer,
  mt as requiresManagedMediaSource,
  pt as supportsManagedMediaSource,
  gt as supportsPassthrough,
  L as supportsWorkerMediaSource
};
//# sourceMappingURL=index.js.map
