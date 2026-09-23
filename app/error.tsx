"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="empty-state" role="alert"><h2>Что-то пошло не так</h2><p>Попробуйте загрузить страницу ещё раз.</p><button className="btn btn-primary" onClick={reset}>Повторить</button></div>;}
