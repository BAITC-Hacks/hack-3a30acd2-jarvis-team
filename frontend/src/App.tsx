import { createContext, useContext, useState } from 'react'
import { ArrowUpRight, BriefcaseBusiness, ChevronsUp, Compass, FlaskConical, LayoutDashboard, LogOut, Users } from 'lucide-react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { readActor, saveActor } from './api/client'
import type { Actor } from './types'
import { Home } from './pages/Home'
import { Catalog } from './pages/Catalog'
import { BusinessDashboard, ProposalReview, TeamDashboard } from './pages/Dashboards'
import { Editor } from './pages/Editor'
import { TaskDetail } from './pages/TaskDetail'

const ActorContext = createContext<{ actor: Actor | null; choose: (actor: Actor | null) => void }>({ actor: null, choose: () => {} })
export const useActor = () => useContext(ActorContext)
function Guard({ role, children }: { role: Actor['role']; children: React.ReactNode }) {
  const { actor } = useActor()
  return actor?.role === role ? children : <Navigate to="/" replace />
}
export default function App() {
  const [actor, setActor] = useState(readActor)
  const navigate = useNavigate()
  const location = useLocation()
  function choose(value: Actor | null) { saveActor(value); setActor(value) }
  return <ActorContext.Provider value={{ actor, choose }}><div className="app-shell">
    <aside className="sidebar"><Link to="/" className="brand"><span className="brand-mark"><ChevronsUp size={26} /></span>TaskUp <span className="ai-label">AI</span></Link><p className="sidebar-caption">Понятные задачи.<br />Практические результаты.</p>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><nav><NavLink to="/catalog"><Compass size={19} />Каталог задач</NavLink>{actor?.role === 'business' && <><NavLink to="/business" end><LayoutDashboard size={19} />Мои задачи</NavLink><NavLink to="/business/tasks/new"><BriefcaseBusiness size={19} />Создать задачу</NavLink></>}{actor?.role === 'team' && <NavLink to="/team"><Users size={19} />Мои предложения</NavLink>}<NavLink to="/" end><Users size={19} />Демо-профили</NavLink></nav>
      <div className="sidebar-note"><FlaskConical size={19} /><strong>Идея становится задачей</strong><p>Уточняйте детали, повышайте готовность и находите команду.</p><Link to="/catalog">Посмотреть задачи <ArrowUpRight size={14} /></Link></div>
      <div className="sidebar-bottom"><span className="status-dot" />Локальная демонстрация<span className="small muted">AI Sana · Практический MVP</span></div>
    </aside>
    <div className="workspace"><header className="topbar"><span>Рабочее пространство <span className="breadcrumb">/ {location.pathname.startsWith('/catalog') ? 'Каталог' : location.pathname === '/' ? 'Выбор профиля' : actor?.role === 'team' ? 'Команда' : 'Бизнес'}</span></span><div className="profile-chip"><span className="avatar">{actor?.name.replace(/[«»]/g, '').split(' ').at(-1)?.slice(0, 2).toUpperCase() || 'TU'}</span><div><b>{actor?.name || 'Гостевой просмотр'}</b><small>{actor ? actor.role === 'business' ? 'Представитель бизнеса' : 'Студенческая команда' : 'Выберите демо-профиль'}</small></div><button className="icon-button" aria-label="Сменить профиль" onClick={() => { choose(null); navigate('/') }}><LogOut size={17} /></button></div></header>
      <main key={`${actor?.role}-${actor?.id}`}><Routes><Route path="/" element={<Home />} /><Route path="/catalog" element={<Catalog />} /><Route path="/tasks/:id" element={<TaskDetail />} /><Route path="/business" element={<Guard role="business"><BusinessDashboard /></Guard>} /><Route path="/business/tasks/new" element={<Guard role="business"><Editor /></Guard>} /><Route path="/business/tasks/:id/edit" element={<Guard role="business"><Editor /></Guard>} /><Route path="/business/tasks/:id/proposals" element={<Guard role="business"><ProposalReview /></Guard>} /><Route path="/team" element={<Guard role="team"><TeamDashboard /></Guard>} /><Route path="*" element={<div className="empty"><h1>Страница не найдена</h1><Link to="/catalog">Вернуться в каталог</Link></div>} /></Routes></main>
      <footer>TaskUp AI <span>Бизнес формулирует задачу. Команда выбирает вызов.</span></footer>
    </div></div></ActorContext.Provider>
}
