import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './client'

export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(r => r + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    if (!url) { setLoading(false); return }
    setLoading(true); setError('')
    api<T>(url, 'GET', undefined, controller.signal).then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [url, revision])
  return { data, setData, loading, error, reload }
}
export function useAction() {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function run(work: () => Promise<unknown>, message = 'Изменения сохранены.') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setSuccess('')
    try { await work(); setSuccess(message) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.') }
    finally { lock.current = false; setBusy(false) }
  }
  return { busy, error, success, run }
}
