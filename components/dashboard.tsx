"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, FileText, Plus, Search, Users } from "lucide-react";
import { api, statuses, type Application, type Challenge, type Team, type User } from "@/lib/client";
import { useSession } from "./shell";
import { Button } from "./ui/button";
import { TeamProfileEditor } from "./team-profile-editor";

type DashboardData = { user: User; challenges: Challenge[]; applications: Application[]; team: Team | null };

export function Dashboard() {
  const { user, loading: sessionLoading } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [tab, setTab] = useState("applications");
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    const result = await api<DashboardData>("/api/dashboard", { signal });
    if (signal?.aborted) return;
    setData(result);
    setTeam(result.team);
  }, []);

  useEffect(() => {
    if (!user) return;
    setTab(new URLSearchParams(window.location.search).get("tab") === "profile" ? "profile" : "applications");
    const controller = new AbortController();
    load(controller.signal).catch(err => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [user, load]);

  function selectTab(next: string) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  if (sessionLoading) {
    return <div className="page-container" role="status" aria-label="Загрузка кабинета"><div className="skeleton hero-skeleton" /></div>;
  }
  if (!user) {
    return (
      <div className="empty-state">
        <Users size={35} /><h1>Войдите в свой аккаунт</h1>
        <p>Здесь будут ваши задачи, отклики и профиль команды.</p>
        <Button asChild><Link href="/login?next=/dashboard">Войти <ArrowRight size={18} /></Link></Button>
      </div>
    );
  }
  if (!data || data.user.id !== user.id) {
    return (
      <div className="page-container">
        {error ? (
          <div className="empty-state" role="alert"><h2>Не удалось загрузить кабинет</h2><p>{error}</p><Button onClick={() => load().catch(err => setError(err.message))}>Повторить</Button></div>
        ) : <div className="skeleton hero-skeleton" role="status" aria-label="Загрузка кабинета" />}
      </div>
    );
  }

  const business = user.role === "BUSINESS";
  const list = filter === "ALL" ? data.challenges : data.challenges.filter(challenge => challenge.status === filter);
  const statusFilters = [["ALL", "Все задачи"], ["DRAFT", "Черновики"], ["OPEN", "Опубликованы"], ["ASSIGNED", "В работе"], ["CLOSED", "Закрыты"]];

  return (
    <div className="page-container dashboard-page">
      <div className="dashboard-heading">
        <div>
          <h1>{business ? "Мои задачи" : "Моя команда"}</h1>
          <p className="lead">{business ? "Продолжайте черновики, следите за откликами и выбирайте команду." : "Следите за откликами и расскажите бизнесу о своей команде."}</p>
        </div>
        <Button asChild>
          <Link href={business ? "/challenges/new" : "/#catalog"}>
            {business ? <Plus size={18} /> : <Search size={18} />}{business ? "Создать задачу" : "Найти задачу"}
          </Link>
        </Button>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}

      {business ? (
        <>
          <div className="dashboard-summary">
            {[
              { label: "Всего задач", value: data.challenges.length, icon: FileText },
              { label: "Принимают отклики", value: data.challenges.filter(challenge => challenge.status === "OPEN").length, icon: Search },
              { label: "Получено откликов", value: data.challenges.reduce((count, challenge) => count + challenge.applicationCount, 0), icon: Users },
              { label: "Команда выбрана", value: data.challenges.filter(challenge => challenge.status === "ASSIGNED").length, icon: Check },
            ].map(stat => <div key={stat.label}><stat.icon size={20} /><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
          </div>
          <div className="dashboard-tabs" aria-label="Статус задач">
            {statusFilters.map(([key, label]) => (
              <button key={key} className={filter === key ? "selected" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}<span>{key === "ALL" ? data.challenges.length : data.challenges.filter(challenge => challenge.status === key).length}</span>
              </button>
            ))}
          </div>
          <div className="dashboard-list">
            {list.length ? list.map(challenge => (
              <Link href={challenge.status === "DRAFT" ? `/challenges/${challenge.id}/edit` : `/challenges/${challenge.id}`} className="dashboard-row" key={challenge.id}>
                <div className={`row-icon status-${challenge.status}`}><FileText size={24} /></div>
                <div className="row-main">
                  <span className="row-company">{challenge.company} · {challenge.industry}</span>
                  <h3>{challenge.brief.title || challenge.draft.slice(0, 85) || "Новый черновик"}</h3>
                  <div className="row-detail">
                    <span className={`status-badge status-${challenge.status}`}>{statuses[challenge.status]}</span>
                    <span>Обновлено {new Date(challenge.updatedAt).toLocaleDateString("ru-RU")}</span>
                  </div>
                </div>
                <div className="row-score"><strong>{challenge.score}%</strong><span>Описание заполнено</span></div>
                <div className="row-applications"><Users size={18} /><strong>{challenge.applicationCount}</strong><span>Отклики</span></div>
                <ArrowUpRight size={21} />
              </Link>
            )) : (
              <div className="empty-state surface">
                <FileText size={34} />
                <h3>{filter === "ALL" ? "У вас пока нет задач" : "Задач с таким статусом пока нет"}</h3>
                <p>{filter === "ALL" ? "Начните с нескольких предложений о проблеме вашего бизнеса." : "Посмотрите все задачи или создайте новую."}</p>
                {filter === "ALL" ? (
                  <Button asChild><Link href="/challenges/new">Создать первую задачу <Plus size={18} /></Link></Button>
                ) : <Button variant="outline" onClick={() => setFilter("ALL")}>Показать все задачи</Button>}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="dashboard-tabs" aria-label="Разделы команды">
            <button className={tab === "applications" ? "selected" : ""} aria-pressed={tab === "applications"} onClick={() => selectTab("applications")}>Мои отклики <span>{data.applications.length}</span></button>
            <button className={tab === "profile" ? "selected" : ""} aria-pressed={tab === "profile"} onClick={() => selectTab("profile")}>Профиль команды</button>
          </div>
          <div className="dashboard-list" hidden={tab !== "applications"}>
              {data.applications.length ? data.applications.map(application => (
                <Link href={`/challenges/${application.challengeId}`} className="dashboard-row" key={application.id}>
                  <div className="row-icon"><FileText size={24} /></div>
                  <div className="row-main">
                    <span className="row-company">{application.challenge?.company}</span>
                    <h3>{application.challenge?.brief.title || "Задача бизнеса"}</h3>
                    <p className="application-excerpt">{application.proposal}</p>
                    <span className={`status-badge status-${application.status}`}>{statuses[application.status]}</span>
                  </div>
                  <ArrowUpRight size={21} />
                </Link>
              )) : (
                <div className="empty-state surface">
                  <Search size={34} /><h3>Вы ещё не откликались на задачи</h3>
                  <p>Выберите задачу в каталоге и предложите, как ваша команда поможет бизнесу.</p>
                  <Button asChild><Link href="/#catalog">Найти задачу <ArrowRight size={18} /></Link></Button>
                </div>
              )}
          </div>
          <div hidden={tab !== "profile"}>
            {team ? <TeamProfileEditor key={team.id} team={team} onSaved={setTeam} onValidationFailure={() => selectTab("profile")} />
              : <div className="empty-state surface"><h3>Профиль команды не найден</h3><p>Попробуйте выйти и снова войти в аккаунт.</p></div>}
          </div>
        </>
      )}
    </div>
  );
}
