import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Save, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAction, useResource } from '../api/hooks'
import { CriteriaEditor, Loading, Notice, PageHeading, ScorePanel } from '../components/common'
import { emptyCard, industries, labels, type Answer, type Criterion, type PrivateTask, type Score, type TaskCard, type TextField } from '../types'

const STEPS = ['Описание', 'Вопросы', 'Карточка', 'Подтверждение и публикация']
const GROUPS: { title: string; fields: TextField[] }[] = [
  { title: 'Суть задачи', fields: ['title', 'context', 'need', 'users'] },
  { title: 'Данные и результат', fields: ['data', 'data_source', 'expected_result'] },
  { title: 'Условия и связь', fields: ['deadline', 'constraints', 'contact', 'interaction_format', 'feedback_process'] },
]

export function Editor() { const { id } = useParams(); return <EditorContent key={id || 'new'} id={id} /> }
function EditorContent({ id }: { id?: string }) {
  const resource = useResource<PrivateTask>(id ? `/business/tasks/${id}` : null)
  const [task, setTask] = useState<PrivateTask | null>(null)
  const [step, setStep] = useState(id ? 2 : 0)
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('Образование')
  const [card, setCard] = useState<TaskCard>({ ...emptyCard })
  const [answers, setAnswers] = useState<Answer[]>([])
  const [preview, setPreview] = useState<Score | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [delta, setDelta] = useState<number | null>(null)
  const action = useAction()
  const navigate = useNavigate()
  function receive(value: PrivateTask) {
    setTask(value); setDescription(value.raw_description); setIndustry(value.industry)
    setCard(value.draft_card); setAnswers(value.answers); setPreview(value.preview_score)
  }
  useEffect(() => { if (resource.data) receive(resource.data) }, [resource.data])
  const taskId = task?.id
  useEffect(() => {
    if (!taskId) return
    const controller = new AbortController()
    setPreviewLoading(true); setPreviewError('')
    const timer = setTimeout(() => api<Score>(`/business/tasks/${taskId}/score-preview`, 'POST', { card }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPreview(value) })
      .catch(e => { if (!controller.signal.aborted) setPreviewError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false) }), 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [card, taskId])
  function answer(field: Answer['field'], value: Answer['value']) {
    setAnswers(current => [...current.filter(a => a.field !== field), { field, question_id: `q_${field}`, value }])
  }
  async function save(current = task, payload: object = { draft_card: card, industry, raw_description: description, answers }) {
    if (!current) throw new Error('Сначала создайте задачу.')
    const value = await api<PrivateTask>(`/business/tasks/${current.id}/draft`, 'PATCH', { version: current.version, ...payload })
    receive(value); setReviewed(false)
    return value
  }
  async function mutation(current: PrivateTask, name: string) {
    const value = await api<PrivateTask>(`/business/tasks/${current.id}/${name}`, 'POST', { version: current.version })
    receive(value)
    return value
  }
  async function analyze() {
    const current = task ? await save(task, { raw_description: description, industry, answers }) : await api<PrivateTask>('/business/tasks', 'POST', { raw_description: description, industry })
    receive(current)
    await mutation(current, 'analyze'); setStep(1)
  }
  const dirty = !!task && (JSON.stringify(card) !== JSON.stringify(task.draft_card) || industry !== task.industry || description !== task.raw_description)
  if (resource.loading) return <Loading />
  if (resource.error) return <><Notice error={resource.error} /><button className="button secondary" onClick={resource.reload}>Повторить загрузку</button></>
  return <><PageHeading eyebrow="Конструктор задачи" title={task ? 'Сделаем задачу понятнее' : 'Расскажите о своей задаче'} description="Помощник структурирует сведения. Вы проверяете факты и решаете, когда их опубликовать." action={<Link className="button secondary" to="/business"><ArrowLeft size={16} />Мои задачи</Link>} />
    <div className="steps">{STEPS.map((name, index) => <button key={name} disabled={!task || action.busy || index > step} className={index === step ? 'active' : index < step ? 'done' : ''} onClick={() => setStep(index)}><span>{index < step ? <Check size={14} /> : index + 1}</span>{name}</button>)}</div>
    <Notice error={action.error} success={action.success} />
    {task?.ai_info && <div className="ai-notice"><Sparkles size={17} /><div><b>{task.ai_info.mode === 'llm' ? 'Внешний AI' : 'Локальный резервный режим'}</b><span>{task.ai_info.message}</span></div></div>}
    {step === 0 && <section className="panel description-panel"><fieldset disabled={action.busy}><label htmlFor="industry">Отрасль<select id="industry" value={industry} onChange={e => setIndustry(e.target.value)}>{Array.from(new Set([...industries, industry])).map(i => <option key={i}>{i}</option>)}</select></label><label htmlFor="description">Что вы хотите изменить?<textarea id="description" className="large-textarea" value={description} onChange={e => setDescription(e.target.value)} minLength={10} maxLength={12000} placeholder="Например: Мы небольшой учебный центр. Сейчас отмечаем оплату курсов вручную и иногда теряем сведения. Хотим навести порядок с оплатами." /></label><p className="muted small">Пишите своими словами. Если детали пока неизвестны, помощник задаст вопросы.</p><div className="actions"><button className="button" disabled={description.trim().length < 10} onClick={() => action.run(analyze, 'Описание сохранено. Ответьте на уточняющие вопросы.')}>{action.busy ? 'Анализируем…' : 'Уточнить с помощником'}<Sparkles size={16} /></button></div></fieldset></section>}
    {step === 1 && task && <div className="editor-layout"><section className="panel"><h2>Несколько важных деталей</h2><p className="muted">Ответы станут основой карточки. Если чего-то не знаете, так и укажите.</p><fieldset disabled={action.busy}>{task.questions.map((q, index) => {
      const value = answers.find(a => a.field === q.field)?.value
      return <div className="question" key={q.id}><div className="eyebrow">Вопрос {index + 1} · {labels[q.field]}</div><label htmlFor={q.id}>{q.text}{q.field !== 'success_criteria' && <textarea id={q.id} value={typeof value === 'string' ? value : ''} maxLength={q.field === 'title' ? 200 : 3000} onChange={e => answer(q.field, e.target.value)} placeholder="Ваш ответ" />}</label>{q.field === 'success_criteria' && <><CriteriaEditor prefix={q.id} value={Array.isArray(value) ? value : []} onChange={v => answer(q.field, v)} />{typeof value === 'string' && <p className="small muted">{value}</p>}</>}<button className="text-button small" onClick={() => answer(q.field, 'Пока не знаю')}>Пока не знаю</button></div>
    })}<div className="actions"><button className="button" onClick={() => action.run(async () => { const current = await save(task, { answers }); await mutation(current, 'compose'); setStep(2) }, 'Карточка сформирована. Проверьте сведения.')}>{action.busy ? 'Собираем…' : 'Сформировать карточку'}<ArrowRight size={16} /></button><button className="button secondary" onClick={() => action.run(async () => { const current = await save(task, { answers }); await mutation(current, 'analyze') }, 'Ответы сохранены. Подготовлены следующие вопросы.')}>Ещё вопросы</button></div></fieldset></section><SourcePanel task={task} answers={answers} /></div>}
    {step === 2 && task && <div className="editor-layout wide-aside"><section><div className="panel"><div className="row-between"><h2>Рабочая карточка</h2><span className="tag">Версия {task.version}</span></div><p className="muted small">Все поля можно изменить. Неизвестные сведения оставьте пустыми.</p><fieldset disabled={action.busy}><label htmlFor="card-industry">Отрасль<select id="card-industry" value={industry} onChange={e => setIndustry(e.target.value)}>{Array.from(new Set([...industries, industry])).map(i => <option key={i}>{i}</option>)}</select></label>{GROUPS.map((group, gi) => <div className="form-group" key={group.title}><h3>{group.title}</h3>{group.fields.map(field => <label key={field} htmlFor={`card-${field}`}>{labels[field]}{field === 'title' ? <input id={`card-${field}`} value={card[field] || ''} maxLength={200} onChange={e => setCard({ ...card, [field]: e.target.value || null })} /> : <textarea id={`card-${field}`} rows={2} value={card[field] || ''} maxLength={3000} onChange={e => setCard({ ...card, [field]: e.target.value || null })} />}{card[field] === task.draft_card[field] && task.evidence[field]?.map((ev, i) => <span className="evidence" key={i}>Источник {ev.source_id === 'description' ? 'описание' : 'ответ'}: «{ev.quote}»</span>)}</label>)}{gi === 1 && <div className="field"><b>Критерии успеха</b><CriteriaEditor value={card.success_criteria} onChange={(value: Criterion[]) => setCard({ ...card, success_criteria: value })} /></div>}</div>)}<div className="actions sticky-actions"><button className="button secondary" onClick={() => action.run(() => save(), 'Черновик сохранён. Публичная карточка не менялась.')}><Save size={16} />Сохранить черновик</button><button className="button" onClick={() => action.run(async () => { await save(); setStep(3) }, 'Проверьте сведения перед подтверждением.')}>К подтверждению<ArrowRight size={16} /></button></div></fieldset></div><SourcePanel task={task} answers={answers} /></section><aside><div className="preview-status" role="status">{previewLoading ? 'Пересчитываем предварительную оценку…' : dirty ? 'Предварительная оценка текущих полей' : 'Черновик сохранён'}</div><Notice error={previewError} />{preview && <ScorePanel score={preview} preview />}<p className="small muted top-gap">Официальный рейтинг: {task.score.total_score} / 100. Изменится после вашего подтверждения.</p></aside></div>}
    {step === 3 && task && <div className="editor-layout"><section className="panel"><div className="eyebrow">Последнее слово за вами</div><h2>Проверьте и подтвердите</h2><p className="muted">Подтверждение обновит официальный рейтинг{task.is_published ? ' и карточку в общем каталоге' : ''}. Публикация — отдельное действие.</p><div className="confirmation-card"><h3>{card.title || 'Название пока не указано'}</h3><p>{card.need || 'Потребность пока не указана'}</p><div className="score-comparison"><div><span>Сейчас</span><b>{task.score.total_score}<small> / 100</small></b></div><ArrowRight size={22} /><div><span>После подтверждения</span><b>{task.preview_score.total_score}<small> / 100</small></b></div></div></div>{delta !== null && <div className="notice success" role="status">Изменение рейтинга: {delta > 0 ? '+' : ''}{delta} баллов. Официально: {task.score.total_score} / 100.</div>}
      <fieldset disabled={action.busy}><label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />Я проверил(а) сведения и подтверждаю их от лица бизнеса.</label><div className="actions"><button className="button" disabled={!reviewed} onClick={() => action.run(async () => { const value = await mutation(task, 'confirm'); setDelta(value.score_delta ?? 0); setReviewed(false) }, 'Сведения подтверждены. Официальный рейтинг пересчитан.')}><Check size={17} />Подтвердить сведения</button><button className="button secondary" onClick={() => setStep(2)}>Вернуться к карточке</button></div><div className="publish-box"><h3>{task.is_published ? 'Карточка опубликована' : 'Готовы встретиться с командами?'}</h3><p className="small muted">Можно публиковать с любым рейтингом. Нужны подтверждение текущей карточки и название.</p><button className="button" disabled={task.has_unconfirmed_changes || !card.title?.trim() || task.is_published} onClick={() => action.run(async () => { await mutation(task, 'publish') }, 'Задача опубликована и доступна всем командам.')}>{task.is_published ? 'Уже в каталоге' : 'Опубликовать в каталоге'}<ExternalLink size={16} /></button>{task.is_published && <button className="text-button" onClick={() => navigate(`/tasks/${task.id}`)}>Открыть опубликованную задачу →</button>}</div></fieldset></section><aside><ScorePanel score={task.score} /><SourcePanel task={task} answers={answers} /></aside></div>}
  </>
}
function SourcePanel({ task, answers }: { task: PrivateTask; answers: Answer[] }) {
  return <section className="panel source-panel"><div className="eyebrow">Опора на ваши сведения</div><h3>Исходное описание</h3><p className="pre-wrap">{task.raw_description}</p>{answers.length > 0 && <><h3>Ответы представителя</h3><dl>{answers.map(a => <div key={a.question_id}><dt>{labels[a.field]}</dt><dd>{Array.isArray(a.value) ? a.value.map((v, i) => <p key={i}>{v.criterion || '—'} · {v.expected_value || '—'} · {v.verification_method || '—'}</p>) : a.value || 'Нет ответа'}</dd></div>)}</dl></>}<p className="small muted">Цитата подтверждает источник текста, но не гарантирует верную интерпретацию. Проверьте каждое поле.</p></section>
}
