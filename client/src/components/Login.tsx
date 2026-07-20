import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, IdCardIcon, InfoIcon, LockIcon, MailIcon, NotebookTextIcon, UserIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api, rhssoLoginUrl } from "../api.js";
import Logo from "./Logo.js";
import { PASSWORD_RULE } from "../lib/password.js";
import { authSchema } from "../lib/formSchemas.js";

function usernameFromName(firstName, lastName) {
  return `${firstName} ${lastName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32)
    .replace(/\.+$/g, "") || "user";
}

function lettersOnly(value) {
  return String(value || "").replace(/[^A-Za-z]/g, "");
}

function usernameSuffixOnly(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

// Little postal letters that drift gently around the hero panel — each with its
// own position, size, drift vector and timing for an organic "floating" feel.
const FLOATERS = [
  { t: "envelope", top: "10%", left: "12%", size: 34, dx: "14px", dy: "-18px", rot: "6deg", dur: 20, delay: 0 },
  { t: "note",     top: "18%", left: "63%", size: 24, dx: "-10px", dy: "14px", rot: "-8deg", dur: 23, delay: 2.2 },
  { t: "envelope", top: "70%", left: "20%", size: 30, dx: "10px", dy: "-18px", rot: "5deg", dur: 24, delay: 1.1 },
  { t: "envelope", top: "40%", left: "82%", size: 28, dx: "-14px", dy: "-10px", rot: "-6deg", dur: 21, delay: 4.2 },
  { t: "note",     top: "82%", left: "66%", size: 22, dx: "10px", dy: "12px", rot: "7deg", dur: 25, delay: 3.3 },
  { t: "envelope", top: "31%", left: "31%", size: 26, dx: "-8px", dy: "-18px", rot: "-5deg", dur: 22, delay: 6.1 },
  { t: "note",     top: "52%", left: "48%", size: 20, dx: "12px", dy: "8px", rot: "8deg", dur: 27, delay: 2.7 },
  { t: "envelope", top: "84%", left: "34%", size: 24, dx: "10px", dy: "-14px", rot: "4deg", dur: 23, delay: 1.6 },
];

// Combined login / register screen — split hero + auth form.
export default function Login({ onAuthed, initialError = "" }) {
  const [mode, setMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState(initialError || null);
  const [success, setSuccess] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false); // no users yet → create the admin
  const [registerStep, setRegisterStep] = useState(1);
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [usernameSuffix, setUsernameSuffix] = useState("");
  const [rhssoEnabled, setRhssoEnabled] = useState(false);

  const isRegister = needsSetup || mode === "register";
  const resolver = useMemo(
    () => zodResolver(authSchema(needsSetup ? "admin" : isRegister ? "register" : "login")),
    [isRegister, needsSetup]
  );
  const {
    register,
    handleSubmit,
    clearErrors,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: "onChange",
    resolver,
    defaultValues: {
      username: "",
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    },
  });
  const firstName = watch("firstName");
  const lastName = watch("lastName");
  const username = watch("username");
  const usernameBase = usernameFromName(firstName || "", lastName || "");
  const usernameField = register("username");
  const firstNameField = register("firstName");
  const lastNameField = register("lastName");
  const usernameEdited = useRef(false);

  useEffect(() => {
    if (!isRegister || usernameEdited.current) return;
    setValue("username", usernameFromName(firstName || "", lastName || ""), { shouldValidate: true });
    setUsernameSuffix("");
    setUsernameTaken(false);
    setUsernameSuggestions([]);
  }, [firstName, lastName, isRegister, setValue, usernameEdited]);

  // Check the generated/custom handle while the user is filling out step two.
  useEffect(() => {
    if (!isRegister || needsSetup || registerStep !== 2 || !firstName || !lastName || !username) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .usernameOptions(firstName, lastName, username)
        .then(({ available, suggestions }) => {
          if (cancelled) return;
          if (username === usernameBase) setUsernameTaken(!available);
          setUsernameSuggestions(available ? [] : suggestions || []);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [firstName, lastName, username, usernameBase, isRegister, needsSetup, registerStep]);

  // First-run: if the workspace has no accounts, show the "create admin" screen.
  useEffect(() => {
    let cancelled = false;
    api
      .setupStatus()
      .then(({ needsSetup, rhssoEnabled }) => {
        if (cancelled) return;
        setRhssoEnabled(!!rhssoEnabled);
        if (needsSetup) {
          setNeedsSetup(true);
          setMode("register");
          setRegisterStep(2);
          setValue("username", "admin", { shouldValidate: true });
          setUsernameSuffix("");
          usernameEdited.current = true;
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const isBypassed =
          !!initialError ||
          params.has("local") ||
          params.get("local") === "true" ||
          hashParams.has("local") ||
          hashParams.get("local") === "true" ||
          sessionStorage.getItem("echo.ssoBypass") === "true";

        if (rhssoEnabled && !isBypassed) {
          window.location.assign(rhssoLoginUrl());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialError, setValue]);

  function switchMode(next) {
    setServerError(null);
    setUsernameSuggestions([]);
    setUsernameTaken(false);
    setUsernameSuffix("");
    clearErrors();
    setMode(next);
    setRegisterStep(1);
    if (next === "register") {
      usernameEdited.current = false;
      setValue("password", "", { shouldValidate: false });
      setShowPw(false);
    }
  }

  const submit = handleSubmit(
    async (values) => {
      setServerError(null);
      try {
        const payload = isRegister
          ? {
              username: values.username,
              password: values.password,
              ...(needsSetup ? {} : { firstName: values.firstName, lastName: values.lastName }),
            }
          : { username: values.username, password: values.password };
        const result = isRegister ? await api.register(payload) : await api.login(payload);
        // Play the ripple-burst welcome, then hand off to the app.
        setSuccess(true);
        setTimeout(() => onAuthed(result), 1150);
      } catch (err) {
        setServerError(err.message);
        if (err.usernameTaken && err.suggestions) {
          setUsernameTaken(true);
          setUsernameSuggestions(err.suggestions);
        }
      }
    },
    (validationErrors) => {
      if (validationErrors.confirmPassword) {
        setServerError(validationErrors.confirmPassword.message || "Please confirm your password.");
      } else if (validationErrors.password) {
        setServerError(validationErrors.password.message || "Please enter a valid password.");
      } else {
        const firstError = Object.values(validationErrors)[0];
        setServerError(firstError?.message || "Please complete all required fields.");
      }
    }
  );

  async function continueRegistration() {
    const valid = await trigger(["firstName", "lastName"]);
    if (valid) {
      setServerError(null);
      setRegisterStep(2);
    } else {
      setServerError("Please enter your first and last name to continue.");
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-bg" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="auth-grid" />
      </div>

      <div className="auth-shell">
        {/* Brand / hero panel */}
        <aside className="auth-hero" aria-hidden="true">
          <div className="auth-letters">
            {FLOATERS.map((f, i) => (
              <span
                key={i}
                className="floatk"
                style={{
                  top: f.top,
                  left: f.left,
                  width: f.size,
                  height: f.size,
                  "--dx": f.dx,
                  "--dy": f.dy,
                  "--rot": f.rot,
                  animationDuration: `${f.dur}s`,
                  animationDelay: `${f.delay}s`,
                }}
              >
                {f.t === "note" ? <NotebookTextIcon /> : <MailIcon />}
              </span>
            ))}
          </div>
          <div className="auth-hero-mid">
            <div className="auth-logo-wrap">
              <div className="auth-hero-glow" />
              <div className="auth-ripples">
                <span className="auth-ripple" />
                <span className="auth-ripple" />
                <span className="auth-ripple" />
              </div>
              <Logo size={132} />
            </div>
          </div>
        </aside>

        {/* Auth form panel */}
        <form
          className={`auth-card ${needsSetup ? "setup" : ""}`}
          onSubmit={(event) => {
            if (isRegister && !needsSetup && registerStep === 1) {
              event.preventDefault();
              continueRegistration();
              return;
            }
            submit(event);
          }}
        >
          <div className="auth-card-head">
            <div className="auth-logo-sm">
              <Logo size={44} />
            </div>
            <h1 className="brand">Echo</h1>
            <p className="auth-card-sub">Sign in to pick up where your conversations left off.</p>
          </div>

          {!needsSetup && (
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!isRegister}
                className={!isRegister ? "active" : ""}
                onClick={() => switchMode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isRegister}
                className={isRegister ? "active" : ""}
                onClick={() => switchMode("register")}
              >
                Create account
              </button>
              <span className={`auth-tab-ind ${isRegister ? "right" : ""}`} />
            </div>
          )}

          {needsSetup && <div className="setup-badge">🛡 First-time setup</div>}

          <div className="auth-subtitle-row">
            {isRegister && !needsSetup && registerStep === 2 && (
              <button
                type="button"
                className="auth-back"
                onClick={() => setRegisterStep(1)}
                title="Back to names"
                aria-label="Back to names"
              >
                <ArrowLeftIcon size={14} strokeWidth={2} />
              </button>
            )}
            <p className="subtitle">
              {needsSetup
                ? "Welcome to Echo! Create the admin account to set up your workspace."
                : isRegister
                ? "Create your account to get started."
                : "Welcome back — sign in to continue."}
            </p>
          </div>

          {needsSetup && (
            <div className="setup-callout">
              This first account becomes the workspace <strong>admin</strong> — it can issue
              one-time passwords to help others who get locked out.
            </div>
          )}

          {isRegister && !needsSetup && registerStep === 1 && (
            <>
              <label className="field">
                <span>First name</span>
                <div className="input-wrap">
                  <IdCardIcon size={17} strokeWidth={1.6} />
                  <input
                    {...firstNameField}
                    autoComplete="given-name"
                    placeholder="First name"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        continueRegistration();
                      }
                    }}
                    onBeforeInput={(event) => {
                      if (event.data && /[^A-Za-z]/.test(event.data)) event.preventDefault();
                    }}
                    onChange={(event) => firstNameField.onChange({
                      target: { name: firstNameField.name, value: lettersOnly(event.target.value) },
                    })}
                  />
                </div>
                {errors.firstName && <span className="field-hint error small">{errors.firstName.message}</span>}
              </label>
              <label className="field">
                <span>Last name</span>
                <div className="input-wrap">
                  <IdCardIcon size={17} strokeWidth={1.6} />
                  <input
                    {...lastNameField}
                    autoComplete="family-name"
                    placeholder="Last name"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        continueRegistration();
                      }
                    }}
                    onBeforeInput={(event) => {
                      if (event.data && /[^A-Za-z]/.test(event.data)) event.preventDefault();
                    }}
                    onChange={(event) => lastNameField.onChange({
                      target: { name: lastNameField.name, value: lettersOnly(event.target.value) },
                    })}
                  />
                </div>
                {errors.lastName && <span className="field-hint error small">{errors.lastName.message}</span>}
              </label>
            </>
          )}

          {isRegister && !needsSetup && registerStep === 1 ? (
            <button type="button" className="btn-primary auth-submit" onClick={continueRegistration}>
              Continue
            </button>
          ) : <>
          <label className="field">
            <span>{needsSetup ? "Admin username" : "Username"}</span>
            {isRegister && !needsSetup ? (
              <div className="input-wrap username-composed">
                <UserIcon size={17} strokeWidth={1.6} />
                <span className="auth-username-prefix">{usernameBase}</span>
                <input
                  {...usernameField}
                  type="text"
                  className="auth-username-credential"
                  autoComplete="username"
                  aria-hidden="true"
                  value={`${usernameBase}${usernameSuffix}`}
                  readOnly
                />
                {usernameTaken && (
                  <input
                    name="username-suffix"
                    value={usernameSuffix}
                    onBeforeInput={(event) => {
                      if (event.data && /[^A-Za-z0-9]/.test(event.data)) event.preventDefault();
                    }}
                    onChange={(event) => {
                      usernameEdited.current = true;
                      const suffix = usernameSuffixOnly(event.target.value);
                    setUsernameSuffix(suffix);
                    setServerError(null);
                    setUsernameSuggestions([]);
                    setValue("username", `${usernameBase}${suffix}`, { shouldValidate: true });
                  }}
                    autoComplete="off"
                    placeholder="add letters or numbers"
                  />
                )}
              </div>
            ) : (
              <div className="input-wrap">
                <UserIcon size={17} strokeWidth={1.6} />
                <input
                  {...usernameField}
                  autoComplete="username"
                  placeholder={needsSetup ? "admin" : "Username"}
                  readOnly={needsSetup}
                />
              </div>
            )}
            {errors.username && <span className="field-hint error small">{errors.username.message}</span>}
          </label>
          {needsSetup ? (
            <span className="field-hint">The workspace administrator always uses @admin.</span>
          ) : null}

          {isRegister && !needsSetup && usernameSuggestions.length > 0 && (
            <div className="auth-username-options">
              <span className="field-hint">That username is taken. Try one of these:</span>
              <div className="auth-username-suggestions">
                {usernameSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="link"
                    onClick={() => {
                      setValue("username", suggestion, { shouldValidate: true });
                      setUsernameSuffix(suggestion.slice(usernameBase.length));
                      setServerError(null);
                      setUsernameSuggestions([]);
                      usernameEdited.current = true;
                    }}
                  >
                    @{suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="field">
            <span className="field-label-row">
              <span>Password</span>
              {isRegister && (
                <button
                  type="button"
                  className="password-info"
                  title={PASSWORD_RULE}
                  aria-label={PASSWORD_RULE}
                >
                  <InfoIcon size={14} strokeWidth={2} />
                </button>
              )}
            </span>
            <div className="input-wrap">
              <LockIcon size={17} strokeWidth={1.6} />
              <input
                {...register("password")}
                type={showPw ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "Create a password" : "Enter your password"}
                onKeyDown={needsSetup ? (event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                } : undefined}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPw ? <EyeOffIcon size={17} strokeWidth={1.6} /> : <EyeIcon size={17} strokeWidth={1.6} />}
              </button>
            </div>
            {errors.password && <span className="field-hint error small">{errors.password.message}</span>}
            {!isRegister && serverError && <span className="field-hint error small">{serverError}</span>}
          </label>

          {isRegister && (
            <label className="field confirm-password-field">
              <span>Confirm password</span>
              <div className="input-wrap">
                <LockIcon size={17} strokeWidth={1.6} />
                <input
                  {...register("confirmPassword")}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                />
              </div>
              {errors.confirmPassword && <span className="field-hint error small">{errors.confirmPassword.message}</span>}
            </label>
          )}

          <button type="submit" className="btn-primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="spinner" />
            ) : needsSetup ? (
              "Create admin account"
            ) : isRegister ? (
              "Create account"
            ) : (
              "Sign in"
            )}
          </button>

          {!needsSetup && !isRegister && rhssoEnabled && (
            <>
              <div className="auth-divider"><span>or</span></div>
              <button
                type="button"
                className="auth-sso"
                onClick={() => window.location.assign(rhssoLoginUrl())}
              >
                Sign in with RHSSO
              </button>
            </>
          )}
          </>}

          {!needsSetup && !isRegister && (
            <p className="auth-switch">
              New to Echo?{" "}
              <button
                type="button"
                className="link"
                onClick={() => switchMode("register")}
              >
                Create one
              </button>
            </p>
          )}
        </form>
      </div>

      {success && (
        <div className="auth-success">
          <div className="success-mark">
            <span className="success-ripple" />
            <span className="success-ripple" />
            <span className="success-ripple" />
            <Logo size={104} />
          </div>
          <div className="success-text">Welcome to Echo</div>
        </div>
      )}
    </div>
  );
}
