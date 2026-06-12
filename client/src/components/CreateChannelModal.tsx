import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import Modal from "./Modal.js";
import { channelSchema, normalizeChannelNameInput } from "../lib/formSchemas.js";

// "Create a channel" dialog with a name field and public/private choice.
export default function CreateChannelModal({ onCreate, onClose }) {
  const [error, setError] = useState(null);
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
    },
  });
  const name = useWatch({ control, name: "name" }) || "";
  const type = useWatch({ control, name: "type" }) || "public";
  const nameField = register("name");
  const typeField = register("type");

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await onCreate(values.name, values.type);
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
              onBlur={nameField.onBlur}
              placeholder="e.g. marketing"
              maxLength={64}
            />
          </div>
          {errors.name && <span className="field-hint error small">{errors.name.message}</span>}
        </label>

        <div className="field">
          <span className="field-label">Visibility</span>
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
              <div className="vo-body">
                <div className="vo-title"># Public</div>
                <div className="vo-desc">Anyone in the workspace can find and join.</div>
              </div>
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
              <div className="vo-body">
                <div className="vo-title">🔒 Private</div>
                <div className="vo-desc">Only invited members can view and join.</div>
              </div>
            </label>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" data-testid="create-channel-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" data-testid="create-channel-submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
