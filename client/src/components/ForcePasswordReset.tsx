import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api } from "../api.js";
import Logo from "./Logo.js";
import { PASSWORD_RULE } from "../lib/password.js";
import { passwordPairSchema } from "../lib/formSchemas.js";

// Shown (blocking) right after a user signs in with an admin-issued one-time
// password: they must choose their own new password before using the app.
export default function ForcePasswordReset({ user, onDone, onCancel }) {
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: "onChange",
    resolver: zodResolver(passwordPairSchema()),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });
  const newPasswordField = register("newPassword");
  const confirmPasswordField = register("confirmPassword");

  const submit = handleSubmit(async ({ newPassword }) => {
    setError(null);
    try {
      // No current password needed — the account is on a one-time password and
      // the user is already authenticated with it.
      const { user: updated } = await api.changePassword(undefined, newPassword);
      onDone(updated);
      reset();
    } catch (err) {
      setError(err.message);
    }
  });

  return (
    <div className="force-reset">
      <form className="force-reset-card" onSubmit={submit}>
        <Logo size={40} />
        <h2>Set a new password</h2>
        <p>
          Welcome back{user?.displayName ? `, ${user.displayName}` : ""}. You signed in with a
          one-time password — choose a new password to finish.
        </p>
        <input
          {...newPasswordField}
          className="settings-input"
          type="password"
          placeholder="New password"
          autoFocus
          onChange={(e) => {
            setError(null);
            newPasswordField.onChange(e);
          }}
        />
        {errors.newPassword && <div className="error small">{errors.newPassword.message}</div>}
        <input
          {...confirmPasswordField}
          className="settings-input"
          type="password"
          placeholder="Confirm new password"
          onChange={(e) => {
            setError(null);
            confirmPasswordField.onChange(e);
          }}
        />
        {errors.confirmPassword && <div className="error small">{errors.confirmPassword.message}</div>}
        <div className="field-hint">{PASSWORD_RULE}</div>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save and continue"}
        </button>
        {error && <div className="error">{error}</div>}
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Sign out instead
          </button>
        )}
      </form>
    </div>
  );
}
