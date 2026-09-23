import { ArrowUpRight, Check, CircleHelp, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Criterion, PublicTask, Score } from '../types'
import { ProjectArtwork } from './ProjectArtwork'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}
export function Loading() { return <div className="state"><LoaderCircle className="spin" size={24} />Загружаем данные…</div> }
export function Notice({ error, success }: { error?: string; success?: string }) {
  return <>{error && <div className="notice error" role="alert">{error}</div>}{success && <div className="notice success" role="status"><Check size={18} />{success}</div>}</>
}
export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <div className="empty"><CircleHelp size={30} /><h3>{title}</h3><p>{text}</p>{children}</div>
}
export function ScoreBadge({ score }: { score: Score }) {
  return <span className={`score-badge ${score.total_score >= 70 ? 'strong' : ''}`}><b>{score.total_score}</b><span>/ 100 · {score.readiness_level}</span></span>
}
export function ScorePanel({ score, preview = false }: { score: Score; preview?: boolean }) {
  return <section className="panel score-panel"><div className="eyebrow">{preview ? 'Будет после подтверждения' : 'Подтверждённая готовность'}</div>
    <div className="score-hero"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" className="ring-bg" /><circle cx="50" cy="50" r="43" className="ring-value" strokeDasharray={`${score.total_score * 2.702} 270.2`} /></svg><div><strong>{score.total_score}</strong><span>из 100 баллов</span></div></div>
    <h2 className="center">{score.readiness_level}</h2><p className="center muted small">{score.next_level ? `Ещё ${score.points_to_next_level} баллов до уровня «${score.next_level}»` : 'Достигнут высший уровень готовности'}</p>
    <details open className="score-details"><summary>Из чего складывается рейтинг</summary><div className="breakdown">{score.breakdown.map(row => <div key={row.criterion} title={row.basis}><span>{row.criterion}</span><b>{row.awarded}<small> / {row.maximum}</small></b><p>{row.basis}</p></div>)}</div></details>
    {score.improvement_suggestions.length > 0 && <div className="suggestions"><h3>Как сделать задачу понятнее</h3>{score.improvement_suggestions.map(item => <div key={item.action}><span>{item.action}</span><b>+{item.available_points}</b></div>)}</div>}
    <p className="small muted">Оценка заполненности. Достоверность сведений проверяет человек. Любой уровень допускает публикацию.</p>
  </section>
}
export function TaskTile({ task }: { task: PublicTask }) {
  return <Link className="task-tile" to={`/tasks/${task.id}`}>
    <ProjectArtwork industry={task.industry} variant={task.id} />
    <div className="tile-content"><div className="tile-top"><span className="tag">{task.industry}</span><span className="tile-reference">#{String(task.id).padStart(3, '0')}</span></div>
      <h2>{task.card.title}</h2><p className="task-need">{task.card.need || 'Потребность предстоит уточнить вместе с бизнесом.'}</p>
      <div className="company">{task.business_name}</div><div className="tile-bottom"><ScoreBadge score={task.score} /><span className="small muted">{task.proposal_count} откл.</span></div>
    </div>
  </Link>
}
export function CriteriaEditor({ value, onChange, prefix = 'criterion' }: { value: Criterion[]; onChange: (value: Criterion[]) => void; prefix?: string }) {
  const keys: (keyof Criterion)[] = ['criterion', 'expected_value', 'verification_method']
  const names = ['Критерий', 'Ожидаемое значение или условие', 'Способ проверки']
  return <div className="criteria-editor">{value.map((row, i) => <div className="criterion-row" key={i}><div className="row-between"><b>Критерий {i + 1}</b><button type="button" className="icon-button" aria-label={`Удалить критерий ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={16} /></button></div>{keys.map((key, j) => <label key={key} htmlFor={`${prefix}-${i}-${key}`}>{names[j]}<input id={`${prefix}-${i}-${key}`} value={row[key] || ''} maxLength={3000} onChange={e => onChange(value.map((r, n) => n === i ? { ...r, [key]: e.target.value || null } : r))} /></label>)}</div>)}
    <button type="button" className="button secondary small-button" disabled={value.length >= 20} onClick={() => onChange([...value, { criterion: null, expected_value: null, verification_method: null }])}><Plus size={16} />Добавить критерий</button></div>
}
export function SafeLink({ url }: { url: string | null }) {
  if (!url || !/^https?:\/\//i.test(url)) return <span className="muted">Ссылка не указана</span>
  const demo = new URL(url).hostname === 'example.org'
  return <div><a href={url} target="_blank" rel="noopener noreferrer" className="text-link">{demo ? 'Демонстрационная ссылка' : 'Открыть результат'} <ArrowUpRight size={14} /></a>{demo && <p className="small muted">Вымышленный адрес, не работающий прототип.</p>}</div>
}
