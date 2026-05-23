"use client";

import type {
  WorldSkinAssetFileName,
  WorldSkinBuiltinSlug,
  WorldSkinUploaderStatus
} from "@3dspace/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  clearStoredUploaderPassword,
  fetchWorldSkinUploaderStatus,
  getStoredUploaderPassword,
  uploadWorldSkinFile,
  verifyWorldSkinUploaderPassword,
  WORLD_SKIN_FILE_SPECS,
  WORLD_SKIN_SLUG_OPTIONS,
  WORLD_SKIN_UPLOAD_FILE_ORDER,
  worldSkinUploadAccept,
  WorldSkinUploaderError
} from "../../lib/worldSkinUploader";
import styles from "./WorldSkinUploader.module.css";

export function WorldSkinUploader() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [slug, setSlug] = useState<WorldSkinBuiltinSlug>("default-theater");
  const [version, setVersion] = useState(1);
  const [status, setStatus] = useState<WorldSkinUploaderStatus | null>(null);
  const [busyFile, setBusyFile] = useState<WorldSkinAssetFileName | null>(null);
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const activePassword = authenticated ? getStoredUploaderPassword() : "";

  const refreshStatus = useCallback(async () => {
    if (!activePassword) return;
    setError("");
    try {
      const next = await fetchWorldSkinUploaderStatus({
        password: activePassword,
        slug,
        version
      });
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load upload status.");
      setStatus(null);
    }
  }, [activePassword, slug, version]);

  useEffect(() => {
    const stored = getStoredUploaderPassword();
    if (stored) {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (authenticated && activePassword) {
      void refreshStatus();
    }
  }, [authenticated, activePassword, refreshStatus]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setError("");
    try {
      await verifyWorldSkinUploaderPassword(password);
      setAuthenticated(true);
      setPassword("");
    } catch (err) {
      const message =
        err instanceof WorldSkinUploaderError && err.statusCode === 404
          ? "Uploader is not configured on the API (set WORLD_SKIN_UPLOADER_PASSWORD)."
          : err instanceof Error
            ? err.message
            : "Login failed.";
      setError(message);
      setAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    clearStoredUploaderPassword();
    setAuthenticated(false);
    setStatus(null);
    setError("");
  }

  async function handleUpload(fileName: WorldSkinAssetFileName, file: File) {
    if (!activePassword) return;
    setBusyFile(fileName);
    setError("");
    try {
      const result = await uploadWorldSkinFile({
        password: activePassword,
        slug,
        version,
        fileName,
        file
      });
      await refreshStatus();
      void result.storageKey;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Upload failed for ${fileName}.`);
    } finally {
      setBusyFile(null);
    }
  }

  if (!authenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.kicker}>Operator tool</p>
          <h1 className={styles.title}>World skin R2 uploader</h1>
          <p className={styles.lead}>
            Upload skin assets to Cloudflare R2 — <code>panorama.webp</code>, <code>floor.webp</code>,{" "}
            <code>thumbnail.png</code>, and optional files. See{" "}
            <code>docs/planning/new-features/WORLD_SKIN_PANORAMA_SPEC.md</code>.
          </p>
          <form className={styles.card} onSubmit={handleLogin}>
            <label className={styles.label} htmlFor="uploader-password">
              Password
            </label>
            <input
              id="uploader-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.button} type="submit" disabled={authLoading || !password}>
              {authLoading ? "Checking…" : "Unlock uploader"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <p className={styles.kicker}>Operator tool</p>
        <h1 className={styles.title}>World skin R2 uploader</h1>
        <p className={styles.lead}>
          Files are written to object storage at the prefix below. After upload, wire the same{" "}
          <code>storageKey</code> in <code>builtin.json</code> (Phase 2).
        </p>

        <div className={styles.card}>
          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="skin-slug">
                Skin
              </label>
              <select
                id="skin-slug"
                className={styles.select}
                value={slug}
                onChange={(event) => setSlug(event.target.value as WorldSkinBuiltinSlug)}
              >
                {WORLD_SKIN_SLUG_OPTIONS.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label} htmlFor="skin-version">
                Version
              </label>
              <input
                id="skin-version"
                className={styles.input}
                type="number"
                min={1}
                max={99}
                value={version}
                onChange={(event) => setVersion(Number(event.target.value) || 1)}
              />
            </div>
          </div>

          {status ? (
            <p className={styles.prefix}>
              R2 prefix: <strong>{status.r2Prefix}</strong>
            </p>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          {WORLD_SKIN_UPLOAD_FILE_ORDER.map((fileName) => {
            const spec = WORLD_SKIN_FILE_SPECS[fileName]!;
            const row = status?.files.find((entry) => entry.fileName === fileName);
            return (
              <div key={fileName} className={styles.fileRow}>
                <div className={styles.fileMeta}>
                  <p className={styles.fileName}>
                    {spec.label}
                    <code> {fileName}</code>
                    {spec.required ? (
                      <span className={styles.badgeRequired}>Required</span>
                    ) : null}
                    {row?.uploaded ? <span className={styles.badgeOk}>On R2</span> : (
                      <span className={styles.badgeMissing}>Missing</span>
                    )}
                  </p>
                  <p className={styles.fileHint}>{spec.hint}</p>
                  {row?.storageKey ? (
                    <p className={styles.fileHint}>
                      <code>{row.storageKey}</code>
                    </p>
                  ) : null}
                </div>
                <label className={styles.buttonSecondary}>
                  {busyFile === fileName ? "Uploading…" : "Choose file"}
                  <input
                    type="file"
                    hidden
                    accept={worldSkinUploadAccept(fileName)}
                    disabled={busyFile !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void handleUpload(fileName, file);
                    }}
                  />
                </label>
              </div>
            );
          })}

          <div className={styles.actions}>
            <button className={styles.buttonSecondary} type="button" onClick={() => void refreshStatus()}>
              Refresh status
            </button>
            <button className={styles.buttonSecondary} type="button" onClick={handleLogout}>
              Lock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
