/* Import a file from Google Drive through the Google Picker.
 *
 * Only the `drive.file` scope is requested, so Learnora can read exactly the
 * files the student picks and nothing else in their Drive. The client ID, API
 * key and project number are public browser values (the key is restricted to
 * our origins in Google Cloud); there is no client secret in the app. */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined;

export const GOOGLE_DRIVE_ENABLED = Boolean(CLIENT_ID && API_KEY && APP_ID);

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";

/* Google Docs have no bytes to download; they are exported to a type the
   study pipeline already reads. */
const NATIVE_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/pdf", ext: "pdf" },
  "application/vnd.google-apps.presentation": { mime: "application/pdf", ext: "pdf" },
  "application/vnd.google-apps.spreadsheet": { mime: "text/csv", ext: "csv" },
};

const PICK_MIME = [
  "application/pdf",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "image/jpeg",
  "image/png",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
].join(",");

export class DriveImportError extends Error {}

/* Minimal shapes for the two Google globals; they ship no bundled types. */
interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}
interface PickerDoc {
  id: string;
  name: string;
  mimeType: string;
}
interface PickerBuilder {
  setAppId(id: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  setCallback(cb: (data: Record<string, unknown>) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface GoogleGlobals {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string; error?: string }) => void;
        error_callback?: (e: { type: string }) => void;
      }): TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: unknown) => { setMimeTypes(m: string): unknown };
    ViewId: { DOCS: unknown };
    Action: { PICKED: string; CANCEL: string };
  };
}
declare global {
  interface Window {
    google?: GoogleGlobals;
    gapi?: { load(name: string, cb: () => void): void };
  }
}

const loading = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading.delete(src);
      reject(new DriveImportError("Couldn't reach Google. Check your connection and try again."));
    };
    document.head.appendChild(el);
  });
  loading.set(src, promise);
  return promise;
}

async function loadPicker(): Promise<void> {
  await Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)]);
  await new Promise<void>((resolve) => window.gapi!.load("picker", resolve));
}

function requestToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: SCOPE,
      callback: (r) =>
        r.access_token
          ? resolve(r.access_token)
          : reject(new DriveImportError("Google didn't give Learnora access to Drive.")),
      error_callback: () =>
        reject(new DriveImportError("The Google sign-in window was closed before it finished.")),
    });
    client.requestAccessToken();
  });
}

function pick(token: string): Promise<PickerDoc | null> {
  return new Promise((resolve) => {
    const g = window.google!.picker;
    const view = new g.DocsView(g.ViewId.DOCS);
    view.setMimeTypes(PICK_MIME);
    new g.PickerBuilder()
      .setAppId(APP_ID!)
      .setDeveloperKey(API_KEY!)
      .setOAuthToken(token)
      .addView(view)
      .setCallback((data) => {
        if (data.action === g.Action.PICKED) {
          resolve((data.docs as PickerDoc[])[0] ?? null);
        } else if (data.action === g.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}

async function download(doc: PickerDoc, token: string, maxBytes: number): Promise<File> {
  const native = NATIVE_EXPORT[doc.mimeType];
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}`;
  const url = native
    ? `${base}/export?mimeType=${encodeURIComponent(native.mime)}`
    : `${base}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new DriveImportError(
      res.status === 403 && native
        ? "That Google file is too large to export. Download it as a PDF and upload it instead."
        : "Couldn't download that file from Drive. Try another one.",
    );
  }
  const blob = await res.blob();
  if (blob.size > maxBytes) {
    throw new DriveImportError(
      `That file is over ${Math.round(maxBytes / (1024 * 1024))}MB. Pick a smaller one.`,
    );
  }
  const type = native?.mime ?? doc.mimeType;
  const name =
    native && !doc.name.toLowerCase().endsWith(`.${native.ext}`)
      ? `${doc.name}.${native.ext}`
      : doc.name;
  return new File([blob], name, { type });
}

/* Resolves to the chosen file, or null if the student closed the picker. */
export async function importFromDrive(maxBytes: number): Promise<File | null> {
  if (!GOOGLE_DRIVE_ENABLED) {
    throw new DriveImportError("Google Drive import isn't set up yet.");
  }
  await loadPicker();
  const token = await requestToken();
  const doc = await pick(token);
  return doc ? download(doc, token, maxBytes) : null;
}
