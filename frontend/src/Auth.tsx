import { useEffect, useState } from "react";
import { api, ApiError, setToken, type User } from "./api";

type Step = "login" | "register" | "verify" | "forgot" | "reset";
type Session = { user: User; token: string };

export default function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const post = <T,>(path: string, body: object) =>
    api<T>(`/api/auth/${path}`, { method: "POST", body: JSON.stringify(body) });
  const finish = (res: Session) => { setToken(res.token); onAuth(res.user); };
  const goTo = (s: Step, addr: string, message = "") => {
    setEmail(addr); setStep(s); setError(""); setInfo(message); setCooldown(s === "verify" || s === "reset" ? 60 : 0);
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true); setError(""); setInfo("");
    try {
      if (step === "verify") {
        finish(await post<Session>("verify-email", { email, code: val("code") }));
      } else if (step === "register") {
        await post("register", {
          name: val("name"), email: val("email"), password: f.get("password"),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        goTo("verify", val("email"), `We sent a 6-digit code to ${val("email")}.`);
      } else if (step === "forgot") {
        await post("forgot-password", { email: val("email") });
        goTo("reset", val("email"), "If an account exists for that email, we sent a reset code.");
      } else if (step === "reset") {
        finish(await post<Session>("reset-password", { email, code: val("code"), password: f.get("password") }));
      } else {
        try {
          finish(await post<Session>("login", { email: val("email"), password: f.get("password") }));
        } catch (err) {
          if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
            goTo("verify", val("email"), "Your email isn't verified yet. We sent you a new code.");
          } else throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(""); setInfo("");
    try {
      await post(step === "reset" ? "forgot-password" : "resend-verification", { email });
      setInfo("A new code is on its way."); setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
    }
  }

  const codeInput = <input name="code" className="code" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="000000" autoComplete="one-time-code" autoFocus required />;
  const title: Record<Step, string> = { login: "Log in", register: "Create account", verify: "Verify email", forgot: "Send reset code", reset: "Set new password" };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit} key={step}>
        <h1>ActionLens</h1>
        {step === "verify" && <><p className="muted">Check <strong>{email}</strong> and enter the code. It expires in 10 minutes.</p>{codeInput}</>}
        {step === "reset" && (
          <>
            <p className="muted">Enter the code sent to <strong>{email}</strong> and choose a new password.</p>
            {codeInput}
            <input name="password" type="password" placeholder="New password (min 8 characters)" minLength={8} required />
          </>
        )}
        {step === "forgot" && (
          <>
            <p className="muted">Enter your account email and we'll send you a reset code.</p>
            <input name="email" type="email" placeholder="Email" defaultValue={email} autoFocus required />
          </>
        )}
        {(step === "login" || step === "register") && (
          <>
            <p className="muted">Never miss a deadline buried in a PDF.</p>
            {step === "register" && <input name="name" placeholder="Name" required />}
            <input name="email" type="email" placeholder="Email" defaultValue={email} required />
            <input name="password" type="password" placeholder="Password (min 8 characters)" minLength={step === "register" ? 8 : 1} required />
          </>
        )}
        {info && <p className="info">{info}</p>}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{title[step]}</button>

        {(step === "verify" || step === "reset") && (
          <button type="button" className="link" disabled={cooldown > 0} onClick={resend}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        )}
        {step === "login" && (
          <>
            <button type="button" className="link" onClick={() => goTo("forgot", email)}>Forgot password?</button>
            <button type="button" className="link" onClick={() => goTo("register", email)}>New here? Create an account</button>
          </>
        )}
        {step === "register" && <button type="button" className="link" onClick={() => goTo("login", email)}>Have an account? Log in</button>}
        {(step === "verify" || step === "forgot" || step === "reset") && <button type="button" className="link" onClick={() => goTo("login", email)}>Back to log in</button>}
      </form>
    </div>
  );
}
