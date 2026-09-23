"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, CheckCircle2, ExternalLink, GraduationCap, ImageIcon, Pencil, Star, Users, X } from "lucide-react";
import { api, skillsList } from "@/lib/client";
import type { TeamPhoto, TeamProfileResponse } from "@/lib/team-profile";
import { useSession } from "./shell";
import { Button } from "./ui/button";

export function TeamRating({ average, count }: { average: number | null; count: number }) {
  return <span className="team-rating"><Star size={19} aria-hidden="true" className={count ? "rated" : ""} />
    {count && average !== null ? <><strong>{average.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} / 5</strong><span>Отзывы: {count}</span></> : <span>Пока нет оценок</span>}
  </span>;
}

function safeLinks(value: string) {
  return value.split(/[\n,]+/).map(part => part.trim()).filter(part => {
    try { const url = new URL(part); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
  });
}

export function TeamProfilePage({ id }: { id: string }) {
  const { user, loading: sessionLoading } = useSession();
  const [data, setData] = useState<TeamProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [activePhoto, setActivePhoto] = useState<TeamPhoto | null>(null);
  const [retry, setRetry] = useState(0);
  const [sourceChallenge, setSourceChallenge] = useState("");
  const pending = useRef(false);
  const photoDialog = useRef<HTMLDialogElement>(null);
  const reviewForm = useRef<HTMLFormElement>(null);

  const chooseChallenge = useCallback((next: string, response: TeamProfileResponse) => {
    const review = response.reviewableChallenges.find(item => item.id === next)?.review;
    setChallengeId(next);
    setRating(review?.rating || 0);
    setComment(review?.comment || "");
    setReviewError("");
    setSaved(false);
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<TeamProfileResponse>(`/api/teams/${id}`, { signal: controller.signal })
      .then(response => {
        setData(response);
        const params = new URLSearchParams(window.location.search);
        const requested = params.get("review");
        const from = params.get("from") || "";
        setSourceChallenge(/^[a-z0-9-]{1,100}$/i.test(from) ? from : "");
        const first = response.reviewableChallenges.find(item => item.id === requested)
          || response.reviewableChallenges.find(item => !item.review) || response.reviewableChallenges[0];
        chooseChallenge(first?.id || "", response);
      }).catch(reason => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, user?.id, sessionLoading, retry, chooseChallenge]);

  useEffect(() => {
    if (!loading && data && window.location.hash === "#write-review") {
      requestAnimationFrame(() => document.getElementById("write-review")?.scrollIntoView({ behavior: "instant" }));
    }
  }, [loading, data]);

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setReviewError("");
    setSaved(false);
    if (!rating) {
      setReviewError("Выберите оценку от 1 до 5.");
      reviewForm.current?.querySelector<HTMLInputElement>('input[name="rating"]')?.focus();
      return;
    }
    if (comment.trim().length < 10) {
      setReviewError("Расскажите о работе команды: не менее 10 символов.");
      reviewForm.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = await api<TeamProfileResponse>(`/api/teams/${id}/reviews`, {
        method: "POST", body: JSON.stringify({ challengeId, rating, comment: comment.trim() }),
      });
      setData(response);
      setSaved(true);
    } catch (reason) { setReviewError((reason as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }

  function showPhoto(photo: TeamPhoto) {
    setActivePhoto(photo);
    photoDialog.current?.showModal();
  }

  if (loading) return <div className="page-container"><div className="skeleton hero-skeleton" role="status" aria-label="Загрузка профиля команды" /></div>;
  if (!data) return <div className="empty-state"><Users size={34} /><h1>Не удалось открыть профиль</h1><p role="alert">{error}</p><Button onClick={() => setRetry(value => value + 1)}>Попробовать ещё раз</Button><Link className="text-link" href="/#catalog">В каталог задач</Link></div>;
  const { team, isOwner, reviewableChallenges } = data;
  const photos = team.photos || [];
  const firstPhoto = photos[0];
  const editingReview = reviewableChallenges.find(item => item.id === challengeId)?.review;
  const portfolio = safeLinks(team.portfolio);

  return <div className="page-container public-team-page">
    <Link className="back-link" href={sourceChallenge ? `/challenges/${sourceChallenge}#applications` : isOwner ? "/dashboard?tab=profile" : "/#catalog"}><ArrowLeft size={17} />{sourceChallenge ? "Вернуться к задаче" : isOwner ? "К редактированию профиля" : "Каталог задач"}</Link>
    <header className="surface team-profile-hero">
      <div className="team-cover">
        {firstPhoto ? <button type="button" className="team-cover-photo" onClick={() => showPhoto(firstPhoto)} aria-label="Увеличить фотографию команды"><Image src={firstPhoto.url} alt={firstPhoto.caption || `Команда ${team.name}`} fill sizes="(max-width: 640px) 100vw, 380px" unoptimized /></button>
          : <div className="team-cover-placeholder"><Users size={54} strokeWidth={1.3} /><span>Команда</span></div>}
      </div>
      <div className="team-hero-content">
        <div className="team-profile-kicker"><span>Профиль команды</span>{team.isDemo && <span className="demo-badge">Демо</span>}</div>
        <h1>{team.name}</h1>
        {team.tagline && <p className="team-tagline">{team.tagline}</p>}
        {team.university && <p className="team-university"><GraduationCap size={20} />{team.university}</p>}
        <div className="team-profile-facts">
          <a href="#reviews" className="team-rating-link"><TeamRating {...team.rating} /></a>
          <span><BriefcaseBusiness size={18} />Закрытых задач: {team.completedProjects}</span>
          <span><Users size={18} />Участников: {team.members.length}</span>
        </div>
        {team.skills && <div className="skill-tags">{skillsList(team.skills).map(skill => <span key={skill}>{skill}</span>)}</div>}
        {isOwner && <Button asChild variant="outline"><Link href="/dashboard?tab=profile"><Pencil size={17} />Редактировать профиль</Link></Button>}
        {!!reviewableChallenges.length && <Button asChild variant="outline"><a href="#write-review"><Star size={17} />Оставить отзыв</a></Button>}
      </div>
    </header>

    <div className="team-profile-columns">
      <div className="team-profile-main">
        <section className="surface team-profile-section">
          <h2>О команде</h2><p className="preserve-lines">{team.description || "Команда пока не добавила описание."}</p>
          {team.experience && <><h3>Наш опыт</h3><p className="preserve-lines">{team.experience}</p></>}
        </section>
        <section className="surface team-profile-section" id="projects">
          <div className="panel-heading"><h2>Кому мы помогли</h2><span className="count-badge">{team.cases.length}</span></div>
          {team.cases.length ? <><p className="field-hint">Проекты и результаты описаны самой командой.</p><div className="team-case-list">
            {team.cases.map((project, index) => <article key={index} className="team-case">
              <h3>{project.title}</h3>
              {project.client && <p className="case-client"><BriefcaseBusiness size={17} />{project.client}</p>}
              {project.description && <p className="preserve-lines">{project.description}</p>}
              {project.result && <div className="case-result"><strong>Результат</strong><p className="preserve-lines">{project.result}</p></div>}
              {safeLinks(project.link || "").length > 0 && <a className="text-link" href={project.link} target="_blank" rel="noopener noreferrer">Посмотреть проект <ExternalLink size={16} /><span className="sr-only"> в новой вкладке</span></a>}
            </article>)}
          </div></> : <p className="muted">Примеры проектов ещё не добавлены.</p>}
        </section>
        {!!photos.length && <section className="surface team-profile-section">
          <h2>Фотографии</h2><div className="team-gallery">{photos.map((photo, index) => <figure key={photo.id}>
            <button type="button" onClick={() => showPhoto(photo)} aria-label={`Увеличить фотографию ${index + 1}`}><Image src={photo.url} alt={photo.caption || `Фотография команды ${index + 1}`} fill sizes="(max-width: 640px) 45vw, 330px" unoptimized /><span><ImageIcon size={17} />Увеличить</span></button>
            {photo.caption && <figcaption>{photo.caption}</figcaption>}
          </figure>)}</div>
        </section>}
        <section className="surface team-profile-section" id="reviews">
          <div className="panel-heading"><h2>Отзывы заказчиков</h2><TeamRating {...team.rating} /></div>
          <p className="field-hint">Оценку может оставить заказчик после закрытия задачи, в которой была выбрана эта команда.</p>
          {team.reviews.length ? <div className="team-reviews">{team.reviews.map(review => <article className="team-review" key={review.id}>
            <div className="team-review-heading"><div><strong>{review.authorName}</strong><span>{review.company}</span></div><span className="review-stars" aria-label={`Оценка ${review.rating} из 5`}>{[1, 2, 3, 4, 5].map(value => <Star key={value} size={17} fill={value <= review.rating ? "currentColor" : "none"} aria-hidden="true" />)}</span></div>
            <p className="preserve-lines">{review.comment}</p>
            <div className="team-review-meta"><Link href={`/challenges/${review.challengeId}`}>{review.challengeTitle}<ArrowUpRight size={14} /></Link><time dateTime={review.updatedAt}>{new Date(review.updatedAt).toLocaleDateString("ru-RU")}</time></div>
          </article>)}</div> : <div className="team-reviews-empty"><Star size={30} /><h3>Пока нет отзывов</h3><p>Здесь появятся оценки и впечатления заказчиков после совместной работы.</p></div>}
        </section>
        {!!reviewableChallenges.length && <section className="surface team-profile-section" id="write-review">
          <h2>{editingReview ? "Ваш отзыв" : "Поделитесь опытом работы"}</h2>
          <p className="muted">Отзыв и ваше имя будут видны в профиле команды. Его можно изменить позже.</p>
          <form ref={reviewForm} onSubmit={submitReview} noValidate aria-busy={busy}>
            <fieldset disabled={busy}>
              <label className="field">Совместная задача<select aria-label="Совместная задача" value={challengeId} onChange={event => chooseChallenge(event.target.value, data)}>{reviewableChallenges.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              <fieldset className="rating-picker"><legend>Ваша оценка</legend><div>{[1, 2, 3, 4, 5].map(value => <label key={value} className={value <= rating ? "filled" : ""}>
                <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => { setRating(value); setSaved(false); }} aria-label={`${value} из 5`} />
                <Star size={29} fill={value <= rating ? "currentColor" : "none"} aria-hidden="true" /><span>{value}</span>
              </label>)}</div><p className="field-hint">{rating ? `Вы выбрали ${rating} из 5` : "1 — плохо, 5 — отлично"}</p></fieldset>
              <label className="field" htmlFor="team-review-comment">Как прошла работа?<textarea id="team-review-comment" rows={4} value={comment} minLength={10} maxLength={2000} onChange={event => { setComment(event.target.value); setSaved(false); }} placeholder="Что команда сделала хорошо? Какой результат вы получили? Что можно улучшить?" /></label>
              {reviewError && <div className="error-banner" role="alert">{reviewError}</div>}
              {saved && <div className="success-banner" role="status"><CheckCircle2 size={19} />Отзыв сохранён. Спасибо за обратную связь.</div>}
              <Button type="submit" disabled={busy}>{busy ? "Сохраняем…" : editingReview ? "Сохранить отзыв" : "Опубликовать отзыв"}</Button>
            </fieldset>
          </form>
        </section>}
      </div>
      <aside className="team-profile-sidebar">
        <section className="surface team-profile-section"><h2>Участники</h2>
          {team.members.length ? <ul className="team-member-list">{team.members.map((member, index) => <li key={member.id || index}><span className="member-avatar" aria-hidden="true">{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><span>{member.role || "Участник команды"}</span></div></li>)}</ul> : <p className="muted">Состав команды пока не указан.</p>}
        </section>
        {!!portfolio.length && <section className="surface team-profile-section"><h2>Ссылки на работы</h2><div className="team-portfolio-links">{portfolio.map((href, index) => <a key={`${href}-${index}`} href={href} target="_blank" rel="noopener noreferrer">{new URL(href).hostname.replace(/^www\./, "")}<ExternalLink size={16} /><span className="sr-only"> в новой вкладке</span></a>)}</div></section>}
        {isOwner && <p className="team-public-note">Этот профиль доступен по ссылке и из ваших откликов на задачи.</p>}
      </aside>
    </div>
    <dialog ref={photoDialog} className="team-photo-dialog" aria-label="Фотография команды" onClick={event => { if (event.target === event.currentTarget) photoDialog.current?.close(); }}>
      <button className="icon-button photo-dialog-close" type="button" aria-label="Закрыть фотографию" onClick={() => photoDialog.current?.close()}><X size={23} /></button>
      {activePhoto && <><div className="photo-dialog-image"><Image src={activePhoto.url} alt={activePhoto.caption || "Фотография команды"} fill sizes="95vw" unoptimized /></div>{activePhoto.caption && <p>{activePhoto.caption}</p>}</>}
    </dialog>
  </div>;
}
