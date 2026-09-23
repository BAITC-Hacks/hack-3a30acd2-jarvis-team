import type { Actor } from '../types'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const KEY = 'taskup-demo-actor'
export function readActor(): Actor | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null')
    return value && ['business', 'team'].includes(value.role) && Number.isInteger(value.id) && typeof value.name === 'string' ? value : null
  } catch { return null }
}
export function saveActor(actor: Actor | null) {
  if (actor) localStorage.setItem(KEY, JSON.stringify(actor))
  else localStorage.removeItem(KEY)
}
export class ApiError extends Error {
  constructor(message: string, public code: string) { super(message) }
}
export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const actor = readActor()
  let response: Response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(actor ? { 'X-Demo-Role': actor.role, 'X-Demo-Actor-Id': String(actor.id) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(130000)]) : AbortSignal.timeout(130000),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('Нет связи с сервером. Проверьте, что backend запущен, и повторите попытку. Введённые данные сохранены на экране.', 'network_error')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(data?.error?.message || 'Не удалось выполнить действие.', data?.error?.code || 'http_error')
  return data as T
}
