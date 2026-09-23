import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default function Login() {return <Suspense fallback={<div className="page-container">Загрузка…</div>}><AuthForm/></Suspense>;}
