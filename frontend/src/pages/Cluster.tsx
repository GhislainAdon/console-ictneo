import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type Addon, type CertProvider, type ClusterRecord } from '../api/client'
import { useSelected } from '../store/selected'
import { NamespacesSection } from '../components/NamespacesSection'
import { RegisterExternalDrawer } from '../components/RegisterExternalDrawer'

export function Cluster() {
  const { project, setProject } = useSelected()
  const [addons, setAddons] = useState<Addon[]>([])
  const [providers, setProviders] = useState<CertProvider[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [clusters, setClusters] = useState<ClusterRecord[]>([])
  const [health, setHealth] = useState<{ docker: boolean; kind: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showExternal, setShowExternal] = useState(false)

  const refreshClusters = async () => {
    const r = await api.clusters.list()
    setClusters(r.clusters)
  }

  useEffect(() => {
    api.catalog.addons().then((r) => setAddons(r.addons))
    api.catalog.certProviders().then((r) => setProviders(r.providers))
    api.catalog.k8sVersions().then((r) => setVersions(r.versions))
    refreshClusters()
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
      await refreshClusters()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const destroy = async () => {
    if (!project.cluster_name) return
    if (!confirm(`Detach and delete cluster ${project.cluster_name}?`)) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      await api.clusters.remove(project.cluster_name)
      await api.projects.update(project.id, { status: 'draft', cluster_name: null })
      const refreshed = await api.projects.get(project.id)
      setProject(refreshed)
      await refreshClusters()
      setMsg('Cluster removed')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const attachExternal = async (rec: ClusterRecord) => {
    await refreshClusters()
    setMsg(`External cluster ${rec.name} (k8s ${rec.k8s_version || '?'}) registered`)
    // Offer one-click attach to the current project.
    if (confirm(`Attach ${rec.name} to project ${project.name}?`)) {
      await api.projects.update(project.id, {
        status: 'ready',
        cluster_name: rec.name,
      })
      const refreshed = await api.projects.get(project.id)
      setProject(refreshed)
    }
  }

  const removeCluster = async (rec: ClusterRecord) => {
    const label = rec.source === 'external' ? 'external cluster' : 'local kind cluster'
    if (!confirm(`Remove ${label} ${rec.name}?`)) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      await api.clusters.remove(rec.name)
      if (project.cluster_name === rec.name) {
        await api.projects.update(project.id, { status: 'draft', cluster_name: null })
        const refreshed = await api.projects.get(project.id)
        setProject(refreshed)
      }
      await refreshClusters()
      setMsg(`Cluster ${rec.name} removed`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const attachCluster = async (rec: ClusterRecord) => {
    await api.projects.update(project.id, { status: 'ready', cluster_name: rec.name })
    const refreshed = await api.projects.get(project.id)
    setProject(refreshed)
    setMsg(`Attached ${rec.name} to ${project.name}`)
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
        <div className="panel-title">Clusters</div>
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Docker daemon</dt><dd>{health?.docker ? <span className="badge success">ONLINE</span> : <span className="badge danger">OFFLINE</span>}</dd>
          <dt>kind CLI</dt><dd>{health?.kind ? <span className="badge success">READY</span> : <span className="badge danger">MISSING</span>}</dd>
          <dt>Project status</dt><dd><span className="badge">{project.status}</span></dd>
          <dt>Attached cluster</dt><dd>{project.cluster_name ?? '—'}</dd>
        </dl>

        {clusters.length > 0 && (
          <table className="data-table" style={{ width: '100%', marginBottom: 16, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>K8s</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Server</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <tr key={c.name} style={{ borderTop: '1px solid var(--line, #2a2a2a)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <code>{c.name}</code>
                    {project.cluster_name === c.name && (
                      <span className="badge success" style={{ marginLeft: 8 }}>ATTACHED</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span className={'badge ' + (c.source === 'external' ? 'warn' : '')}>
                      {c.source}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px' }}>{c.k8s_version || '—'}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                    {c.server_url ?? '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {project.cluster_name !== c.name && (
                      <button onClick={() => attachCluster(c)} style={{ marginRight: 8 }}>
                        Attach
                      </button>
                    )}
                    <button className="danger" onClick={() => removeCluster(c)} disabled={busy}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!health?.kind && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            kind CLI not installed. Install: <code>go install sigs.k8s.io/kind@latest</code> or see kind.sigs.k8s.io.
            You can still register external clusters.
          </div>
        )}
        <div className="row">
          <button className="primary" disabled={busy || !health?.kind || !health?.docker} onClick={launch}>
            {busy ? '⏵ Provisioning…' : '⏵ Provision Kind Cluster'}
          </button>
          <button disabled={busy} onClick={() => setShowExternal((v) => !v)}>
            {showExternal ? '× Close External' : '+ Register External'}
          </button>
          {project.cluster_name && (
            <button className="danger" disabled={busy} onClick={destroy}>
              ⏹ Detach Cluster
            </button>
          )}
        </div>
        {msg && <div className="badge success" style={{ marginTop: 12, padding: '6px 12px' }}>{msg}</div>}
        {err && <div className="error-banner" style={{ marginTop: 12 }}>{err}</div>}
      </div>

      {showExternal && (
        <RegisterExternalDrawer
          onClose={() => setShowExternal(false)}
          onRegistered={attachExternal}
        />
      )}

      {project.cluster_name && <NamespacesSection cluster={project.cluster_name} />}
    </motion.div>
  )
}
