import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type Project } from '../api/client'
import { useSelected } from '../store/selected'

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    k8s_version: '1.34',
    cert_provider: 'letsencrypt',
    domain: 'example.local',
  })
  const { project, setProject } = useSelected()

  const refresh = () =>
    api.projects.list().then((p) => {
      setProjects(p)
      if (project) {
        const updated = p.find((x) => x.id === project.id)
        if (updated) setProject(updated)
      }
    })

  useEffect(() => {
    refresh()
    api.catalog.k8sVersions().then((r) => setVersions(r.versions))
    api.catalog.certProviders().then((r) => setProviders(r.providers))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const created = await api.projects.create(form)
      setProject(created)
      setForm({ ...form, name: '', description: '' })
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete project? This cannot be undone.')) return
    await api.projects.remove(id)
    if (project?.id === id) setProject(null)
    refresh()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid"
      style={{ gridTemplateColumns: '1fr 1fr' }}
    >
      <div className="panel">
        <div className="panel-title">Create Project</div>
        <form onSubmit={submit} className="stack">
          <div>
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ictneo-prod-01"
              required
            />
          </div>
          <div>
            <label>Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Production cluster for service X"
            />
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>K8s Version</label>
              <select
                value={form.k8s_version}
                onChange={(e) => setForm({ ...form, k8s_version: e.target.value })}
              >
                {versions.map((v) => (
                  <option key={v} value={v}>v{v}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Cert Provider</label>
              <select
                value={form.cert_provider}
                onChange={(e) => setForm({ ...form, cert_provider: e.target.value })}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label>Domain</label>
            <input
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="example.local"
            />
          </div>
          {err && <div className="error-banner">{err}</div>}
          <button className="primary" type="submit">▸ Initialize Project</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-title">Project Fleet</div>
        <div className="stack">
          <AnimatePresence>
            {projects.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="toggle"
                onClick={() => setProject(p)}
                style={{
                  borderColor: project?.id === p.id ? 'var(--glow)' : undefined,
                  background: project?.id === p.id ? 'rgba(0,229,255,0.08)' : undefined,
                  cursor: 'pointer',
                }}
              >
                <div className="dot" style={{
                  background: project?.id === p.id ? 'var(--glow)' : 'var(--text-2)',
                  boxShadow: project?.id === p.id ? '0 0 12px var(--glow)' : 'none',
                }} />
                <div className="meta">
                  <h3>{p.name}</h3>
                  <p>
                    v{p.k8s_version} · {p.cert_provider} · {p.domain} · {p.addons.length} addons
                  </p>
                </div>
                <button
                  className="danger"
                  onClick={(e) => { e.stopPropagation(); remove(p.id) }}
                  style={{ padding: '6px 12px', fontSize: 10 }}
                >
                  Delete
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {projects.length === 0 && (
            <p className="dim mono">No projects. Create one to begin.</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
