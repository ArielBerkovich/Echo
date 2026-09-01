import { useState } from "react";
import { PlayIcon, Volume2Icon, XIcon } from "lucide-react";
import {
  MESSAGE_SOUNDS,
  NONE_SOUND_ID,
  previewMessageSound,
  selectedMessageSound,
  setSelectedMessageSound,
} from "../lib/messageSounds.js";

export default function MessageSoundControls() {
  const [selected, setSelected] = useState(() => selectedMessageSound());

  function selectSound(soundId) {
    if (!setSelectedMessageSound(soundId)) return;
    setSelected(soundId);
    previewMessageSound(soundId);
  }

  return (
    <div className="message-sound-settings">
      <div className="message-sound-options" role="radiogroup" aria-label="Message sound">
        {MESSAGE_SOUNDS.map((sound) => (
          <div key={sound.id} className={`message-sound-option${selected === sound.id ? " active" : ""}`}>
            <label className="message-sound-choice">
              <input
                type="radio"
                name="message-sound"
                value={sound.id}
                checked={selected === sound.id}
                onChange={() => selectSound(sound.id)}
              />
              <span className="message-sound-icon" aria-hidden="true">{sound.id === NONE_SOUND_ID ? <XIcon size={16} strokeWidth={2.5} /> : <Volume2Icon size={16} strokeWidth={2} />}</span>
              <span className="message-sound-choice-copy"><strong>{sound.label}</strong><small>{sound.description}</small></span>
            </label>
            {sound.url ? <button type="button" className="btn-secondary message-sound-preview" data-testid={`message-sound-preview-${sound.id}`} aria-label={`Preview ${sound.label} sound`} onClick={() => previewMessageSound(sound.id)}>
              <PlayIcon size={13} fill="currentColor" aria-hidden="true" /> Preview
            </button> : <span className="message-sound-preview-placeholder">No preview</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
