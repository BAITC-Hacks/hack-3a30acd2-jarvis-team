import Link from "next/link";
export default function NotFound(){return <div className="empty-state"><span className="eyebrow">404</span><h1>Здесь пока нет задачи</h1><p>Страница не найдена или недоступна.</p><Link className="btn btn-primary" href="/">В каталог</Link></div>;}
