const ot = 33554432;
const dt = 8, ut = 10;
const f = globalThis.ManagedMediaSource;
function S(h = !1) {
  const t = typeof MediaSource > "u" ? null : MediaSource;
  return h && f ? f : t ?? f ?? null;
}
function P(h, t = !1) {
  return S(t)?.isTypeSupported(h) ?? !1;
}
function L(h = !1) {
  return S(h)?.canConstructInDedicatedWorker === !0;
}
function ct() {
  return f !== void 0;
}
function lt() {
  return typeof MediaSource > "u" && f !== void 0;
}
class O {
  #e = !0;
  #s = [];
  get open() {
    return this.#e;
  }
  /** Returns whether this changed anything. */
  set(t) {
    return t === this.#e ? !1 : (this.#e = t, t && this.#i(), !0);
  }
  wait() {
    return this.#e ? Promise.resolve() : new Promise((t) => {
      this.#s.push(t);
    });
  }
  /** Let everyone through whatever the state is, for teardown. */
  abandon() {
    this.#i();
  }
  #i() {
    const t = this.#s;
    this.#s = [];
    for (const e of t) e();
  }
}
class U {
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
  #i;
  #t = null;
  /** What the `SourceBuffer` was opened with, or last changed to. */
  #n = "";
  /** A codec to move the `SourceBuffer` to before the next append. */
  #o = null;
  #a = [];
  #p = 0;
  #l = null;
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
  #f = !0;
  /** The last thing said about there being no room, so it is said once. */
  #u = !1;
  /** Whether everything buffered is waiting to be thrown away; see `reset`. */
  #m = !1;
  /** Which stretch of timeline is being filled. Bumped by every `reset`. */
  #g = 0;
  /** A duration to put on the MediaSource as soon as it will take one. */
  #b = null;
  /** Media times a decoder can start from, in order; see #evict. */
  #E = [];
  /** Whether the playhead has been put where the media starts; see #startAtMedia. */
  #S = !1;
  /** Seconds of media to collect before the first append; see `holdStart`. */
  #r = 0;
  #k = 0;
  #v = !1;
  #T = !1;
  #c = new O();
  #R = [];
  constructor(t) {
    this.#s = t;
    const e = S(t.preferManaged);
    if (!e) throw new Error("this browser has no Media Source Extensions");
    this.#e = e, this.mediaSource = new e(), this.managed = e === f, this.managed && (this.mediaSource.addEventListener(
      "startstreaming",
      this.#h
    ), this.mediaSource.addEventListener("endstreaming", this.#y)), this.#i = new Promise((s) => {
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
    return this.#c.wait();
  }
  /**
   * Open the stream, or -- for the initialization segment a seek brings with
   * it -- re-open the one already running.
   */
  async open(t, e) {
    if (!this.#e.isTypeSupported(t))
      throw new Error(`unsupported codec: ${t}`);
    if (await this.#i, !this.#v) {
      if (this.#t)
        t !== this.#n && (this.#o = t);
      else {
        const s = this.mediaSource.addSourceBuffer(t);
        s.mode = "segments", s.addEventListener("updateend", this.#A), s.addEventListener("error", this.#O), this.#t = s, this.#n = t;
      }
      this.#P({ data: e, init: !0 }), this.#U();
    }
  }
  push(t, e, s) {
    this.#v || (s && this.#E.push(e), this.#P({ data: t, init: !1, start: e }));
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
    this.#S || (this.#r = t);
  }
  /** Whether the first media is still being collected. Ends the hold when not. */
  #M() {
    if (this.#r === 0) return !1;
    const t = this.#a.filter((s) => !s.init);
    return (t.length > 0 ? t[t.length - 1].start - t[0].start : 0) < this.#r && !this.#T ? !0 : (this.#r = 0, !1);
  }
  /**
   * How long the whole presentation is.
   *
   * Without this the media element has no timeline to offer a viewer: it is
   * what turns `seekable` into the length of the file rather than the length
   * of what has been converted so far.
   */
  setDuration(t) {
    this.#b = t, this.#U();
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
    this.#v || (this.#g++, this.#a = [], this.#p = 0, this.#E = [], this.#S = !1, this.#T = !1, this.#d = !1, this.#_(), this.#t && (this.#m = !0), this.#x(!0), this.#N(), this.#w());
  }
  async finish() {
    if (this.#T = !0, this.#v || !this.#t) return;
    const t = this.#g;
    await new Promise((e) => {
      this.#R.push(e), this.#w();
    }), !(this.#v || this.#g !== t) && this.mediaSource.readyState === "open" && this.mediaSource.endOfStream();
  }
  close() {
    this.#v || (this.#v = !0, this.managed && (this.mediaSource.removeEventListener(
      "startstreaming",
      this.#h
    ), this.mediaSource.removeEventListener(
      "endstreaming",
      this.#y
    )), this.#t?.removeEventListener("updateend", this.#A), this.#t?.removeEventListener("error", this.#O), this.#t = null, this.#a = [], this.#p = 0, this.#E = [], this.#c.abandon(), this.#x(!0));
  }
  /** Tell the sink where playback has got to, so it can evict what is behind. */
  setCurrentTime(t) {
    this.#k = t, this.#C(), this.#N(), this.#w();
  }
  #P(t) {
    this.#a.push(t), this.#p += t.data.byteLength, this.#N(), this.#w();
  }
  #w() {
    const t = this.#t;
    if (this.#v || !t || t.updating || this.#l)
      return;
    if (this.#m) {
      this.#l = { type: "clear" };
      try {
        t.remove(0, Number.POSITIVE_INFINITY);
      } catch (s) {
        this.#l = null, this.#m = !1, this.#F(s);
      }
      return;
    }
    if (this.#d) return;
    const e = this.#a[0];
    if (!e) {
      this.#x(!1);
      return;
    }
    if (!(!e.init && this.#M())) {
      if (this.#o !== null) {
        const s = this.#o;
        this.#o = null;
        try {
          t.changeType(s), this.#n = s;
        } catch (i) {
          this.#F(i);
          return;
        }
      }
      this.#l = { type: "append", pending: e, epoch: this.#g };
      try {
        t.appendBuffer(e.data);
      } catch (s) {
        this.#l = null, s instanceof DOMException && s.name === "QuotaExceededError" ? (this.#d = !0, this.#N(), this.#_(), this.#C()) : this.#F(s);
      }
    }
  }
  #A = () => {
    const t = this.#l;
    if (t?.type === "append") {
      if (t.epoch === this.#g && this.#a[0] === t.pending) {
        const e = this.#a.shift();
        this.#p -= e.data.byteLength, e.init || this.#W(e.start);
      }
    } else t?.type === "remove" ? (this.#d = !1, this.#_()) : t?.type === "clear" && (this.#m = !1);
    this.#l = null, this.#U(), this.#C(), this.#N(), this.#w();
  };
  /**
   * The managed source asking for data again, which is the only thing that
   * reopens the door `endstreaming` closed.
   */
  #h = () => {
    this.#f = !0, this.#N(), this.#_();
  };
  /**
   * The managed source saying it has enough.
   *
   * What is already queued still goes in -- it was converted, and a few
   * fragments are cheaper to append than to convert again -- but nothing more
   * is taken until it asks. This is the whole point of the managed source: it
   * knows what the radio and the battery are doing and the page does not.
   */
  #y = () => {
    this.#f = !1, this.#N(), this.#_();
  };
  #O = () => {
    this.#F(new Error("the SourceBuffer rejected what was appended"));
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
  #W(t) {
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
  #U() {
    const t = this.#b;
    if (t === null || this.#v || this.mediaSource.readyState !== "open" || this.#l || this.#t?.updating) return;
    const e = this.#t?.buffered, s = e && e.length > 0 ? e.end(e.length - 1) : 0;
    this.#b = null;
    try {
      this.mediaSource.duration = Math.max(t, s);
    } catch (i) {
      this.#F(i);
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
    if (!this.#d || !t || t.updating || this.#l || this.#m || t.buffered.length === 0) return;
    const e = this.#k - this.#s.keepBehindSeconds;
    let s = 0;
    for (const r of this.#E) {
      if (r > e) break;
      s = r;
    }
    const i = s - 1e-3;
    if (!(i <= 0)) {
      for (; this.#E.length > 0 && this.#E[0] < s; )
        this.#E.shift();
      this.#l = { type: "remove" }, t.remove(0, i);
    }
  }
  /** How far past the playhead the buffer reaches, in seconds. */
  #G() {
    const t = this.#t?.buffered;
    return !t || t.length === 0 ? 0 : t.end(t.length - 1) - this.#k;
  }
  #N() {
    const t = !this.#d && this.#f && this.#G() < this.#s.maxAheadSeconds && this.#p < this.#s.queueHighWaterMark && // The fragment limit would stop the input before a start hold fills.
    (this.#r > 0 || this.#a.length < 2);
    this.#c.set(t) && this.#s.onReadyChange?.(t);
  }
  /**
   * Say whether conversion is waiting on the buffer, whichever of the two
   * reasons it is: no room left, or a managed source that wants nothing for
   * now. Both look the same from where the conversion sits.
   */
  #_() {
    const t = this.#d || !this.#f;
    t !== this.#u && (this.#u = t, this.#s.onBlocked?.(t));
  }
  /** Wake `finish`, either because everything is appended or because we gave up. */
  #x(t) {
    if (!t && (!this.#T || this.#a.length > 0 || this.#l))
      return;
    const e = this.#R;
    this.#R = [];
    for (const s of e) s();
  }
  #F(t) {
    this.#s.onError?.(
      t instanceof Error ? t : new Error(String(t))
    );
  }
}
const x = "" + new URL("assets/worker-DPoV-j1g.js", import.meta.url).href, F = 5e-3, k = 5e-3, C = 240, H = 1, B = 4, V = 250, W = 2e-6;
class G {
  #e;
  /** Recent refresh times, to average the period over. */
  #s = [];
  #i = 1;
  #t = Number.NEGATIVE_INFINITY;
  /** The smoothed phase error, in grid steps, or NaN before a measurement. */
  #n = Number.NaN;
  #o = Number.NaN;
  constructor(t) {
    this.#e = t;
  }
  /** The speed factor last sent. */
  get adjust() {
    return this.#i;
  }
  /** The smoothed phase error in grid steps; 0 is a refresh in the middle of its step. */
  get error() {
    return this.#n;
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
  /** Take one animation frame. */
  frame(t) {
    const { now: e } = t, s = e - this.#o;
    this.#o = e, this.#s.push(e), this.#s.length > C && this.#s.shift();
    const i = this.period, r = t.step;
    if (!t.active || r === null || Number.isNaN(i)) {
      this.#a(e);
      return;
    }
    const n = t.rate * i / (r * 1e3), a = n >= 1 ? Math.round(n) : 1 / Math.round(1 / n);
    if (!(a > 0) || Math.abs(n / a - 1) > F) {
      this.#a(e);
      return;
    }
    const o = t.at(e + i);
    if (Number.isNaN(o)) return;
    const d = (o - t.origin) / r, c = d - Math.floor(d) - 0.5;
    if (Number.isNaN(this.#n) || !(s > 0) || s > 200)
      this.#n = c;
    else {
      let m = c - this.#n;
      m -= Math.round(m), this.#n += m * Math.min(1, s / 1e3 / H), this.#n -= Math.round(this.#n);
    }
    const D = a * r * 1e3 / i - this.#n * r / B, v = t.speed / this.#i;
    if (!(v > 0)) return;
    const I = Math.min(
      1 + k,
      Math.max(1 - k, D / v)
    );
    this.#p(e, I);
  }
  /** Forget the phase: a seek, a pause, a change of speed. */
  reset() {
    this.#n = Number.NaN;
  }
  #a(t) {
    this.#n = Number.NaN, this.#p(t, 1);
  }
  #p(t, e) {
    Math.abs(e - this.#i) < W || e !== 1 && t - this.#t < V || (this.#i = e, this.#t = t, this.#e(e));
  }
}
var u = /* @__PURE__ */ ((h) => (h[h.Nothing = 0] = "Nothing", h[h.Metadata = 1] = "Metadata", h[h.CurrentData = 2] = "CurrentData", h[h.FutureData = 3] = "FutureData", h[h.EnoughData = 4] = "EnoughData", h))(u || {});
const j = 250, y = 0.25, b = 4;
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
const q = [
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
  #i = !1;
  #t = !0;
  #n = !1;
  #o = !1;
  #a = 0;
  #p = !1;
  #l = !1;
  /** A readyState asked for before the duration was known; see `setReadyState`. */
  #d = null;
  /** The position while the sound is not running. */
  #f = 0;
  /** Whether the sound is playing, so that the position is the one heard. */
  #u = !1;
  #m = Number.NaN;
  #g = null;
  #b = null;
  #E;
  #S;
  #r;
  #k = null;
  constructor(t, e) {
    this.#e = t, this.#s = e, this.#E = t.playbackRate, this.#S = t.volume, this.#r = t.muted;
  }
  /** The gain the sound should have now. */
  get gain() {
    return this.#r ? 0 : this.#S;
  }
  get rate() {
    return this.#E;
  }
  get paused() {
    return this.#t;
  }
  /** Whether the sound is playing and playback is wanted. */
  get playing() {
    return this.#u && !this.#t;
  }
  get readyState() {
    return this.#a;
  }
  /** The position the element reports. */
  get currentTime() {
    if (this.#u) {
      const t = this.#s.heard();
      if (!Number.isNaN(t)) return t;
    }
    return this.#f;
  }
  install() {
    if (this.#i) return;
    this.#i = !0;
    const t = this.#e, e = (s, i) => Object.defineProperty(t, s, { configurable: !0, ...i });
    e("currentTime", {
      get: () => this.currentTime,
      set: (s) => this.#v(s)
    }), e("paused", { get: () => this.#t }), e("play", { value: () => this.#T(), writable: !0 }), e("pause", { value: () => this.#c(), writable: !0 }), e("playbackRate", {
      get: () => this.#E,
      set: (s) => this.#R(s)
    }), e("volume", {
      get: () => this.#S,
      set: (s) => this.#M(s, this.#r)
    }), e("muted", {
      get: () => this.#r,
      set: (s) => this.#M(this.#S, !!s)
    }), e("duration", { get: () => this.#m }), e("buffered", { get: () => new g(this.#g) }), e("seekable", { get: () => new g(this.#P()) }), e("played", {
      get: () => new g(
        this.#b === null ? null : { start: this.#b, end: this.currentTime }
      )
    }), e("readyState", { get: () => this.#a }), e("seeking", { get: () => this.#n }), e("ended", { get: () => this.#o }), e("error", { get: () => null });
  }
  /** Give the element its own media interface back, with the volume and speed it has now. */
  uninstall() {
    if (!this.#i) return;
    this.#i = !1, this.#A();
    const t = this.#e;
    for (const e of q) delete t[e];
    this.#e.playbackRate = this.#E, this.#e.volume = this.#S, this.#e.muted = this.#r;
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
    const e = this.#a;
    if (t !== e) {
      if (this.#a = t, t < e) {
        t < 3 && e >= 3 && !this.#t && this.#h("waiting");
        return;
      }
      !this.#p && t >= 1 && (this.#p = !0, this.#h("loadedmetadata")), !this.#l && t >= 2 && (this.#l = !0, this.#h("loadeddata")), e < 3 && t >= 3 && this.#h("canplay"), e < 4 && t >= 4 && this.#h("canplaythrough");
    }
  }
  /** A seek's media is in place: `seeked`. */
  seeked() {
    this.#n && (this.#n = !1, this.#h("timeupdate"), this.#h("seeked"));
  }
  /** The sound started playing at media time `media`. */
  soundStarted(t) {
    this.#u || (this.#f = t, this.#u = !0, this.#b ??= t, !this.#t && (this.#h("playing"), this.#w()));
  }
  /**
   * The sound stopped at media time `media`: run out (`waiting` follows from
   * the readyState the caller sets), paused, or at the end of the media.
   */
  soundStopped(t, e) {
    this.#f = t, this.#u = !1, this.#A(), e && (this.#o = !0, this.#h("timeupdate"), this.#t || (this.#t = !0, this.#h("pause")), this.#h("ended"));
  }
  /** Where the media begins, for a load whose first media is later than zero. */
  place(t) {
    this.#u || t <= this.#f || (this.#f = t, this.#h("timeupdate"));
  }
  #v(t) {
    if (!Number.isFinite(t))
      throw new TypeError(`currentTime cannot be ${t}`);
    let e = Math.max(0, t);
    Number.isFinite(this.#m) && (e = Math.min(e, this.#m)), this.#u = !1, this.#A(), this.#o = !1, this.#n = !0, this.#f = e, this.#h("seeking"), this.#h("timeupdate"), this.#s.seek(e);
  }
  async #T() {
    if (this.#o && this.#v(0), this.#t && (this.#t = !1, this.#h("play"), this.#a < 3 && this.#h("waiting")), !await this.#s.resume())
      throw this.#t || (this.#t = !0, this.#h("pause")), new DOMException(
        "the browser does not let sound start without the viewer's gesture",
        "NotAllowedError"
      );
    this.#t || (this.#s.play(), this.#u && (this.#h("playing"), this.#w()));
  }
  #c() {
    this.#t || (this.#f = this.currentTime, this.#u = !1, this.#t = !0, this.#A(), this.#s.pause(), this.#h("timeupdate"), this.#h("pause"));
  }
  #R(t) {
    if (!(t >= y && t <= b))
      throw new DOMException(
        `playbackRate ${t} is outside ${y} to ${b}`,
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
    t === this.#S && e === this.#r || (this.#S = t, this.#r = e, this.#s.volume(this.gain), this.#h("volumechange"));
  }
  #P() {
    return Number.isFinite(this.#m) ? { start: 0, end: this.#m } : this.#g;
  }
  #w() {
    this.#k === null && (this.#k = setInterval(
      () => this.#h("timeupdate"),
      j
    ));
  }
  #A() {
    this.#k !== null && (clearInterval(this.#k), this.#k = null);
  }
  /** Fire `type` on the element once the code that caused it has run, as a media element does. */
  #h(t) {
    queueMicrotask(() => {
      this.#i && this.#e.dispatchEvent(new Event(t));
    });
  }
}
const K = "" + new URL("assets/processor-BjPUH9p-.js", import.meta.url).href, $ = 33, N = 4, M = 0.05, w = 2e-6, T = 5e-4, X = 4, Q = 20, Y = 60, J = 200, Z = 32;
class tt {
  #e;
  #s;
  // The block being collected: when it started and its lowest reading.
  #i = 0;
  #t = 1 / 0;
  #n = 0;
  #o = 0;
  // The mapping: context seconds at wall ms w is #offset + #slope × (w − #at) / 1000.
  #a = !1;
  #p = 0;
  #l = 0;
  #d = 1;
  // Covariance of (offset in ms, slope).
  #f = 0;
  #u = 0;
  #m = 0;
  #g = 0;
  /** Since when the readings have been off the line, or NaN. */
  #b = Number.NaN;
  /** The last `currentTime` read, and the wall time it was first read. */
  #E = Number.NaN;
  #S = 0;
  #r = [];
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
    const e = this.#r, s = e.at(-1);
    s !== void 0 && s.epoch !== t.epoch && (e.length = 0), e.push(t);
    const i = this.#k(performance.now());
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
      this.#c();
      return;
    }
    const s = e.currentTime;
    if (this.#g = e.outputLatency ?? 0, s !== this.#E)
      this.#E = s, this.#S = t;
    else if (t - this.#S > Q) return;
    this.#a || (this.#a = !0, this.#p = t, this.#l = s, this.#d = 1, this.#f = 400, this.#u = 0, this.#m = T * T, this.#i = t, this.#t = 1 / 0);
    const i = (s - this.#T(t)) * 1e3;
    if (i < -30 || i > Y) {
      Number.isNaN(this.#b) && (this.#b = t), t - this.#b >= J && (this.#c(), this.sample(t));
      return;
    }
    this.#b = Number.NaN, t - this.#i >= $ && this.#t !== 1 / 0 && (this.#R(this.#n, this.#o), this.#i = t, this.#t = 1 / 0), i < this.#t && (this.#t = i, this.#n = t, this.#o = s);
  }
  /** Media time being heard at wall time `wall`, or NaN when not playing or not yet known. */
  at(t) {
    const e = this.#k(t), s = this.#v(e);
    return s === void 0 ? Number.NaN : s.state === "playing" ? s.media + (e - s.frame) * s.speed / this.#s : s.state === "starved" ? s.media : Number.NaN;
  }
  /** Media seconds per wall second right now; 0 when not playing. */
  get speed() {
    const t = this.#v(this.#k(performance.now()));
    return t === void 0 || t.state !== "playing" ? 0 : t.speed * this.#d;
  }
  /** The processor's state as last reported; "idle" before the first report. */
  get state() {
    return this.#r.at(-1)?.state ?? "idle";
  }
  /** Wall time at which the device plays context frame `frame` (outputLatency included); NaN until known. */
  wallOfFrame(t) {
    if (!this.#a) return Number.NaN;
    const e = t / this.#s;
    return this.#p + (e - this.#l) * 1e3 / this.#d + this.#g * 1e3;
  }
  /** The context frame being played at wall time `wall`; NaN until known. */
  #k(t) {
    return this.#a ? this.#T(t - this.#g * 1e3) * this.#s : Number.NaN;
  }
  /** The latest report that covers `frame`. */
  #v(t) {
    if (!Number.isNaN(t)) {
      for (let e = this.#r.length - 1; e >= 0; e--)
        if (this.#r[e].frame <= t) return this.#r[e];
    }
  }
  /** Context seconds on the mapping's line at wall ms `wall` (no latency). */
  #T(t) {
    return this.#l + this.#d * (t - this.#p) / 1e3;
  }
  #c() {
    this.#a = !1, this.#b = Number.NaN;
  }
  /** A Kalman step with the block minimum (`wall` ms, `time` s). */
  #R(t, e) {
    const s = t - this.#p, i = Math.abs(s) / 1e3;
    this.#l += this.#d * s / 1e3, this.#p = t;
    const r = this.#f + 2 * s * this.#u + s * s * this.#m, n = this.#u + s * this.#m;
    this.#f = r + M * M * i, this.#u = n, this.#m += w * w * i;
    const a = (e - this.#l) * 1e3, o = this.#f + N * N;
    if (Math.abs(a) > X * Math.sqrt(o)) return;
    const d = this.#f / o, c = this.#u / o;
    this.#l += d * a / 1e3, this.#d += c * a, this.#m -= c * this.#u, this.#u -= d * this.#u, this.#f -= d * this.#f;
  }
}
const et = "mpeg2toh264-sound", st = K, it = 50, rt = 48e3;
class ht {
  context;
  clock;
  /** The end of the PCM channel that belongs to the decode worker. */
  workerPort;
  #e;
  #s = null;
  /** Commands given before the processor existed, in order. */
  #i = [];
  #t = !1;
  #n;
  #o = 0;
  constructor(t) {
    this.#e = t, this.context = new AudioContext({ sampleRate: rt }), this.clock = new tt(this.context);
    const { port1: e, port2: s } = new MessageChannel();
    this.workerPort = s, this.#n = setInterval(this.#l, it), this.#o = requestAnimationFrame(this.#d), this.context.audioWorklet.addModule(st).then(
      () => this.#a(e),
      (i) => this.#p(i)
    );
  }
  /** Give the processor a command, now or as soon as it exists. */
  control(t) {
    this.#t || (this.#s ? this.#s.port.postMessage(t) : this.#i.push(t));
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
    this.#t || (this.#t = !0, clearInterval(this.#n), cancelAnimationFrame(this.#o), this.#s?.port.close(), this.#s?.disconnect(), this.#s = null, this.#i = [], this.workerPort.close(), this.context.close());
  }
  #a(t) {
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
      this.#p(s);
      return;
    }
    e.onprocessorerror = () => this.#p(new Error("the sound processor failed")), e.port.onmessage = (s) => {
      this.clock.report(s.data), this.#e.report(s.data);
    }, e.connect(this.context.destination), e.port.postMessage({ type: "pcm-port", port: t }, [
      t
    ]);
    for (const s of this.#i) e.port.postMessage(s);
    this.#i = [], this.#s = e;
  }
  #p(t) {
    this.#t || this.#e.error(
      t instanceof Error ? t : new Error(String(t))
    );
  }
  #l = () => {
    this.clock.sample();
  };
  #d = (t) => {
    this.clock.sample(), this.#e.frame(t), this.#o = requestAnimationFrame(this.#d);
  };
}
const nt = x, E = 0.1, A = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting"
], _ = ["seeked", "play", "ratechange"];
function R(h = !1) {
  return L(h);
}
const at = 'video/mp4; codecs="mp4v.61"';
function ft(h = !1) {
  return P(at, h);
}
function l(h) {
  return h instanceof Error ? h : new Error(String(h));
}
function p() {
  return performance.timeOrigin + performance.now();
}
class pt extends EventTarget {
  video;
  #e;
  #s;
  #i = null;
  /** Which load messages belong to. Bumped by every load and every stop. */
  #t = 0;
  #n = "idle";
  /** The sink, when the page owns the MediaSource. */
  #o = null;
  #a = null;
  /** The `<source>` child a Managed Media Source needs; see #attachManaged. */
  #p = null;
  /** Whether remote playback was turned off here, and so is ours to turn back. */
  #l = !1;
  #d = null;
  #f = null;
  /** How long the input is, when it turned out to be one that can be seeked. */
  #u = null;
  /**
   * A start hold the worker asked for. It arrives before the first
   * initialization segment, which is what creates the sink.
   */
  #m = 0;
  /** Source video properties indexed by presentation time. */
  #g = [];
  /** What sound the programme last said it was carrying. See `AudioTracks`. */
  #b = null;
  /** When `load()` was called, as epoch milliseconds; every mark counts from it. */
  #E = 0;
  /** When the last mark was, so each one can say what it cost on its own. */
  #S = 0;
  /** Built the first time deinterlacing is turned on, and kept after that. */
  #r = null;
  /** Whether deinterlacing was asked for. */
  #k = !1;
  #v = !1;
  /** What the current load was asked for, so it can be loaded again. */
  #T = "";
  /** Whether the current load decodes the pictures here. */
  #c = !1;
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
  #M = 0;
  /**
   * Where the sink last put the playhead, until the `seeking` that follows:
   * one that finds the playhead there is that move, not the viewer's.
   */
  #P = null;
  #w = null;
  #A = null;
  /** Decode mode: the sound's way out, and the element's media interface. */
  #h = null;
  #y = null;
  #O = null;
  /** Which dual-mono service was last chosen, which a new load keeps. */
  #W = !1;
  /**
   * The grid the pictures change on -- a field, or a frame of progressive
   * video -- in seconds, and a media time on it; from the last picture taken.
   */
  #U = null;
  #C = 0;
  /**
   * Decode mode: where the current epoch starts, and whether each of the two
   * things playback waits for after a start or a seek is there -- the sound
   * buffered in the worklet, and the first picture at or after the start in
   * the deinterlacer. The worklet is told to play only once both are, so
   * that the clock never starts with the picture behind it.
   */
  #G = 0;
  #N = !1;
  #_ = !1;
  constructor(t, e = {}) {
    super(), this.video = t, this.#e = e;
    const s = e.mediaSource ?? "auto";
    this.#s = s === "auto" ? R(e.preferManagedMediaSource) ? "worker" : "main" : s, this.video.addEventListener("seeking", this.#tt);
    for (const i of _)
      this.video.addEventListener(i, this.#B);
    for (const i of A)
      this.video.addEventListener(i, this.#et);
    e.deinterlace && (this.deinterlace = !0);
  }
  get state() {
    return this.#n;
  }
  /**
   * How long the input is, or null while it is a stream that plays as it
   * arrives. The same number reaches the media element as its duration.
   */
  get duration() {
    return this.#u;
  }
  /**
   * What sound the programme is carrying and which of it is being taken, or
   * null before its program map has been read. See `AudioTracks`.
   */
  get audio() {
    return this.#b;
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
    this.#i?.postMessage({
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
    this.#W = t, this.#h?.control({ type: "dual-mono", sub: t }), this.#i?.postMessage({
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
    return this.#c;
  }
  /**
   * The size the picture is shown at, after its sample aspect ratio, or
   * null before the first one. Where the pictures are decoded here this is
   * what `video.videoWidth` and `videoHeight` would say; otherwise it is
   * them.
   */
  get videoSize() {
    if (this.#c) return this.#A;
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
    const t = this.#r;
    return t?.running ? !this.#c || t.enabled && (t.scan?.interlaced ?? !0) : !1;
  }
  /** Whether deinterlacing was asked for, whatever the source turned out to be. */
  get deinterlaceWanted() {
    return this.#k;
  }
  /**
   * The deinterlacer itself, once there has been one, for the settings that
   * are its own -- the field order, and whether a picture goes up per field
   * or per frame. Null until `deinterlace` has been turned on.
   */
  get deinterlacer() {
    return this.#r;
  }
  set deinterlace(t) {
    this.#k = t, this.#x();
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
  #x() {
    if (!this.#v)
      try {
        !this.#r && this.#e.deinterlacer && (this.#r = this.#e.deinterlacer(this.video)), this.#r && (this.#r.videoTimeline = this.#g, this.#r.enabled = this.#k);
      } catch (t) {
        this.#I("error", { error: l(t) });
      }
  }
  #F(t, e, s) {
    t <= 0 || e <= 0 || this.#$({ start: s, codedSize: { width: t, height: e } });
  }
  /** Add source metadata now, but apply it only when its picture is shown. */
  #ht(t) {
    for (const { start: e, interlaced: s, topFieldFirst: i } of t)
      this.#$({
        start: e,
        scan: { interlaced: s, topFieldFirst: i }
      });
  }
  #$(t) {
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
    this.#r && (this.#r.videoTimeline = this.#g);
  }
  #j() {
    this.#g = [], this.#r && (this.#r.videoTimeline = []);
  }
  load(t) {
    return this.#v ? Promise.reject(new Error("the player has been destroyed")) : this.#s === "worker" && !R(this.#e.preferManagedMediaSource) ? Promise.reject(
      new Error("this browser cannot construct a MediaSource in a worker")
    ) : (this.stop(), this.#X(String(t), !0));
  }
  /**
   * Start a load. `decodable` is false to pass the video through whatever the
   * deinterlacer takes, which is how a stream decode mode cannot play is
   * loaded again.
   */
  #X(t, e) {
    const s = this.#t;
    this.#T = t, this.#u = null, this.#P = null, this.#m = 0, this.#j(), this.#x();
    const i = this.#r?.decodedVideo ?? null;
    if (this.#c = e && this.#e.softwareDecode !== !1 && i !== null, !this.#c && !this.#e.passthrough) {
      const a = new Error(
        this.#e.softwareDecode === !1 ? "the video cannot be decoded because softwareDecode is false, and passthrough is off" : "the video cannot be decoded because no deinterlacer with a decodedVideo input was given, and passthrough is off"
      ), o = new Promise((d, c) => {
        this.#f = { resolve: d, reject: c };
      });
      return queueMicrotask(() => {
        s === this.#t && this.#D(a);
      }), o;
    }
    !this.#c && this.#R && (this.#r?.destroy(), this.#r = null, this.#R = !1, this.#x()), this.#A = null, this.#E = p(), this.#S = this.#E;
    const r = this.#ct(), n = new Promise((a, o) => {
      this.#f = { resolve: a, reject: o };
    });
    if (this.#L("loading"), r.postMessage({
      type: "load",
      id: s,
      url: t,
      wasmUrl: this.#e.wasmUrl === void 0 ? null : String(this.#e.wasmUrl),
      recoveryInterval: this.#e.recoveryInterval,
      openGopRecovery: this.#e.openGopRecovery,
      splitFieldSamples: this.#e.splitFieldSamples,
      audioGainSteps: this.#e.audioGainSteps ?? 0,
      surroundAudioGainSteps: this.#e.surroundAudioGainSteps ?? this.#e.audioGainSteps ?? 0,
      video: this.#c ? "decode" : "passthrough",
      serviceId: this.#e.serviceId ?? null,
      sink: this.#s,
      preferManagedMediaSource: this.#e.preferManagedMediaSource ?? !1,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10
    }), this.#it(), this.#c && i) {
      i.onrelease = this.#Y;
      try {
        this.#nt(s);
      } catch (o) {
        return queueMicrotask(() => {
          s === this.#t && this.#D(l(o));
        }), n;
      }
      this.#q(), this.#Q(0);
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
      ), this.#w = setInterval(this.#B, 40);
    }
    return n;
  }
  /**
   * Decode mode: the AudioWorklet the sound plays through, and the element's
   * media interface answered from here for the length of the load.
   */
  #nt(t) {
    const e = new ht({
      report: (r) => {
        t === this.#t && this.#dt(r);
      },
      error: (r) => {
        t === this.#t && this.#D(r);
      },
      frame: (r) => {
        t === this.#t && this.#at(r);
      }
    }), s = new G(
      (r) => e.control({ type: "adjust", ratio: r })
    ), i = new z(this.video, {
      play: () => this.#H(),
      pause: () => e.control({ type: "pause" }),
      seek: (r) => this.#ot(r),
      rate: (r) => {
        e.control({ type: "rate", rate: r }), this.#B();
      },
      volume: (r) => e.control({ type: "volume", gain: r }),
      heard: () => e.clock.at(performance.now()),
      resume: () => e.resume()
    });
    e.control({ type: "rate", rate: i.rate }), e.control({ type: "volume", gain: i.gain }), e.control({ type: "dual-mono", sub: this.#W }), i.install(), this.#h = e, this.#y = i, this.#O = s, this.#U = null;
  }
  /** Hold the media clock to the display, for the refresh at `now`. */
  #at(t) {
    const e = this.#h, s = this.#y;
    this.#O.frame({
      now: t,
      at: (i) => e.clock.at(i),
      speed: e.clock.speed,
      step: this.#U,
      origin: this.#C,
      rate: s.rate,
      active: s.playing
    });
  }
  /**
   * Start the sound's epoch at media time `at`, held: it plays once both its
   * sound and its first picture are in (`#startIfReady`).
   */
  #Q(t) {
    this.#O?.reset(), this.#G = t, this.#N = !1, this.#_ = !1, this.#h.control({ type: "pause" }), this.#h.control({ type: "epoch", epoch: this.#M, at: t });
  }
  /** The viewer moved the playhead, in decode mode: a new epoch from `time`. */
  #ot(t) {
    if (this.#n === "idle" || this.#n === "error") return;
    const e = this.#y;
    e.readyState > u.Metadata && e.setReadyState(u.Metadata), this.#q(), this.#Q(t), this.#i?.postMessage({
      type: "seek",
      id: this.#t,
      time: t,
      epoch: this.#M
    });
  }
  /** Let the sound play, where the epoch has what it waits for and playback is wanted. */
  #H() {
    const t = this.#y;
    !t || !this.#N || !this.#_ || (t.seeked(), t.setReadyState(u.EnoughData), t.paused || this.#h.control({ type: "play" }));
  }
  /** What the worklet says it is doing, for the element and the start. */
  #dt(t) {
    const e = this.#y;
    if (!(!e || t.epoch !== this.#M))
      switch (t.state) {
        case "ready":
          if (this.#N) break;
          this.#N = !0, this.#H();
          break;
        case "playing":
          e.setReadyState(u.EnoughData), e.soundStarted(t.media);
          break;
        case "starved":
          e.soundStopped(t.media, !1), e.setReadyState(u.CurrentData);
          break;
        case "paused":
          e.soundStopped(t.media, !1);
          break;
        case "ended":
          this.#N || (this.#N = !0, this.#H()), e.soundStopped(t.media, !0);
          break;
      }
  }
  /** Give a picture's buffer back to the worker that made it. */
  #Y = (t) => {
    !this.#c || t.byteLength === 0 || this.#i?.postMessage(
      { type: "recycle", id: this.#t, data: t },
      [t]
    );
  };
  /** Forget the pictures held and ask for the ones at the playhead. */
  #q() {
    this.#M++, this.#r?.decodedVideo?.reset(), this.#B();
  }
  /** Ask for the pictures from the playhead to a little past it. */
  #B = () => {
    if (!this.#c) return;
    const t = this.video.currentTime, e = t + 0.3 * Math.max(1, this.video.playbackRate);
    this.#i?.postMessage({
      type: "need",
      id: this.#t,
      epoch: this.#M,
      from: t,
      until: e
    });
  };
  /** Show a picture of the current run, and hand back one of an older run. */
  #ut(t, e) {
    const s = this.#r?.decodedVideo;
    if (t !== this.#M || !s) {
      this.#Y(e.data);
      return;
    }
    const i = this.#A;
    (i?.width !== e.displayWidth || i?.height !== e.displayHeight) && (this.#A = {
      width: e.displayWidth,
      height: e.displayHeight
    }), this.#R = !0;
    try {
      s.push(e);
    } catch (n) {
      this.#I("error", { error: l(n) });
      return;
    }
    const r = e.interlaced ? e.repeatFirstField ? 3 : 2 : 1;
    if (this.#U = e.duration / r, this.#C = e.timestamp, !this.#_ && e.timestamp + e.duration > this.#G) {
      this.#_ = !0;
      const n = this.#y;
      n.readyState < u.CurrentData && n.setReadyState(u.CurrentData), this.#H();
    }
  }
  /** Abandon the current load. The player stays usable. */
  stop() {
    const t = this.#t;
    this.#t++, this.#P = null, this.#i?.postMessage({ type: "stop", id: t }), this.#rt(), this.#K(new Error("the load was stopped")), this.#L("idle");
  }
  /** Stop, and give up the worker. The player cannot be loaded again. */
  destroy() {
    if (!this.#v) {
      this.stop(), this.#v = !0, this.video.removeEventListener("seeking", this.#tt);
      for (const t of _)
        this.video.removeEventListener(t, this.#B);
      for (const t of A)
        this.video.removeEventListener(t, this.#et);
      this.#r?.destroy(), this.#r = null, this.#i?.terminate(), this.#i = null;
    }
  }
  addEventListener(t, e, s) {
    super.addEventListener(t, e, s);
  }
  removeEventListener(t, e, s) {
    super.removeEventListener(t, e, s);
  }
  #ct() {
    if (!this.#i) {
      const t = new Worker(
        this.#e.workerUrl ?? nt,
        {
          type: "module"
        }
      );
      t.onmessage = this.#lt, t.onerror = (e) => this.#D(new Error(e.message || "the worker failed")), this.#i = t;
    }
    return this.#i;
  }
  #lt = (t) => {
    const e = t.data;
    if (e.id === this.#t)
      switch (e.type) {
        case "handle":
          e.managed && this.#J(), this.video.srcObject = e.handle, this.#V("attached", p());
          break;
        case "open":
          this.#ft(e.mimeCodec, e.data);
          break;
        case "video-config":
          this.#c || this.#F(
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
          this.#L("converting"), this.#K(null);
          break;
        case "seekable":
          this.#u = e.duration, this.#o?.setDuration(e.duration), this.#y?.setDuration(e.duration), this.#I("seekable", { duration: e.duration });
          break;
        case "buffered":
          this.#y?.setBuffered(e.range);
          break;
        case "reset":
          this.#j(), this.#o?.reset(), this.#c && this.#q();
          break;
        case "picture":
          this.#ut(e.epoch, e.picture);
          break;
        case "pictures-end":
          this.#c && e.epoch === this.#M && (this.#r?.decodedVideo?.finish(), this.#_ || (this.#_ = !0, this.#H()));
          break;
        case "no-aac-audio":
          this.#kt();
          break;
        case "scans":
          this.#ht(e.scans);
          break;
        case "services":
          this.#I("services", e.services);
          break;
        case "audio":
          this.#b = e.audio, this.#I("audio", e.audio);
          break;
        case "private_stream_1":
        case "private_stream_2":
          this.#I(e.type, e.stream);
          break;
        case "mark":
          this.#V(e.name, e.at);
          break;
        case "seek":
          this.#Z(e.time);
          break;
        case "hold":
          this.#m = e.seconds, this.#o?.holdStart(e.seconds);
          break;
        case "progress":
          e.totalBytes === null && this.#y?.setDuration(Number.POSITIVE_INFINITY), this.#I("progress", {
            bytesRead: e.bytesRead,
            totalBytes: e.totalBytes
          });
          break;
        case "stats":
          this.#I("stats", e.stats);
          break;
        case "blocked":
          this.#L(e.blocked ? "buffer-full" : "converting");
          break;
        case "finish":
          this.#gt();
          break;
        case "completed":
          this.#L("completed"), this.#s === "worker" && this.#z();
          break;
        case "error":
          this.#D(new Error(e.message));
          break;
      }
  };
  /** Open a MediaSource here, for browsers that cannot have one in a worker. */
  #ft(t, e) {
    const s = this.#t;
    let i;
    try {
      i = this.#o ?? this.#pt(s), i.holdStart(this.#m);
    } catch (r) {
      this.#D(l(r));
      return;
    }
    i.open(t, e).then(
      // The worker is waiting on flow to know the open succeeded. Going
      // through ready() rather than saying true covers the case where the
      // append filled the queue on its own.
      () => i.ready().then(() => this.#st(s, { type: "flow", id: s, ready: !0 })),
      (r) => {
        s === this.#t && this.#D(l(r));
      }
    );
  }
  #pt(t) {
    const e = new U({
      preferManaged: this.#e.preferManagedMediaSource,
      queueHighWaterMark: this.#e.queueHighWaterMark ?? 33554432,
      maxAheadSeconds: this.#e.maxAheadSeconds ?? 8,
      keepBehindSeconds: this.#e.keepBehindSeconds ?? 10,
      seek: (s) => this.#Z(s),
      onMark: (s) => this.#V(s, p()),
      onReadyChange: (s) => this.#st(t, { type: "flow", id: t, ready: s }),
      onBlocked: (s) => {
        t === this.#t && this.#L(s ? "buffer-full" : "converting");
      },
      onError: (s) => {
        t === this.#t && this.#D(s);
      }
    });
    return this.#o = e, this.#a = URL.createObjectURL(e.mediaSource), e.managed ? this.#mt(this.#a) : this.video.src = this.#a, this.#V("attached", p()), this.#u !== null && e.setDuration(this.#u), e;
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
  #mt(t) {
    this.video.removeAttribute("src"), this.#J();
    const e = document.createElement("source");
    e.type = "video/mp4", e.src = t, this.video.append(e), this.#p = e, this.video.load();
  }
  /**
   * Rule out AirPlay, which a managed source cannot be sent over and which
   * Safari will not open one until the element has given up. The element
   * belongs to whoever made it, so it is put back on the way out -- unless it
   * was already off, and theirs to keep.
   */
  #J() {
    this.video.disableRemotePlayback || (this.video.disableRemotePlayback = !0, this.#l = !0);
  }
  #gt() {
    const t = this.#t, e = this.#o;
    e && e.finish().then(
      () => {
        t === this.#t && this.#z();
      },
      (s) => {
        t === this.#t && this.#D(l(s));
      }
    );
  }
  /**
   * Put the playhead forward to where the media begins, for the sink. That is
   * no seek of the viewer's: the pictures sent for the request at the old
   * position begin there, so the run they belong to goes on, and the sound
   * held back for them has not been let into the element any earlier.
   */
  #Z(t) {
    if (this.#y) {
      this.#y.place(t);
      return;
    }
    this.video.currentTime >= t || (this.video.currentTime = t, this.#P = this.video.currentTime);
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
  #tt = () => {
    if (this.#y) return;
    const t = this.#P === this.video.currentTime;
    if (this.#P = null, t || this.#n === "idle" || this.#n === "error" || (this.#c && this.#q(), this.#u === null)) return;
    const e = this.video.currentTime;
    this.#St(e) || (this.#L("seeking"), this.#j(), this.#it(), this.#i?.postMessage({
      type: "seek",
      id: this.#t,
      time: e,
      epoch: null
    }));
  };
  #et = (t) => {
    this.#n !== "idle" && (this.#V(t.type, p()), t.type === "waiting" && !this.#c && this.#Et());
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
  #Et() {
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
  #V(t, e) {
    if (this.#E === 0) return;
    const s = e - this.#E, i = Math.max(0, e - this.#S);
    this.#S = Math.max(this.#S, e), this.#I("timing", { name: t, sinceLoad: s, sincePrevious: i });
  }
  #St(t) {
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
  #vt = () => {
    const t = this.video.currentTime;
    this.#s === "main" && !this.#c ? this.#o?.setCurrentTime(t) : this.#i?.postMessage({
      type: "time",
      id: this.#t,
      currentTime: t
    });
  };
  #st(t, e) {
    t === this.#t && this.#i?.postMessage(e);
  }
  #it() {
    this.#d === null && (this.#d = setInterval(
      this.#vt,
      200
    ));
  }
  #z() {
    this.#d !== null && (clearInterval(this.#d), this.#d = null);
  }
  /**
   * Load the same input again with the video passed through, for a stream
   * that decode mode cannot play, or fail the load where passthrough is off.
   * The load's promise settles as the new one does.
   */
  #kt() {
    if (!this.#c) {
      this.#D(
        new Error("the worker refused to decode a load it passes through")
      );
      return;
    }
    if (!this.#e.passthrough) {
      this.#D(
        new Error(
          "the video cannot be decoded because the stream has no AAC sound, which decoding needs, and passthrough is off"
        )
      );
      return;
    }
    const t = this.#f;
    this.#f = null, this.stop(), this.#X(this.#T, !1).then(t?.resolve, (s) => t?.reject(s));
  }
  #rt() {
    this.#z(), this.#w !== null && clearInterval(this.#w), this.#w = null;
    const t = this.#c;
    this.#c = !1, t && this.#r?.decodedVideo?.reset(), this.#j(), this.#o?.close(), this.#o = null, this.#h?.close(), this.#h = null, this.#O = null, this.#y?.uninstall(), this.#y = null, this.#a && URL.revokeObjectURL(this.#a), this.#a = null, this.#p?.remove(), this.#p = null, this.#l && (this.video.disableRemotePlayback = !1, this.#l = !1), this.video.removeAttribute("src"), this.video.srcObject = null, this.video.load();
  }
  #D(t) {
    this.#rt(), this.#L("error"), this.#K(t), this.#I("error", { error: t });
  }
  #K(t) {
    const e = this.#f;
    e && (this.#f = null, t ? e.reject(t) : e.resolve());
  }
  #L(t) {
    this.#n !== t && (this.#n = t, this.#I("statechange", { state: t }));
  }
  #I(t, e) {
    this.dispatchEvent(new CustomEvent(t, { detail: e }));
  }
}
export {
  ut as DEFAULT_KEEP_BEHIND_SECONDS,
  dt as DEFAULT_MAX_AHEAD_SECONDS,
  ot as DEFAULT_QUEUE_HIGH_WATER_MARK,
  pt as Mpeg2TsPlayer,
  lt as requiresManagedMediaSource,
  ct as supportsManagedMediaSource,
  ft as supportsPassthrough,
  R as supportsWorkerMediaSource
};
//# sourceMappingURL=index.js.map
