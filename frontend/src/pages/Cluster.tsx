import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type Addon, type CertProvider } from '../api/client'
import { useSelected } from '../store/selected'
import { NamespacesSection } from '../components/NamespacesSection'

export function Cluster() {
  const { project, setProject } = useSelected()
  const [addons, setAddons] = useState<Addon[]>([])
  const [providers, setProviders] = useState<CertProvider[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [clusters, setClusters] = useState<string[]>([])
  const [health, setHealth] = useState<{ docker: boolean; kind: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.catalog.addons().then((r) => setAddons(r.addons))
    api.catalog.certProviders().then((r) => setProviders(r.providers))
    api.catalog.k8sVersions().then((r) => setVersions(r.versions))
    api.clusters.list().then((r) => setClusters(r.clusters))
    api.clusters.health().then(setHealth)
  }, [])

  if (!project) {
    return (
      <div className="panel">
        <div className="panel-title">No project selected</div>
        <p className="dim mono">Select a project from the Projects page first.</p>
      </div>
    )
  }

  const toggleAddon = async (id: string, isRequired?: boolean) => {
    if (isRequired) return
    const next = project.addons.includes(id)
      ? project.addons.filter((a) => a !== id)
      : [...project.addons, id]
    const updated = await api.projects.update(project.id, { addons: next })
    setProject(updated)
  }

  const setField = async (patch: Record<string, string>) => {
    const updated = await api.projects.update(project.id, patch)
    setProject(updated)
  }

  const launch = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const name = `ictneo-${project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
      const res = await api.clusters.create(name, project.k8s_version)
      if (!res.ok) throw new Error(res.stderr || 'Failed to create cluster')
      setMsg(`Cluster ${name} ready`)
      await api.projects.update(project.id, { status: 'ready', cluster_name: name })
      const refreshed = await api.projects.get(project.id)
      setProject(refreshed)
      const list = await api.clusters.list()
      setClusters(list.clusters)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const destroy = async () => {
    if (!project.cluster_name) return
    if (!confirm(`Delete local cluster ${project.cluster_name}?`)) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      await api.clusters.remove(project.cluster_name)
      await api.projects.update(project.id, { status: 'draft', cluster_name: null })
      const refreshed = await api.projects.get(project.id)
      setProject(refreshed)
      const list = await api.clusters.list()
      setClusters(list.clusters)
      setMsg('Cluster destroyed')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const categories = Array.from(new Set(addons.map((a) => a.category)))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="stack">
      <div className="panel">
        <div className="panel-title">Cluster Configuration · {project.name}</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div>
            <label>K8s Version</label>
            <select value={project.k8s_version} onChange={(e) => setField({ k8s_version: e.target.value })}>
              {versions.map((v) => <option key={v} value={v}>v{v}</option>)}
            </select>
          </div>
          <div>
            <label>Cert Provider</label>
            <select value={project.cert_provider} onChange={(e) => setField({ cert_provider: e.target.value })}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label>Domain</label>
            <input value={project.domain} onChange={(e) => setField({ domain: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Addons Matrix</div>
        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase' }}>
              [ {cat} ]
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {addons.filter((a) => a.category === cat).map((a) => {
                const active = project.addons.includes(a.id) || a.required
                return (
                  <div
                    key={a.id}
                    className={'toggle' + (active ? ' on' : '') + (a.required ? ' required' : '')}
                    onClick={() => toggleAddon(a.id, a.required)}
                  >
                    <div className="dot" />
                    <div className="meta">
                      <h3>{a.name}{a.required && <span className="badge warn" style={{ marginLeft: 8 }}>REQ</span>}</h3>
                      <p>{a.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title">Launch Sequence</div>
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Docker daemon</dt><dd>{health?.docker ? <span className="badge success">ONLINE</span> : <span className="badge danger">OFFLINE</span>}</dd>
          <dt>kind CLI</dt><dd>{health?.kind ? <span className="badge success">READY</span> : <span className="badge danger">MISSING</span>}</dd>
          <dt>Live clusters</dt><dd>{clusters.length ? clusters.join(', ') : '—'}</dd>
          <dt>Project status</dt><dd><span className="badge">{project.status}</span></dd>
          <dt>Attached cluster</dt><dd>{project.cluster_name ?? '—'}</dd>
        </dl>
        {!health?.kind && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            kind CLI not installed. Install: <code>go install sigs.k8s.io/kind@latest</code> or see kind.sigs.k8s.io
          </div>
        )}
        <div className="row">
          <button className="primary" disabled={busy || !health?.kind || !health?.docker} onClick={launch}>
            {busy ? '⏵ Provisioning…' : '⏵ Provision Kind Cluster'}
          </button>
          {project.cluster_name && (
            <button className="danger" disabled={busy} onClick={destroy}>
              ⏹ Destroy Cluster
            </button>
          )}
        </div>
        {msg && <div className="badge success" style={{ marginTop: 12, padding: '6px 12px' }}>{msg}</div>}
        {err && <div className="error-banner" style={{ marginTop: 12 }}>{err}</div>}
      </div>

      {project.cluster_name && <NamespacesSection cluster={project.cluster_name} />}
    </motion.div>
  )
}
