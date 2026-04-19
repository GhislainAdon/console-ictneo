import { useState } from 'react'
import { api, type ClusterRecord } from '../api/client'

interface Props {
  onClose: () => void
  onRegistered: (record: ClusterRecord) => void
}

export function RegisterExternalDrawer({ onClose, onRegistered }: Props) {
  const [name, setName] = useState('')
  const [payload, setPayload] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('name is required'); return }
    if (!payload.trim()) { setErr('payload is required'); return }
    setBusy(true); setErr(null)
    try {
      const rec = await api.clusters.registerExternal(name.trim(), payload.trim())
      onRegistered(rec)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title">Register External Cluster</div>
      <ol style={{ lineHeight: 1.6, marginTop: 4 }}>
        <li>
          Give your cluster admin the script:{' '}
          <a
            href={api.clusters.registerScriptUrl}
            download="register-cluster.sh"
          >
            ⤓ register-cluster.sh
          </a>
        </li>
        <li>
          They run it on the cluster with a chosen role: <code>bash register-cluster.sh --role view</code> (or <code>edit</code> / <code>admin</code>).
        </li>
        <li>They paste back the single-line base64 payload the script prints.</li>
      </ol>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
        <div>
          <label>Cluster name (unique)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="prod-cluster-01"
          />
        </div>
        <div>
          <label>Base64 payload</label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="eyJzZXJ2ZXIiOiJodHRwczovLy4uLiJ9"
            rows={6}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? '⏵ Registering…' : '⏵ Register'}
        </button>
        <button disabled={busy} onClick={onClose}>Cancel</button>
      </div>

      {err && <div className="error-banner" style={{ marginTop: 12 }}>{err}</div>}
    </div>
  )
}
