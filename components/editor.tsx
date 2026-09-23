"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Cloud, FileText, Lightbulb, LoaderCircle, LockKeyhole, RotateCcw, Sparkles } from "lucide-react";
import { api, ClientError, industries, type Challenge } from "@/lib/client";
import { type BriefField } from "@/lib/brief";
import { detailEditorFields, editorHints, editorLabels, requiredEditorFields } from "@/lib/editor-copy";
import { publicationRequirements } from "@/lib/publication";
import { readiness } from "@/lib/readiness";
import { Button } from "./ui/button";
import { useSession } from "./shell";
import { ReadinessPanel } from "./readiness-panel";

type Step = "description" | "questions" | "review";
const steps: { key: Step; label: string }[] = [
  { key: "description", label: "Опишите задачу" },
  { key: "questions", label: "Уточните детали" },
  { key: "review", label: "Проверьте и опубликуйте" },
];
const exampleDraft = "У нас небольшая служба доставки цветов. Диспетчер распределяет заказы вручную, и курьеры часто опаздывают. Хотим лучше планировать маршруты, но не понимаем, с чего начать.";

export function Editor({ id }: { id?: string }) {
  const { user, loading: sessionLoading, setBeforeLeave } = useSession();
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const current = useRef<Challenge | null>(null);
  const serverStamp = useRef("");
  const version = useRef(0);
  const savedVersion = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const analyzedAnswers = useRef<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Сохранено");
  const [draft, setDraft] = useState("");
  const [company, setCompany] = useState<string | null>(null);
  const [industry, setIndustry] = useState("Ритейл");
  const [step, setStep] = useState<Step>(id ? "questions" : "description");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [attemptedPublish, setAttemptedPublish] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const replace = useCallback((value: Challenge) => {
    current.current = value;
    setChallenge(value);
  }, []);

  const changeStep = useCallback((next: Step) => {
    setStep(next);
    setError("");
    setNotice("");
    if (current.current) {
      const url = new URL(window.location.href);
      url.searchParams.set("step", next);
      url.searchParams.delete("retry");
      window.history.replaceState(null, "", url);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    api<{ challenge: Challenge }>(`/api/challenges/${id}`).then(({ challenge: loaded }) => {
      if (!active) return;
      serverStamp.current = loaded.updatedAt;
      replace(loaded);
      const params = new URLSearchParams(window.location.search);
      const savedStep = params.get("step") as Step;
      setStep(steps.some(item => item.key === savedStep) ? savedStep : loaded.status === "OPEN" || loaded.score >= 60 || Object.keys(loaded.answers || {}).length ? "review" : "questions");
      const unanswered = (loaded.questions || []).findIndex(question => !loaded.answers?.[question.field]?.trim());
      setQuestionIndex(Math.max(0, unanswered));
      if (params.has("retry")) setError("Задача сохранена, но помощник не ответил. Попробуйте ещё раз или заполните описание самостоятельно.");
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, replace]);

  const update = useCallback((patch: Partial<Challenge>) => {
    if (!current.current) return;
    replace({ ...current.current, ...patch });
    version.current += 1;
    setRevision(version.current);
    setSaveStatus("Есть несохранённые изменения");
    setNotice("");
  }, [replace]);

  const reportError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие. Попробуйте ещё раз.");
    if (reason instanceof ClientError && reason.code === "conflict") setConflict(true);
  }, []);

  const save = useCallback(async () => {
    const snapshot = current.current;
    const snapshotVersion = version.current;
    if (!snapshot || snapshotVersion <= savedVersion.current) return snapshot;
    if (conflict) throw new Error("Изменения из другой версии не перезаписаны. Сохраните свои правки отдельным черновиком.");
    setSaveStatus("Сохраняется…");
    const pending = queue.current.catch(() => {}).then(async () => {
      if (snapshotVersion <= savedVersion.current) return current.current;
      const { challenge: saved } = await api<{ challenge: Challenge }>(`/api/challenges/${snapshot.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          draft: snapshot.draft, company: snapshot.company, industry: snapshot.industry,
          brief: snapshot.brief, answers: snapshot.answers, lockedFields: snapshot.lockedFields,
          expectedUpdatedAt: serverStamp.current,
        }),
      });
      serverStamp.current = saved.updatedAt;
      savedVersion.current = snapshotVersion;
      if (version.current === snapshotVersion) {
        replace(saved);
        setSaveStatus("Сохранено");
      }
      return saved;
    });
    queue.current = pending;
    try { return await pending; }
    catch (reason) { setSaveStatus("Не удалось сохранить"); reportError(reason); throw reason; }
  }, [conflict, replace, reportError]);

  useEffect(() => {
    setBeforeLeave(save);
    return () => setBeforeLeave(null);
  }, [save, setBeforeLeave]);

  useEffect(() => {
    if (!revision || busy || conflict) return;
    const timer = setTimeout(() => { void save().catch(() => {}); }, 650);
    return () => clearTimeout(timer);
  }, [revision, busy, conflict, save]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) event.preventDefault();
    };
    const beforeNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || version.current === savedVersion.current) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      void save().then(() => router.push(`${destination.pathname}${destination.search}${destination.hash}`)).catch(reportError);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [save, router, reportError]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { challenge: created } = await api<{ challenge: Challenge }>("/api/challenges", {
        method: "POST", body: JSON.stringify({ draft, company: company ?? user?.company ?? "", industry }),
      });
      setNotice("Описание сохранено. Готовим вопросы…");
      try {
        await api(`/api/challenges/${created.id}/analyze`, { method: "POST", body: JSON.stringify({ expectedUpdatedAt: created.updatedAt }) });
        router.replace(`/challenges/${created.id}/edit?step=questions`);
      } catch {
        router.replace(`/challenges/${created.id}/edit?step=questions&retry=1`);
      }
    } catch (reason) { reportError(reason); setBusy(false); }
  }

  async function analyze(destination: Step = "review") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await save();
      const result = await api<{ challenge: Challenge; mode: "demo" | "live" }>(`/api/challenges/${current.current!.id}/analyze`, {
        method: "POST", body: JSON.stringify({ expectedUpdatedAt: serverStamp.current }),
      });
      serverStamp.current = result.challenge.updatedAt;
      replace({ ...result.challenge, mode: result.mode });
      analyzedAnswers.current = JSON.stringify(result.challenge.answers || {});
      setSaveStatus("Сохранено");
      setQuestionIndex(0);
      changeStep(destination);
      if (destination === "review") setNotice("Ответы добавлены в описание. Проверьте его перед публикацией.");
    } catch (reason) { reportError(reason); }
    finally { setBusy(false); }
  }

  async function goTo(next: Step) {
    if (busy) return;
    if (next === "review" && step === "questions" && Object.values(current.current?.answers || {}).some(Boolean) && analyzedAnswers.current !== JSON.stringify(current.current?.answers || {})) {
      await analyze("review");
      return;
    }
    try { await save(); changeStep(next); } catch (reason) { reportError(reason); }
  }

  async function answerNext(event: React.FormEvent) {
    event.preventDefault();
    if (!current.current) return;
    if (questionIndex >= current.current.questions.length - 1) { await analyze("review"); return; }
    setBusy(true);
    try {
      await save();
      setQuestionIndex(index => index + 1);
      requestAnimationFrame(() => document.getElementById("question-answer")?.focus());
    } catch (reason) { reportError(reason); }
    finally { setBusy(false); }
  }

  function focusField(field: BriefField) {
    setStep("review");
    if (field === "audience" || field === "currentState") setMoreOpen(true);
    requestAnimationFrame(() => document.getElementById(`brief-${field}`)?.focus());
  }

  async function unlockField(field: BriefField) {
    setBusy(true);
    try { await save(); update({ lockedFields: (current.current?.lockedFields || []).filter(key => key !== field) }); }
    catch (reason) { reportError(reason); }
    finally { setBusy(false); }
  }

  async function publish() {
    const local = current.current;
    if (!local) return;
    setAttemptedPublish(true);
    const checks = publicationRequirements(local.brief);
    if (!checks.ready) {
      const field = checks.missingFields[0]?.key || readiness(local.brief).sections.find(section => section.score < section.max)?.key;
      setError(checks.missingFields.length ? `Заполните поле «${editorLabels[checks.missingFields[0].key]}».` : `Добавьте немного деталей: сейчас ${checks.score} из ${checks.minScore} баллов, необходимых для публикации.`);
      if (field) focusField(field);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save();
      await api(`/api/challenges/${local.id}/publish`, { method: "POST", body: JSON.stringify({ expectedUpdatedAt: serverStamp.current }) });
      router.push(`/challenges/${local.id}?published=1`);
    } catch (reason) { reportError(reason); setBusy(false); }
  }

  async function saveCopy() {
    const local = current.current;
    if (!local) return;
    setBusy(true);
    try {
      const { challenge: copy } = await api<{ challenge: Challenge }>("/api/challenges", { method: "POST", body: JSON.stringify({ draft: local.draft, company: local.company, industry: local.industry }) });
      await api(`/api/challenges/${copy.id}`, { method: "PATCH", body: JSON.stringify({ brief: local.brief, answers: local.answers, lockedFields: local.lockedFields, expectedUpdatedAt: copy.updatedAt }) });
      savedVersion.current = version.current;
      router.push(`/challenges/${copy.id}/edit?step=review`);
    } catch (reason) { reportError(reason); setBusy(false); }
  }

  if (sessionLoading || loading) return <div className="page-container editor-page"><div className="skeleton hero-skeleton" aria-label="Загрузка задачи" /></div>;
  if (!user) return <div className="empty-state"><LockKeyhole size={32} /><h1>Войдите, чтобы создать задачу</h1><p>Мы сохраним описание, и вы сможете вернуться к нему в любой момент.</p><Button asChild><Link href={`/login?next=${id ? `/challenges/${id}/edit` : "/challenges/new"}`}>Войти</Link></Button></div>;
  if (user.role !== "BUSINESS") return <div className="empty-state"><h1>Задачи создают представители бизнеса</h1><p>Ваша команда может выбрать проект и предложить своё решение.</p><Button asChild><Link href="/">Найти задачу</Link></Button></div>;
  if (id && !challenge) return <div className="empty-state"><h1>Не удалось открыть задачу</h1><p role="alert">{error}</p><Button asChild variant="outline"><Link href="/dashboard">К моим задачам</Link></Button></div>;
  if (challenge && challenge.ownerId !== user.id) return <div className="empty-state"><h1>Редактировать задачу может её автор</h1><Button asChild variant="outline"><Link href={`/challenges/${id}`}>Посмотреть задачу</Link></Button></div>;
  if (challenge?.status === "ASSIGNED" || challenge?.status === "CLOSED") return <div className="empty-state"><CheckCircle2 size={34} /><h1>Описание задачи зафиксировано</h1><p>После выбора команды или закрытия задачи оно доступно для просмотра.</p><Button asChild><Link href={`/challenges/${id}`}>Открыть задачу</Link></Button></div>;

  const c = challenge;
  const report = c ? readiness(c.brief) : null;
  const checks = c ? publicationRequirements(c.brief) : null;
  const question = c?.questions?.[questionIndex];
  const lowerScoreField = report?.sections.filter(section => section.score < section.max).sort((a, b) => (b.max - b.score) - (a.max - a.score))[0];
  const titles: Record<Step, string> = { description: "Расскажите о вашей задаче", questions: "Давайте уточним детали", review: "Проверьте описание задачи" };
  const descriptions: Record<Step, string> = {
    description: "Опишите проблему своими словами. Мы поможем подготовить понятную задачу для команды.",
    questions: "По одному вопросу за раз. Коротких ответов достаточно, а неизвестное можно пропустить.",
    review: "Здесь всё, что увидят команды. Любой текст можно изменить прямо в поле.",
  };

  function briefField(field: BriefField, required = false) {
    if (!c) return null;
    const invalid = attemptedPublish && checks?.missingFields.some(item => item.key === field);
    const protectedField = c.lockedFields?.includes(field);
    const props = {
      id: `brief-${field}`, value: c.brief[field], maxLength: field === "title" ? 160 : 5000,
      "aria-invalid": !!invalid, "aria-describedby": `hint-${field}`,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update({
        brief: { ...c.brief, [field]: event.target.value },
        lockedFields: Array.from(new Set([...(c.lockedFields || []), field])),
      }),
    };
    return <div className={`review-field ${invalid ? "has-error" : ""}`} key={field}>
      <label className="field" htmlFor={props.id}><span>{editorLabels[field]} {required && <span className="required-word">Обязательно</span>}</span>
        {field === "title" || field === "timeline" || field === "skills" ? <input {...props} /> : <textarea {...props} rows={3} />}
      </label>
      <p id={`hint-${field}`} className={invalid ? "field-error" : "field-hint"}>{invalid ? "Заполните это поле: минимум 5 символов, без «не знаю». " : ""}{editorHints[field]}</p>
      {protectedField && <details className="field-protection"><summary><LockKeyhole size={13} /> Ваша формулировка сохранится при работе помощника</summary><button type="button" onClick={() => void unlockField(field)}><RotateCcw size={14} /> Разрешить помощнику обновлять это поле</button></details>}
    </div>;
  }

  return <div className="page-container editor-page">
    <div className="editor-top"><Link className="back-link" href="/dashboard"><ArrowLeft size={17} /> Мои задачи</Link>{c && <span className={`save-status ${saveStatus === "Не удалось сохранить" ? "text-danger" : ""}`} aria-live="polite">{saveStatus === "Сохраняется…" ? <LoaderCircle size={17} className="spin" /> : <Cloud size={17} />}{saveStatus}</span>}</div>
    <nav className="wizard-steps" aria-label="Создание задачи">{steps.map((item, index) => <button key={item.key} type="button" aria-current={step === item.key ? "step" : undefined} disabled={!c && index !== 0 || busy} onClick={() => void goTo(item.key)}><span>{c && index < steps.findIndex(s => s.key === step) ? <Check size={15} /> : index + 1}</span>{item.label}</button>)}</nav>
    <header className="editor-heading"><h1>{titles[step]}</h1><p className="lead">{descriptions[step]}</p></header>
    {error && <div className="error-banner" role="alert"><div><strong>{conflict ? "Задача уже изменилась" : "Нужно ещё немного внимания"}</strong><p>{error}</p>{conflict && <><p>Ваш текст остаётся здесь. Сохраните его отдельно, чтобы не потерять изменения.</p><Button variant="outline" disabled={busy} onClick={saveCopy}>Сохранить отдельным черновиком</Button></>}</div>{!conflict && <button type="button" aria-label="Закрыть сообщение" onClick={() => setError("")}>×</button>}</div>}
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={20} />{notice}</div>}

    {step === "description" && <form className="surface wizard-description" onSubmit={c ? event => { event.preventDefault(); void analyze("questions"); } : create}>
      <fieldset disabled={busy}>
        <label className="field" htmlFor="source-draft">В чём ваша проблема?<textarea id="source-draft" aria-label="Исходное описание" value={c?.draft ?? draft} onChange={event => c ? update({ draft: event.target.value }) : setDraft(event.target.value)} rows={6} minLength={20} maxLength={12000} required placeholder="Что сейчас работает не так? Кому это мешает? Что вы хотите улучшить?" /></label>
        <div className="draft-helper"><button type="button" onClick={() => c ? update({ draft: exampleDraft }) : setDraft(exampleDraft)}><Lightbulb size={16} /> Вставить пример про доставку</button><span>{(c?.draft ?? draft).length} / 12 000</span></div>
        <div className="form-row"><label className="field">Компания<input value={c?.company ?? company ?? user.company ?? ""} onChange={event => c ? update({ company: event.target.value }) : setCompany(event.target.value)} minLength={2} maxLength={120} required placeholder="Название вашей компании" /></label><label className="field">Отрасль<select aria-label="Отрасль" value={c?.industry ?? industry} onChange={event => c ? update({ industry: event.target.value }) : setIndustry(event.target.value)}>{Array.from(new Set([...industries, c?.industry].filter((value): value is string => !!value))).map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="form-footer"><span><LockKeyhole size={16} /> Пока задачу видите только вы</span><Button disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18} /> Готовим вопросы…</> : <>Продолжить <ArrowRight size={18} /></>}</Button></div>
      </fieldset>
    </form>}

    {step === "questions" && c && <div className="questions-workspace">
      <div className="mode-notice"><Sparkles size={19} /><div><strong>{c.mode === "live" ? "Помощник ИИ" : "Демонстрационный режим"}</strong><p>{c.mode === "live" ? "Помощник подсказывает, какие детали нужны команде. Проверьте результат перед публикацией." : "Вопросы подбирает локальный сценарий. Внешний ИИ не используется."}</p></div></div>
      {question ? <form className="surface question-card" onSubmit={answerNext}>
        <fieldset disabled={busy}>
          <div className="question-progress"><span>Вопрос {questionIndex + 1} из {c.questions.length}</span><div className="question-dots" aria-hidden="true">{c.questions.map((q, index) => <i key={q.id} className={index <= questionIndex ? "filled" : ""} />)}</div></div>
          <h2 id="question-title">{question.question}</h2><p className="field-hint">{editorHints[question.field]}</p>
          <label className="field" htmlFor="question-answer">Ваш ответ<textarea id="question-answer" aria-label={editorLabels[question.field]} value={c.answers?.[question.field] || ""} onChange={event => update({ answers: { ...c.answers, [question.field]: event.target.value } })} rows={5} maxLength={question.field === "title" ? 160 : 5000} placeholder="Напишите так, как объяснили бы коллеге…" /></label>
          {c.lockedFields?.includes(question.field) && <div className="info-banner">Это поле вы изменили вручную. Его текст защищён. <button type="button" onClick={() => { changeStep("review"); focusField(question.field); }}>Открыть поле</button></div>}
          <div className="question-actions"><Button type="button" variant="ghost" disabled={!questionIndex || busy} onClick={() => setQuestionIndex(index => index - 1)}><ArrowLeft size={17} /> Назад</Button><Button disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18} /> Сохраняем…</> : questionIndex === c.questions.length - 1 ? <>Собрать описание <ArrowRight size={18} /></> : <>Далее <ArrowRight size={18} /></>}</Button></div>
          <button type="button" className="text-button skip-question" disabled={busy} onClick={() => { if (questionIndex === c.questions.length - 1) void analyze("review"); else setQuestionIndex(index => index + 1); }}>Пока не знаю — пропустить</button>
        </fieldset>
      </form> : <section className="surface questions-start"><Sparkles size={34} /><h2>{c.score >= 60 ? "Основные детали уже есть" : "Подготовим вопросы по вашей задаче"}</h2><p>{c.score >= 60 ? "Можно перейти к описанию или проверить, что ещё стоит уточнить." : "Помощник предложит до пяти вопросов. Ответьте на те, на которые знаете ответ."}</p><Button disabled={busy} onClick={() => void analyze("questions")}>{busy ? "Готовим вопросы…" : "Получить вопросы"}<ArrowRight size={18} /></Button></section>}
      <button type="button" className="text-link questions-to-review" disabled={busy} onClick={() => void goTo("review")}>Заполнить описание самостоятельно <ChevronRight size={17} /></button>
      <details className="source-summary"><summary>Показать исходное описание</summary><p>{c.draft}</p><button type="button" onClick={() => void goTo("description")}>Изменить описание</button></details>
    </div>}

    {step === "review" && c && report && checks && <div className="review-layout">
      <aside className="review-sidebar">
        <section className={`surface publication-checklist ${checks.ready ? "is-ready" : ""}`} aria-label="Проверка перед публикацией">
          {checks.ready ? <CheckCircle2 size={28} /> : <FileText size={28} />}
          <h2>{checks.ready ? "Можно публиковать" : checks.missingFields.length ? `Заполните ${checks.missingFields.length === 1 ? "ещё одно поле" : `ещё ${checks.missingFields.length} поля`}` : "Добавьте немного деталей"}</h2>
          <p>{checks.ready ? "Команды увидят задачу в каталоге и смогут предложить решение." : "Покажем, что нужно дополнить. Нажмите на пункт, чтобы перейти к полю."}</p>
          {checks.missingFields.length > 0 && <ul>{checks.missingFields.map(item => <li key={item.key}><button type="button" onClick={() => focusField(item.key)}>{editorLabels[item.key]}<ArrowRight size={16} /></button></li>)}</ul>}
          {!checks.scoreReady && <div className="score-needed"><span>Полнота описания: <strong>{checks.score} из {checks.minScore}</strong> нужных баллов.</span>{lowerScoreField && <button type="button" onClick={() => focusField(lowerScoreField.key)}>{editorLabels[lowerScoreField.key]}<ArrowRight size={16} /></button>}</div>}
          {c.status === "DRAFT" ? <Button className="full-width" disabled={busy || conflict} onClick={() => void publish()}>{busy ? <><LoaderCircle className="spin" size={18} /> Сохраняем…</> : <>Опубликовать задачу <ArrowRight size={18} /></>}</Button> : <Button className="full-width" disabled={busy} onClick={async () => { try { await save(); router.push(`/challenges/${c.id}`); } catch (reason) { reportError(reason); } }}>Сохранить и открыть задачу</Button>}
          <span className="publication-privacy"><LockKeyhole size={14} />{c.status === "DRAFT" ? "Без вашего нажатия задача не публикуется" : "Изменения опубликованной задачи видны командам"}</span>
        </section>
        <ReadinessPanel report={report} compact />
        <Button variant="outline" disabled={busy} onClick={() => void analyze("questions")}><Sparkles size={17} /> Помочь с деталями</Button>
      </aside>
      <fieldset className="review-form" disabled={busy}>
        <section className="surface review-section"><div className="section-heading"><div><h2>Главное о задаче</h2><p>Эти четыре поля нужны для публикации.</p></div></div>{requiredEditorFields.map(field => briefField(field, true))}</section>
        <section className="surface review-section"><div className="section-heading"><div><h2>Детали для команды</h2><p>Они помогут оценить объём работы и предложить подходящее решение.</p></div></div>{detailEditorFields.map(field => briefField(field))}</section>
        <details className="surface review-section extra-context" open={moreOpen} onToggle={event => setMoreOpen(event.currentTarget.open)}><summary>Дополнительный контекст</summary>{briefField("audience")}{briefField("currentState")}</details>
        {(c.assumptions?.length > 0 || c.recommendations?.length > 0) && <details className="surface review-section assistant-notes"><summary>Советы помощника</summary>{c.assumptions?.length > 0 && <><h3>Предположения — проверьте их</h3>{c.assumptions.map((text, index) => <p key={index}>{text}</p>)}</>}{c.recommendations?.length > 0 && <><h3>Рекомендации</h3>{c.recommendations.map((text, index) => <p key={index}>{text}</p>)}</>}</details>}
        <details className="source-summary"><summary>Сравнить с исходным описанием</summary><p>{c.draft}</p></details>
        <div className="review-bottom"><Button variant="outline" onClick={() => void goTo("questions")}><ArrowLeft size={17} /> Вернуться к вопросам</Button><Button onClick={() => { void save().then(() => setNotice("Все изменения сохранены.")).catch(reportError); }} disabled={busy}>Сохранить</Button></div>
      </fieldset>
    </div>}
  </div>;
}
