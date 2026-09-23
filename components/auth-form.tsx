"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Eye, EyeOff, GraduationCap } from "lucide-react";
import { api, type User } from "@/lib/client";
import { Button } from "./ui/button";
import { useSession } from "./shell";

export function AuthForm() {
  const [register, setRegister] = useState(false);
  const [role, setRole] = useState<"BUSINESS" | "TEAM">("BUSINESS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [demoFilled, setDemoFilled] = useState(false);
  const pending = useRef(false);
  const { refresh } = useSession();
  const router = useRouter();
  const params = useSearchParams();

  function switchMode(value: boolean) {
    if (pending.current) return;
    setRegister(value);
    setError("");
    setDemoFilled(false);
    setPassword("");
    setPasswordVisible(false);
  }

  function fillDemo(account: "business" | "team") {
    setEmail(`${account}@demo.local`);
    setPassword("SanaDemo2026!");
    setError("");
    setDemoFilled(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (register && String(data.name || "").trim().length < 2) {
      setError("Введите имя: не менее 2 символов.");
      const nameField = form.elements.namedItem("name");
      if (nameField instanceof HTMLInputElement) nameField.focus();
      return;
    }
    const organization = String(data.company || data.teamName || "").trim();
    if (register && organization.length < 2) {
      setError(role === "BUSINESS" ? "Введите название компании: не менее 2 символов." : "Введите название команды: не менее 2 символов.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("Пароль слишком длинный. Сократите его, особенно если используете кириллицу или эмодзи.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth", {
        method: "POST",
        body: JSON.stringify({ ...data, ...(register ? { role } : {}), action: register ? "register" : "login" }),
      });
      await refresh();
      const next = params.get("next");
      let destination = "/dashboard";
      if (next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
        const url = new URL(next, window.location.origin);
        if (url.origin === window.location.origin) destination = `${url.pathname}${url.search}${url.hash}`;
      }
      if (result.user.role === "TEAM" && destination.startsWith("/challenges/new")) destination = "/#catalog";
      router.push(destination);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout page-container">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="segmented" aria-label="Вход или регистрация">
          <button className={!register ? "selected" : ""} aria-pressed={!register} disabled={busy} onClick={() => switchMode(false)}>Вход</button>
          <button className={register ? "selected" : ""} aria-pressed={register} disabled={busy} onClick={() => switchMode(true)}>Регистрация</button>
        </div>
        <div className="auth-heading">
          <h1 id="auth-title">{register ? "Создать аккаунт" : "Войти в аккаунт"}</h1>
          <p className="muted">{register ? "Выберите роль. Бизнес размещает задачи, команды предлагают решения." : "Войдите, чтобы работать со своими задачами и откликами."}</p>
        </div>
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            {register && (
              <>
                <fieldset className="role-fieldset">
                  <legend>Кто вы?</legend>
                  <div className="role-picker">
                    <button type="button" className={role === "BUSINESS" ? "selected" : ""} aria-pressed={role === "BUSINESS"} onClick={() => { setRole("BUSINESS"); setError(""); }}>
                      <BriefcaseBusiness size={22} />Я представляю бизнес
                    </button>
                    <button type="button" className={role === "TEAM" ? "selected" : ""} aria-pressed={role === "TEAM"} onClick={() => { setRole("TEAM"); setError(""); }}>
                      <GraduationCap size={22} />Я из команды
                    </button>
                  </div>
                </fieldset>
                <label className="field">Ваше имя
                  <input name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder="Как к вам обращаться" />
                </label>
                <label className="field">{role === "BUSINESS" ? "Компания" : "Название команды"}
                  <input key={role} name={role === "BUSINESS" ? "company" : "teamName"} required minLength={2} maxLength={120} autoComplete={role === "BUSINESS" ? "organization" : "off"} placeholder={role === "BUSINESS" ? "Например, Цветочная мастерская" : "Например, Команда Решение"} />
                </label>
                {role === "TEAM" && (
                  <label className="field">Учебное заведение <span className="optional-label">необязательно</span>
                    <input name="university" maxLength={160} placeholder="Университет или колледж" />
                  </label>
                )}
              </>
            )}
            <label className="field">Электронная почта
              <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setDemoFilled(false); }} />
            </label>
            <div className="field">
              <label htmlFor="auth-password">Пароль</label>
              <div className="password-field">
                <input
                  id="auth-password"
                  name="password"
                  type={passwordVisible ? "text" : "password"}
                  required
                  minLength={register ? 8 : 1}
                  maxLength={72}
                  autoComplete={register ? "new-password" : "current-password"}
                  aria-describedby={register ? "password-hint" : undefined}
                  placeholder={register ? "Придумайте пароль" : "Введите пароль"}
                  value={password}
                  onChange={event => { setPassword(event.target.value); setDemoFilled(false); }}
                />
                <button className="icon-button" type="button" aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"} onClick={() => setPasswordVisible(!passwordVisible)}>
                  {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {register && <span id="password-hint" className="field-hint">Не менее 8 символов.</span>}
            </div>
            {error && <div className="error-banner" role="alert">{error}</div>}
            {demoFilled && <p className="field-hint" role="status">Данные заполнены. Нажмите «Войти».</p>}
            <Button className="full-width" type="submit" disabled={busy}>
              {busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"}<ArrowRight size={18} />
            </Button>
          </fieldset>
        </form>
        {!register && (
          <div className="auth-demo">
            <strong>Хотите сначала попробовать?</strong>
            <p>Заполните форму данными демоаккаунта.</p>
            <div className="demo-account-buttons">
              <Button type="button" variant="outline" disabled={busy} onClick={() => fillDemo("business")}><BriefcaseBusiness size={18} />Демо: бизнес</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => fillDemo("team")}><GraduationCap size={18} />Демо: команда</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
