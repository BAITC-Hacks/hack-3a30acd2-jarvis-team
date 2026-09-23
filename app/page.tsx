import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
export default function Home() { return <Suspense fallback={<div className="page-container"><div className="skeleton hero-skeleton"/></div>}><Catalog/></Suspense>; }
