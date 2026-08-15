import { useEffect, useState } from "react";
import { api, getBackendUrl } from "../api.js";

export default function AllureReport({ channel }) {
  const projectId = channel?.external?.projectId;
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let version = "";
    let checking = false;
    setSrc("");
    setError("");
    if (!projectId) return undefined;

    async function loadReport() {
      const [{ url }, current] = await Promise.all([
        api.getAllureReportUrl(projectId),
        api.getAllureReportVersion(projectId),
      ]);
      if (cancelled) return;
      version = current.version;
      setSrc(`${getBackendUrl() || window.location.origin}${url}`);
    }

    async function checkForUpdate() {
      if (checking || cancelled) return;
      checking = true;
      try {
        const current = await api.getAllureReportVersion(projectId);
        if (!cancelled && current.version && version && current.version !== version) {
          version = current.version;
          const { url } = await api.getAllureReportUrl(projectId);
          if (!cancelled) setSrc(`${getBackendUrl() || window.location.origin}${url}`);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        checking = false;
      }
    }

    loadReport().catch((err) => { if (!cancelled) setError(err.message); });
    const interval = window.setInterval(checkForUpdate, 10000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [projectId]);

  return (
    <main className="channel-view allure-report-view">
      <div className="channel-main">
        <header className="channel-header">
          <span className="ch-name">#{channel.name}</span>
          <span className="ch-meta">Latest Allure report</span>
          {src && <a className="header-action-button" href={src} target="_blank" rel="noreferrer">Open report</a>}
        </header>
        <div className="allure-report-container">
          {error ? <div className="empty-state"><h3>Allure report unavailable</h3><p>{error}</p></div> : null}
          {!error && !src ? <div className="empty-state"><p>Loading Allure report…</p></div> : null}
          {src ? <iframe className="allure-report-frame" title={`${projectId} Allure report`} src={src} loading="eager" referrerPolicy="no-referrer" /> : null}
        </div>
      </div>
    </main>
  );
}
