import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = { title: { default: "AI Sana Challenge Hub — от идеи к решению", template: "%s · AI Sana" }, description: "Превратите бизнес-проблему в понятную задачу и найдите студенческую команду для её решения." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ru"><body><a href="#main-content" className="skip-link">Перейти к содержимому</a><Shell>{children}</Shell></body></html>; }
