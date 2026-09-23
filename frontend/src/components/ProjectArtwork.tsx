import { ArrowUpRight, BookOpen, Box, Cpu, Layers3, Leaf } from 'lucide-react'

const themes: Record<string, { name: string; Icon: typeof BookOpen; caption: string }> = {
  'Образование': { name: 'education', Icon: BookOpen, caption: 'Знания в действие' },
  'Производство': { name: 'industry', Icon: Cpu, caption: 'Создавайте лучше' },
  'Агро': { name: 'agro', Icon: Leaf, caption: 'Технологии роста' },
  'Ритейл': { name: 'retail', Icon: Box, caption: 'Новый опыт' },
}

/** Original, local CSS artwork. It illustrates the category, not a finished prototype. */
export function ProjectArtwork({ industry, variant = 0 }: { industry: string; variant?: number }) {
  const { name, Icon, caption } = themes[industry] || { name: 'general', Icon: Layers3, caption: 'Превратите идею в результат' }
  return <div className={`project-art art-${name} art-variant-${variant % 2}`} aria-hidden="true">
    <div className="art-grid" />
    <div className="art-object"><span /><span /><span /><Icon size={42} strokeWidth={1.25} /></div>
    <span className="art-caption">{caption}</span>
    <span className="art-corner"><ArrowUpRight size={18} /></span>
  </div>
}

export function StudioArtwork() {
  return <div className="studio-art" aria-hidden="true">
    <div className="studio-orbit orbit-one" /><div className="studio-orbit orbit-two" />
    <div className="studio-orbit orbit-three" /><div className="studio-core" />
    <div className="studio-star star-one" /><div className="studio-star star-two" />
    <span className="art-coordinate coordinate-top">TASKUP / ИДЕИ В ДЕЙСТВИИ</span>
    <span className="art-coordinate coordinate-bottom">ОПИСАНИЕ → РЕЗУЛЬТАТ</span>
  </div>
}
