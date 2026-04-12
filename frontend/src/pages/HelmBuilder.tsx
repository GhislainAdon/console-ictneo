import { useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api/client'
import { useSelected } from '../store/selected'

export function HelmBuilder() {
  const { project } = useSelected()
  const [form, setForm] = useState({
    app_name: 'app',
    image_repository: 'nginx',
    image_tag: 'stable',
    service_port: '80',
    description: '',
  })
  const [files, setFiles] = useState<Record<string, string> | null>(null)
  const [active, setActive] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  const preview = async () => {
    if (!project) { setErr('Select a project first'); return }
    setErr(null)
    try {
      const res = await api.generate.helmPreview({
        project_name: project.name,
        app_name: form.app_name,
        image_repository: form.image_repository,
        image_tag: form.image_tag,
        service_port: Number(form.service_port),
        description: form.description || undefined,
      })
      setFiles(res.files)
      setActive(Object.keys(res.files)[0])
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const download = async () => {
    if (!project) return
    const res = await fetch(api.generate.helmDownloadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: project.name,
        app_name: form.app_name,
        image_repository: form.image_repository,
        image_tag: form.image_tag,
        service_port: Number(form.service_port),
        description: form.description || undefined,
      }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${form.app_name}-helm.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!project) {
    return (
      <div className="panel">
        <div className="panel-title">No project selected</div>
        <p className="dim mono">Select a project from the Projects page first.</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid"
      style={{ gridTemplateColumns: '0.7fr 1.3fr' }}
    >
      <div className="panel">
        <div className="panel-title">Helm Chart Builder</div>
        <div className="stack">
          <div>
            <label>App Name</label>
            <input value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
          </div>
          <div>
            <label>Image Repository</label>
            <input value={form.image_repository} onChange={(e) => setForm({ ...form, image_repository: e.target.value })} />
          </div>
          <div>
            <label>Image Tag</label>
            <input value={form.image_tag} onChange={(e) => setForm({ ...form, image_tag: e.target.value })} />
          </div>
          <div>
            <label>Service Port</label>
            <input value={form.service_port} onChange={(e) => setForm({ ...form, service_port: e.target.value })} />
          </div>
          <div>
            <label>Description (optional)</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {err && <div className="error-banner">{err}</div>}
          <div className="row">
            <button className="primary" onClick={preview}>▸ Generate Chart</button>
            <button onClick={download} disabled={!files}>⤓ Download .zip</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Chart Inspector</div>
        {!files && <p className="dim mono">Generate a chart to inspect its files.</p>}
        {files && (
          <div className="grid" style={{ gridTemplateColumns: '260px 1fr', alignItems: 'start' }}>
            <div className="stack" style={{ gap: 4 }}>
              {Object.keys(files).map((path) => (
                <div
                  key={path}
                  onClick={() => setActive(path)}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    color: active === path ? 'var(--glow)' : 'var(--text-1)',
                    borderLeft: '2px solid ' + (active === path ? 'var(--glow)' : 'transparent'),
                    background: active === path ? 'rgba(0,229,255,0.08)' : 'transparent',
                  }}
                >
                  {path.replace(form.app_name + '/', '')}
                </div>
              ))}
            </div>
            <pre className="yaml">{files[active] || ''}</pre>
          </div>
        )}
      </div>
    </motion.div>
  )
}
