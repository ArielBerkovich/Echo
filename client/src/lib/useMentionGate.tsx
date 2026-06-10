import { useState } from "react";
import { api } from "../api.js";
import { nonMemberMentions } from "./mentions.js";
import MentionAddModal from "../components/MentionAddModal.js";

// Guards sends against @-mentioning non-members of a private channel. Returns
// `gate(body, proceed)` — if the body mentions non-members it shows the
// "Add to channel?" prompt and returns true (caller should stop); otherwise
// returns false (caller sends normally). Also returns `mentionModal` to render.
export function useMentionGate({ channel, users, onChannelUpdated }) {
  const [prompt, setPrompt] = useState(null); // { users, proceed }
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  function gate(body, proceed) {
    const missing = nonMemberMentions(channel, users, body);
    if (missing.length === 0) return false;
    setError(null);
    setPrompt({ users: missing, proceed });
    return true;
  }

  async function addAndSend() {
    if (!prompt) return;
    setAdding(true);
    setError(null);
    try {
      let updated;
      for (const u of prompt.users) {
        ({ channel: updated } = await api.addChannelMember(channel.id, u.id));
      }
      if (updated) onChannelUpdated?.(updated);
      prompt.proceed();
      setPrompt(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  function sendAnyway() {
    prompt?.proceed();
    setPrompt(null);
  }

  const mentionModal = (
    <MentionAddModal
      prompt={prompt}
      channelName={channel.name}
      adding={adding}
      error={error}
      onAdd={addAndSend}
      onSendAnyway={sendAnyway}
      onClose={() => !adding && setPrompt(null)}
    />
  );

  return { gate, mentionModal };
}
