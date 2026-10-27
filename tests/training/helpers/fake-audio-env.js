// 実際のAudioContext・setTimeoutを使わず、時計とタイマーを自分で進められる疑似環境(訓練のテスト用)。
// tests/functional-pitch/trial-timeline.test.js の疑似環境と同じ考え方。
// WAVの長さはファイル名で決める(仮音源と同じ: 調セットアップ5.0秒、出題音3.0秒、フィードバック3.0秒)。
export function createFakeAudioEnv({ startAudioSeconds = 10, failSrc = null } = {}) {
  let wallMs = 0;
  let audioMs = startAudioSeconds * 1000;
  let nextId = 1;
  const timers = new Map();
  const loaded = [];
  const scheduled = []; // { src, when }
  const stopped = [];

  const durationFor = (src) => (src.includes("-setup-") ? 5.0 : 3.0);

  return {
    audioContextTimeFn: () => audioMs / 1000,
    setTimeoutFn: (fn, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: Math.round((wallMs + delayMs) * 1000) / 1000, fn });
      return id;
    },
    clearTimeoutFn: (id) => { timers.delete(id); },
    loadAudioBufferFn: (src) => {
      loaded.push(src);
      if (failSrc && src.includes(failSrc)) return Promise.reject(new Error("読み込めません"));
      return Promise.resolve({ src, duration: durationFor(src) });
    },
    scheduleAudioBufferFn: (buffer, when) => {
      scheduled.push({ src: buffer.src, when });
      return { source: { stop: () => stopped.push(buffer.src) }, startedAt: when };
    },
    // 壁時計と音声時計を一緒に進め、期限の来たタイマーを順に発火する。
    tick(seconds) {
      const target = wallMs + seconds * 1000;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        audioMs += timer.at - wallMs;
        wallMs = timer.at;
        timer.fn();
      }
      audioMs += target - wallMs;
      wallMs = target;
    },
    loaded,
    scheduled,
    stopped,
    audioOptions() {
      return {
        soundsBasePath: "S/",
        loadAudioBufferFn: this.loadAudioBufferFn,
        scheduleAudioBufferFn: this.scheduleAudioBufferFn,
        audioContextTimeFn: this.audioContextTimeFn,
        setTimeoutFn: this.setTimeoutFn,
        clearTimeoutFn: this.clearTimeoutFn,
      };
    },
  };
}

export async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

export function approx(actual, expected) {
  if (Math.abs(actual - expected) > 1e-6) throw new Error(`expected ~${expected}, got ${actual}`);
}
