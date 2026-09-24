import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Check, Globe2, LockKeyhole } from "lucide-react";
import Modal, { ModalActions } from "./Modal.js";
import { Button } from "./Button.js";
import { channelSchema, normalizeChannelNameInput } from "../lib/formSchemas.js";
import { Input, InputShell } from "./Input.js";
import { useI18n } from "../lib/i18n.js";

// "Create a channel" dialog with a name field and public/private choice.
export default function CreateChannelModal({ onCreate, onClose }) {
  const { t } = useI18n();
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
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function focusNameOnOpen(event) {
    event.preventDefault();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

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
    <Modal title={t("createChannel")} onClose={onClose} onOpenAutoFocus={focusNameOnOpen}>
      <form data-testid="create-channel-modal" onSubmit={submit}>
        <label className="field">
          <span className="field-label">{t("channelName")}</span>
          <InputShell className="name-input">
            <span className="name-prefix">{type === "private" ? "🔒" : "#"}</span>
            <Input
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
              placeholder={t("channelNameExample")}
              maxLength={64}
            />
          </InputShell>
          {errors.name && (
            <span className="field-hint error small">
              {errors.name.message === "Channel name is required" ? t("channelNameRequired") : errors.name.message}
            </span>
          )}
        </label>

        <fieldset className="field visibility-field">
          <legend className="field-label">{t("channelAccessQuestion")}</legend>
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
                <div className="vo-title">{t("channelVisibilityPublic")}</div>
                <div className="vo-desc">{t("publicChannelHint")}</div>
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
                <div className="vo-title">{t("channelVisibilityPrivate")}</div>
                <div className="vo-desc">{t("privateChannelHint")}</div>
              </div>
              <span className="vo-check"><Check size={15} strokeWidth={2.5} /></span>
            </label>
          </div>
          <p className="visibility-note">{t("channelVisibilityNote")}</p>
        </fieldset>

        <section className="channel-advanced-options">
          <div className="channel-advanced-panel">
            <label className={`channel-readonly-toggle${readOnly ? " is-enabled" : ""}`}>
              <input
                {...readOnlyField}
                type="checkbox"
                data-testid="create-channel-readonly-toggle"
                aria-label={t("managersOnly")}
              />
              <span className="channel-readonly-switch" aria-hidden="true">
                <span className="channel-readonly-switch-thumb" />
              </span>
              <span className="channel-readonly-toggle-copy">
                <span>{t("managersOnly")}</span>
                <span className="channel-readonly-toggle-state">{readOnly ? t("on") : t("off")}</span>
              </span>
            </label>
            <p className="channel-advanced-hint">{t("managersOnlyPostingHint")}</p>
          </div>
        </section>

        {error && <div className="error">{error}</div>}

        <ModalActions>
                  <Button variant="secondary" data-testid="create-channel-cancel" onClick={onClose}>
            {t("cancel")}
                  </Button>
                  <Button type="submit" variant="primary" data-testid="create-channel-submit" disabled={isSubmitting}>
            {isSubmitting ? t("creating") : t("create")}
                  </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
