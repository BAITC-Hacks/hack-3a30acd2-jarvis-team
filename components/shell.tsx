"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, LogOut, Menu, Plus, Sparkles, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, type User } from "@/lib/client";
import { Button } from "./ui/button";

type Session = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setBeforeLeave: (guard: (() => Promise<unknown>) | null) => void;
};

const SessionContext = createContext<Session>({
  user: null,
  loading: true,
  refresh: async () => {},
  setBeforeLeave: () => {},
});

export const useSession = () => useContext(SessionContext);

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol"><Sparkles size={23} strokeWidth={1.8} /></span>
      <span>AI Sana<span className="brand-caption">CHALLENGE HUB</span></span>
    </span>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const logoutPending = useRef(false);
  const beforeLeave = useRef<(() => Promise<unknown>) | null>(null);
  const setBeforeLeave = useCallback((guard: (() => Promise<unknown>) | null) => { beforeLeave.current = guard; }, []);
  const pathname = usePathname();
  const router = useRouter();

  async function refresh() {
    try {
      const data = await api<{ user: User | null }>("/api/auth");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!menu) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    setError("");
    try {
      await beforeLeave.current?.();
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "logout" }),
      });
      setUser(null);
      setMenu(false);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }

  const dashboardLabel = user?.role === "TEAM" ? "Моя команда" : "Мои задачи";
  const createHref = user ? "/challenges/new" : "/login?next=/challenges/new";
  const navigation = (
    <>
      <Link
        className={`nav-link ${pathname === "/" ? "active" : ""}`}
        href="/#catalog"
        aria-current={pathname === "/" ? "page" : undefined}
        onClick={() => setMenu(false)}
      >
        Каталог задач
      </Link>
      {user && (
        <Link
          className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          onClick={() => setMenu(false)}
        >
          {dashboardLabel}
        </Link>
      )}
      <Link
        className={`nav-link ${pathname === "/how-it-works" ? "active" : ""}`}
        href="/how-it-works"
        aria-current={pathname === "/how-it-works" ? "page" : undefined}
        onClick={() => setMenu(false)}
      >
        Как это работает
      </Link>
    </>
  );

  return (
    <SessionContext.Provider value={{ user, loading, refresh, setBeforeLeave }}>
      <div className="app-shell">
        <div className="main-shell">
          <header className="topbar">
            <div className="header-inner">
              <Link href="/" aria-label="AI Sana — главная" onClick={() => setMenu(false)}>
                <Brand />
              </Link>
              <nav className="primary-nav" aria-label="Основная навигация">
                {navigation}
              </nav>
              <div className="topbar-actions">
                {!loading && user?.role !== "TEAM" && (
                  <Button className="header-create" asChild>
                    <Link href={createHref}><Plus size={17} />Создать задачу</Link>
                  </Button>
                )}
                {loading ? (
                  <span className="muted" role="status">Загрузка…</span>
                ) : user ? (
                  <>
                    <Link className="user-pill" href="/dashboard" aria-label={`${dashboardLabel}: ${user.name}`}>
                      <span aria-hidden="true">{user.name.slice(0, 1)}</span>
                      <span className="user-name">{user.name}</span>
                    </Link>
                    <button
                      className="icon-button"
                      aria-label={loggingOut ? "Выходим…" : "Выйти"}
                      title="Выйти"
                      disabled={loggingOut}
                      onClick={logout}
                    >
                      <LogOut size={19} />
                    </button>
                  </>
                ) : (
                  <Link className="header-login" href="/login">Войти</Link>
                )}
                <button
                  ref={menuButton}
                  className="menu-toggle"
                  aria-label={menu ? "Закрыть меню" : "Открыть меню"}
                  aria-expanded={menu}
                  aria-controls="mobile-navigation"
                  onClick={() => setMenu(!menu)}
                >
                  {menu ? <X size={23} /> : <Menu size={23} />}
                </button>
              </div>
            </div>
            <nav id="mobile-navigation" className="mobile-nav" aria-label="Мобильная навигация" hidden={!menu}>
              {navigation}
              {!loading && user?.role !== "TEAM" && (
                <Link className="nav-link" href={createHref} onClick={() => setMenu(false)}>
                  <Plus size={18} />Создать задачу
                </Link>
              )}
            </nav>
          </header>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <main id="main-content">{children}</main>
          <footer className="footer">
            <span>AI Sana Challenge Hub</span>
            <p>Помогаем бизнесу и командам работать вместе.</p>
            <Link href="/how-it-works">Как это работает <ArrowRight size={16} /></Link>
          </footer>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
