import { useState } from 'react'
import { ArrowDownWideNarrow, Plus, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useActor } from '../App'
import { useResource } from '../api/hooks'
import { Empty, Loading, Notice, PageHeading, TaskTile } from '../components/common'
import { industries, levels, type PublicTask } from '../types'

export function Catalog() {
  const { actor } = useActor()
  const [industry, setIndustry] = useState('')
  const [level, setLevel] = useState('')
  const [sort, setSort] = useState('score_desc')
  const params = new URLSearchParams({ sort, ...(industry ? { industry } : {}), ...(level ? { readiness_level: level } : {}) })
  const resource = useResource<PublicTask[]>(`/tasks?${params}`)
  return <><PageHeading eyebrow="Возможности для совместной работы" title="Каталог задач" description="Реальные потребности бизнеса. Выберите задачу, в которой ваша команда может быть полезна." action={actor?.role === 'business' && <Link className="button" to="/business/tasks/new"><Plus size={17} />Создать задачу</Link>} />
    <div className="catalog-banner"><div className="banner-icon"><ArrowDownWideNarrow size={25} /></div><div><h3>Больше ясности — выше в каталоге</h3><p>Рейтинг отражает заполненность задачи. Откликнуться можно на задачу любого уровня.</p></div><span className="banner-note">0–100 <small>баллов готовности</small></span></div>
    <div className="filters"><SlidersHorizontal size={18} /><label>Тема<select value={industry} onChange={e => setIndustry(e.target.value)}><option value="">Все темы</option>{industries.map(i => <option key={i}>{i}</option>)}</select></label><label>Готовность<select value={level} onChange={e => setLevel(e.target.value)}><option value="">Все уровни</option>{levels.map(i => <option key={i}>{i}</option>)}</select></label><label className="sort-filter">Сортировка<select value={sort} onChange={e => setSort(e.target.value)}><option value="score_desc">Сначала самые готовые</option><option value="published_desc">Сначала новые</option></select></label>{(industry || level || sort !== 'score_desc') && <button className="text-button" onClick={() => { setIndustry(''); setLevel(''); setSort('score_desc') }}>Сбросить</button>}</div>
    <Notice error={resource.error} />{resource.error && <button className="button secondary" onClick={resource.reload}>Повторить загрузку</button>}{resource.loading ? <Loading /> : resource.data?.length ? <><div className="list-caption"><b>{resource.data.length} задач</b><span>Общий каталог · открыт всем командам</span></div><div className="task-grid">{resource.data.map(t => <TaskTile key={t.id} task={t} />)}</div></> : !resource.error && <Empty title="Задачи не найдены" text="Измените фильтры или опубликуйте первую задачу." />}</>
}
