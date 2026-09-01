import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Check, ChevronDown, Globe2, LockKeyhole } from "lucide-react";
import Modal, { ModalActions } from "./Modal.js";
import { channelSchema, normalizeChannelNameInput } from "../lib/formSchemas.js";

// "Create a channel" dialog with a name field and public/private choice.
export default function CreateChannelModal({ onCreate, onClose }) {
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef(null);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: "onChange",
    resolver: zodResolver(channelSchema),
    defaultValues: {
      name: "",
      type: "public",
      readOnly: false,
    },
  });
  const name = useWatch({ control, name: "name" }) || "";
  const type = useWatch({ control, name: "type" }) || "public";
  const readOnly = !!useWatch({ control, name: "readOnly" });
  const nameField = register("name");
  const typeField = register("type");
  const readOnlyField = register("readOnly");

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await onCreate(values.name, values.type, !!values.readOnly);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  });

  return (
    <Modal title="Create a channel" onClose={onClose}>
      <form data-testid="create-channel-modal" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Name</span>
          <div className="name-input">
            <span className="name-prefix">{type === "private" ? "🔒" : "#"}</span>
            <input
              data-testid="create-channel-name"
              {...nameField}
              ref={(el) => {
                nameField.ref(el);
                inputRef.current = el;
              }}
              value={name}
              onChange={(e) => {
                setError(null);
                setValue("name", normalizeChannelNameInput(e.target.value), {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              onKeyDown={(e) => {
                if (e.key !== "_" && e.key !== "-") return;
                const start = e.currentTarget.selectionStart ?? 0;
                const end = e.currentTarget.selectionEnd ?? start;
                const nextValue = `${name.slice(0, start)}${e.key}${name.slice(end)}`;
                if (e.key === "_" || nextValue.includes("--")) {
                  e.preventDefault();
                }
              }}
              onBlur={nameField.onBlur}
              placeholder="e.g. marketing"
              maxLength={64}
            />
          </div>
          {errors.name && <span className="field-hint error small">{errors.name.message}</span>}
        </label>

        <fieldset className="field visibility-field">
          <legend className="field-label">Who can access this channel?</legend>
          <div className="visibility">
            <label className={`visibility-option ${type === "public" ? "selected" : ""}`}>
              <input
                {...typeField}
                type="radio"
                value="public"
                checked={type === "public"}
                onChange={() => {
                  setError(null);
                  setValue("type", "public", { shouldDirty: true, shouldValidate: true });
                }}
              />
              <span className="vo-icon public"><Globe2 size={18} strokeWidth={1.8} /></span>
              <div className="vo-body">
                <div className="vo-title">Public</div>
                <div className="vo-desc">Everyone can discover and join this channel.</div>
              </div>
              <span className="vo-check"><Check size={15} strokeWidth={2.5} /></span>
            </label>
            <label className={`visibility-option ${type === "private" ? "selected" : ""}`}>
              <input
                {...typeField}
                type="radio"
                value="private"
                checked={type === "private"}
                onChange={() => {
                  setError(null);
                  setValue("type", "private", { shouldDirty: true, shouldValidate: true });
                }}
              />
              <span className="vo-icon private"><LockKeyhole size={18} strokeWidth={1.8} /></span>
              <div className="vo-body">
                <div className="vo-title">Private</div>
                <div className="vo-desc">Only people you invite can view and join.</div>
              </div>
              <span className="vo-check"><Check size={15} strokeWidth={2.5} /></span>
            </label>
          </div>
          <p className="visibility-note">You can make a private channel public later, but public channels can’t be made private.</p>
        </fieldset>

        <section className="channel-advanced-options">
          <button
            type="button"
            className={`channel-advanced-toggle${showAdvanced ? " is-open" : ""}`}
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            <span>Advanced options</span>
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          {showAdvanced && (
            <div className="channel-advanced-panel">
              <label className={`channel-readonly-toggle${readOnly ? " is-enabled" : ""}`}>
                <input
                  {...readOnlyField}
                  type="checkbox"
                  data-testid="create-channel-readonly-toggle"
                  aria-label="Managers only"
                />
                <span className="channel-readonly-switch" aria-hidden="true">
                  <span className="channel-readonly-switch-thumb" />
                </span>
                <span className="channel-readonly-toggle-copy">
                  <span>Managers only</span>
                  <span className="channel-readonly-toggle-state">{readOnly ? "On" : "Off"}</span>
                </span>
              </label>
              <p className="channel-advanced-hint">Only the channel creator and managers can post messages and replies.</p>
            </div>
          )}
        </section>

        {error && <div className="error">{error}</div>}

        <ModalActions>
          <button type="button" className="btn-secondary" data-testid="create-channel-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" data-testid="create-channel-submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
