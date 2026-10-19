/**
 * Voice: browser Web Speech API by default (speech-to-text + text-to-speech, nothing leaves the device
 * except what the browser's own recogniser does). Optional Sarvam AI for Telugu via our backend.
 */
import { api } from "./api";
import { useStore } from "./store";

type Lang = "en" | "te";

function settings() {
  return useStore.getState().settings;
}

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  currentAudio?.pause();
  currentAudio = null;
}

export async function speak(text: string, lang?: Lang): Promise<void> {
  const st = settings();
  if (!text || st?.voice_on === false || st?.mute) return;
  stopSpeaking();
  const language: Lang = lang ?? (st?.language === "te" ? "te" : "en");
  if (language === "te" && st?.voice_provider === "sarvam") {
    try {
      const r = await api.post<{ audio_base64: string; mime: string }>("/api/voice/tts", { text, lang: "te-IN" });
      currentAudio = new Audio(`data:${r.mime};base64,${r.audio_base64}`);
      await currentAudio.play();
      return;
    } catch {
      /* fall back to browser voice */
    }
  }
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language === "te" ? "te-IN" : "en-IN";
      u.rate = 0.92;
      u.pitch = 1.15;
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((v) => v.lang === u.lang) ?? voices.find((v) => v.lang.startsWith(language === "te" ? "te" : "en"));
      if (v) u.voice = v;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

export function canListen(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition) || Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Listen once. Records audio in parallel (so the parent can replay her exact words) and returns
 * { text, audio }. Telugu + Sarvam: transcribes the recording on the server.
 */
export function listen(onPartial?: (t: string) => void): { stop: () => void; result: Promise<{ text: string; audio: Blob | null }> } {
  const st = settings();
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  const useSarvam = st?.language === "te" && st?.voice_provider === "sarvam";
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let rec: Recognition | null = null;
  let stopped = false;
  let text = "";

  const result = new Promise<{ text: string; audio: Blob | null }>((resolve) => {
    let recDone = !Ctor || useSarvam;
    let audioDone = false;
    let audio: Blob | null = null;
    const finish = async () => {
      if (!(recDone && audioDone)) return;
      if (useSarvam && audio) {
        try {
          const fd = new FormData();
          fd.append("file", audio, "speech.webm");
          fd.append("lang", "te-IN");
          text = (await api.form<{ text: string }>("/api/voice/stt", fd)).text;
        } catch {
          /* ignore */
        }
      }
      resolve({ text: text.trim(), audio });
    };

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          audio = chunks.length ? new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }) : null;
          audioDone = true;
          void finish();
        };
        recorder.start();
        if (stopped) recorder.stop();
      })
      .catch(() => {
        audioDone = true;
        void finish();
      }) ?? (audioDone = true);

    if (Ctor && !useSarvam) {
      rec = new Ctor();
      rec.lang = st?.language === "te" ? "te-IN" : "en-IN";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        text = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join(" ");
        onPartial?.(text);
      };
      rec.onerror = () => undefined;
      rec.onend = () => {
        recDone = true;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        void finish();
      };
      try {
        rec.start();
      } catch {
        recDone = true;
      }
    }
  });

  return {
    stop: () => {
      stopped = true;
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
    result,
  };
}
