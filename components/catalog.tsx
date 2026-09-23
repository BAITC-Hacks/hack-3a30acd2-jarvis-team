"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight, ArrowUpRight, BriefcaseBusiness, Clock3, Compass,
  GraduationCap, HeartPulse, Landmark, Leaf, Search,
  SlidersHorizontal, Truck, Users, Wheat, X,
} from "lucide-react";
import { api, industries, skillsList, type Challenge } from "@/lib/client";
import { Button } from "./ui/button";
import { useSession } from "./shell";

const industryIcons: Record<string, typeof Leaf> = {
  Ритейл: BriefcaseBusiness,
  Образование: GraduationCap,
  Логистика: Truck,
  Агротехнологии: Wheat,
  Здравоохранение: HeartPulse,
  Экология: Leaf,
  Финансы: Landmark,
  Туризм: Compass,
};

function responseLabel(count: number) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "откликов";
  if (count % 10 === 1) return "отклик";
  if (count % 10 >= 2 && count % 10 <= 4) return "отклика";
  return "откликов";
}

export function ChallengeCard({ challenge, index = 0 }: { challenge: Challenge; index?: number }) {
  const Icon = industryIcons[challenge.industry] || BriefcaseBusiness;
  const score = Math.max(0, Math.min(100, challenge.score));
  const count = challenge.applicationCount || 0;

  return (
    <Link href={`/challenges/${challenge.id}`} className={`challenge-card card-tone-${index % 4}`}>
      <div className="card-top">
        <div className="company-icon"><Icon size={24} strokeWidth={1.7} /></div>
        <div className="company-info">
          <strong>{challenge.company}</strong>
          <span>{challenge.industry}</span>
        </div>
        {challenge.isDemo && <span className="demo-badge">Демо</span>}
      </div>
      <h3>{challenge.brief.title || "Новая задача"}</h3>
      <p className="card-description">{challenge.brief.problem || "Откройте задачу, чтобы посмотреть подробности."}</p>
      <div className="skill-tags">
        {skillsList(challenge.brief.skills).slice(0, 3).map(skill => <span key={skill}>{skill}</span>)}
      </div>
      <div className="card-meta">
        <span><Clock3 size={16} />{challenge.brief.timeline || "Срок обсуждается"}</span>
        <span><Users size={16} />{count} {responseLabel(count)}</span>
      </div>
      <div className="card-score"><span>Описание заполнено</span><strong>{score}%</strong></div>
      <div className="score-track" aria-hidden="true"><div style={{ width: `${score}%` }} /></div>
      <span className="card-link-label">Подробнее о задаче <ArrowUpRight size={18} /></span>
    </Link>
  );
}

export function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useSession();
  const query = params.toString();
  const searchQuery = params.get("q") || "";
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(searchQuery);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ challenges: Challenge[] }>(`/api/challenges?${query}`, { signal: controller.signal })
      .then(data => setChallenges(data.challenges))
      .catch(err => { if (err.name !== "AbortError") setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, retry]);

  useEffect(() => { setSearch(searchQuery); }, [searchQuery]);

  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value.trim()) next.set(key, value.trim());
    else next.delete(key);
    router.push(`/${next.size ? `?${next.toString()}` : ""}#catalog`, { scroll: false });
  }

  function resetFilters() {
    setSearch("");
    router.push("/#catalog", { scroll: false });
  }

  const active = ["q", "industry", "skill", "readiness"].filter(key => params.get(key));
  const createHref = user ? "/challenges/new" : "/login?next=/challenges/new";

  return (
    <div className="page-container">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Бизнес и команды — вместе</div>
          <h1>Задачи бизнеса.<br /><span className="serif-word">Решения команд.</span></h1>
          <p>Расскажите, что нужно улучшить в вашем бизнесе. Мы поможем описать задачу, а команды предложат свои решения.</p>
          <div className="hero-actions">
            {user?.role === "TEAM" ? (
              <>
                <Button asChild><a href="#catalog">Найти задачу <ArrowRight size={18} /></a></Button>
                <Button variant="outline" asChild><Link href="/dashboard">Моя команда</Link></Button>
              </>
            ) : (
              <>
                <Button asChild><Link href={createHref}>Бизнесу: создать задачу <ArrowRight size={18} /></Link></Button>
                <Button variant="outline" asChild><a href="#catalog">Командам: найти задачу</a></Button>
              </>
            )}
          </div>
        </div>
        <aside className="hero-example" aria-label="Пример задачи">
          <span className="eyebrow"><Truck size={19} />Например, доставка цветов</span>
          <h2>«Заказы опаздывают.<br />Как это исправить?»</h2>
          <p>Начните с такого простого описания. Ответьте на несколько вопросов — и задача будет понятна команде.</p>
          <details className="hero-example-details">
            <summary>Посмотреть пример готовой задачи</summary>
            <dl>
              <div><dt>Что сделать</dt><dd>Планировщик маршрутов для диспетчера.</dd></div>
              <div><dt>Как измерить успех</dt><dd>Снизить долю опозданий с 25% до 10%.</dd></div>
              <div><dt>Что передаст команда</dt><dd>Работающий прототип и инструкцию.</dd></div>
            </dl>
            <p className="field-hint">Вымышленный пример: детали уточняются с бизнесом.</p>
          </details>
        </aside>
      </section>

      <div className="process-strip" aria-label="Как разместить задачу">
        <span><span>1</span>Опишите задачу</span>
        <ArrowRight aria-hidden="true" size={19} />
        <span><span>2</span>Уточните детали</span>
        <ArrowRight aria-hidden="true" size={19} />
        <span><span>3</span>Выберите команду</span>
      </div>

      <section id="catalog" className="catalog-section" aria-labelledby="catalog-title">
        <div className="section-heading">
          <div className="section-title-row">
            <h2 id="catalog-title">Открытые задачи</h2>
            <p className="muted">Выберите задачу и расскажите, как ваша команда может помочь.</p>
          </div>
        </div>

        <form className="catalog-search" onSubmit={event => { event.preventDefault(); filter("q", search); }}>
          <div className="field search-label">
            <label htmlFor="catalog-search">Поиск задач</label>
            <span className="search-field">
              <Search size={20} aria-hidden="true" />
              <input
                id="catalog-search"
                placeholder="Например, доставка или аналитика"
                value={search}
                maxLength={200}
                onChange={event => setSearch(event.target.value)}
              />
              {search && (
                <button type="button" className="icon-button" aria-label="Очистить поиск" onClick={() => { setSearch(""); filter("q", ""); }}>
                  <X size={18} />
                </button>
              )}
            </span>
          </div>
          <Button className="search-submit" type="submit">Найти</Button>
          <label className="field industry-filter">Отрасль
            <select value={params.get("industry") || ""} onChange={event => filter("industry", event.target.value)}>
              <option value="">Все отрасли</option>
              {industries.map(industry => <option key={industry}>{industry}</option>)}
            </select>
          </label>
        </form>

        <details className="filter-details">
          <summary><SlidersHorizontal size={18} />Дополнительные фильтры{(params.get("skill") || params.get("readiness")) && <span className="connection-dot" />}</summary>
          <div className="extra-filters">
            <label className="field">Навыки
              <select value={params.get("skill") || ""} onChange={event => filter("skill", event.target.value)}>
                <option value="">Все навыки</option>
                {["Python", "Data Science", "React", "UX/UI", "SQL", "NLP", "Аналитика"].map(skill => <option key={skill}>{skill}</option>)}
              </select>
            </label>
            <label className="field">Заполненность описания
              <select value={params.get("readiness") || ""} onChange={event => filter("readiness", event.target.value)}>
                <option value="">Любая</option>
                <option value="80">От 80%</option>
                <option value="90">От 90%</option>
              </select>
            </label>
          </div>
        </details>

        <div className="catalog-tools">
          <p className="catalog-result-count" role="status">
            {loading ? "Загружаем задачи…" : error ? "Не удалось загрузить задачи" : `Найдено задач: ${challenges.length}`}
          </p>
          <label className="sort-control">Порядок
            <select aria-label="Сортировка" value={params.get("sort") || "newest"} onChange={event => filter("sort", event.target.value)}>
              <option value="newest">Сначала новые</option>
              <option value="readiness">Сначала подробные</option>
            </select>
          </label>
        </div>

        {active.length > 0 && (
          <div className="active-filters" aria-label="Выбранные фильтры">
            {active.map(key => {
              const label = key === "readiness" ? `Описание от ${params.get(key)}%` : params.get(key);
              return <button key={key} aria-label={`Убрать фильтр: ${label}`} onClick={() => filter(key, "")}>{label}<X size={15} /></button>;
            })}
            <button className="reset-filters" onClick={resetFilters}>Сбросить всё</button>
          </div>
        )}

        {error ? (
          <div className="empty-state" role="alert">
            <h3>Не удалось загрузить задачи</h3><p>{error}</p>
            <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Повторить</Button>
          </div>
        ) : loading ? (
          <div className="challenge-grid" aria-label="Загрузка задач" aria-busy="true">
            {[1, 2, 3].map(value => <div key={value} className="skeleton card-skeleton" />)}
          </div>
        ) : challenges.length ? (
          <div className="challenge-grid">
            {challenges.map((challenge, index) => <ChallengeCard key={challenge.id} challenge={challenge} index={index} />)}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={32} />
            <h3>Задачи не найдены</h3>
            <p>Попробуйте другое слово или сбросьте фильтры.</p>
            <Button variant="outline" onClick={resetFilters}>Сбросить фильтры</Button>
          </div>
        )}
        <p className="demo-catalog-note">«Демо» — учебные примеры с вымышленными компаниями. Остальные задачи размещены пользователями.</p>
      </section>
    </div>
  );
}
