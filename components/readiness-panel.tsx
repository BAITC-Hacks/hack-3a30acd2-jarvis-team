import { Check, CircleHelp } from "lucide-react";
import type { Challenge } from "@/lib/client";

export function ReadinessPanel({ report, compact = false }: { report: Challenge["readiness"]; compact?: boolean }) {
  return <section className={`readiness-panel ${compact ? "compact" : ""}`} aria-label="Полнота описания задачи">
    <div className="readiness-heading"><h3>Насколько понятна задача</h3><strong className="readiness-number">{report.score}<span> / 100</span></strong></div>
    <div className="score-track" aria-hidden="true"><div style={{ width: `${report.score}%` }} /></div>
    <p className="readiness-explanation">Чем больше деталей, тем проще команде предложить решение.</p>
    <details className="score-details"><summary>Из чего складывается оценка</summary>
      <div className="readiness-sections">{report.sections.map(section => <details key={section.key}>
        <summary>{section.score === section.max ? <Check size={16} /> : <CircleHelp size={16} />}<span>{section.label}</span><strong>{section.score}<span>/{section.max}</span></strong></summary>
        <p>{section.rule}</p>{section.score < section.max && <p>{section.hint}</p>}
      </details>)}</div>
      <p className="score-disclaimer">Оценка отражает полноту описания, а не гарантирует результат проекта. Веса и порог публикации — настройки платформы, не официальные правила конкурса.</p>
    </details>
  </section>;
}
