import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type Namespace } from '../api/client'

interface Props {
  cluster: string
}

const PROTECTED = new Set(['default', 'kube-system', 'kube-public', 'kube-node-lease', 'local-path-storage'])

export function NamespacesSection({ cluster }: Props) {
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () =>
    api.namespaces
      .list(cluster)
      .then((r) => setNamespaces(r.namespaces))
      .catch((e) => setErr((e as Error).message))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [cluster])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await api.namespaces.create(cluster, name.trim())
      setName('')
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (n: string) => {
    if (PROTECTED.has(n)) return
    if (!confirm(`Delete namespace ${n}? All resources inside will be removed.`)) return
    setBusy(true)
    setErr(null)
    try {
      await api.namespaces.remove(cluster, n)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Namespaces · {cluster}</div>

      <form onSubmit={create} className="row" style={{ marginBottom: 16, gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label>New Namespace</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="ictneo-dev"
            required
          />
        </div>
        <button className="primary" disabled={busy || !name.trim()}>▸ Create</button>
      </form>

      {err && <div className="error-banner" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        <AnimatePresence>
          {namespaces.map((ns) => {
            const locked = PROTECTED.has(ns.name)
            const terminating = ns.status !== 'Active'
            return (
              <motion.div
                key={ns.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className={'toggle' + (ns.status === 'Active' ? ' on' : '')}
                style={{ cursor: 'default', opacity: terminating ? 0.6 : 1 }}
              >
                <div className="dot" />
                <div className="meta">
                  <h3>
                    {ns.name}
                    {locked && <span className="badge warn" style={{ marginLeft: 8 }}>SYS</span>}
                    {terminating && <span className="badge danger" style={{ marginLeft: 8 }}>{ns.status}</span>}
                  </h3>
                  <p className="mono">{ns.created_at?.substring(0, 19).replace('T', ' ') || '—'}</p>
                </div>
                {!locked && (
                  <button
                    className="danger"
                    disabled={busy || terminating}
                    onClick={() => remove(ns.name)}
                    style={{ padding: '6px 12px', fontSize: 10 }}
                  >
                    Delete
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
