export interface Criterion { criterion: string | null; expected_value: string | null; verification_method: string | null }
export interface TaskCard {
  title: string | null; context: string | null; need: string | null; users: string | null;
  data: string | null; constraints: string | null; expected_result: string | null;
  success_criteria: Criterion[]; contact: string | null; interaction_format: string | null;
  data_source: string | null; deadline: string | null; feedback_process: string | null;
}
export type FieldName = keyof TaskCard
export type TextField = Exclude<FieldName, 'success_criteria'>
export interface Question { id: string; field: FieldName; text: string }
export interface Answer { question_id: string; field: FieldName; value: string | Criterion[] | null }
export interface Score {
  total_score: number; readiness_level: string;
  breakdown: { criterion: string; awarded: number; maximum: number; basis: string; missing_fields: string[] }[];
  improvement_suggestions: { action: string; available_points: number; fields: string[] }[];
  next_level: string | null; points_to_next_level: number;
}
export interface PublicTask {
  id: number; business_id: number; business_name: string; industry: string; card: TaskCard;
  score: Score; published_at: string; proposal_count: number;
}
export interface PrivateTask {
  id: number; business_id: number; business_name: string; industry: string; raw_description: string;
  questions: Question[]; answers: Answer[]; draft_card: TaskCard; confirmed_card: TaskCard | null;
  is_published: boolean; version: number; score: Score; preview_score: Score; has_unconfirmed_changes: boolean;
  evidence: Record<string, { source_id: string; quote: string }[]>;
  ai_info: { mode: 'llm' | 'rule_based'; message: string } | null;
  proposal_count: number; confirmed_at: string | null; published_at: string | null; created_at: string;
  updated_at: string; score_delta?: number;
}
export interface Business { id: number; name: string; demo_contact: string }
export interface Team { id: number; name: string; interests: string[]; skills: string[]; technologies: string[] }
export interface Profiles { businesses: Business[]; teams: Team[] }
export interface Actor { role: 'business' | 'team'; id: number; name: string }
export interface Milestone {
  id: number; proposal_id: number; stage_code: 'prototype'; result_description: string; result_url: string | null;
  status: 'submitted' | 'confirmed'; points_awarded: number; submitted_at: string; confirmed_at: string | null;
}
export interface Proposal {
  id: number; task_id: number; task_title: string; team_id: number; team_name: string;
  team_skills: string[]; team_technologies: string[];
  idea: string; plan: string; estimated_duration: string; prototype_url: string | null;
  status: 'pending' | 'accepted' | 'rejected'; milestones: Milestone[]; created_at: string; updated_at: string;
}
export const labels: Record<FieldName, string> = {
  title: 'Название задачи', context: 'Контекст', need: 'Потребность', users: 'Пользователи',
  data: 'Данные и материалы', data_source: 'Источник данных', constraints: 'Ограничения', deadline: 'Срок',
  expected_result: 'Ожидаемый результат', success_criteria: 'Критерии успеха', contact: 'Контакт для связи',
  interaction_format: 'Формат взаимодействия', feedback_process: 'Процесс обратной связи',
}
export const industries = ['Образование', 'Производство', 'Агро', 'Ритейл', 'Услуги', 'Другое']
export const levels = ['Черновик', 'Рабочая', 'Готовая', 'Приоритетная']
export const emptyCard: TaskCard = { title: null, context: null, need: null, users: null, data: null,
  constraints: null, expected_result: null, success_criteria: [], contact: null, interaction_format: null,
  data_source: null, deadline: null, feedback_process: null }
