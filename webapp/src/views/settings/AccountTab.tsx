import { useId, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import {
  InlineFeedback,
  type FeedbackState,
} from "../../components/InlineFeedback";
import { useAuth } from "../../context/auth";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useExportData } from "../../hooks/useDataAdmin";
import { useUpdateEmail, useUpdateProfile } from "../../hooks/useAuthActions";
import {
  useProfileDetails,
  useRemoveAvatar,
  useUpdateBio,
  useUploadAvatar,
} from "../../hooks/useProfileDetails";
import { initialsFor } from "./profile";
import styles from "./settings.module.css";

const BIO_MAX = 280;

export function AccountTab() {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const { showToast } = useToast();
  const updateProfile = useUpdateProfile();
  const updateEmail = useUpdateEmail();
  const exportData = useExportData();
  const profileDetails = useProfileDetails();
  const updateBio = useUpdateBio();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const bioId = useId();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const email = user?.email ?? "—";
  const metadataName =
    (user?.user_metadata?.full_name as string | undefined) || "Student";
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const [bioOpen, setBioOpen] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioFeedback, setBioFeedback] = useState<FeedbackState | null>(null);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await uploadAvatar.mutateAsync(file);
      await updateProfile.mutateAsync({ avatar_url: url });
      showToast("Photo updated.");
    } catch (err) {
      showToast(`Could not update your photo. ${(err as Error).message}`, {
        error: true,
      });
    }
  }

  async function onRemoveAvatar() {
    const ok = await confirm("Remove your profile photo?", {
      title: "Remove Photo?",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await removeAvatar.mutateAsync();
      await updateProfile.mutateAsync({ avatar_url: null });
      showToast("Photo removed.");
    } catch (err) {
      showToast(`Could not remove your photo. ${(err as Error).message}`, {
        error: true,
      });
    }
  }

  async function onSaveBio() {
    if (bioDraft.length > BIO_MAX) {
      setBioFeedback({
        kind: "error",
        message: `Keep it under ${BIO_MAX} characters.`,
      });
      return;
    }
    try {
      await updateBio.mutateAsync(bioDraft);
      setBioFeedback({ kind: "success", message: "Bio updated." });
      setBioOpen(false);
    } catch (err) {
      setBioFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  /* Keep the saved name local so the heading updates before session refresh. */
  const [name, setName] = useState(metadataName);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(metadataName);
  const [nameFeedback, setNameFeedback] = useState<FeedbackState | null>(null);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState | null>(
    null,
  );

  async function onSaveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameFeedback({ kind: "error", message: "Name cannot be empty." });
      return;
    }
    try {
      await updateProfile.mutateAsync({ full_name: trimmed });
      setName(trimmed);
      setNameFeedback({ kind: "success", message: "Display name updated." });
      setNameOpen(false);
    } catch (err) {
      setNameFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  async function onSubmitEmail() {
    const next = emailDraft.trim();
    if (!next || !next.includes("@")) {
      setEmailFeedback({
        kind: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }
    if (next === email) {
      setEmailFeedback({
        kind: "error",
        message: "This is already your current email.",
      });
      return;
    }
    try {
      await updateEmail.mutateAsync(next);
      setEmailFeedback({
        kind: "success",
        message: `Confirmation email sent to ${next}. Check your inbox.`,
      });
      setEmailDraft("");
    } catch (err) {
      setEmailFeedback({ kind: "error", message: (err as Error).message });
    }
  }

  /* A failed export was the quietest failure in the app: the student
     confirms a dialog, the dialog closes, and nothing whatsoever happens —
     indistinguishable from a browser that blocked the download. Success needs
     no toast (a file appears), so only the failure is announced. */
  function reportExportFailure(err: Error) {
    showToast(`Could not export your data. ${err.message}`, { error: true });
  }

  async function onExportHtml() {
    const ok = await confirm(
      "Download an interactive HTML report of your study data?",
      { title: "Export Report?", confirmText: "Export" },
    );
    if (ok)
      exportData.mutate({ format: "html" }, { onError: reportExportFailure });
  }

  async function onExportCsv() {
    const ok = await confirm(
      "Download a CSV copy of all your study logs and tasks to your device?",
      { title: "Export Data?", confirmText: "Export" },
    );
    if (ok)
      exportData.mutate({ format: "csv" }, { onError: reportExportFailure });
  }

  return (
    <>
      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-profile-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="user" size={18} />
          </span>
          <div>
            <h3 id="settings-profile-heading">Profile</h3>
            <p>Name and sign-in email</p>
          </div>
        </div>

        <div className={styles.avatar}>
          <div className={styles.avatarCircle} aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initialsFor(name)}
          </div>
          <div className={styles.avatarInfo}>
            <h4>{name}</h4>
            <p>{email}</p>
          </div>
          <div className={styles.avatarUpload}>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => void onPickAvatar(e)}
            />
            <Button
              size="sm"
              disabled={uploadAvatar.isPending}
              onClick={() => avatarInputRef.current?.click()}
            >
              <Icon name="upload-cloud" size={16} />
              {uploadAvatar.isPending
                ? "Uploading..."
                : avatarUrl
                  ? "Change Photo"
                  : "Upload Photo"}
            </Button>
            {avatarUrl && (
              <Button
                size="sm"
                variant="secondary"
                disabled={removeAvatar.isPending}
                onClick={() => void onRemoveAvatar()}
              >
                <Icon name="trash" size={16} />
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id="settings-name-label">
              Display Name
            </span>
            <p className={styles.fieldDesc}>
              This is the name shown in your workspace
            </p>
          </div>
          <div className={styles.fieldAction}>
            <Button
              size="sm"
              aria-expanded={nameOpen}
              aria-controls="settings-name-form"
              onClick={() => {
                setNameOpen((open) => !open);
                setNameDraft(name);
                setNameFeedback(null);
              }}
            >
              {nameOpen ? "Cancel" : "Edit"}
            </Button>
          </div>
        </div>

        {nameOpen && (
          <div className={styles.inlineForm} id="settings-name-form">
            <div className={styles.inputRow}>
              <input
                type="text"
                aria-labelledby="settings-name-label"
                placeholder="Your full name"
                autoComplete="name"
                autoFocus
                maxLength={80}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => void onSaveName()}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
        {nameFeedback && <InlineFeedback {...nameFeedback} />}

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id={bioId}>
              Bio
            </span>
            <p className={styles.fieldDesc}>
              Shown to friends when they decide whether to accept your
              request. Not shown on the leaderboard or anywhere else.
            </p>
          </div>
          <div className={styles.fieldAction}>
            <Button
              size="sm"
              aria-expanded={bioOpen}
              aria-controls="settings-bio-form"
              onClick={() => {
                setBioOpen((open) => !open);
                setBioDraft(profileDetails.data?.bio ?? "");
                setBioFeedback(null);
              }}
            >
              {bioOpen ? "Cancel" : profileDetails.data?.bio ? "Edit" : "Add"}
            </Button>
          </div>
        </div>

        {bioOpen && (
          <div className={styles.inlineForm} id="settings-bio-form">
            <div className={styles.inputRow}>
              <textarea
                aria-labelledby={bioId}
                placeholder="A sentence or two about you"
                autoFocus
                maxLength={BIO_MAX}
                rows={3}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => void onSaveBio()}
                disabled={updateBio.isPending}
              >
                {updateBio.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className={styles.fieldDesc}>
              {bioDraft.length}/{BIO_MAX}
            </p>
          </div>
        )}
        {bioFeedback && <InlineFeedback {...bioFeedback} />}

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText} id="settings-email-label">
              Email Address
            </span>
            <p className={styles.fieldDesc}>Used for login and notifications</p>
          </div>
          <div className={styles.fieldAction}>
            <span className={styles.fieldValue}>{email}</span>
            <Button
              size="sm"
              aria-expanded={emailOpen}
              aria-controls="settings-email-form"
              onClick={() => {
                setEmailOpen((open) => !open);
                setEmailFeedback(null);
              }}
            >
              {emailOpen ? "Cancel" : "Change"}
            </Button>
          </div>
        </div>

        {emailOpen && (
          <div className={styles.inlineForm} id="settings-email-form">
            <div className={styles.inputRow}>
              <input
                type="email"
                aria-labelledby="settings-email-label"
                placeholder="New email address"
                autoComplete="email"
                autoFocus
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => void onSubmitEmail()}
                disabled={updateEmail.isPending}
              >
                {updateEmail.isPending ? "Sending..." : "Update"}
              </Button>
            </div>
          </div>
        )}
        {emailFeedback && <InlineFeedback {...emailFeedback} />}
      </Card>

      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
        aria-labelledby="settings-export-heading"
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="download" size={18} />
          </span>
          <div>
            <h3 id="settings-export-heading">Export Data</h3>
            <p>Download a copy of your study data</p>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>Interactive Report</span>
            <p className={styles.fieldDesc}>
              Download an HTML report with study stats, charts, and summaries
            </p>
          </div>
          <div className={styles.fieldAction}>
            <Button size="sm" onClick={() => void onExportHtml()}>
              <Icon name="download" size={16} /> Export Report
            </Button>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <span className={styles.labelText}>CSV Export</span>
            <p className={styles.fieldDesc}>
              Download tasks, exams, and study logs for a spreadsheet
            </p>
          </div>
          <div className={styles.fieldAction}>
            <Button size="sm" onClick={() => void onExportCsv()}>
              <Icon name="download" size={16} /> Export CSV
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
