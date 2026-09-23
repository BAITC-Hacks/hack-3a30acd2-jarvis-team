"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ImagePlus, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { api, type Team } from "@/lib/client";
import { MAX_TEAM_CASES, MAX_TEAM_PHOTOS, MAX_TEAM_PHOTO_BYTES, teamProfileSchema, type TeamCase, type TeamPhoto } from "@/lib/team-profile";
import { useSession } from "./shell";
import { Button } from "./ui/button";

type Props = { team: Team; onSaved: (team: Team) => void; onValidationFailure?: () => void };
type PhotoCandidate = { dataUrl: string; name: string };

function textFields(team: Team) {
  return {
    name: team.name, university: team.university, tagline: team.tagline || "",
    description: team.description, experience: team.experience || "", skills: team.skills,
    portfolio: team.portfolio, cases: team.cases || [],
    members: team.members.map(({ name, role }) => ({ name, role })),
  };
}

export function TeamProfileEditor({ team, onSaved, onValidationFailure }: Props) {
  const [profile, setProfile] = useState<Team>(() => ({ ...team, cases: team.cases || [], photos: team.photos || [], tagline: team.tagline || "", experience: team.experience || "" }));
  const current = useRef(profile);
  const savedProfile = useRef(profile);
  const savedText = useRef(JSON.stringify(textFields(profile)));
  const version = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [photoCandidate, setPhotoCandidate] = useState<PhotoCandidate | null>(null);
  const candidate = useRef<PhotoCandidate | null>(null);
  const [caption, setCaption] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileReader = useRef<FileReader | null>(null);
  const savePending = useRef<Promise<void> | null>(null);
  const photoPending = useRef<Promise<void> | null>(null);
  const router = useRouter();
  const { setBeforeLeave } = useSession();

  function update(patch: Partial<Team>) {
    const next = { ...current.current, ...patch };
    current.current = next;
    setProfile(next);
    version.current += 1;
    setDirty(JSON.stringify(textFields(next)) !== savedText.current);
    setSaved(false);
    setFieldErrors({});
    setError("");
  }

  const save = useCallback(async () => {
    if (photoPending.current) await photoPending.current.catch(() => {});
    if (savePending.current) return savePending.current;
    const snapshot = current.current;
    const payload = textFields(snapshot);
    if (JSON.stringify(payload) === savedText.current) { setSaved(true); return; }
    const parsed = teamProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.issues.forEach(issue => { errors[issue.path.join(".")] ??= issue.message; });
      setFieldErrors(errors);
      setError("Проверьте отмеченные поля — остальные изменения сохранены в форме.");
      onValidationFailure?.();
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      throw new Error("Заполните отмеченные поля профиля перед переходом.");
    }
    const snapshotVersion = version.current;
    setBusy(true);
    setError("");
    setSaved(false);
    const pending = (async () => {
      try {
        const { team: updated } = await api<{ team: Team }>("/api/team", { method: "PATCH", body: JSON.stringify(parsed.data) });
        savedProfile.current = updated;
        savedText.current = JSON.stringify(textFields(updated));
        if (version.current === snapshotVersion) {
          current.current = updated;
          setProfile(updated);
          setDirty(false);
          setSaved(true);
        }
        onSaved(updated);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Не удалось сохранить профиль. Попробуйте ещё раз.");
        onValidationFailure?.();
        throw reason;
      } finally { setBusy(false); savePending.current = null; }
    })();
    savePending.current = pending;
    return pending;
  }, [onSaved, onValidationFailure]);

  const saveBeforeLeave = useCallback(async () => {
    await save();
    if (candidate.current || fileReader.current?.readyState === FileReader.LOADING) {
      const message = "Загрузите выбранное фото или отмените выбор перед переходом.";
      setPhotoError(message);
      onValidationFailure?.();
      requestAnimationFrame(() => photoInput.current?.focus());
      throw new Error(message);
    }
  }, [save, onValidationFailure]);

  useEffect(() => {
    setBeforeLeave(saveBeforeLeave);
    return () => setBeforeLeave(null);
  }, [saveBeforeLeave, setBeforeLeave]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(textFields(current.current)) !== savedText.current || candidate.current || photoPending.current || fileReader.current?.readyState === FileReader.LOADING) event.preventDefault();
    };
    const beforeNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (JSON.stringify(textFields(current.current)) === savedText.current && !candidate.current && !photoPending.current && fileReader.current?.readyState !== FileReader.LOADING) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      void saveBeforeLeave().then(() => router.push(`${destination.pathname}${destination.search}${destination.hash}`)).catch(() => {});
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [saveBeforeLeave, router]);

  useEffect(() => () => { fileReader.current?.abort(); }, []);

  function clearCandidate(resetInput = true) {
    fileReader.current?.abort();
    fileReader.current = null;
    candidate.current = null;
    setPhotoCandidate(null);
    setReadingPhoto(false);
    setCaption("");
    if (resetInput && photoInput.current) photoInput.current.value = "";
  }

  function choosePhoto(file?: File) {
    clearCandidate(false);
    setPhotoError("");
    setPhotoNotice("");
    if (!file) return;
    if (current.current.photos.length >= MAX_TEAM_PHOTOS) { setPhotoError(`Можно добавить до ${MAX_TEAM_PHOTOS} фото. Удалите одно, чтобы загрузить новое.`); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setPhotoError("Выберите изображение JPEG, PNG или WebP."); return; }
    if (!file.size || file.size > MAX_TEAM_PHOTO_BYTES) { setPhotoError("Фото должно быть не больше 4 МБ. Выберите другой файл."); return; }
    const reader = new FileReader();
    fileReader.current = reader;
    setReadingPhoto(true);
    reader.onload = () => {
      if (reader !== fileReader.current) return;
      const selected = { dataUrl: String(reader.result), name: file.name };
      candidate.current = selected;
      setPhotoCandidate(selected);
      setReadingPhoto(false);
    };
    reader.onerror = () => { if (reader === fileReader.current) { setPhotoError("Не удалось прочитать файл. Выберите фото ещё раз."); setReadingPhoto(false); } };
    reader.readAsDataURL(file);
  }

  function replacePhotos(photos: TeamPhoto[]) {
    const next = { ...current.current, photos };
    current.current = next;
    setProfile(next);
    savedProfile.current = { ...savedProfile.current, photos };
    onSaved(savedProfile.current);
  }

  async function uploadPhoto() {
    if (!candidate.current || photoPending.current || savePending.current) return;
    const selected = candidate.current;
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoNotice("");
    const pending = (async () => {
      try {
        const { photo } = await api<{ photo: TeamPhoto }>("/api/team/photos", { method: "POST", body: JSON.stringify({ dataUrl: selected.dataUrl, caption }) });
        replacePhotos([...current.current.photos, photo]);
        clearCandidate();
        setPhotoNotice("Фото добавлено в профиль.");
      } catch (reason) { setPhotoError(reason instanceof Error ? reason.message : "Не удалось загрузить фото. Попробуйте ещё раз."); }
      finally { setPhotoBusy(false); photoPending.current = null; }
    })();
    photoPending.current = pending;
    await pending;
  }

  async function removePhoto(photo: TeamPhoto) {
    if (photoPending.current || savePending.current) return;
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoNotice("");
    const pending = (async () => {
      try {
        await api(`/api/team/photos/${photo.id}`, { method: "DELETE" });
        replacePhotos(current.current.photos.filter(item => item.id !== photo.id));
        setPhotoNotice("Фото удалено из профиля.");
      } catch (reason) { setPhotoError(reason instanceof Error ? reason.message : "Не удалось удалить фото. Попробуйте ещё раз."); }
      finally { setPhotoBusy(false); photoPending.current = null; }
    })();
    photoPending.current = pending;
    await pending;
  }

  function updateCase(index: number, patch: Partial<TeamCase>) {
    update({ cases: current.current.cases.map((item, position) => position === index ? { ...item, ...patch } : item) });
  }

  function issue(field: string) {
    return fieldErrors[field] ? <span className="field-error" id={`team-error-${field}`}>{fieldErrors[field]}</span> : null;
  }

  function validation(field: string) {
    return { "aria-invalid": !!fieldErrors[field], "aria-describedby": fieldErrors[field] ? `team-error-${field}` : undefined };
  }

  return (
    <div className="team-profile-editor">
      <div className="profile-editor-intro">
        <div><h2>Расскажите о своей команде</h2><p className="muted">Покажите, чем вы занимаетесь и кому уже помогли. Этот профиль виден всем, а заказчик сможет открыть его прямо из вашего отклика.</p></div>
        <Button variant="outline" asChild><Link href={`/teams/${profile.id}`}>Открыть профиль <ArrowUpRight size={18} /></Link></Button>
      </div>
      <form ref={form} className="team-form profile-editor-sections" noValidate aria-busy={busy} onSubmit={event => { event.preventDefault(); void save().catch(() => {}); }}>
        <fieldset className="team-fields" disabled={busy}>
          <section className="surface profile-editor-section" aria-labelledby="team-about-heading">
            <div className="profile-section-heading"><h3 id="team-about-heading">О команде</h3><p className="muted">Обязательно только название. Остальное можно заполнить позже.</p></div>
            <div className="form-row">
              <label className="field">Название команды <span className="required-word">обязательно</span>
                <input name="name" required minLength={2} maxLength={120} value={profile.name} {...validation("name")} onChange={event => update({ name: event.target.value })} />{issue("name")}
              </label>
              <label className="field">Учебное заведение или организация
                <input name="university" maxLength={160} value={profile.university} {...validation("university")} placeholder="Университет, колледж или компания" onChange={event => update({ university: event.target.value })} />{issue("university")}
              </label>
            </div>
            <label className="field">Чем занимается команда
              <input name="tagline" maxLength={160} value={profile.tagline} {...validation("tagline")} onChange={event => update({ tagline: event.target.value })} placeholder="Например: создаём сайты и автоматизируем работу малого бизнеса" />
              <span className="field-hint">Одно предложение, которое заказчик увидит первым.</span>{issue("tagline")}
            </label>
            <label className="field">О команде подробнее
              <textarea name="description" rows={4} maxLength={3000} value={profile.description} {...validation("description")} onChange={event => update({ description: event.target.value })} placeholder="Кто вы, какие задачи решаете и как работаете с заказчиками" />{issue("description")}
            </label>
            <label className="field">Навыки
              <input name="skills" maxLength={1000} value={profile.skills} {...validation("skills")} onChange={event => update({ skills: event.target.value })} placeholder="Например: React, Python, дизайн интерфейсов" />
              <span className="field-hint">Перечислите через запятую.</span>{issue("skills")}
            </label>
          </section>
          <section className="surface profile-editor-section" aria-labelledby="team-experience-heading">
            <div className="profile-section-heading"><h3 id="team-experience-heading">Опыт и ссылки</h3><p className="muted">Можно рассказать о коммерческих, учебных и волонтёрских проектах.</p></div>
            <label className="field">Опыт команды
              <textarea name="experience" maxLength={5000} rows={4} value={profile.experience} {...validation("experience")} onChange={event => update({ experience: event.target.value })} placeholder="Как давно работаете вместе, с какими задачами сталкивались, что умеете особенно хорошо" />{issue("experience")}
            </label>
            <label className="field">Портфолио
              <textarea name="portfolio" rows={3} maxLength={2000} value={profile.portfolio} {...validation("portfolio")} onChange={event => update({ portfolio: event.target.value })} placeholder="https://github.com/your-team" />
              <span className="field-hint">Ссылки на сайт, репозитории или презентации. Каждая с https:// или http://, по одной на строку.</span>{issue("portfolio")}
            </label>
          </section>
          <section className="surface profile-editor-section" aria-labelledby="team-cases-heading">
            <div className="profile-section-heading"><h3 id="team-cases-heading">Кому вы уже помогли</h3><p className="muted">Добавьте реальные проекты: кому помогли, что сделали и что изменилось.</p></div>
            {profile.cases.map((item, index) => (
              <div className="profile-case-card" key={index}>
                <div className="profile-case-heading"><h4>Проект {index + 1}</h4><button type="button" className="icon-button" aria-label={`Удалить проект ${index + 1}`} onClick={() => update({ cases: profile.cases.filter((_, position) => position !== index) })}><Trash2 size={18} /></button></div>
                <div className="form-row">
                  <label className="field">Название проекта
                    <input name={`cases.${index}.title`} required minLength={2} maxLength={140} value={item.title} {...validation(`cases.${index}.title`)} onChange={event => updateCase(index, { title: event.target.value })} placeholder="Например: сайт для цветочной мастерской" />{issue(`cases.${index}.title`)}
                  </label>
                  <label className="field">Кому помогли
                    <input name={`cases.${index}.client`} maxLength={160} value={item.client} {...validation(`cases.${index}.client`)} onChange={event => updateCase(index, { client: event.target.value })} placeholder="Название клиента или сфера его бизнеса" />{issue(`cases.${index}.client`)}
                  </label>
                </div>
                <label className="field">Что сделали
                  <textarea name={`cases.${index}.description`} rows={3} maxLength={2000} value={item.description} {...validation(`cases.${index}.description`)} onChange={event => updateCase(index, { description: event.target.value })} placeholder="Какая была задача и как вы её решили" />{issue(`cases.${index}.description`)}
                </label>
                <label className="field">Какой результат получили
                  <textarea name={`cases.${index}.result`} rows={2} maxLength={1500} value={item.result} {...validation(`cases.${index}.result`)} onChange={event => updateCase(index, { result: event.target.value })} placeholder="Например: менеджер обрабатывает заказ за 2 минуты вместо 10" />{issue(`cases.${index}.result`)}
                </label>
                <label className="field">Ссылка на проект
                  <input name={`cases.${index}.link`} type="url" maxLength={1000} value={item.link} {...validation(`cases.${index}.link`)} onChange={event => updateCase(index, { link: event.target.value })} placeholder="https://example.com" />{issue(`cases.${index}.link`)}
                </label>
              </div>
            ))}
            {issue("cases")}
            <Button type="button" variant="outline" disabled={profile.cases.length >= MAX_TEAM_CASES} onClick={() => update({ cases: [...profile.cases, { title: "", client: "", description: "", result: "", link: "" }] })}><Plus size={18} />Добавить проект</Button>
            <p className="field-hint">До {MAX_TEAM_CASES} проектов. Если опыта пока нет, оставьте этот раздел пустым.</p>
          </section>
          <section className="surface profile-editor-section" aria-labelledby="team-members-heading">
            <div className="profile-section-heading"><h3 id="team-members-heading">Участники</h3><p className="muted">Кто будет работать над задачей и за что отвечает.</p></div>
            {profile.members.map((member, index) => (
              <div className="member-row" key={member.id || `new-${index}`}>
                <label className="field">Имя
                  <input name={`members.${index}.name`} required maxLength={100} value={member.name} {...validation(`members.${index}.name`)} onChange={event => update({ members: profile.members.map((item, position) => position === index ? { ...item, name: event.target.value } : item) })} />{issue(`members.${index}.name`)}
                </label>
                <label className="field">Роль в команде
                  <input name={`members.${index}.role`} maxLength={120} value={member.role} {...validation(`members.${index}.role`)} onChange={event => update({ members: profile.members.map((item, position) => position === index ? { ...item, role: event.target.value } : item) })} placeholder="Например, разработчик" />{issue(`members.${index}.role`)}
                </label>
                <button type="button" className="icon-button" aria-label={`Удалить участника ${index + 1}`} onClick={() => update({ members: profile.members.filter((_, position) => position !== index) })}><Trash2 size={19} /></button>
              </div>
            ))}
            {issue("members")}
            <Button type="button" variant="outline" disabled={profile.members.length >= 20} onClick={() => update({ members: [...profile.members, { name: "", role: "" }] })}><Plus size={18} />Добавить участника</Button>
            {profile.members.length >= 20 && <p className="field-hint">Можно добавить до 20 участников.</p>}
          </section>
        </fieldset>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="surface form-footer profile-editor-footer">
          <span className="profile-save-note" role="status">{busy ? "Сохраняем изменения…" : saved && !dirty ? <><Check size={18} />Профиль сохранён</> : dirty ? "Есть несохранённые изменения" : "Сохраните текст, когда закончите заполнение."}</span>
          <Button type="submit" disabled={busy || photoBusy}><Save size={18} />{busy ? "Сохраняем…" : "Сохранить профиль"}</Button>
        </div>
      </form>
      <section className="surface profile-editor-section" aria-labelledby="team-photos-heading" aria-busy={photoBusy}>
        <div className="profile-section-heading"><h3 id="team-photos-heading">Фото команды и проектов</h3><p className="muted">Первое фото станет обложкой профиля. Можно добавить до {MAX_TEAM_PHOTOS} фото: JPEG, PNG или WebP до 4 МБ каждое.</p><p className="field-hint">Фото сохраняются сразу после загрузки. Текст выше сохраняется кнопкой «Сохранить профиль».</p></div>
        {!!profile.photos.length && <div className="profile-photo-grid">
          {profile.photos.map((photo, index) => (
            <figure className="profile-photo-card" key={photo.id}>
              <Image src={photo.url} alt={photo.caption || `Фото команды «${profile.name}», ${index + 1}`} width={800} height={600} unoptimized />
              <figcaption>{index === 0 && <span className="badge">Обложка</span>}{photo.caption || `Фото ${index + 1}`}</figcaption>
              <button type="button" className="icon-button profile-photo-remove" disabled={photoBusy || busy} aria-label={`Удалить фото ${index + 1}`} onClick={() => { void removePhoto(photo); }}><Trash2 size={18} /></button>
            </figure>
          ))}
        </div>}
        <div className="profile-photo-upload">
          {profile.photos.length < MAX_TEAM_PHOTOS && <label className="field" htmlFor="team-photo-file"><span><ImagePlus size={19} />Выберите фото</span><input ref={photoInput} id="team-photo-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy || busy} onChange={event => choosePhoto(event.target.files?.[0])} /></label>}
          {profile.photos.length >= MAX_TEAM_PHOTOS && <p className="field-hint">Все {MAX_TEAM_PHOTOS} фото загружены. Удалите одно, чтобы добавить новое.</p>}
          {readingPhoto && <p role="status">Подготавливаем фото…</p>}
          {photoCandidate && <div className="profile-photo-preview">
            <Image src={photoCandidate.dataUrl} alt={`Предпросмотр: ${photoCandidate.name}`} width={800} height={600} unoptimized />
            <label className="field">Подпись к фото<input maxLength={200} value={caption} disabled={photoBusy || busy} onChange={event => setCaption(event.target.value)} placeholder="Например: наша команда на демонстрации проекта" /><span className="field-hint">Что изображено на фото. Подпись увидят посетители профиля.</span></label>
            <div className="action-row"><Button type="button" disabled={photoBusy || busy} onClick={() => { void uploadPhoto(); }}><Upload size={18} />{photoBusy ? "Загружаем…" : "Загрузить фото"}</Button><Button type="button" variant="ghost" disabled={photoBusy || busy} onClick={() => { clearCandidate(); setPhotoError(""); }}><X size={18} />Отменить выбор</Button></div>
          </div>}
        </div>
        {photoError && <div className="error-banner" role="alert">{photoError}</div>}
        {photoNotice && <p className="success-banner" role="status">{photoNotice}</p>}
      </section>
      <p className="muted">Оценки и отзывы о команде оставляют заказчики после завершения совместных задач. Они появятся в вашем <Link href={`/teams/${profile.id}`}>публичном профиле</Link>.</p>
    </div>
  );
}
