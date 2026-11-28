const ft = 33554432;
const pt = 8, mt = 10;
const p = globalThis.ManagedMediaSource;
function y(h = !1) {
  const t = typeof MediaSource > "u" ? null : MediaSource;
  return h && p ? p : t ?? p ?? null;
}
function U(h, t = !1) {
  return y(t)?.isTypeSupported(h) ?? !1;
}
function x(h = !1) {
  return y(h)?.canConstructInDedicatedWorker === !0;
}
function gt() {
  return p !== void 0;
}
function Et() {
  return typeof MediaSource > "u" && p !== void 0;
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
class V {
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
  #l = "";
  /** A codec to move the `SourceBuffer` to before the next append. */
  #o = null;
  #n = [];
  #p = 0;
  #u = null;
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
  #c = !0;
  /** The last thing said about there being no room, so it is said once. */
  #a = !1;
  /** Whether everything buffered is waiting to be thrown away; see `reset`. */
  #m = !1;
  /** Which stretch of timeline is being filled. Bumped by every `reset`. */
  #g = 0;
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
    const e = y(t.preferManaged);
    if (!e) throw new Error("this browser has no Media Source Extensions");
    this.#e = e, this.mediaSource = new e(), this.managed = e === p, this.managed && (this.mediaSource.addEventListener(
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
        t !== this.#l && (this.#o = t);
      else {
        const s = this.mediaSource.addSourceBuffer(t);
        s.mode = "segments", s.addEventListener("updateend", this.#A), s.addEventListener("error", this.#O), this.#t = s, this.#l = t;
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
    const t = this.#n.filter((s) => !s.init);
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
    this.#v || (this.#g++, this.#n = [], this.#p = 0, this.#E = [], this.#S = !1, this.#w = !1, this.#d = !1, this.#U(), this.#t && (this.#m = !0), this.#P(!0), this.#_(), this.#N());
  }
  async finish() {
    if (this.#w = !0, this.#v || !this.#t) return;
    const t = this.#g;
    await new Promise((e) => {
      this.#I.push(e), this.#N();
    }), !(this.#v || this.#g !== t) && this.mediaSource.readyState === "open" && this.mediaSource.endOfStream();
  }
  close() {
    this.#v || (this.#v = !0, this.managed && (this.mediaSource.removeEventListener(
      "startstreaming",
      this.#h
    ), this.mediaSource.removeEventListener(
      "endstreaming",
      this.#k
    )), this.#t?.removeEventListener("updateend", this.#A), this.#t?.removeEventListener("error", this.#O), this.#t = null, this.#n = [], this.#p = 0, this.#E = [], this.#f.abandon(), this.#P(!0));
  }
  /** Tell the sink where playback has got to, so it can evict what is behind. */
  setCurrentTime(t) {
    this.#b = t, this.#C(), this.#_(), this.#N();
  }
  #L(t) {
    this.#n.push(t), this.#p += t.data.byteLength, this.#_(), this.#N();
  }
  #N() {
    const t = this.#t;
    if (this.#v || !t || t.updating || this.#u)
      return;
    if (this.#m) {
      this.#u = { type: "clear" };
      try {
        t.remove(0, Number.POSITIVE_INFINITY);
      } catch (s) {
        this.#u = null, this.#m = !1, this.#T(s);
      }
      return;
    }
    if (this.#d) return;
    const e = this.#n[0];
    if (!e) {
      this.#P(!1);
      return;
    }
    if (!(!e.init && this.#M())) {
      if (this.#o !== null) {
        const s = this.#o;
        this.#o = null;
        try {
          t.changeType(s), this.#l = s;
        } catch (i) {
          this.#T(i);
          return;
        }
      }
      this.#u = { type: "append", pending: e, epoch: this.#g };
      try {
        t.appendBuffer(e.data);
      } catch (s) {
        this.#u = null, s instanceof DOMException && s.name === "QuotaExceededError" ? (this.#d = !0, this.#_(), this.#U(), this.#C()) : this.#T(s);
      }
    }
  }
  #A = () => {
    const t = this.#u;
    if (t?.type === "append") {
      if (t.epoch === this.#g && this.#n[0] === t.pending) {
        const e = this.#n.shift();
        this.#p -= e.data.byteLength, e.init || this.#q(e.start);
      }
    } else t?.type === "remove" ? (this.#d = !1, this.#U()) : t?.type === "clear" && (this.#m = !1);
    this.#u = null, this.#F(), this.#C(), this.#_(), this.#N();
  };
  /**
   * The managed source asking for data again, which is the only thing that
   * reopens the door `endstreaming` closed.
   */
  #h = () => {
    this.#c = !0, this.#_(), this.#U();
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
    this.#c = !1, this.#_(), this.#U();
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
  #C() {
    const t = this.#t;
    if (!this.#d || !t || t.updating || this.#u || this.#m || t.buffered.length === 0) return;
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
    const t = !this.#d && this.#c && this.#j() < this.#s.maxAheadSeconds && this.#p < this.#s.queueHighWaterMark && // The fragment limit would stop the input before a start hold fills.
    (this.#i > 0 || this.#n.length < 2);
    this.#f.set(t) && this.#s.onReadyChange?.(t);
  }
  /**
   * Say whether conversion is waiting on the buffer, whichever of the two
   * reasons it is: no room left, or a managed source that wants nothing for
   * now. Both look the same from where the conversion sits.
   */
  #U() {
    const t = this.#d || !this.#c;
    t !== this.#a && (this.#a = t, this.#s.onBlocked?.(t));
  }
  /** Wake `finish`, either because everything is appended or because we gave up. */
  #P(t) {
    if (!t && (!this.#w || this.#n.length > 0 || this.#u))
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
const H = "" + new URL("assets/worker-B7jJbN7o.js", import.meta.url).href, O = 5e-3, S = 5, B = 1 / (4 * S * S), v = 1e-3, k = 2e-3, b = O + k + v, l = 240, W = 30, G = 30, q = 250, j = 2e-6;
class z {
  #e;
  /** Recent refresh times, a ring from `#oldest`, to average the period over. */
  #s = new Float64Array(l);
  #r = 0;
  #t = 0;
  /** The gaps between them, sorted for their median where measured. */
  #l = new Float64Array(l - 1);
  #o = Number.NaN;
  #n = 0;
  #p = 1;
  #u = Number.NEGATIVE_INFINITY;
  /** How much faster than asked the sound plays at adjust 1, as learnt from the lead. */
  #d;
  /** `drift` is what an earlier lock on the same output device learnt. */
  constructor(t, e = 0) {
    this.#e = t, this.#d = e;
  }
  /** How much faster than asked the output device plays, as learnt so far. */
  get drift() {
    return this.#d;
  }
  /** The speed factor last sent. */
  get adjust() {
    return this.#p;
  }
  /** The refresh period, in ms, or NaN until enough refreshes were seen. */
  get period() {
    return this.#o;
  }
  /**
   * The first refresh at or after `wall` on the grid of those seen, as an
   * animation frame's time; NaN while the period is not known.
   */
  refreshAfter(t) {
    const e = this.#o;
    if (Number.isNaN(e)) return Number.NaN;
    const s = this.#a(this.#t - 1);
    return s + Math.max(0, Math.ceil((t - s) / e)) * e;
  }
  /** Take one animation frame. */
  frame(t) {
    const { now: e, rate: s, step: i } = t;
    this.#c(e);
    const r = this.#o;
    if (i === null || Number.isNaN(r)) {
      this.#g(e, 1);
      return;
    }
    if (!t.active) return;
    const n = s * r / (i * 1e3), a = n >= 1 ? Math.round(n) : 1 / Math.round(1 / n), o = Math.abs(n / a - 1) <= O ? a * i * 1e3 / (r * s) : 1, d = t.avDifference;
    let c = 0;
    Number.isFinite(d) && (c = Math.min(
      k,
      Math.max(-k, d / S)
    ), this.#d = Math.min(
      v,
      Math.max(-v, this.#d + B * d * r / 1e3)
    ));
    const F = Math.min(
      1 + b,
      Math.max(1 - b, o * (1 - c - this.#d))
    );
    this.#g(e, F);
  }
  /** Add a refresh time, and measure the period where it is due. */
  #c(t) {
    this.#t < l ? (this.#s[(this.#r + this.#t) % l] = t, this.#t++) : (this.#s[this.#r] = t, this.#r = (this.#r + 1) % l), this.#n++, this.#t >= W && (Number.isNaN(this.#o) || this.#n >= G) && this.#m();
  }
  /** The `index`th refresh time held, oldest first. */
  #a(t) {
    return this.#s[(this.#r + t) % l];
  }
  /**
   * The span of the refreshes held over the refreshes it took. Refreshes the
   * page missed leave gaps of whole periods, counted as the periods they
   * were against the median gap.
   */
  #m() {
    const t = this.#t - 1, e = t === this.#l.length ? this.#l : this.#l.subarray(0, t);
    for (let r = 0; r < t; r++)
      e[r] = this.#a(r + 1) - this.#a(r);
    e.sort();
    const s = e[t >> 1];
    let i = 0;
    for (let r = 0; r < t; r++)
      i += Math.max(1, Math.round(e[r] / s));
    this.#o = (this.#a(t) - this.#a(0)) / i, this.#n = 0;
  }
  #g(t, e) {
    Math.abs(e - this.#p) < j || e !== 1 && t - this.#u < q || (this.#p = e, this.#u = t, this.#e(e));
  }
}
var u = /* @__PURE__ */ ((h) => (h[h.Nothing = 0] = "Nothing", h[h.Metadata = 1] = "Metadata", h[h.CurrentData = 2] = "CurrentData", h[h.FutureData = 3] = "FutureData", h[h.EnoughData = 4] = "EnoughData", h))(u || {});
const K = 250, M = 0.25, N = 4;
class g {
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
const $ = [
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
class X {
  #e;
  #s;
  #r = !1;
  #t = !0;
  #l = !1;
  #o = !1;
  #n = 0;
  #p = !1;
  #u = !1;
  /** A readyState asked for before the duration was known; see `setReadyState`. */
  #d = null;
  /** The position while the sound is not running. */
  #c = 0;
  /** Whether the sound is playing, so that the position is the one heard. */
  #a = !1;
  #m = Number.NaN;
  #g = null;
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
    return this.#a && !this.#t;
  }
  get readyState() {
    return this.#n;
  }
  /** The position the element reports. */
  get currentTime() {
    if (this.#a) {
      const t = this.#s.heard();
      if (!Number.isNaN(t)) return t;
    }
    return this.#c;
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
    }), e("duration", { get: () => this.#m }), e("buffered", { get: () => new g(this.#g) }), e("seekable", { get: () => new g(this.#L()) }), e("played", {
      get: () => new g(
        this.#y === null ? null : { start: this.#y, end: this.currentTime }
      )
    }), e("readyState", { get: () => this.#n }), e("seeking", { get: () => this.#l }), e("ended", { get: () => this.#o }), e("error", { get: () => null });
  }
  /** Give the element its own media interface back, with the volume and speed it has now. */
  uninstall() {
    if (!this.#r) return;
    this.#r = !1, this.#A();
    const t = this.#e;
    for (const e of $) delete t[e];
    this.#e.playbackRate = this.#E, this.#e.volume = this.#S, this.#e.muted = this.#i;
  }
  /** How long the media is; Infinity for a live input, NaN before it is known. */
  setDuration(t) {
    if (Object.is(t, this.#m)) return;
    this.#m = t, this.#h("durationchange");
    const e = this.#d;
    this.#d = null, e !== null && this.setReadyState(e);
  }
  setBuffered(t) {
    this.#g = t, this.#h("progress");
  }
  /**
   * Move readyState, with the events a media element fires on the way up,
   * and `waiting` on the way down while playback is wanted. `loadedmetadata`
   * and `loadeddata` come once a load, as the element's do; the others again
   * after every fall, as after a seek.
   */
  setReadyState(t) {
    if (t >= 1 && Number.isNaN(this.#m)) {
      this.#d = t;
      return;
    }
    this.#d = null;
    const e = this.#n;
    if (t !== e) {
      if (this.#n = t, t < e) {
        t < 3 && e >= 3 && !this.#t && this.#h("waiting");
        return;
      }
      !this.#p && t >= 1 && (this.#p = !0, this.#h("loadedmetadata")), !this.#u && t >= 2 && (this.#u = !0, this.#h("loadeddata")), e < 3 && t >= 3 && this.#h("canplay"), e < 4 && t >= 4 && this.#h("canplaythrough");
    }
  }
  /** A seek's media is in place: `seeked`. */
  seeked() {
    this.#l && (this.#l = !1, this.#h("timeupdate"), this.#h("seeked"));
  }
  /** The sound started playing at media time `media`. */
  soundStarted(t) {
    this.#a || (this.#c = t, this.#a = !0, this.#y ??= t, !this.#t && (this.#h("playing"), this.#N()));
  }
  /**
   * The sound stopped at media time `media`: run out (`waiting` follows from
   * the readyState the caller sets), paused, or at the end of the media.
   */
  soundStopped(t, e) {
    this.#c = t, this.#a = !1, this.#A(), e && (this.#o = !0, this.#h("timeupdate"), this.#t || (this.#t = !0, this.#h("pause")), this.#h("ended"));
  }
  /** Where the media begins, for a load whose first media is later than zero. */
  place(t) {
    this.#a || t <= this.#c || (this.#c = t, this.#h("timeupdate"));
  }
  #v(t) {
    if (!Number.isFinite(t))
      throw new TypeError(`currentTime cannot be ${t}`);
    let e = Math.max(0, t);
    Number.isFinite(this.#m) && (e = Math.min(e, this.#m)), this.#a = !1, this.#A(), this.#o = !1, this.#l = !0, this.#c = e, this.#h("seeking"), this.#h("timeupdate"), this.#s.seek(e);
  }
  async #w() {
    if (this.#o && this.#v(0), this.#t && (this.#t = !1, this.#h("play"), this.#n < 3 && this.#h("waiting")), !await this.#s.resume())
      throw this.#t || (this.#t = !0, this.#h("pause")), new DOMException(
        "the browser does not let sound start without the viewer's gesture",
        "NotAllowedError"
      );
    this.#t || (this.#s.play(), this.#a && (this.#h("playing"), this.#N()));
  }
  #f() {
    this.#t || (this.#c = this.currentTime, this.#a = !1, this.#t = !0, this.#A(), this.#s.pause(), this.#h("timeupdate"), this.#h("pause"));
  }
  #I(t) {
    if (!(t >= M && t <= N))
      throw new DOMException(
        `playbackRate ${t} is outside ${M} to ${N}`,
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
    return Number.isFinite(this.#m) ? { start: 0, end: this.#m } : this.#g;
  }
  #N() {
    this.#b === null && (this.#b = setInterval(
      () => this.#h("timeupdate"),
      K
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
const Q = "" + new URL("assets/processor-9SraeEvc.js", import.meta.url).href, Y = 33, w = 4, A = 0.05, T = 2e-6, R = 5e-4, J = 4, Z = 20, tt = 60, et = 200, st = 32;
class it {
  #e;
  #s;
  // The block being collected: when it started and its lowest reading.
  #r = 0;
  #t = 1 / 0;
  #l = 0;
  #o = 0;
  // The mapping: context seconds at wall ms w is #offset + #slope × (w − #at) / 1000.
  #n = !1;
  #p = 0;
  #u = 0;
  #d = 1;
  // Covariance of (offset in ms, slope).
  #c = 0;
  #a = 0;
  #m = 0;
  #g = 0;
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
      e.length > st && e.shift();
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
    if (this.#g = e.outputLatency ?? 0, s !== this.#E)
      this.#E = s, this.#S = t;
    else if (t - this.#S > Z) return;
    this.#n || (this.#n = !0, this.#p = t, this.#u = s, this.#d = 1, this.#c = 400, this.#a = 0, this.#m = R * R, this.#r = t, this.#t = 1 / 0);
    const i = (s - this.#v(t)) * 1e3;
    if (i < -30 || i > tt) {
      Number.isNaN(this.#y) && (this.#y = t), t - this.#y >= et && (this.#w(), this.sample(t));
      return;
    }
    this.#y = Number.NaN, t - this.#r >= Y && this.#t !== 1 / 0 && (this.#f(this.#l, this.#o), this.#r = t, this.#t = 1 / 0), i < this.#t && (this.#t = i, this.#l = t, this.#o = s);
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
    if (!this.#n) return Number.NaN;
    const e = t / this.#s;
    return this.#p + (e - this.#u) * 1e3 / this.#d + this.#g * 1e3;
  }
  /** The context frame being heard at wall time `wall`; NaN until known. */
  frameAt(t) {
    return this.#n ? this.#v(t - this.#g * 1e3) * this.#s : Number.NaN;
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
    return this.#u + this.#d * (t - this.#p) / 1e3;
  }
  #w() {
    this.#n = !1, this.#y = Number.NaN;
  }
  /** A Kalman step with the block minimum (`wall` ms, `time` s). */
  #f(t, e) {
    const s = t - this.#p, i = Math.abs(s) / 1e3;
    this.#u += this.#d * s / 1e3, this.#p = t;
    const r = this.#c + 2 * s * this.#a + s * s * this.#m, n = this.#a + s * this.#m;
    this.#c = r + A * A * i, this.#a = n, this.#m += T * T * i;
    const a = (e - this.#u) * 1e3, o = this.#c + w * w;
    if (Math.abs(a) > J * Math.sqrt(o)) return;
    const d = this.#c / o, c = this.#a / o;
    this.#u += d * a / 1e3, this.#d += c * a, this.#m -= c * this.#a, this.#a -= d * this.#a, this.#c -= d * this.#c;
  }
}
const rt = "mpeg2toh264-sound", ht = Q, nt = 50, _ = /* @__PURE__ */ new WeakMap();
function at(h) {
  let t = _.get(h);
  return t || (t = h.audioWorklet.addModule(ht), _.set(h, t)), t;
}
class ot {
  context;
  clock;
  /** The end of the PCM channel that belongs to the decode worker. */
  workerPort;
  #e;
  #s = null;
  /** Commands given before the processor existed, in order. */
  #r = [];
  #t = !1;
  #l;
  #o = 0;
  constructor(t, e, s) {
    this.#e = s, this.context = t, this.clock = e;
    const { port1: i, port2: r } = new MessageChannel();
    this.workerPort = r, this.#l = setInterval(this.#u, nt), this.#o = requestAnimationFrame(this.#d), at(t).then(
      () => this.#n(i),
      (n) => this.#p(n)
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
    this.#t || (this.#t = !0, clearInterval(this.#l), cancelAnimationFrame(this.#o), this.#s?.port.close(), this.#s?.disconnect(), this.#s = null, this.#r = [], this.workerPort.close());
  }
  #n(t) {
    if (this.#t) {
      t.close();
      return;
    }
    let e;
    try {
      e = new AudioWorkletNode(this.context, rt, {
        numberOfInputs: 0,
        outputChannelCount: [2]
      });
    } catch (s) {
      this.#p(s);
      return;
    }
    e.onprocessorerror = () => this.#p(new Error("the sound processor failed")), e.port.onmessage = (s) => {
      this.clock.report(s.data), this.#e.report(s.data);
    }, e.connect(this.context.destination), e.port.postMessage({ type: "pcm-port", port: t }, [
      t
    ]);
    for (const s of this.#r) e.port.postMessage(s);
    this.#r = [], this.#s = e;
  }
  #p(t) {
    this.#t || this.#e.error(
      t instanceof Error ? t : new Error(String(t))
    );
  }
  #u = () => {
    this.clock.sample();
  };
  #d = (t) => {
    this.clock.sample(), this.#e.frame(t), this.#o = requestAnimationFrame(this.#d);
  };
}
const dt = 40, D = 2, ut = 0.02, ct = H, E = 0.1, I = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting"
], L = ["seeked", "play", "ratechange"];
function P(h = !1) {
  return x(h);
}
const lt = 'video/mp4; codecs="mp4v.61"';
function St(h = !1) {
  return U(lt, h);
}
function f(h) {
  return h instanceof Error ? h : new Error(String(h));
}
function m() {
  return performance.timeOrigin + performance.now();
}
class vt extends EventTarget {
  video;
  #e;
  #s;
  #r = null;
  /** Which load messages belong to. Bumped by every load and every stop. */
  #t = 0;
  #l = "idle";
  /** The sink, when the page owns the MediaSource. */
  #o = null;
  #n = null;
  /** The `<source>` child a Managed Media Source needs; see #attachManaged. */
  #p = null;
  /** Whether remote playback was turned off here, and so is ours to turn back. */
  #u = !1;
  #d = null;
  #c = null;
  /** How long the input is, when it turned out to be one that can be seeked. */
  #a = null;
  /**
   * A start hold the worker asked for. It arrives before the first
   * initialization segment, which is what creates the sink.
   */
  #m = 0;
  /** Source video properties indexed by presentation time. */
  #g = [];
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
  #C = null;
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
  #V = !1;
  /** The page was hidden or shown: see `#placeStart`. */
  #J = () => this.#X();
  /** A playback speed asked for while playing that the worklet has not been seen to play at yet. */
  #B = null;
  constructor(t, e = {}) {
    super(), this.video = t, this.#e = e;
    const s = e.mediaSource ?? "auto";
    this.#s = s === "auto" ? P(e.preferManagedMediaSource) ? "worker" : "main" : s, this.video.addEventListener("seeking", this.#nt);
    for (const i of L)
      this.video.addEventListener(i, this.#W);
    for (const i of I)
      this.video.addEventListener(i, this.#at);
    e.deinterlace && (this.deinterlace = !0);
  }
  get state() {
    return this.#l;
  }
  /**
   * How long the input is, or null while it is a stream that plays as it
   * arrives. The same number reaches the media element as its duration.
   */
  get duration() {
    return this.#a;
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
        !this.#i && this.#e.deinterlacer && (this.#i = this.#e.deinterlacer(this.video)), this.#i && (this.#i.videoTimeline = this.#g, this.#i.enabled = this.#b);
      } catch (t) {
        this.#D("error", { error: f(t) });
      }
  }
  #ct(t, e, s) {
    t <= 0 || e <= 0 || this.#Z({ start: s, codedSize: { width: t, height: e } });
  }
  /** Add source metadata now, but apply it only when its picture is shown. */
  #lt(t) {
    for (const { start: e, interlaced: s, topFieldFirst: i } of t)
      this.#Z({
        start: e,
        scan: { interlaced: s, topFieldFirst: i }
      });
  }
  #Z(t) {
    const e = this.#g.at(-1), s = {
      start: t.start,
      codedSize: t.codedSize ?? e?.codedSize,
      scan: t.scan ?? e?.scan
    };
    if (e?.start === s.start) this.#g.pop();
    else if (e?.codedSize?.width === s.codedSize?.width && e?.codedSize?.height === s.codedSize?.height && e?.scan?.interlaced === s.scan?.interlaced && e?.scan?.topFieldFirst === s.scan?.topFieldFirst)
      return;
    if (this.#g.push(s), this.video.buffered.length > 0) {
      const i = this.video.buffered.start(0);
      let r = 0;
      for (; r + 1 < this.#g.length && this.#g[r + 1].start <= i; )
        r++;
      r > 0 && this.#g.splice(0, r);
    }
    this.#i && (this.#i.videoTimeline = this.#g);
  }
  #z() {
    this.#g = [], this.#i && (this.#i.videoTimeline = []);
  }
  load(t) {
    return this.#v ? Promise.reject(new Error("the player has been destroyed")) : this.#s === "worker" && !P(this.#e.preferManagedMediaSource) ? Promise.reject(
      new Error("this browser cannot construct a MediaSource in a worker")
    ) : (this.stop(), this.#tt(String(t), !0));
  }
  /**
   * Start a load. `decodable` is false to pass the video through whatever the
   * deinterlacer takes, which is how a stream decode mode cannot play is
   * loaded again.
   */
  #tt(t, e) {
    const s = this.#t;
    this.#w = t, this.#a = null, this.#L = null, this.#m = 0, this.#i?.decodedVideo?.rendererStatus().state === "failed" && (this.#i.destroy(), this.#i = null, this.#I = !1), this.#z(), this.#$();
    const i = this.#i?.decodedVideo ?? null;
    if (this.#f = e && this.#e.softwareDecode !== !1 && i !== null, !this.#f && !this.#e.passthrough) {
      const a = new Error(
        this.#e.softwareDecode === !1 ? "the video cannot be decoded because softwareDecode is false, and passthrough is off" : "the video cannot be decoded because no deinterlacer with a decodedVideo input was given, and passthrough is off"
      ), o = new Promise((d, c) => {
        this.#c = { resolve: d, reject: c };
      });
      return queueMicrotask(() => {
        s === this.#t && this.#R(a);
      }), o;
    }
    !this.#f && this.#I && (this.#i?.destroy(), this.#i = null, this.#I = !1, this.#$()), this.#A = null, this.#E = m(), this.#S = this.#E;
    const r = this.#kt(), n = new Promise((a, o) => {
      this.#c = { resolve: a, reject: o };
    });
    if (this.#x("loading"), r.postMessage({
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
    }), this.#dt(), this.#f && i) {
      i.onrelease = this.#it, i.onrendererstatus = () => {
        s === this.#t && this.#st(i);
      };
      try {
        this.#ft(s);
      } catch (o) {
        return queueMicrotask(() => {
          s === this.#t && this.#R(f(o));
        }), n;
      }
      queueMicrotask(() => {
        s === this.#t && this.#st(i);
      }), this.#K(), this.#et(0);
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
  #ft(t) {
    this.#F ??= new AudioContext(), this.#C ??= new it(this.#F);
    const e = new ot(this.#F, this.#C, {
      report: (r) => {
        t === this.#t && this.#St(r);
      },
      error: (r) => {
        t === this.#t && this.#R(r);
      },
      frame: (r) => {
        t === this.#t && this.#pt(r);
      }
    }), s = new z(
      (r) => e.control({ type: "adjust", ratio: r }),
      this.#q
    ), i = new X(this.video, {
      play: () => this.#H(),
      pause: () => {
        this.#V = !1, e.control({ type: "pause" });
      },
      seek: (r) => this.#mt(r),
      rate: (r) => {
        this.#Et(r), this.#W();
      },
      volume: (r) => e.control({ type: "volume", gain: r }),
      heard: () => e.clock.at(performance.now()),
      resume: () => e.resume()
    });
    e.control({ type: "rate", rate: i.rate }), e.control({ type: "volume", gain: i.gain }), e.control({ type: "dual-mono", sub: this.#j }), i.install(), document.addEventListener("visibilitychange", this.#J), this.#h = e, this.#k = i, this.#O = s, this.#_ = null;
  }
  /** Hold the media clock to the display, for the refresh at `now`. */
  #pt(t) {
    const e = this.#k;
    this.#O.frame({
      now: t,
      step: this.#_,
      rate: e.rate,
      active: e.playing,
      avDifference: this.#i.decodedVideo.avDifference()
    }), this.#X();
  }
  /**
   * Start the sound's epoch at media time `at`, held: it plays once both its
   * sound and its first picture are in (`#startIfReady`).
   */
  #et(t) {
    this.#V = !1, this.#U = t, this.#P = !1, this.#T = !1, this.#h.control({ type: "pause" }), this.#h.control({ type: "epoch", epoch: this.#M, at: t });
  }
  /** The viewer moved the playhead, in decode mode: a new epoch from `time`. */
  #mt(t) {
    if (this.#l === "idle" || this.#l === "error") return;
    const e = this.#k;
    e.readyState > u.Metadata && e.setReadyState(u.Metadata), this.#K(), this.#et(t), this.#r?.postMessage({
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
  #H() {
    const t = this.#k;
    !t || !this.#P || !this.#T || this.#i.decodedVideo.rendererStatus().state !== "prepared" || (t.seeked(), t.setReadyState(u.EnoughData), t.paused || this.#gt());
  }
  /**
   * The renderer is prepared, which a start waits for, or has failed, which
   * ends the load: decoded pictures have nothing else to be shown with.
   */
  #st(t) {
    const e = t.rendererStatus();
    e.state === "failed" ? this.#R(
      new Error(`the decoded pictures cannot be shown: ${e.reason}`)
    ) : this.#H();
  }
  /**
   * Playback is to start: at the first refresh it can be placed on
   * (`#placeStart`), which every refresh tries until it can.
   */
  #gt() {
    this.#B = null, this.#V = !0, this.#X();
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
   *
   * A hidden page has no refreshes to place it on, and puts up no pictures
   * to start with: the sound starts at once, and the pictures follow its
   * clock once the page is shown. A start waiting for a refresh when the
   * page is hidden goes then (`#onVisibility`).
   */
  #X() {
    if (!this.#V) return;
    const t = this.#h;
    if (document.visibilityState === "hidden") {
      this.#V = !1, t.control({ type: "play", at: 0 });
      return;
    }
    const e = performance.now() + (t.context.outputLatency ?? 0) * 1e3 + dt, s = this.#O.refreshAfter(
      e + D
    ), i = t.clock.frameAt(s - D);
    if (Number.isNaN(i)) return;
    this.#V = !1;
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
  #Et(t) {
    this.#h.control({ type: "rate", rate: t }), this.#B = this.#k.playing ? t : null;
  }
  /** What the worklet says it is doing, for the element and the start. */
  #St(t) {
    const e = this.#k;
    if (!(!e || t.epoch !== this.#M))
      switch (t.state) {
        case "ready":
          if (this.#P) break;
          this.#P = !0, this.#H();
          break;
        case "playing":
          e.setReadyState(u.EnoughData), e.soundStarted(t.media), this.#B !== null && Math.abs(t.speed / this.#B - 1) < ut && (this.#B = null, this.#i.decodedVideo.startsAt(
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
          this.#P || (this.#P = !0, this.#H()), e.soundStopped(t.media, !0);
          break;
      }
  }
  /** Give a picture's buffer back to the worker that made it. */
  #it = (t) => {
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
  #vt(t, e) {
    const s = this.#i?.decodedVideo;
    if (t !== this.#M || !s) {
      this.#it(e.data);
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
      this.#D("error", { error: f(n) });
      return;
    }
    const r = e.interlaced ? e.repeatFirstField ? 3 : 2 : 1;
    if (this.#_ = e.duration / r, !this.#T && // The picture two after the one the start falls in; a millisecond
    // over, for timestamps at the start that are a tick either side.
    e.timestamp > this.#U + e.duration + 1e-3) {
      this.#T = !0;
      const n = this.#k;
      n.readyState < u.CurrentData && n.setReadyState(u.CurrentData), this.#H();
    }
  }
  /** Abandon the current load. The player stays usable. */
  stop() {
    const t = this.#t;
    this.#t++, this.#L = null, this.#r?.postMessage({ type: "stop", id: t }), this.#ut(), this.#Y(new Error("the load was stopped")), this.#x("idle");
  }
  /** Stop, and give up the worker. The player cannot be loaded again. */
  destroy() {
    if (!this.#v) {
      this.stop(), this.#v = !0, this.video.removeEventListener("seeking", this.#nt);
      for (const t of L)
        this.video.removeEventListener(t, this.#W);
      for (const t of I)
        this.video.removeEventListener(t, this.#at);
      this.#i?.destroy(), this.#i = null, this.#r?.terminate(), this.#F?.close(), this.#F = null, this.#C = null, this.#r = null;
    }
  }
  addEventListener(t, e, s) {
    super.addEventListener(t, e, s);
  }
  removeEventListener(t, e, s) {
    super.removeEventListener(t, e, s);
  }
  #kt() {
    if (!this.#r) {
      const t = new Worker(
        this.#e.workerUrl ?? ct,
        {
          type: "module"
        }
      );
      t.onmessage = this.#yt, t.onerror = (e) => this.#R(new Error(e.message || "the worker failed")), this.#r = t;
    }
    return this.#r;
  }
  #yt = (t) => {
    const e = t.data;
    if (e.id === this.#t)
      switch (e.type) {
        case "handle":
          e.managed && this.#rt(), this.video.srcObject = e.handle, this.#G("attached", m());
          break;
        case "open":
          this.#bt(e.mimeCodec, e.data);
          break;
        case "video-config":
          this.#f || this.#ct(
            e.width,
            e.height,
            e.start
          );
          break;
        case "fragment":
          this.#o?.push(
            e.data,
            e.start,
            e.randomAccess
          );
          break;
        case "opened":
          this.#x("converting"), this.#Y(null);
          break;
        case "seekable":
          this.#a = e.duration, this.#o?.setDuration(e.duration), this.#k?.setDuration(e.duration), this.#D("seekable", { duration: e.duration });
          break;
        case "buffered":
          this.#k?.setBuffered(e.range);
          break;
        case "reset":
          this.#z(), this.#o?.reset(), this.#f && this.#K();
          break;
        case "picture":
          this.#vt(e.epoch, e.picture);
          break;
        case "pictures-end":
          this.#f && e.epoch === this.#M && (this.#i?.decodedVideo?.finish(), this.#T || (this.#T = !0, this.#H()));
          break;
        case "no-aac-audio":
          this.#_t();
          break;
        case "scans":
          this.#lt(e.scans);
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
          this.#ht(e.time);
          break;
        case "hold":
          this.#m = e.seconds, this.#o?.holdStart(e.seconds);
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
          this.#x(e.blocked ? "buffer-full" : "converting");
          break;
        case "finish":
          this.#wt();
          break;
        case "completed":
          this.#x("completed"), this.#s === "worker" && this.#Q();
          break;
        case "error":
          this.#R(new Error(e.message));
          break;
      }
  };
  /** Open a MediaSource here, for browsers that cannot have one in a worker. */
  #bt(t, e) {
    const s = this.#t;
    let i;
    try {
      i = this.#o ?? this.#Mt(s), i.holdStart(this.#m);
    } catch (r) {
      this.#R(f(r));
      return;
    }
    i.open(t, e).then(
      // The worker is waiting on flow to know the open succeeded. Going
      // through ready() rather than saying true covers the case where the
      // append filled the queue on its own.
      () => i.ready().then(() => this.#ot(s, { type: "flow", id: s, ready: !0 })),
      (r) => {
        s === this.#t && this.#R(f(r));
      }
    );
  }
  #Mt(t) {
    const e = new V({
      preferManaged: this.#e.preferManagedMediaSource,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10,
      seek: (s) => this.#ht(s),
      onMark: (s) => this.#G(s, m()),
      onReadyChange: (s) => this.#ot(t, { type: "flow", id: t, ready: s }),
      onBlocked: (s) => {
        t === this.#t && this.#x(s ? "buffer-full" : "converting");
      },
      onError: (s) => {
        t === this.#t && this.#R(s);
      }
    });
    return this.#o = e, this.#n = URL.createObjectURL(e.mediaSource), e.managed ? this.#Nt(this.#n) : this.video.src = this.#n, this.#G("attached", m()), this.#a !== null && e.setDuration(this.#a), e;
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
  #Nt(t) {
    this.video.removeAttribute("src"), this.#rt();
    const e = document.createElement("source");
    e.type = "video/mp4", e.src = t, this.video.append(e), this.#p = e, this.video.load();
  }
  /**
   * Rule out AirPlay, which a managed source cannot be sent over and which
   * Safari will not open one until the element has given up. The element
   * belongs to whoever made it, so it is put back on the way out -- unless it
   * was already off, and theirs to keep.
   */
  #rt() {
    this.video.disableRemotePlayback || (this.video.disableRemotePlayback = !0, this.#u = !0);
  }
  #wt() {
    const t = this.#t, e = this.#o;
    e && e.finish().then(
      () => {
        t === this.#t && this.#Q();
      },
      (s) => {
        t === this.#t && this.#R(f(s));
      }
    );
  }
  /**
   * Put the playhead forward to where the media begins, for the sink. That is
   * no seek of the viewer's: the pictures sent for the request at the old
   * position begin there, so the run they belong to goes on, and the sound
   * held back for them has not been let into the element any earlier.
   */
  #ht(t) {
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
  #nt = () => {
    if (this.#k) return;
    const t = this.#L === this.video.currentTime;
    if (this.#L = null, t || this.#l === "idle" || this.#l === "error" || (this.#f && this.#K(), this.#a === null)) return;
    const e = this.video.currentTime;
    this.#Tt(e) || (this.#x("seeking"), this.#z(), this.#dt(), this.#r?.postMessage({
      type: "seek",
      id: this.#t,
      time: e,
      epoch: null
    }));
  };
  #at = (t) => {
    this.#l !== "idle" && (this.#G(t.type, m()), t.type === "waiting" && !this.#f && this.#At());
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
  #At() {
    if (this.video.seeking) return;
    const t = this.video.currentTime, e = this.video.buffered;
    let s = null;
    for (let i = 0; i < e.length; i++) {
      const r = e.start(i);
      if (t >= r - E && t < e.end(i) - E)
        return;
      r > t + E && (s === null || r < s) && (s = r);
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
  #Tt(t) {
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
  #Rt = () => {
    const t = this.video.currentTime;
    this.#s === "main" && !this.#f ? this.#o?.setCurrentTime(t) : this.#r?.postMessage({
      type: "time",
      id: this.#t,
      currentTime: t
    });
  };
  #ot(t, e) {
    t === this.#t && this.#r?.postMessage(e);
  }
  #dt() {
    this.#d === null && (this.#d = setInterval(
      this.#Rt,
      200
    ));
  }
  #Q() {
    this.#d !== null && (clearInterval(this.#d), this.#d = null);
  }
  /**
   * Load the same input again with the video passed through, for a stream
   * that decode mode cannot play, or fail the load where passthrough is off.
   * The load's promise settles as the new one does.
   */
  #_t() {
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
    const t = this.#c;
    this.#c = null, this.stop(), this.#tt(this.#w, !1).then(t?.resolve, (s) => t?.reject(s));
  }
  #ut() {
    this.#Q(), this.#N !== null && clearInterval(this.#N), this.#N = null;
    const t = this.#f;
    this.#f = !1, t && this.#i?.decodedVideo?.reset(), this.#z(), this.#o?.close(), this.#o = null, this.#h?.close(), this.#h = null, this.#O && (this.#q = this.#O.drift), this.#O = null, this.#k?.uninstall(), document.removeEventListener("visibilitychange", this.#J), this.#k = null, this.#n && URL.revokeObjectURL(this.#n), this.#n = null, this.#p?.remove(), this.#p = null, this.#u && (this.video.disableRemotePlayback = !1, this.#u = !1), this.video.removeAttribute("src"), this.video.srcObject = null, this.video.load();
  }
  #R(t) {
    this.#ut(), this.#x("error"), this.#Y(t), this.#D("error", { error: t });
  }
  #Y(t) {
    const e = this.#c;
    e && (this.#c = null, t ? e.reject(t) : e.resolve());
  }
  #x(t) {
    this.#l !== t && (this.#l = t, this.#D("statechange", { state: t }));
  }
  #D(t, e) {
    this.dispatchEvent(new CustomEvent(t, { detail: e }));
  }
}
export {
  mt as DEFAULT_KEEP_BEHIND_SECONDS,
  pt as DEFAULT_MAX_AHEAD_SECONDS,
  ft as DEFAULT_QUEUE_HIGH_WATER_MARK,
  vt as Mpeg2TsPlayer,
  Et as requiresManagedMediaSource,
  gt as supportsManagedMediaSource,
  St as supportsPassthrough,
  P as supportsWorkerMediaSource
};
//# sourceMappingURL=index.js.map
