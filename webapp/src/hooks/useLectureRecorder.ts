import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES } from "../api/studyPackage";

/* Record a lecture in the browser, then hand the finished file to whoever
 * asked — the capture bar sends it down the same upload → notes path as a
 * recording picked from disk. Nothing is transcribed live; that would need a
 * streaming provider (see WAITINGONLEDGER.md).
 *
 * Speech at 16 kbps Opus is clear and keeps a long lecture under the 10 MB
 * upload limit (about 80 minutes). Recording stops by itself just short of
 * the limit rather than producing a file the upload would refuse. */

export const RECORDING_BITS_PER_SECOND = 16_000;
export const RECORDING_LIMIT_BYTES = Math.floor(MAX_UPLOAD_BYTES * 0.95);

/* Formats the AI provider documents first; WebM (all Chrome offers on some
   versions) last. */
const FORMATS = [
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
] as const;

export type RecordingFormat = (typeof FORMATS)[number];

export function pickRecordingFormat(
  isSupported: (mime: string) => boolean,
): RecordingFormat | null {
  return FORMATS.find((format) => isSupported(format.mime)) ?? null;
}

export function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function lectureTitle(startedAt: Date): string {
  const day = startedAt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const time = startedAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Lecture, ${day} ${time}`;
}

export interface FinishedRecording {
  file: File;
  title: string;
  /** True when the size limit stopped it rather than the student. */
  hitLimit: boolean;
}

export function useLectureRecorder(
  onFinished: (recording: FinishedRecording) => void,
) {
  const [recording, setRecording] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const discardRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const start = useCallback(async () => {
    setError(null);
    const format = canRecordAudio()
      ? pickRecordingFormat((mime) => MediaRecorder.isTypeSupported(mime))
      : null;
    if (!format) {
      setError(
        "This browser can't record audio. Record on your phone and upload the file instead.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true },
      });
    } catch {
      setError(
        "Learnora couldn't use your microphone. Allow it in your browser's site settings, then try again.",
      );
      return;
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: format.mime,
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    let size = 0;
    let hitLimit = false;
    const startedAt = new Date();
    const timer = window.setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 500);

    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunks.push(event.data);
      size += event.data.size;
      setBytes(size);
      if (size >= RECORDING_LIMIT_BYTES && recorder.state === "recording") {
        hitLimit = true;
        recorder.stop();
      }
    };
    recorder.onstop = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      setRecording(false);
      if (discardRef.current || chunks.length === 0) return;
      const type = format.mime.split(";")[0];
      const title = lectureTitle(startedAt);
      const file = new File(chunks, `${title.replace(/[^\w ,-]/g, "-")}.${format.ext}`, {
        type,
      });
      onFinishedRef.current({ file, title, hitLimit });
    };

    discardRef.current = false;
    recorderRef.current = recorder;
    setElapsedSecs(0);
    setBytes(0);
    setRecording(true);
    recorder.start(1000);
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const discard = useCallback(() => {
    discardRef.current = true;
    stop();
  }, [stop]);

  /* Leaving the page mid-lecture would lose the recording: warn, and release
     the microphone if the component goes away regardless. */
  useEffect(() => {
    if (!recording) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording]);

  useEffect(
    () => () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
    [],
  );

  return { recording, elapsedSecs, bytes, error, start, stop, discard };
}
