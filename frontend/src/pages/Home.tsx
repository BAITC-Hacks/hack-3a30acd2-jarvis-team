import { useState } from 'react'
import { ArrowRight, BriefcaseBusiness, Check, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useActor } from '../App'
import { useResource } from '../api/hooks'
import { Empty, Loading, Notice, PageHeading } from '../components/common'
import type { Profiles } from '../types'
import { StudioArtwork } from '../components/ProjectArtwork'

export function Home() {
  const { actor, choose } = useActor()
  const [role, setRole] = useState<'business' | 'team'>(actor?.role || 'business')
  const [selected, setSelected] = useState<number | null>(actor?.id || null)
  const resource = useResource<Profiles>('/demo/profiles')
  const navigate = useNavigate()
  const profiles = role === 'business' ? resource.data?.businesses : resource.data?.teams
  const profile = profiles?.find(p => p.id === selected) || profiles?.[0]
  function enter(path: string) { if (profile) { choose({ role, id: profile.id, name: profile.name }); navigate(path) } }
  return <><PageHeading eyebrow="Добро пожаловать в TaskUp AI" title="С чего начнём?" description="Превратите потребность бизнеса в понятную задачу или найдите реальный вызов для своей команды." />
    <div className="home-layout"><section className="panel role-panel"><div className="section-number">01 <span>Выберите свою роль</span></div><div className="role-options">{(['business', 'team'] as const).map(item => <button key={item} className={`role-card ${role === item ? 'selected' : ''}`} onClick={() => { setRole(item); setSelected(null) }}>{item === 'business' ? <BriefcaseBusiness size={25} /> : <Users size={25} />}<strong>{item === 'business' ? 'Я представитель бизнеса' : 'Я студенческая команда'}</strong><span>{item === 'business' ? 'Опишу задачу и выберу команды' : 'Предложу решение и покажу результат'}</span><span className="radio-dot">{role === item && <Check size={12} />}</span></button>)}</div>
      <div className="section-number">02 <span>Выберите демо-профиль</span></div><Notice error={resource.error} />{resource.error && <button className="button secondary" onClick={resource.reload}>Повторить загрузку</button>}{resource.loading ? <Loading /> : !profiles?.length ? <Empty title="Профилей пока нет" text="Запустите seed-данные по инструкции в README." /> : <><label htmlFor="profile">{role === 'business' ? 'Организация' : 'Команда'}<select id="profile" value={profile?.id || ''} onChange={e => setSelected(Number(e.target.value))}>{profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>{role === 'team' && <div className="tag-row">{resource.data?.teams.find(t => t.id === profile?.id)?.technologies.map(t => <span className="tag" key={t}>{t}</span>)}</div>}<div className="actions"><button className="button" onClick={() => enter(role === 'business' ? '/business' : '/team')}>Перейти в кабинет <ArrowRight size={17} /></button><button className="button secondary" onClick={() => enter('/catalog')}>Открыть каталог</button></div></>}
      <p className="small muted top-gap">Демо-вход без пароля. Все профили и данные вымышлены.</p></section>
      <aside className="home-explainer"><StudioArtwork /><div className="explainer-content"><div className="eyebrow">От запроса к результату</div><h2>Большие идеи.<br /><span>Реальные проекты.</span></h2><ol className="journey"><li><b>Расскажите о потребности</b><p>Помощник задаст вопросы и соберёт карточку.</p></li><li><b>Подтвердите детали</b><p>За понятный контекст, данные и критерии растёт готовность задачи.</p></li><li><b>Выберите команды</b><p>Рассмотрите предложения и подтвердите реальный результат.</p></li></ol><Link to="/catalog" className="text-link">Посмотреть общий каталог <ArrowRight size={16} /></Link></div></aside></div></>
}
