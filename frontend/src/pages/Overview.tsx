import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type Project } from '../api/client'
import { useSelected } from '../store/selected'

export function Overview() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clusters, setClusters] = useState<string[]>([])
  const [addonCount, setAddonCount] = useState<number>(0)
  const { project, setProject } = useSelected()

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => setProjects([]))
    api.clusters.list().then((r) => setClusters(r.clusters)).catch(() => setClusters([]))
    api.catalog.addons().then((r) => setAddonCount(r.addons.length))
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="stack"
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="label">PROJECTS</div>
          <div className="value">{projects.length.toString().padStart(2, '0')}</div>
        </div>
        <div className="stat-card">
          <div className="label">LIVE CLUSTERS</div>
          <div className="value">{clusters.length.toString().padStart(2, '0')}</div>
        </div>
        <div className="stat-card">
          <div className="label">ADDONS CATALOG</div>
          <div className="value">{addonCount.toString().padStart(2, '0')}</div>
        </div>
        <div className="stat-card">
          <div className="label">ACTIVE CONTEXT</div>
          <div className="value" style={{ fontSize: 15 }}>
            {project ? project.name : '— NONE —'}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.1fr 0.9fr' }}>
        <div className="panel">
          <div className="panel-title">Recent Projects</div>
          {projects.length === 0 ? (
            <p className="dim mono">No projects yet. Create one on the Projects page.</p>
          ) : (
            <div className="stack">
              {projects.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="row"
                  style={{ justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => setProject(p)}
                >
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--glow)' }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-2)' }}>
                      k8s v{p.k8s_version} · {p.addons.length} addons · {p.cert_provider}
                    </div>
                  </div>
                  <span className="badge">{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">System Telemetry</div>
          <dl className="kv">
            <dt>Console</dt><dd>v0.1.0 · FastAPI + Vite</dd>
            <dt>Catalog</dt><dd>{addonCount} addons / 6 k8s versions</dd>
            <dt>Storage</dt><dd>SQLite · ~/console/backend/data</dd>
            <dt>Runtime</dt><dd>Python 3.14 · Node 24</dd>
            <dt>Local Clusters</dt>
            <dd>{clusters.length > 0 ? clusters.join(', ') : '—'}</dd>
          </dl>
        </div>
      </div>
    </motion.div>
  )
}
