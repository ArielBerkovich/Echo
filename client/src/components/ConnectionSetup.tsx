import { useState } from "react";
import { api, setBackendUrl } from "../api.js";
import Logo from "./Logo.js";

export default function ConnectionSetup({ onConfigured }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    let normalized;
    try {
      normalized = setBackendUrl(url);
    } catch (err) {
      setError(err.message);
      return;
    }
    setChecking(true);
    try {
      await api.health();
      onConfigured(normalized);
    } catch {
      setBackendUrl("");
      setError("Echo could not be reached at that address. Check the URL and your network connection.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="auth-screen connection-screen">
      <div className="auth-bg" aria-hidden="true">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" /><div className="auth-grid" />
      </div>
      <section className="connection-card" aria-labelledby="connection-title">
        <Logo />
        <h1 id="connection-title">Connect to Echo</h1>
        <p>Enter the URL of your Echo backend to get started.</p>
        <form onSubmit={submit}>
          <label htmlFor="backend-url">Backend URL</label>
          <input id="backend-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://echo.example.com" autoFocus required />
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={checking}>{checking ? "Connecting…" : "Connect"}</button>
        </form>
      </section>
    </main>
  );
}
