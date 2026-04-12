import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type K8sResource, type Namespace } from '../api/client'
import { useSelected } from '../store/selected'

export function ResourceExplorer() {
  const { project } = useSelected()
  const [kinds, setKinds] = useState<string[]>([])
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [kind, setKind] = useState('pod')
  const [namespace, setNamespace] = useState('default')
  const [items, setItems] = useState<K8sResource[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [describeYaml, setDescribeYaml] = useState('')
  const [execCmd, setExecCmd] = useState('ls /')
  const [execOut, setExecOut] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cluster = project?.cluster_name

  useEffect(() => {
    if (!cluster) return
    api.k8s.kinds(cluster).then((r) => setKinds(r.kinds))
    api.namespaces.list(cluster).then((r) => setNamespaces(r.namespaces))
  }, [cluster])

  const refresh = async () => {
    if (!cluster) return
    setErr(null)
    try {
      const res = await api.k8s.list(cluster, namespace, kind)
      setItems(res.items)
      setSelected(null)
      setDescribeYaml('')
    } catch (e) {
      setErr((e as Error).message)
      setItems([])
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, namespace, kind])

  const describe = async (name: string) => {
    if (!cluster) return
    setSelected(name)
    setDescribeYaml('loading…')
    try {
      const res = await api.k8s.describe(cluster, namespace, kind, name)
      setDescribeYaml(res.yaml)
    } catch (e) {
      setDescribeYaml(`error: ${(e as Error).message}`)
    }
  }

  const deleteResource = async (name: string) => {
    if (!cluster) return
    if (!confirm(`Delete ${kind}/${name}?`)) return
    setBusy(true)
    try {
      await api.k8s.delete(cluster, namespace, kind, name)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runExec = async () => {
    if (!cluster || !selected || kind !== 'pod') return
    setBusy(true)
    setExecOut('')
    try {
      const res = await api.k8s.exec(cluster, namespace, selected, execCmd)
      setExecOut(
        `$ ${execCmd}\n` +
          (res.stdout || '') +
          (res.stderr ? `\n[stderr]\n${res.stderr}` : '') +
          `\n[exit ${res.exit_code}]`
      )
    } catch (e) {
      setExecOut(`error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const scalePlusMinus = async (delta: number, name: string) => {
    if (!cluster) return
    const current = items.find((i) => i.name === name)
    if (!current || !current.ready) return
    const match = current.ready.match(/^(\d+)\/(\d+)/)
    if (!match) return
    const next = Math.max(0, Number(match[2]) + delta)
    await api.k8s.patch(cluster, namespace, kind, name, { spec: { replicas: next } })
    refresh()
  }

  if (!project) {
    return (
      <div className="panel">
        <div className="panel-title">No project selected</div>
        <p className="dim mono">Select a project from the Projects page first.</p>
      </div>
    )
  }
  if (!cluster) {
    return (
      <div className="panel">
        <div className="panel-title">No cluster attached</div>
        <p className="dim mono">Provision a cluster from the Cluster page first.</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="stack">
      <div className="panel">
        <div className="panel-title">Resource Explorer · {cluster}</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
          <div>
            <label>Namespace</label>
            <select value={namespace} onChange={(e) => setNamespace(e.target.value)}>
              {namespaces
                .filter((n) => n.status === 'Active')
                .map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
            </select>
          </div>
          <div>
            <label>Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button type="button" onClick={refresh}>⟳ REFRESH</button>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '0.9fr 1.1fr', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-title">{kind} · {items.length} items</div>
          {err && <div className="error-banner" style={{ marginBottom: 10 }}>{err}</div>}
          <div className="stack" style={{ gap: 6 }}>
            {items.map((it) => (
              <div
                key={it.name}
                className={'toggle' + (selected === it.name ? ' on' : '')}
                onClick={() => describe(it.name)}
                style={{ cursor: 'pointer' }}
              >
                <div className="dot" />
                <div className="meta">
                  <h3>{it.name}</h3>
                  <p className="mono">{it.ready || '—'} · {it.age?.substring(0, 19).replace('T', ' ') || ''}</p>
                </div>
                {kind === 'deployment' && (
                  <>
                    <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); scalePlusMinus(-1, it.name) }} style={{ padding: '4px 10px', fontSize: 10 }}>−</button>
                    <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); scalePlusMinus(1, it.name) }} style={{ padding: '4px 10px', fontSize: 10 }}>+</button>
                  </>
                )}
                <button type="button" className="danger" disabled={busy} onClick={(e) => { e.stopPropagation(); deleteResource(it.name) }} style={{ padding: '4px 10px', fontSize: 10 }}>
                  DELETE
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="dim mono">No resources in this namespace.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            {selected ? `${kind}/${selected}` : 'Select an item'}
          </div>
          {kind === 'pod' && selected && (
            <div style={{ marginBottom: 12 }}>
              <label>Exec (one-shot)</label>
              <div className="row" style={{ gap: 8 }}>
                <input value={execCmd} onChange={(e) => setExecCmd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runExec() }} />
                <button className="primary" type="button" onClick={runExec} disabled={busy}>▸ RUN</button>
              </div>
              {execOut && <pre className="yaml" style={{ marginTop: 8, maxHeight: 180 }}>{execOut}</pre>}
            </div>
          )}
          <label>Manifest</label>
          <pre className="yaml">{describeYaml || '—'}</pre>
        </div>
      </div>
    </motion.div>
  )
}
