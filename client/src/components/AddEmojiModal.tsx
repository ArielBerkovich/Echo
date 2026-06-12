import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { api } from "../api.js";
import Modal from "./Modal.js";
import { emojiNameSchema, normalizeEmojiNameInput } from "../lib/formSchemas.js";

// Upload an image/GIF and register it as a :shortcode: custom emoji.
export default function AddEmojiModal({ existing = [], onCreated, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [serverError, setServerError] = useState(null);
  const nameSchema = useMemo(() => emojiNameSchema(existing), [existing]);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: "onChange",
    resolver: zodResolver(nameSchema),
    defaultValues: {
      name: "",
    },
  });
  const nameField = register("name");
  const watchedName = useWatch({ control, name: "name" }) || "";
  const cleanName = normalizeEmojiNameInput(watchedName);
  const taken = existing.some((e) => e.name === cleanName);

  // Build (and clean up) a local preview URL for the chosen file.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (f && !f.type.startsWith("image/")) {
      setServerError("Custom emoji must be an image (PNG, GIF, etc.)");
      return;
    }
    setServerError(null);
    setFile(f || null);
  }

  const submit = handleSubmit(async (values) => {
    if (!file) {
      setServerError("An image file is required");
      return;
    }
    setServerError(null);
    try {
      const { emoji } = await api.createEmoji(normalizeEmojiNameInput(values.name), file);
      onCreated?.(emoji);
      onClose();
    } catch (err) {
      setServerError(err.message);
    }
  });

  return (
    <Modal title="Add custom emoji" onClose={onClose}>
      <form data-testid="add-emoji-modal" onSubmit={submit}>
        <div className="emoji-form-row">
          <label className="emoji-drop">
            {preview ? <img src={preview} alt="preview" /> : <span className="emoji-drop-hint">Choose image / GIF</span>}
            <input
              type="file"
              accept="image/*"
              hidden
              data-testid="emoji-file-input"
              onChange={pickFile}
            />
          </label>

          <div className="emoji-form-fields">
            <label className="emoji-name-label">Shortcode</label>
            <div className="emoji-name-input">
              <span>:</span>
              <input
                {...nameField}
                value={watchedName}
                onChange={(e) => {
                  setServerError(null);
                  setValue("name", normalizeEmojiNameInput(e.target.value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                onBlur={nameField.onBlur}
                placeholder="party-parrot"
                data-testid="emoji-shortcode-input"
                autoFocus
                maxLength={34}
              />
              <span>:</span>
            </div>
            <div className="emoji-name-hint">
              {errors.name?.message ? (
                <span className="bad">{errors.name.message}</span>
              ) : taken ? (
                <span className="bad">":{cleanName}:" already exists</span>
              ) : watchedName ? (
                <span>Type :{cleanName || "name"}: in a message to use it.</span>
              ) : (
                <span>Type :name: in a message to use it.</span>
              )}
            </div>
          </div>
        </div>

        {serverError && <div className="error">{serverError}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" data-testid="emoji-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" data-testid="emoji-submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Add emoji"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
