import { createContext, useContext, useState } from 'react'
import { ArrowUpRight, ChevronsUp, Compass, LayoutDashboard, LogOut, Plus, Users } from 'lucide-react'
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
  return <ActorContext.Provider value={{ actor, choose }}>
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Перейти к содержимому</a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="TaskUp AI — главная">
          <span className="brand-mark"><ChevronsUp size={28} strokeWidth={2.6} /></span>
          TaskUp<span className="ai-label">AI</span>
        </Link>
        <nav className="primary-nav" aria-label="Основная навигация">
          <NavLink to="/catalog"><Compass size={17} />Каталог задач</NavLink>
          {actor?.role === 'business' && <>
            <NavLink to="/business" end><LayoutDashboard size={17} />Мои задачи</NavLink>
            <NavLink to="/business/tasks/new"><Plus size={17} />Создать задачу</NavLink>
          </>}
          {actor?.role === 'team' && <NavLink to="/team"><Users size={17} />Мои предложения</NavLink>}
          <NavLink to="/" end><Users size={17} />Демо-профили</NavLink>
        </nav>
        <div className="profile-chip">
          <span className="avatar">{actor?.name.replace(/[«»]/g, '').split(' ').at(-1)?.slice(0, 2).toUpperCase() || 'TU'}</span>
          <div><b>{actor?.name || 'Гостевой просмотр'}</b><small>{actor ? actor.role === 'business' ? 'Представитель бизнеса' : 'Студенческая команда' : 'Выберите демо-профиль'}</small></div>
          <button className="icon-button" aria-label="Сменить профиль" title="Сменить профиль" onClick={() => { choose(null); navigate('/') }}><LogOut size={17} /></button>
        </div>
      </header>
      <div className="workspace">
        <div className="workspace-bar"><span><span className="status-dot" />AI SANA · РАБОЧЕЕ ПРОСТРАНСТВО</span><span>{location.pathname.startsWith('/catalog') ? 'Исследуйте. Выбирайте. Создавайте.' : 'От идеи к подтверждённому результату.'}</span></div>
        <main id="main-content" key={`${actor?.role}-${actor?.id}`}><Routes><Route path="/" element={<Home />} /><Route path="/catalog" element={<Catalog />} /><Route path="/tasks/:id" element={<TaskDetail />} /><Route path="/business" element={<Guard role="business"><BusinessDashboard /></Guard>} /><Route path="/business/tasks/new" element={<Guard role="business"><Editor /></Guard>} /><Route path="/business/tasks/:id/edit" element={<Guard role="business"><Editor /></Guard>} /><Route path="/business/tasks/:id/proposals" element={<Guard role="business"><ProposalReview /></Guard>} /><Route path="/team" element={<Guard role="team"><TeamDashboard /></Guard>} /><Route path="*" element={<div className="empty"><h1>Страница не найдена</h1><Link to="/catalog">Вернуться в каталог</Link></div>} /></Routes></main>
        <footer><Link to="/">TaskUp AI <ArrowUpRight size={14} /></Link><span>Бизнес формулирует задачу. Команда выбирает вызов.</span><span className="footer-demo">Локальная демонстрация</span></footer>
      </div>
    </div>
  </ActorContext.Provider>
}
