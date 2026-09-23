"use client";

import Link from "next/link";
import Image from "next/image";
import { TeamRating } from "./team-profile";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, Check,
  Clock3, ExternalLink, LockKeyhole, Pencil, Send, Users,
} from "lucide-react";
import { api, skillsList, statuses, type Challenge } from "@/lib/client";
import type { BriefField } from "@/lib/brief";
import { editorLabels } from "@/lib/editor-copy";
import { useSession } from "./shell";
import { Button } from "./ui/button";
import { ReadinessPanel } from "./readiness-panel";

const mainFields: BriefField[] = [
  "problem", "outcome", "deliverables", "successCriteria", "data", "constraints",
  "audience", "currentState",
];

function portfolioUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

type ActionError = { scope: string; message: string } | null;
type ApplicationErrors = Partial<Record<"proposal" | "experience" | "timeline", string>>;

export function ChallengeDetail({ id }: { id: string }) {
  const { user, loading: sessionLoading } = useSession();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ApplicationErrors>({});
  const [actionError, setActionError] = useState<ActionError>(null);
  const [success, setSuccess] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const pending = useRef(false);
  const applyForm = useRef<HTMLFormElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await api<{ challenge: Challenge }>(`/api/challenges/${id}`, { signal });
    if (!signal?.aborted) setChallenge(result.challenge);
  }, [id]);

  useEffect(() => {
    if (sessionLoading) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setSuccess("");
    setApplyError("");
    setActionError(null);
    setConfirmClose(false);
    setPublished(new URLSearchParams(window.location.search).get("published") === "1");
    load(controller.signal)
      .catch(err => { if (err.name !== "AbortError") setLoadError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load, user, sessionLoading]);

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const formData = new FormData(event.currentTarget);
    const data = {
      proposal: String(formData.get("proposal") || "").trim(),
      experience: String(formData.get("experience") || "").trim(),
      timeline: String(formData.get("timeline") || "").trim(),
    };
    const errors: ApplicationErrors = {};
    if (data.proposal.length < 20) errors.proposal = "Напишите хотя бы одно предложение: не менее 20 символов.";
    if (data.experience.length < 10) errors.experience = "Кратко расскажите об опыте команды: не менее 10 символов.";
    if (data.timeline.length < 2) errors.timeline = "Укажите срок, например 6 недель.";
    setFieldErrors(errors);
    setApplyError("");
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => applyForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    pending.current = true;
    setBusy("apply");
    setSuccess("");
    try {
      const result = await api<{ challenge: Challenge }>(`/api/challenges/${id}/applications`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      setChallenge(result.challenge);
      setSuccess("Отклик отправлен. Следить за ответом можно в разделе «Моя команда».");
    } catch (err) {
      setApplyError((err as Error).message);
    } finally {
      pending.current = false;
      setBusy("");
    }
  }

  async function action(type: "select" | "close", applicationId?: string) {
    if (pending.current) return;
    const scope = type === "close" ? "close" : applicationId || "select";
    pending.current = true;
    setBusy(scope);
    setActionError(null);
    setSuccess("");
    try {
      const result = await api<{ challenge: Challenge }>(`/api/challenges/${id}/${type}`, {
        method: "POST",
        body: JSON.stringify(applicationId ? { applicationId } : {}),
      });
      setChallenge(result.challenge);
      setConfirmClose(false);
      setPublished(false);
      setSuccess(type === "select" ? "Команда выбрана. Она увидит ваш выбор в своём кабинете." : "Задача закрыта. Новые отклики больше не принимаются.");
    } catch (err) {
      setActionError({ scope, message: (err as Error).message });
    } finally {
      pending.current = false;
      setBusy("");
    }
  }

  if (loading) {
    return <div className="page-container" role="status" aria-label="Загрузка задачи"><div className="skeleton hero-skeleton" /></div>;
  }
  if (!challenge || loadError) {
    return (
      <div className="empty-state">
        <h1>Не удалось открыть задачу</h1>
        <p role="alert">{loadError || "Возможно, задача удалена или доступна только её автору."}</p>
        <Link className="btn btn-outline" href="/#catalog">Вернуться в каталог</Link>
      </div>
    );
  }

  const owner = challenge.ownerId === user?.id;
  const canApply = user?.role === "TEAM" && !challenge.myApplication && challenge.status === "OPEN";
  const applicationCount = challenge.applications?.length ?? challenge.applicationCount;
  const visibleFields = mainFields.filter(field => challenge.brief[field].trim());

  return (
    <div className="page-container detail-page">
      <Link className="back-link" href="/#catalog"><ArrowLeft size={18} />Все задачи</Link>
      <div className="detail-header">
        <div className="detail-company">
          <div className="company-icon"><BriefcaseBusiness size={26} /></div>
          <div>
            <strong>{challenge.company}</strong>
            <span>{challenge.industry}{challenge.isDemo ? " · Демо" : ""}</span>
          </div>
          <span className={`status-badge status-${challenge.status}`}>{statuses[challenge.status]}</span>
        </div>
        <h1>{challenge.brief.title || "Черновик задачи"}</h1>
        <div className="detail-meta">
          <span><Clock3 size={18} />{challenge.brief.timeline || "Срок обсуждается"}</span>
          <span><Users size={18} />Отклики: {challenge.applicationCount}</span>
          <span>Создано {new Date(challenge.createdAt).toLocaleDateString("ru-RU")}</span>
        </div>
        <div className="skill-tags">
          {skillsList(challenge.brief.skills).map(skill => <span key={skill}>{skill}</span>)}
        </div>
      </div>

      {owner && published && challenge.status === "OPEN" && (
        <div className="success-banner" role="status"><Check size={19} />Задача опубликована. Теперь команды могут отправить отклик.</div>
      )}
      {success && <div className="success-banner" role="status"><Check size={19} />{success}</div>}

      <div className="detail-columns">
        <div>
          <article className="surface detail-brief" aria-label="Описание задачи">
            {visibleFields.length ? visibleFields.map(field => (
              <section key={field}>
                <h2>{editorLabels[field]}</h2>
                <p>{challenge.brief[field]}</p>
              </section>
            )) : <p className="muted">Описание пока не заполнено.</p>}
          </article>

          {owner && (
            <section className="surface applications-panel" id="applications" aria-labelledby="applications-title">
              <div className="panel-heading">
                <h2 id="applications-title">Отклики команд</h2>
                <span className="count-badge">{applicationCount}</span>
              </div>
              {challenge.status === "OPEN" && applicationCount > 0 && (
                <p className="application-help">Сравните предложения и выберите одну команду. После выбора приём новых откликов завершится.</p>
              )}
              {challenge.applications?.length ? challenge.applications.map(application => (
                <article className="application-card" key={application.id}>
                  <div className="application-heading">
                    <div>
                      <div className="application-team-title">
                        {application.team?.photos?.[0] && <Image src={application.team.photos[0].url} alt="" width={52} height={52} className="application-team-photo" unoptimized />}
                        <h3>{application.team ? <Link href={`/teams/${application.team.id}?from=${id}`}>{application.team.name}</Link> : "Команда"}</h3>
                      </div>
                      {application.team?.university && <p>{application.team.university}</p>}
                    </div>
                    <span className={`status-badge status-${application.status}`}>{statuses[application.status]}</span>
                  </div>
                  {application.team && <div className="application-profile-bar">
                    <Link className="btn btn-outline btn-sm" href={`/teams/${application.team.id}?from=${id}`}>Посмотреть профиль <ArrowUpRight size={16} /></Link>
                    <TeamRating average={application.team.rating?.average ?? null} count={application.team.rating?.count || 0} />
                    {challenge.status === "CLOSED" && application.status === "SELECTED" && <Link className="text-link" href={`/teams/${application.team.id}?from=${id}&review=${id}#write-review`}>Оценить работу команды</Link>}
                  </div>}
                  <div className="skill-tags">
                    {skillsList(application.team?.skills || "").map(skill => <span key={skill}>{skill}</span>)}
                  </div>
                  {application.team?.description && <p>{application.team.description}</p>}
                  <div className="application-copy">
                    <strong>Предложение решения</strong><p>{application.proposal}</p>
                    <strong>Опыт команды</strong><p>{application.experience}</p>
                    <strong>Предполагаемый срок</strong><p>{application.timeline}</p>
                  </div>
                  {(!!application.team?.members.length || !!application.team?.portfolio.trim()) && (
                    <details className="team-details">
                      <summary>Участники и портфолио</summary>
                      {application.team?.members.map((member, index) => <p key={member.id || index}>{member.name}{member.role ? ` — ${member.role}` : ""}</p>)}
                      {(application.team?.portfolio || "").split(/[\n,]+/).map(value => value.trim()).filter(Boolean).map((value, index) => {
                        const href = portfolioUrl(value);
                        return href ? (
                          <a key={index} href={href} target="_blank" rel="noopener noreferrer">{value}<ExternalLink size={16} aria-label="Откроется в новой вкладке" /></a>
                        ) : <p key={index}>{value}</p>;
                      })}
                    </details>
                  )}
                  {actionError?.scope === application.id && <div className="error-banner application-error" role="alert">{actionError.message}</div>}
                  {challenge.status === "OPEN" && application.status === "PENDING" && (
                    <Button disabled={!!busy} onClick={() => action("select", application.id)}>
                      <Check size={18} />{busy === application.id ? "Выбираем…" : "Выбрать команду"}
                    </Button>
                  )}
                </article>
              )) : (
                <div className="empty-state small-empty">
                  <Users size={30} /><h3>Пока нет откликов</h3>
                  <p>{challenge.status === "DRAFT" ? "Сначала опубликуйте задачу. После этого команды увидят её в каталоге." : challenge.status === "OPEN" ? "Ваша задача видна в каталоге. Здесь появятся предложения команд." : "Команды не отправили отклики на эту задачу."}</p>
                </div>
              )}
            </section>
          )}

          {canApply && (
            <section className="surface apply-panel" id="apply" aria-labelledby="apply-title">
              <h2 id="apply-title">Откликнуться на задачу</h2>
              <p className="application-help">Расскажите, что вы предлагаете. Бизнес получит ваш ответ вместе с <Link className="text-link" href="/dashboard">профилем команды</Link>.</p>
              <form ref={applyForm} onSubmit={apply} noValidate aria-busy={busy === "apply"}>
                <fieldset disabled={!!busy}>
                  <div className="field">
                    <label htmlFor="apply-proposal">Предложение решения</label>
                    <textarea id="apply-proposal" name="proposal" minLength={20} maxLength={4000} required rows={5} placeholder="С чего начнёте и какой результат покажете бизнесу" aria-invalid={!!fieldErrors.proposal} aria-describedby={fieldErrors.proposal ? "proposal-error" : "proposal-hint"} />
                    <span className="field-hint" id="proposal-hint">Хотя бы одно предложение, от 20 до 4 000 символов.</span>
                    {fieldErrors.proposal && <span className="field-error" id="proposal-error">{fieldErrors.proposal}</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="apply-experience">Опыт вашей команды</label>
                    <textarea id="apply-experience" name="experience" minLength={10} maxLength={3000} required rows={3} placeholder="Какие похожие проекты вы делали? Какие навыки помогут?" aria-invalid={!!fieldErrors.experience} aria-describedby={fieldErrors.experience ? "experience-error" : "experience-hint"} />
                    <span className="field-hint" id="experience-hint">Подойдут учебные и личные проекты. От 10 до 3 000 символов.</span>
                    {fieldErrors.experience && <span className="field-error" id="experience-error">{fieldErrors.experience}</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="apply-timeline">Предполагаемый срок</label>
                    <input id="apply-timeline" name="timeline" minLength={2} maxLength={200} required placeholder="Например, 6 недель после выбора команды" aria-invalid={!!fieldErrors.timeline} aria-describedby={fieldErrors.timeline ? "timeline-error" : undefined} />
                    {fieldErrors.timeline && <span className="field-error" id="timeline-error">{fieldErrors.timeline}</span>}
                  </div>
                  {applyError && <div className="error-banner" role="alert">{applyError}</div>}
                  <Button type="submit" disabled={!!busy}><Send size={18} />{busy === "apply" ? "Отправляем…" : "Отправить отклик"}</Button>
                </fieldset>
              </form>
            </section>
          )}
        </div>

        <aside className="detail-sidebar">
          <div className="surface detail-action">
            {owner ? (
              <>
                <h2>Ваша задача</h2>
                <p>{challenge.status === "DRAFT" ? "Проверьте описание и опубликуйте задачу, чтобы получить отклики." : "Предложения команд появятся здесь. Вы сможете выбрать одну команду для работы."}</p>
                <div className="detail-action-links">
                  <Button asChild className="full-width"><a href="#applications">Отклики команд: {applicationCount}<ArrowRight size={18} /></a></Button>
                  {(challenge.status === "DRAFT" || challenge.status === "OPEN") && (
                    <Button asChild className="full-width" variant="outline"><Link href={`/challenges/${id}/edit`}><Pencil size={18} />{challenge.status === "DRAFT" ? "Продолжить черновик" : "Редактировать задачу"}</Link></Button>
                  )}
                </div>
                {challenge.status !== "CLOSED" && (confirmClose ? (
                  <div className="close-confirm">
                    <p>Закрыть задачу? Новые отклики перестанут поступать. Отклики на рассмотрении получат статус «Не выбрана».</p>
                    {actionError?.scope === "close" && <div className="error-banner" role="alert">{actionError.message}</div>}
                    <Button variant="destructive" disabled={!!busy} onClick={() => action("close")}>{busy === "close" ? "Закрываем…" : "Да, закрыть задачу"}</Button>
                    <Button variant="ghost" disabled={!!busy} onClick={() => { setConfirmClose(false); setActionError(null); }}>Отмена</Button>
                  </div>
                ) : <button className="text-button" disabled={!!busy} onClick={() => setConfirmClose(true)}>Закрыть задачу</button>)}
              </>
            ) : challenge.myApplication ? (
              <>
                <Check className="action-icon" size={30} /><h2>Ваш отклик отправлен</h2>
                <span className={`status-badge status-${challenge.myApplication.status}`}>{statuses[challenge.myApplication.status]}</span>
                <p>{challenge.myApplication.status === "SELECTED" ? "Бизнес выбрал вашу команду для решения этой задачи." : challenge.myApplication.status === "REJECTED" ? "Для этой задачи ваша команда не выбрана. Вы можете откликнуться на другие задачи." : "Бизнес рассматривает предложение. Статус обновится после выбора команды."}</p>
                <Button asChild variant="outline"><Link href="/dashboard">Мои отклики <ArrowUpRight size={18} /></Link></Button>
              </>
            ) : challenge.status !== "OPEN" ? (
              <>
                <LockKeyhole size={30} /><h2>Приём откликов завершён</h2>
                <p>В каталоге есть другие задачи, которым нужна команда.</p>
                <Button asChild variant="outline"><Link href="/#catalog">Найти другую задачу</Link></Button>
              </>
            ) : !user ? (
              <>
                <h2>Можете помочь?</h2>
                <p>Войдите или зарегистрируйтесь как команда, чтобы отправить предложение.</p>
                <Button asChild><Link href={`/login?next=${encodeURIComponent(`/challenges/${id}#apply`)}`}>Войти и откликнуться <ArrowRight size={18} /></Link></Button>
              </>
            ) : canApply ? (
              <>
                <h2>Предложите решение</h2>
                <p>Напишите свой подход, опыт команды и срок работы. Это займёт несколько минут.</p>
                <Button className="full-width" asChild><a href="#apply">Откликнуться <ArrowRight size={18} /></a></Button>
              </>
            ) : (
              <>
                <h2>Есть похожая задача?</h2>
                <p>Опишите проблему своего бизнеса и получите предложения команд.</p>
                <Button asChild><Link href="/challenges/new">Создать задачу</Link></Button>
              </>
            )}
          </div>
          <ReadinessPanel report={challenge.readiness} />
        </aside>
      </div>
    </div>
  );
}
