import { useState } from 'react'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useActor } from '../App'
import { api } from '../api/client'
import { useAction, useResource } from '../api/hooks'
import { Loading, Notice, PageHeading, ScorePanel } from '../components/common'
import { labels, type Proposal, type PublicTask, type TextField } from '../types'

export function TaskDetail() {
  const { id } = useParams()
  const { actor } = useActor()
  const resource = useResource<PublicTask>(`/tasks/${id}`)
  const action = useAction()
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ idea: '', plan: '', estimated_duration: '', prototype_url: '' })
  if (resource.loading) return <Loading />
  if (!resource.data || resource.error) return <><Notice error={resource.error} /><button className="button secondary" onClick={resource.reload}>Повторить загрузку</button></>
  const task = resource.data
  const fields = (Object.keys(labels) as (keyof typeof labels)[]).filter(f => f !== 'title' && f !== 'success_criteria') as TextField[]
  return <><Link className="back-link" to="/catalog"><ArrowLeft size={15} />Все задачи</Link><PageHeading eyebrow={`${task.industry} · ${task.business_name}`} title={task.card.title || 'Задача без названия'} description="Подтверждённая бизнесом карточка" action={actor?.role === 'business' && actor.id === task.business_id && <Link className="button secondary" to={`/business/tasks/${id}/edit`}>Редактировать</Link>} />
    <div className="editor-layout"><div><section className="panel"><div className="detail-fields">{fields.map(field => <div key={field}><h3>{labels[field]}</h3><p className={!task.card[field] ? 'muted pre-wrap' : 'pre-wrap'}>{task.card[field] || 'Пока не указано'}</p></div>)}<div className="full-width"><h3>Критерии успеха</h3>{task.card.success_criteria.length ? task.card.success_criteria.map((c, i) => <div className="criterion-public" key={i}><b>{c.criterion || 'Критерий не указан'}</b><p>Ожидается: {c.expected_value || 'Пока не указано'}</p><p>Проверка: {c.verification_method || 'Пока не указано'}</p></div>) : <p className="muted">Пока не указаны</p>}</div></div></section>
      <section className="panel proposal-form" id="proposal"><h2>Предложите свой подход</h2><p className="muted">Решение принимает бизнес. Можно выбрать несколько команд.</p><Notice error={action.error} success={action.success} />{actor?.role === 'team' ? sent ? <Link className="button secondary" to="/team">Посмотреть статус в кабинете<ArrowRight size={16} /></Link> : <form onSubmit={e => { e.preventDefault(); void action.run(async () => { await api<Proposal>(`/tasks/${id}/proposals`, 'POST', { ...form, prototype_url: form.prototype_url || null }); setSent(true) }, 'Предложение отправлено. Бизнес рассмотрит его вручную.') }}><fieldset disabled={action.busy}><label htmlFor="idea">Идея решения<textarea id="idea" value={form.idea} minLength={5} maxLength={3000} required onChange={e => setForm({ ...form, idea: e.target.value })} placeholder="Как вы предлагаете решить задачу?" /></label><label htmlFor="plan">План работы<textarea id="plan" value={form.plan} minLength={5} maxLength={5000} required onChange={e => setForm({ ...form, plan: e.target.value })} placeholder="Основные шаги и подход к проверке" /></label><div className="two-columns"><label htmlFor="duration">Предполагаемый срок<input id="duration" minLength={2} maxLength={200} required value={form.estimated_duration} onChange={e => setForm({ ...form, estimated_duration: e.target.value })} placeholder="Например: 3 недели" /></label><label htmlFor="prototype">Ссылка на прототип · необязательно<input id="prototype" type="url" pattern="https?://.*" maxLength={2000} value={form.prototype_url} onChange={e => setForm({ ...form, prototype_url: e.target.value })} placeholder="https://" /></label></div><button className="button" type="submit"><Send size={16} />{action.busy ? 'Отправляем…' : 'Отправить предложение'}</button><p className="small muted top-gap">Отправка предложения не начисляет баллы команды.</p></fieldset></form> : <>{actor?.role === 'business' && actor.id === task.business_id ? <Link className="button secondary" to={`/business/tasks/${id}/proposals`}>Рассмотреть предложения ({task.proposal_count})<ArrowRight size={16} /></Link> : <Link className="button secondary" to="/">Выбрать профиль команды</Link>}</>}</section></div><aside><ScorePanel score={task.score} /></aside></div></>
}
