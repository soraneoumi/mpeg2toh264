const ct = 33554432;
const lt = 8, ft = 10;
const f = globalThis.ManagedMediaSource;
function S(h = !1) {
  const t = typeof MediaSource > "u" ? null : MediaSource;
  return h && f ? f : t ?? f ?? null;
}
function O(h, t = !1) {
  return S(t)?.isTypeSupported(h) ?? !1;
}
function F(h = !1) {
  return S(h)?.canConstructInDedicatedWorker === !0;
}
function pt() {
  return f !== void 0;
}
function mt() {
  return typeof MediaSource > "u" && f !== void 0;
}
class U {
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
class C {
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
  #f = "";
  /** A codec to move the `SourceBuffer` to before the next append. */
  #d = null;
  #n = [];
  #g = 0;
  #u = null;
  #a = !1;
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
  #o = !1;
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
  #l = new U();
  #O = [];
  constructor(t) {
    this.#s = t;
    const e = S(t.preferManaged);
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
    return this.#l.wait();
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
        t !== this.#f && (this.#d = t);
      else {
        const s = this.mediaSource.addSourceBuffer(t);
        s.mode = "segments", s.addEventListener("updateend", this.#A), s.addEventListener("error", this.#U), this.#t = s, this.#f = t;
      }
      this.#I({ data: e, init: !0 }), this.#x();
    }
  }
  push(t, e, s) {
    this.#v || (s && this.#E.push(e), this.#I({ data: t, init: !1, start: e }));
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
    this.#y = t, this.#x();
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
    this.#v || (this.#m++, this.#n = [], this.#g = 0, this.#E = [], this.#S = !1, this.#w = !1, this.#a = !1, this.#T(), this.#t && (this.#p = !0), this.#P(!0), this.#L(), this.#N());
  }
  async finish() {
    if (this.#w = !0, this.#v || !this.#t) return;
    const t = this.#m;
    await new Promise((e) => {
      this.#O.push(e), this.#N();
    }), !(this.#v || this.#m !== t) && this.mediaSource.readyState === "open" && this.mediaSource.endOfStream();
  }
  close() {
    this.#v || (this.#v = !0, this.managed && (this.mediaSource.removeEventListener(
      "startstreaming",
      this.#h
    ), this.mediaSource.removeEventListener(
      "endstreaming",
      this.#k
    )), this.#t?.removeEventListener("updateend", this.#A), this.#t?.removeEventListener("error", this.#U), this.#t = null, this.#n = [], this.#g = 0, this.#E = [], this.#l.abandon(), this.#P(!0));
  }
  /** Tell the sink where playback has got to, so it can evict what is behind. */
  setCurrentTime(t) {
    this.#b = t, this.#V(), this.#L(), this.#N();
  }
  #I(t) {
    this.#n.push(t), this.#g += t.data.byteLength, this.#L(), this.#N();
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
        this.#u = null, this.#p = !1, this.#R(s);
      }
      return;
    }
    if (this.#a) return;
    const e = this.#n[0];
    if (!e) {
      this.#P(!1);
      return;
    }
    if (!(!e.init && this.#M())) {
      if (this.#d !== null) {
        const s = this.#d;
        this.#d = null;
        try {
          t.changeType(s), this.#f = s;
        } catch (i) {
          this.#R(i);
          return;
        }
      }
      this.#u = { type: "append", pending: e, epoch: this.#m };
      try {
        t.appendBuffer(e.data);
      } catch (s) {
        this.#u = null, s instanceof DOMException && s.name === "QuotaExceededError" ? (this.#a = !0, this.#L(), this.#T(), this.#V()) : this.#R(s);
      }
    }
  }
  #A = () => {
    const t = this.#u;
    if (t?.type === "append") {
      if (t.epoch === this.#m && this.#n[0] === t.pending) {
        const e = this.#n.shift();
        this.#g -= e.data.byteLength, e.init || this.#C(e.start);
      }
    } else t?.type === "remove" ? (this.#a = !1, this.#T()) : t?.type === "clear" && (this.#p = !1);
    this.#u = null, this.#x(), this.#V(), this.#L(), this.#N();
  };
  /**
   * The managed source asking for data again, which is the only thing that
   * reopens the door `endstreaming` closed.
   */
  #h = () => {
    this.#c = !0, this.#L(), this.#T();
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
    this.#c = !1, this.#L(), this.#T();
  };
  #U = () => {
    this.#R(new Error("the SourceBuffer rejected what was appended"));
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
  #C(t) {
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
  #x() {
    const t = this.#y;
    if (t === null || this.#v || this.mediaSource.readyState !== "open" || this.#u || this.#t?.updating) return;
    const e = this.#t?.buffered, s = e && e.length > 0 ? e.end(e.length - 1) : 0;
    this.#y = null;
    try {
      this.mediaSource.duration = Math.max(t, s);
    } catch (i) {
      this.#R(i);
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
  #V() {
    const t = this.#t;
    if (!this.#a || !t || t.updating || this.#u || this.#p || t.buffered.length === 0) return;
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
  #B() {
    const t = this.#t?.buffered;
    return !t || t.length === 0 ? 0 : t.end(t.length - 1) - this.#b;
  }
  #L() {
    const t = !this.#a && this.#c && this.#B() < this.#s.maxAheadSeconds && this.#g < this.#s.queueHighWaterMark && // The fragment limit would stop the input before a start hold fills.
    (this.#i > 0 || this.#n.length < 2);
    this.#l.set(t) && this.#s.onReadyChange?.(t);
  }
  /**
   * Say whether conversion is waiting on the buffer, whichever of the two
   * reasons it is: no room left, or a managed source that wants nothing for
   * now. Both look the same from where the conversion sits.
   */
  #T() {
    const t = this.#a || !this.#c;
    t !== this.#o && (this.#o = t, this.#s.onBlocked?.(t));
  }
  /** Wake `finish`, either because everything is appended or because we gave up. */
  #P(t) {
    if (!t && (!this.#w || this.#n.length > 0 || this.#u))
      return;
    const e = this.#O;
    this.#O = [];
    for (const s of e) s();
  }
  #R(t) {
    this.#s.onError?.(
      t instanceof Error ? t : new Error(String(t))
    );
  }
}
const x = "" + new URL("assets/worker-DPoV-j1g.js", import.meta.url).href, I = 5e-3, V = 10, E = 2e-3, v = I + E + 1e-3, H = 240, B = 250, W = 2e-6;
class G {
  #e;
  /** Recent refresh times, to average the period over. */
  #s = [];
  #r = 1;
  #t = Number.NEGATIVE_INFINITY;
  constructor(t) {
    this.#e = t;
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
    this.#s.push(e), this.#s.length > H && this.#s.shift();
    const r = this.period;
    if (i === null || Number.isNaN(r)) {
      this.#f(e, 1);
      return;
    }
    if (!t.active) return;
    const n = t.speed / this.#r;
    if (!(n > 0)) return;
    const a = s * r / (i * 1e3), o = a >= 1 ? Math.round(a) : 1 / Math.round(1 / a), u = Math.abs(a / o - 1) <= I ? o * i * 1e3 / r : s, c = t.avDifference, L = Number.isFinite(c) ? Math.min(
      E,
      Math.max(-E, c / V)
    ) : 0, P = Math.min(
      1 + v,
      Math.max(1 - v, u * (1 - L) / n)
    );
    this.#f(e, P);
  }
  #f(t, e) {
    Math.abs(e - this.#r) < W || e !== 1 && t - this.#t < B || (this.#r = e, this.#t = t, this.#e(e));
  }
}
var d = /* @__PURE__ */ ((h) => (h[h.Nothing = 0] = "Nothing", h[h.Metadata = 1] = "Metadata", h[h.CurrentData = 2] = "CurrentData", h[h.FutureData = 3] = "FutureData", h[h.EnoughData = 4] = "EnoughData", h))(d || {});
const q = 250, k = 0.25, y = 4;
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
const j = [
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
class z {
  #e;
  #s;
  #r = !1;
  #t = !0;
  #f = !1;
  #d = !1;
  #n = 0;
  #g = !1;
  #u = !1;
  /** A readyState asked for before the duration was known; see `setReadyState`. */
  #a = null;
  /** The position while the sound is not running. */
  #c = 0;
  /** Whether the sound is playing, so that the position is the one heard. */
  #o = !1;
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
    return this.#o && !this.#t;
  }
  get readyState() {
    return this.#n;
  }
  /** The position the element reports. */
  get currentTime() {
    if (this.#o) {
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
    }), e("paused", { get: () => this.#t }), e("play", { value: () => this.#w(), writable: !0 }), e("pause", { value: () => this.#l(), writable: !0 }), e("playbackRate", {
      get: () => this.#E,
      set: (s) => this.#O(s)
    }), e("volume", {
      get: () => this.#S,
      set: (s) => this.#M(s, this.#i)
    }), e("muted", {
      get: () => this.#i,
      set: (s) => this.#M(this.#S, !!s)
    }), e("duration", { get: () => this.#p }), e("buffered", { get: () => new m(this.#m) }), e("seekable", { get: () => new m(this.#I()) }), e("played", {
      get: () => new m(
        this.#y === null ? null : { start: this.#y, end: this.currentTime }
      )
    }), e("readyState", { get: () => this.#n }), e("seeking", { get: () => this.#f }), e("ended", { get: () => this.#d }), e("error", { get: () => null });
  }
  /** Give the element its own media interface back, with the volume and speed it has now. */
  uninstall() {
    if (!this.#r) return;
    this.#r = !1, this.#A();
    const t = this.#e;
    for (const e of j) delete t[e];
    this.#e.playbackRate = this.#E, this.#e.volume = this.#S, this.#e.muted = this.#i;
  }
  /** How long the media is; Infinity for a live input, NaN before it is known. */
  setDuration(t) {
    if (Object.is(t, this.#p)) return;
    this.#p = t, this.#h("durationchange");
    const e = this.#a;
    this.#a = null, e !== null && this.setReadyState(e);
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
      this.#a = t;
      return;
    }
    this.#a = null;
    const e = this.#n;
    if (t !== e) {
      if (this.#n = t, t < e) {
        t < 3 && e >= 3 && !this.#t && this.#h("waiting");
        return;
      }
      !this.#g && t >= 1 && (this.#g = !0, this.#h("loadedmetadata")), !this.#u && t >= 2 && (this.#u = !0, this.#h("loadeddata")), e < 3 && t >= 3 && this.#h("canplay"), e < 4 && t >= 4 && this.#h("canplaythrough");
    }
  }
  /** A seek's media is in place: `seeked`. */
  seeked() {
    this.#f && (this.#f = !1, this.#h("timeupdate"), this.#h("seeked"));
  }
  /** The sound started playing at media time `media`. */
  soundStarted(t) {
    this.#o || (this.#c = t, this.#o = !0, this.#y ??= t, !this.#t && (this.#h("playing"), this.#N()));
  }
  /**
   * The sound stopped at media time `media`: run out (`waiting` follows from
   * the readyState the caller sets), paused, or at the end of the media.
   */
  soundStopped(t, e) {
    this.#c = t, this.#o = !1, this.#A(), e && (this.#d = !0, this.#h("timeupdate"), this.#t || (this.#t = !0, this.#h("pause")), this.#h("ended"));
  }
  /** Where the media begins, for a load whose first media is later than zero. */
  place(t) {
    this.#o || t <= this.#c || (this.#c = t, this.#h("timeupdate"));
  }
  #v(t) {
    if (!Number.isFinite(t))
      throw new TypeError(`currentTime cannot be ${t}`);
    let e = Math.max(0, t);
    Number.isFinite(this.#p) && (e = Math.min(e, this.#p)), this.#o = !1, this.#A(), this.#d = !1, this.#f = !0, this.#c = e, this.#h("seeking"), this.#h("timeupdate"), this.#s.seek(e);
  }
  async #w() {
    if (this.#d && this.#v(0), this.#t && (this.#t = !1, this.#h("play"), this.#n < 3 && this.#h("waiting")), !await this.#s.resume())
      throw this.#t || (this.#t = !0, this.#h("pause")), new DOMException(
        "the browser does not let sound start without the viewer's gesture",
        "NotAllowedError"
      );
    this.#t || (this.#s.play(), this.#o && (this.#h("playing"), this.#N()));
  }
  #l() {
    this.#t || (this.#c = this.currentTime, this.#o = !1, this.#t = !0, this.#A(), this.#s.pause(), this.#h("timeupdate"), this.#h("pause"));
  }
  #O(t) {
    if (!(t >= k && t <= y))
      throw new DOMException(
        `playbackRate ${t} is outside ${k} to ${y}`,
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
  #I() {
    return Number.isFinite(this.#p) ? { start: 0, end: this.#p } : this.#m;
  }
  #N() {
    this.#b === null && (this.#b = setInterval(
      () => this.#h("timeupdate"),
      q
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
const K = "" + new URL("assets/processor-9SraeEvc.js", import.meta.url).href, X = 33, b = 4, M = 0.05, N = 2e-6, w = 5e-4, $ = 4, Q = 20, Y = 60, J = 200, Z = 32;
class tt {
  #e;
  #s;
  // The block being collected: when it started and its lowest reading.
  #r = 0;
  #t = 1 / 0;
  #f = 0;
  #d = 0;
  // The mapping: context seconds at wall ms w is #offset + #slope × (w − #at) / 1000.
  #n = !1;
  #g = 0;
  #u = 0;
  #a = 1;
  // Covariance of (offset in ms, slope).
  #c = 0;
  #o = 0;
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
      e.length > Z && e.shift();
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
    else if (t - this.#S > Q) return;
    this.#n || (this.#n = !0, this.#g = t, this.#u = s, this.#a = 1, this.#c = 400, this.#o = 0, this.#p = w * w, this.#r = t, this.#t = 1 / 0);
    const i = (s - this.#v(t)) * 1e3;
    if (i < -30 || i > Y) {
      Number.isNaN(this.#y) && (this.#y = t), t - this.#y >= J && (this.#w(), this.sample(t));
      return;
    }
    this.#y = Number.NaN, t - this.#r >= X && this.#t !== 1 / 0 && (this.#l(this.#f, this.#d), this.#r = t, this.#t = 1 / 0), i < this.#t && (this.#t = i, this.#f = t, this.#d = s);
  }
  /** Media time being heard at wall time `wall`, or NaN when not playing or not yet known. */
  at(t) {
    const e = this.frameAt(t), s = this.#b(e);
    return s === void 0 ? Number.NaN : s.state === "playing" ? s.media + (e - s.frame) * s.speed / this.#s : s.state === "starved" ? s.media : Number.NaN;
  }
  /** Media seconds per wall second right now; 0 when not playing. */
  get speed() {
    const t = this.#b(this.frameAt(performance.now()));
    return t === void 0 || t.state !== "playing" ? 0 : t.speed * this.#a;
  }
  /** The processor's state as last reported; "idle" before the first report. */
  get state() {
    return this.#i.at(-1)?.state ?? "idle";
  }
  /** Wall time at which the device plays context frame `frame` (outputLatency included); NaN until known. */
  wallOfFrame(t) {
    if (!this.#n) return Number.NaN;
    const e = t / this.#s;
    return this.#g + (e - this.#u) * 1e3 / this.#a + this.#m * 1e3;
  }
  /** The context frame being heard at wall time `wall`; NaN until known. */
  frameAt(t) {
    return this.#n ? this.#v(t - this.#m * 1e3) * this.#s : Number.NaN;
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
    return this.#u + this.#a * (t - this.#g) / 1e3;
  }
  #w() {
    this.#n = !1, this.#y = Number.NaN;
  }
  /** A Kalman step with the block minimum (`wall` ms, `time` s). */
  #l(t, e) {
    const s = t - this.#g, i = Math.abs(s) / 1e3;
    this.#u += this.#a * s / 1e3, this.#g = t;
    const r = this.#c + 2 * s * this.#o + s * s * this.#p, n = this.#o + s * this.#p;
    this.#c = r + M * M * i, this.#o = n, this.#p += N * N * i;
    const a = (e - this.#u) * 1e3, o = this.#c + b * b;
    if (Math.abs(a) > $ * Math.sqrt(o)) return;
    const u = this.#c / o, c = this.#o / o;
    this.#u += u * a / 1e3, this.#a += c * a, this.#p -= c * this.#o, this.#o -= u * this.#o, this.#c -= u * this.#c;
  }
}
const et = "mpeg2toh264-sound", st = K, it = 50, rt = 48e3, A = /* @__PURE__ */ new WeakMap();
function ht(h) {
  let t = A.get(h);
  return t || (t = h.audioWorklet.addModule(st), A.set(h, t)), t;
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
  #f;
  #d = 0;
  constructor(t, e, s) {
    this.#e = s, this.context = t, this.clock = e;
    const { port1: i, port2: r } = new MessageChannel();
    this.workerPort = r, this.#f = setInterval(this.#u, it), this.#d = requestAnimationFrame(this.#a), ht(t).then(
      () => this.#n(i),
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
    this.#t || (this.#t = !0, clearInterval(this.#f), cancelAnimationFrame(this.#d), this.#s?.port.close(), this.#s?.disconnect(), this.#s = null, this.#r = [], this.workerPort.close());
  }
  #n(t) {
    if (this.#t) {
      t.close();
      return;
    }
    let e;
    try {
      e = new AudioWorkletNode(this.context, et, {
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
  #a = (t) => {
    this.clock.sample(), this.#e.frame(t), this.#d = requestAnimationFrame(this.#a);
  };
}
const at = 40, T = 2, ot = 0.02, dt = x, g = 0.1, R = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting"
], _ = ["seeked", "play", "ratechange"];
function D(h = !1) {
  return F(h);
}
const ut = 'video/mp4; codecs="mp4v.61"';
function gt(h = !1) {
  return O(ut, h);
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
  #f = "idle";
  /** The sink, when the page owns the MediaSource. */
  #d = null;
  #n = null;
  /** The `<source>` child a Managed Media Source needs; see #attachManaged. */
  #g = null;
  /** Whether remote playback was turned off here, and so is ours to turn back. */
  #u = !1;
  #a = null;
  #c = null;
  /** How long the input is, when it turned out to be one that can be seeked. */
  #o = null;
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
  #l = !1;
  /**
   * Whether the deinterlacer has been handed a picture. From then on it
   * shows only the pictures handed to it, so a load that passes the video
   * through needs another one.
   */
  #O = !1;
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
  #I = null;
  #N = null;
  #A = null;
  /** Decode mode: the sound's way out, and the element's media interface. */
  #h = null;
  #k = null;
  #U = null;
  /**
   * The context and the clock of what it plays, kept from load to load so
   * that the clock's mapping to wall time is settled before a load's first
   * pictures need it.
   */
  #C = null;
  #x = null;
  /** Which dual-mono service was last chosen, which a new load keeps. */
  #V = !1;
  /**
   * The step the pictures change on -- a field, or a frame of progressive
   * video -- in seconds, from the last picture pushed.
   */
  #B = null;
  /**
   * Decode mode: where the current epoch starts, and whether each of the two
   * things playback waits for after a start or a seek is there -- the sound
   * buffered in the worklet, and the pictures of the start in the
   * deinterlacer: the one the start falls in and the one after it, with the
   * picture after that, which the deinterlacer filters the second against.
   * The worklet is told to play only once both are, so that the pictures
   * start with the sound rather than behind it.
   */
  #L = 0;
  #T = !1;
  #P = !1;
  /** Playback was asked to start and waits for a refresh it can be placed on (`#placeStart`). */
  #R = !1;
  /** A playback speed asked for while playing that the worklet has not been seen to play at yet. */
  #W = null;
  constructor(t, e = {}) {
    super(), this.video = t, this.#e = e;
    const s = e.mediaSource ?? "auto";
    this.#s = s === "auto" ? D(e.preferManagedMediaSource) ? "worker" : "main" : s, this.video.addEventListener("seeking", this.#it);
    for (const i of _)
      this.video.addEventListener(i, this.#G);
    for (const i of R)
      this.video.addEventListener(i, this.#rt);
    e.deinterlace && (this.deinterlace = !0);
  }
  get state() {
    return this.#f;
  }
  /**
   * How long the input is, or null while it is a stream that plays as it
   * arrives. The same number reaches the media element as its duration.
   */
  get duration() {
    return this.#o;
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
    this.#V = t, this.#h?.control({ type: "dual-mono", sub: t }), this.#r?.postMessage({
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
    return this.#l;
  }
  /**
   * The size the picture is shown at, after its sample aspect ratio, or
   * null before the first one. Where the pictures are decoded here this is
   * what `video.videoWidth` and `videoHeight` would say; otherwise it is
   * them.
   */
  get videoSize() {
    if (this.#l) return this.#A;
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
    return t?.running ? !this.#l || t.enabled && (t.scan?.interlaced ?? !0) : !1;
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
    this.#b = t, this.#K();
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
  #K() {
    if (!this.#v)
      try {
        !this.#i && this.#e.deinterlacer && (this.#i = this.#e.deinterlacer(this.video)), this.#i && (this.#i.videoTimeline = this.#m, this.#i.enabled = this.#b);
      } catch (t) {
        this.#D("error", { error: l(t) });
      }
  }
  #ot(t, e, s) {
    t <= 0 || e <= 0 || this.#Q({ start: s, codedSize: { width: t, height: e } });
  }
  /** Add source metadata now, but apply it only when its picture is shown. */
  #dt(t) {
    for (const { start: e, interlaced: s, topFieldFirst: i } of t)
      this.#Q({
        start: e,
        scan: { interlaced: s, topFieldFirst: i }
      });
  }
  #Q(t) {
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
  #j() {
    this.#m = [], this.#i && (this.#i.videoTimeline = []);
  }
  load(t) {
    return this.#v ? Promise.reject(new Error("the player has been destroyed")) : this.#s === "worker" && !D(this.#e.preferManagedMediaSource) ? Promise.reject(
      new Error("this browser cannot construct a MediaSource in a worker")
    ) : (this.stop(), this.#Y(String(t), !0));
  }
  /**
   * Start a load. `decodable` is false to pass the video through whatever the
   * deinterlacer takes, which is how a stream decode mode cannot play is
   * loaded again.
   */
  #Y(t, e) {
    const s = this.#t;
    this.#w = t, this.#o = null, this.#I = null, this.#p = 0, this.#j(), this.#K();
    const i = this.#i?.decodedVideo ?? null;
    if (this.#l = e && this.#e.softwareDecode !== !1 && i !== null, !this.#l && !this.#e.passthrough) {
      const a = new Error(
        this.#e.softwareDecode === !1 ? "the video cannot be decoded because softwareDecode is false, and passthrough is off" : "the video cannot be decoded because no deinterlacer with a decodedVideo input was given, and passthrough is off"
      ), o = new Promise((u, c) => {
        this.#c = { resolve: u, reject: c };
      });
      return queueMicrotask(() => {
        s === this.#t && this.#_(a);
      }), o;
    }
    !this.#l && this.#O && (this.#i?.destroy(), this.#i = null, this.#O = !1, this.#K()), this.#A = null, this.#E = p(), this.#S = this.#E;
    const r = this.#Et(), n = new Promise((a, o) => {
      this.#c = { resolve: a, reject: o };
    });
    if (this.#F("loading"), r.postMessage({
      type: "load",
      id: s,
      url: t,
      wasmUrl: this.#e.wasmUrl === void 0 ? null : String(this.#e.wasmUrl),
      recoveryInterval: this.#e.recoveryInterval,
      openGopRecovery: this.#e.openGopRecovery,
      splitFieldSamples: this.#e.splitFieldSamples,
      audioGainSteps: this.#e.audioGainSteps ?? 0,
      surroundAudioGainSteps: this.#e.surroundAudioGainSteps ?? this.#e.audioGainSteps ?? 0,
      video: this.#l ? "decode" : "passthrough",
      serviceId: this.#e.serviceId ?? null,
      sink: this.#s,
      preferManagedMediaSource: this.#e.preferManagedMediaSource ?? !1,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10
    }), this.#nt(), this.#l && i) {
      i.onrelease = this.#tt, i.onprepared = () => {
        s === this.#t && this.#H();
      };
      try {
        this.#ut(s);
      } catch (o) {
        return queueMicrotask(() => {
          s === this.#t && this.#_(l(o));
        }), n;
      }
      this.#z(), this.#J(0);
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
      ), this.#N = setInterval(this.#G, 40);
    }
    return n;
  }
  /**
   * Decode mode: the AudioWorklet the sound plays through, and the element's
   * media interface answered from here for the length of the load.
   */
  #ut(t) {
    this.#C ??= new AudioContext({ sampleRate: rt }), this.#x ??= new tt(this.#C);
    const e = new nt(this.#C, this.#x, {
      report: (r) => {
        t === this.#t && this.#mt(r);
      },
      error: (r) => {
        t === this.#t && this.#_(r);
      },
      frame: (r) => {
        t === this.#t && this.#ct(r);
      }
    }), s = new G(
      (r) => e.control({ type: "adjust", ratio: r })
    ), i = new z(this.video, {
      play: () => this.#H(),
      pause: () => {
        this.#R = !1, e.control({ type: "pause" });
      },
      seek: (r) => this.#lt(r),
      rate: (r) => {
        this.#pt(r), this.#G();
      },
      volume: (r) => e.control({ type: "volume", gain: r }),
      heard: () => e.clock.at(performance.now()),
      resume: () => e.resume()
    });
    e.control({ type: "rate", rate: i.rate }), e.control({ type: "volume", gain: i.gain }), e.control({ type: "dual-mono", sub: this.#V }), i.install(), this.#h = e, this.#k = i, this.#U = s, this.#B = null;
  }
  /** Hold the media clock to the display, for the refresh at `now`. */
  #ct(t) {
    const e = this.#h, s = this.#k;
    this.#U.frame({
      now: t,
      speed: e.clock.speed,
      step: this.#B,
      rate: s.rate,
      active: s.playing,
      avDifference: this.#i.decodedVideo.avDifference()
    }), this.#Z();
  }
  /**
   * Start the sound's epoch at media time `at`, held: it plays once both its
   * sound and its first picture are in (`#startIfReady`).
   */
  #J(t) {
    this.#R = !1, this.#L = t, this.#T = !1, this.#P = !1, this.#h.control({ type: "pause" }), this.#h.control({ type: "epoch", epoch: this.#M, at: t });
  }
  /** The viewer moved the playhead, in decode mode: a new epoch from `time`. */
  #lt(t) {
    if (this.#f === "idle" || this.#f === "error") return;
    const e = this.#k;
    e.readyState > d.Metadata && e.setReadyState(d.Metadata), this.#z(), this.#J(t), this.#r?.postMessage({
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
    !t || !this.#T || !this.#P || !this.#i.decodedVideo.prepared() || (t.seeked(), t.setReadyState(d.EnoughData), t.paused || this.#ft());
  }
  /**
   * Playback is to start: at the first refresh it can be placed on
   * (`#placeStart`), which every refresh tries until it can.
   */
  #ft() {
    this.#W = null, this.#R = !0, this.#Z();
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
  #Z() {
    if (!this.#R) return;
    const t = this.#h, e = performance.now() + (t.context.outputLatency ?? 0) * 1e3 + at, s = this.#U.refreshAfter(
      e + T
    ), i = t.clock.frameAt(s - T);
    if (Number.isNaN(i)) return;
    this.#R = !1;
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
  #pt(t) {
    this.#h.control({ type: "rate", rate: t }), this.#W = this.#k.playing ? t : null;
  }
  /** What the worklet says it is doing, for the element and the start. */
  #mt(t) {
    const e = this.#k;
    if (!(!e || t.epoch !== this.#M))
      switch (t.state) {
        case "ready":
          if (this.#T) break;
          this.#T = !0, this.#H();
          break;
        case "playing":
          e.setReadyState(d.EnoughData), e.soundStarted(t.media), this.#W !== null && Math.abs(t.speed / this.#W - 1) < ot && (this.#W = null, this.#i.decodedVideo.startsAt(
            t.media,
            this.#h.clock.wallOfFrame(t.frame)
          ));
          break;
        case "starved":
          e.soundStopped(t.media, !1), e.setReadyState(d.CurrentData);
          break;
        case "paused":
          e.soundStopped(t.media, !1);
          break;
        case "ended":
          this.#T || (this.#T = !0, this.#H()), e.soundStopped(t.media, !0);
          break;
      }
  }
  /** Give a picture's buffer back to the worker that made it. */
  #tt = (t) => {
    !this.#l || t.byteLength === 0 || this.#r?.postMessage(
      { type: "recycle", id: this.#t, data: t },
      [t]
    );
  };
  /** Forget the pictures held and ask for the ones at the playhead. */
  #z() {
    this.#M++, this.#i?.decodedVideo?.reset(), this.#G();
  }
  /** Ask for the pictures from the playhead to a little past it. */
  #G = () => {
    if (!this.#l) return;
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
  #gt(t, e) {
    const s = this.#i?.decodedVideo;
    if (t !== this.#M || !s) {
      this.#tt(e.data);
      return;
    }
    const i = this.#A;
    (i?.width !== e.displayWidth || i?.height !== e.displayHeight) && (this.#A = {
      width: e.displayWidth,
      height: e.displayHeight
    }), this.#O = !0;
    try {
      s.push(e);
    } catch (n) {
      this.#D("error", { error: l(n) });
      return;
    }
    const r = e.interlaced ? e.repeatFirstField ? 3 : 2 : 1;
    if (this.#B = e.duration / r, !this.#P && // The picture two after the one the start falls in; a millisecond
    // over, for timestamps at the start that are a tick either side.
    e.timestamp > this.#L + e.duration + 1e-3) {
      this.#P = !0;
      const n = this.#k;
      n.readyState < d.CurrentData && n.setReadyState(d.CurrentData), this.#H();
    }
  }
  /** Abandon the current load. The player stays usable. */
  stop() {
    const t = this.#t;
    this.#t++, this.#I = null, this.#r?.postMessage({ type: "stop", id: t }), this.#at(), this.#$(new Error("the load was stopped")), this.#F("idle");
  }
  /** Stop, and give up the worker. The player cannot be loaded again. */
  destroy() {
    if (!this.#v) {
      this.stop(), this.#v = !0, this.video.removeEventListener("seeking", this.#it);
      for (const t of _)
        this.video.removeEventListener(t, this.#G);
      for (const t of R)
        this.video.removeEventListener(t, this.#rt);
      this.#i?.destroy(), this.#i = null, this.#r?.terminate(), this.#C?.close(), this.#C = null, this.#x = null, this.#r = null;
    }
  }
  addEventListener(t, e, s) {
    super.addEventListener(t, e, s);
  }
  removeEventListener(t, e, s) {
    super.removeEventListener(t, e, s);
  }
  #Et() {
    if (!this.#r) {
      const t = new Worker(
        this.#e.workerUrl ?? dt,
        {
          type: "module"
        }
      );
      t.onmessage = this.#St, t.onerror = (e) => this.#_(new Error(e.message || "the worker failed")), this.#r = t;
    }
    return this.#r;
  }
  #St = (t) => {
    const e = t.data;
    if (e.id === this.#t)
      switch (e.type) {
        case "handle":
          e.managed && this.#et(), this.video.srcObject = e.handle, this.#q("attached", p());
          break;
        case "open":
          this.#vt(e.mimeCodec, e.data);
          break;
        case "video-config":
          this.#l || this.#ot(
            e.width,
            e.height,
            e.start
          );
          break;
        case "fragment":
          this.#d?.push(
            e.data,
            e.start,
            e.randomAccess
          );
          break;
        case "opened":
          this.#F("converting"), this.#$(null);
          break;
        case "seekable":
          this.#o = e.duration, this.#d?.setDuration(e.duration), this.#k?.setDuration(e.duration), this.#D("seekable", { duration: e.duration });
          break;
        case "buffered":
          this.#k?.setBuffered(e.range);
          break;
        case "reset":
          this.#j(), this.#d?.reset(), this.#l && this.#z();
          break;
        case "picture":
          this.#gt(e.epoch, e.picture);
          break;
        case "pictures-end":
          this.#l && e.epoch === this.#M && (this.#i?.decodedVideo?.finish(), this.#P || (this.#P = !0, this.#H()));
          break;
        case "no-aac-audio":
          this.#At();
          break;
        case "scans":
          this.#dt(e.scans);
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
          this.#q(e.name, e.at);
          break;
        case "seek":
          this.#st(e.time);
          break;
        case "hold":
          this.#p = e.seconds, this.#d?.holdStart(e.seconds);
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
          this.#F(e.blocked ? "buffer-full" : "converting");
          break;
        case "finish":
          this.#bt();
          break;
        case "completed":
          this.#F("completed"), this.#s === "worker" && this.#X();
          break;
        case "error":
          this.#_(new Error(e.message));
          break;
      }
  };
  /** Open a MediaSource here, for browsers that cannot have one in a worker. */
  #vt(t, e) {
    const s = this.#t;
    let i;
    try {
      i = this.#d ?? this.#kt(s), i.holdStart(this.#p);
    } catch (r) {
      this.#_(l(r));
      return;
    }
    i.open(t, e).then(
      // The worker is waiting on flow to know the open succeeded. Going
      // through ready() rather than saying true covers the case where the
      // append filled the queue on its own.
      () => i.ready().then(() => this.#ht(s, { type: "flow", id: s, ready: !0 })),
      (r) => {
        s === this.#t && this.#_(l(r));
      }
    );
  }
  #kt(t) {
    const e = new C({
      preferManaged: this.#e.preferManagedMediaSource,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10,
      seek: (s) => this.#st(s),
      onMark: (s) => this.#q(s, p()),
      onReadyChange: (s) => this.#ht(t, { type: "flow", id: t, ready: s }),
      onBlocked: (s) => {
        t === this.#t && this.#F(s ? "buffer-full" : "converting");
      },
      onError: (s) => {
        t === this.#t && this.#_(s);
      }
    });
    return this.#d = e, this.#n = URL.createObjectURL(e.mediaSource), e.managed ? this.#yt(this.#n) : this.video.src = this.#n, this.#q("attached", p()), this.#o !== null && e.setDuration(this.#o), e;
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
  #yt(t) {
    this.video.removeAttribute("src"), this.#et();
    const e = document.createElement("source");
    e.type = "video/mp4", e.src = t, this.video.append(e), this.#g = e, this.video.load();
  }
  /**
   * Rule out AirPlay, which a managed source cannot be sent over and which
   * Safari will not open one until the element has given up. The element
   * belongs to whoever made it, so it is put back on the way out -- unless it
   * was already off, and theirs to keep.
   */
  #et() {
    this.video.disableRemotePlayback || (this.video.disableRemotePlayback = !0, this.#u = !0);
  }
  #bt() {
    const t = this.#t, e = this.#d;
    e && e.finish().then(
      () => {
        t === this.#t && this.#X();
      },
      (s) => {
        t === this.#t && this.#_(l(s));
      }
    );
  }
  /**
   * Put the playhead forward to where the media begins, for the sink. That is
   * no seek of the viewer's: the pictures sent for the request at the old
   * position begin there, so the run they belong to goes on, and the sound
   * held back for them has not been let into the element any earlier.
   */
  #st(t) {
    if (this.#k) {
      this.#k.place(t);
      return;
    }
    this.video.currentTime >= t || (this.video.currentTime = t, this.#I = this.video.currentTime);
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
  #it = () => {
    if (this.#k) return;
    const t = this.#I === this.video.currentTime;
    if (this.#I = null, t || this.#f === "idle" || this.#f === "error" || (this.#l && this.#z(), this.#o === null)) return;
    const e = this.video.currentTime;
    this.#Nt(e) || (this.#F("seeking"), this.#j(), this.#nt(), this.#r?.postMessage({
      type: "seek",
      id: this.#t,
      time: e,
      epoch: null
    }));
  };
  #rt = (t) => {
    this.#f !== "idle" && (this.#q(t.type, p()), t.type === "waiting" && !this.#l && this.#Mt());
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
  #Mt() {
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
  #q(t, e) {
    if (this.#E === 0) return;
    const s = e - this.#E, i = Math.max(0, e - this.#S);
    this.#S = Math.max(this.#S, e), this.#D("timing", { name: t, sinceLoad: s, sincePrevious: i });
  }
  #Nt(t) {
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
  #wt = () => {
    const t = this.video.currentTime;
    this.#s === "main" && !this.#l ? this.#d?.setCurrentTime(t) : this.#r?.postMessage({
      type: "time",
      id: this.#t,
      currentTime: t
    });
  };
  #ht(t, e) {
    t === this.#t && this.#r?.postMessage(e);
  }
  #nt() {
    this.#a === null && (this.#a = setInterval(
      this.#wt,
      200
    ));
  }
  #X() {
    this.#a !== null && (clearInterval(this.#a), this.#a = null);
  }
  /**
   * Load the same input again with the video passed through, for a stream
   * that decode mode cannot play, or fail the load where passthrough is off.
   * The load's promise settles as the new one does.
   */
  #At() {
    if (!this.#l) {
      this.#_(
        new Error("the worker refused to decode a load it passes through")
      );
      return;
    }
    if (!this.#e.passthrough) {
      this.#_(
        new Error(
          "the video cannot be decoded because the stream has no AAC sound, which decoding needs, and passthrough is off"
        )
      );
      return;
    }
    const t = this.#c;
    this.#c = null, this.stop(), this.#Y(this.#w, !1).then(t?.resolve, (s) => t?.reject(s));
  }
  #at() {
    this.#X(), this.#N !== null && clearInterval(this.#N), this.#N = null;
    const t = this.#l;
    this.#l = !1, t && this.#i?.decodedVideo?.reset(), this.#j(), this.#d?.close(), this.#d = null, this.#h?.close(), this.#h = null, this.#U = null, this.#k?.uninstall(), this.#k = null, this.#n && URL.revokeObjectURL(this.#n), this.#n = null, this.#g?.remove(), this.#g = null, this.#u && (this.video.disableRemotePlayback = !1, this.#u = !1), this.video.removeAttribute("src"), this.video.srcObject = null, this.video.load();
  }
  #_(t) {
    this.#at(), this.#F("error"), this.#$(t), this.#D("error", { error: t });
  }
  #$(t) {
    const e = this.#c;
    e && (this.#c = null, t ? e.reject(t) : e.resolve());
  }
  #F(t) {
    this.#f !== t && (this.#f = t, this.#D("statechange", { state: t }));
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
  D as supportsWorkerMediaSource
};
//# sourceMappingURL=index.js.map
