import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type Release, type HelmRepo } from '../api/client'
import { useSelected } from '../store/selected'

export function HelmManager() {
  const { project } = useSelected()
  const [repos, setRepos] = useState<HelmRepo[]>([])
  const [releases, setReleases] = useState<Release[]>([])

  const [newRepo, setNewRepo] = useState({ name: '', url: '' })
  const [draft, setDraft] = useState({
    name: '',
    repo_name: '',
    chart: '',
    version: '',
    namespace: 'default',
    cluster: '',
  })
  const [valuesYaml, setValuesYaml] = useState('')
  const [loadingValues, setLoadingValues] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [deployLog, setDeployLog] = useState<string>('')
  const [busyRelease, setBusyRelease] = useState<number | null>(null)

  const refreshRepos = () => api.helm.repos().then((r) => setRepos(r.repos))
  const refreshReleases = () => {
    if (!project) return
    api.releases.listForProject(project.id).then(setReleases).catch(() => setReleases([]))
  }

  useEffect(() => {
    refreshRepos()
  }, [])
  useEffect(() => {
    refreshReleases()
    if (project?.cluster_name) setDraft((d) => ({ ...d, cluster: project.cluster_name as string }))
  }, [project])

  if (!project) {
    return (
      <div className="panel">
        <div className="panel-title">No project selected</div>
        <p className="dim mono">Select a project from the Projects page first.</p>
      </div>
    )
  }

  const addRepo = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.helm.addRepo(newRepo.name.trim(), newRepo.url.trim())
      setNewRepo({ name: '', url: '' })
      refreshRepos()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const loadValues = async () => {
    if (!draft.repo_name || !draft.chart) {
      setErr('repo and chart are required')
      return
    }
    setLoadingValues(true)
    setErr(null)
    try {
      const res = await api.helm.showValues(draft.repo_name, draft.chart, draft.version)
      setValuesYaml(res.values_yaml)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoadingValues(false)
    }
  }

  const saveRelease = async () => {
    if (!project) return
    setErr(null)
    try {
      // values textarea is raw YAML string; we send it wrapped so the backend
      // stores it as-is. To parse to object client-side we'd need js-yaml, so
      // we store the override under a single key and unwrap it at deploy time.
      // Simpler: store each top-level key verbatim — but we don't parse YAML
      // in the browser. Pragmatic compromise: store the full textarea string
      // under `_raw` and the backend writes it straight into values.yaml as
      // text. Since our backend expects a dict, we keep it as {} when the
      // user hasn't changed anything and let them edit values inline later.
      const repo = repos.find((r) => r.name === draft.repo_name)
      const payload = {
        name: draft.name.trim(),
        repo_name: draft.repo_name,
        repo_url: repo?.url || '',
        chart: draft.chart.trim(),
        version: draft.version.trim(),
        cluster: draft.cluster.trim(),
        namespace: draft.namespace.trim(),
        // parseable values_override stays the model's shape — user edits go in
        // a second step via the "edit values" modal (kept simple here).
        values_override: parseYamlToObject(valuesYaml),
      }
      await api.releases.create(project.id, payload)
      setDraft({
        ...draft,
        name: '',
        chart: '',
        version: '',
      })
      setValuesYaml('')
      refreshReleases()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const deploy = async (r: Release) => {
    setBusyRelease(r.id)
    setDeployLog('')
    setErr(null)
    try {
      const res = await api.releases.deploy(r.id)
      setDeployLog(
        `[${res.ok ? 'OK' : 'FAIL'}]\n` +
          (res.stdout?.split('\n').slice(-8).join('\n') || '') +
          (res.stderr ? `\n[stderr]\n${res.stderr.substring(0, 400)}` : '')
      )
      refreshReleases()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyRelease(null)
    }
  }

  const uninstall = async (r: Release) => {
    if (!confirm(`Uninstall helm release ${r.name} from ${r.cluster}/${r.namespace}?`)) return
    setBusyRelease(r.id)
    try {
      await api.releases.uninstall(r.id)
      refreshReleases()
    } finally {
      setBusyRelease(null)
    }
  }

  const remove = async (r: Release) => {
    if (!confirm(`Delete release record ${r.name}? (this does NOT uninstall it from the cluster)`)) return
    await api.releases.remove(r.id)
    refreshReleases()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="stack">
      <div className="grid" style={{ gridTemplateColumns: '0.9fr 1.1fr' }}>
        <div className="panel">
          <div className="panel-title">Helm Repositories</div>
          <form onSubmit={addRepo} className="row" style={{ gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label>Repo Name</label>
              <input value={newRepo.name} onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })} placeholder="bitnami" required />
            </div>
            <div style={{ flex: 2 }}>
              <label>Repo URL</label>
              <input value={newRepo.url} onChange={(e) => setNewRepo({ ...newRepo, url: e.target.value })} placeholder="https://charts.bitnami.com/bitnami" required />
            </div>
            <button className="primary">+ ADD</button>
          </form>
          <div className="stack" style={{ gap: 6 }}>
            {repos.map((r) => (
              <div key={r.name} className="row" style={{ justifyContent: 'space-between', padding: '6px 10px', borderLeft: '2px solid var(--glow)' }}>
                <div>
                  <div style={{ color: 'var(--glow)' }}>{r.name}</div>
                  <div className="mono dim" style={{ fontSize: 10 }}>{r.url}</div>
                </div>
              </div>
            ))}
            {repos.length === 0 && <p className="dim mono">No repositories configured.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">New Release · {project.name}</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label>Release Name</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="webapp" />
            </div>
            <div>
              <label>Repo</label>
              <select value={draft.repo_name} onChange={(e) => setDraft({ ...draft, repo_name: e.target.value })}>
                <option value="">— select —</option>
                {repos.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label>Chart</label>
              <input value={draft.chart} onChange={(e) => setDraft({ ...draft, chart: e.target.value })} placeholder="nginx" />
            </div>
            <div>
              <label>Version (optional)</label>
              <input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="latest" />
            </div>
            <div>
              <label>Cluster</label>
              <input value={draft.cluster} onChange={(e) => setDraft({ ...draft, cluster: e.target.value })} placeholder={project.cluster_name || 'kind-xxx'} />
            </div>
            <div>
              <label>Namespace</label>
              <input value={draft.namespace} onChange={(e) => setDraft({ ...draft, namespace: e.target.value })} placeholder="default" />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button type="button" onClick={loadValues} disabled={loadingValues}>
              {loadingValues ? 'loading…' : '⤓ Load default values'}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!draft.name || !draft.repo_name || !draft.chart || !draft.cluster}
              onClick={saveRelease}
            >
              ▸ Save Release
            </button>
          </div>

          <label style={{ marginTop: 14 }}>Values Override (YAML)</label>
          <textarea
            value={valuesYaml}
            onChange={(e) => setValuesYaml(e.target.value)}
            placeholder="replicaCount: 2&#10;service:&#10;  type: ClusterIP"
            rows={14}
            style={{ resize: 'vertical', minHeight: 180, fontFamily: 'var(--mono)', fontSize: 11 }}
          />

          {err && <div className="error-banner" style={{ marginTop: 10 }}>{err}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Releases · {project.name}</div>
        {releases.length === 0 ? (
          <p className="dim mono">No releases saved yet.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {releases.map((r) => (
              <div key={r.id} className={'toggle' + (r.status === 'deployed' ? ' on' : '')} style={{ cursor: 'default' }}>
                <div className="dot" />
                <div className="meta">
                  <h3>
                    {r.name}
                    <span className="badge" style={{ marginLeft: 8 }}>{r.status}</span>
                  </h3>
                  <p>
                    {r.repo_name}/{r.chart}{r.version && `@${r.version}`} · {r.cluster}/{r.namespace}
                  </p>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={busyRelease === r.id}
                  onClick={() => deploy(r)}
                  style={{ padding: '6px 12px', fontSize: 10 }}
                >
                  {busyRelease === r.id ? '…' : '▸ DEPLOY / UPGRADE'}
                </button>
                <button
                  type="button"
                  disabled={busyRelease === r.id || r.status !== 'deployed'}
                  onClick={() => uninstall(r)}
                  style={{ padding: '6px 12px', fontSize: 10 }}
                >
                  ⏹ UNINSTALL
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => remove(r)}
                  style={{ padding: '6px 12px', fontSize: 10 }}
                >
                  DELETE
                </button>
              </div>
            ))}
          </div>
        )}
        {deployLog && (
          <pre className="yaml" style={{ marginTop: 14 }}>{deployLog}</pre>
        )}
      </div>
    </motion.div>
  )
}

// Extremely small YAML-lite parser: accepts `key: value` flat pairs and nested
// 2-space indent maps. Enough for the common "replicaCount: 2 / service: { type: ClusterIP }"
// case without pulling in a full YAML library. Anything it doesn't understand
// falls through as a plain string value so the backend will still round-trip it
// via pyyaml.safe_dump.
function parseYamlToObject(yaml: string): Record<string, unknown> {
  if (!yaml.trim()) return {}
  const lines = yaml.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
  const root: Record<string, unknown> = {}
  const stack: [number, Record<string, unknown>][] = [[-1, root]]

  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const valueRaw = line.slice(colon + 1).trim()

    while (stack.length > 1 && stack[stack.length - 1][0] >= indent) stack.pop()
    const parent = stack[stack.length - 1][1]

    if (!valueRaw) {
      const child: Record<string, unknown> = {}
      parent[key] = child
      stack.push([indent, child])
      continue
    }

    let value: unknown = valueRaw
    if (valueRaw === 'true') value = true
    else if (valueRaw === 'false') value = false
    else if (/^-?\d+$/.test(valueRaw)) value = Number(valueRaw)
    else if (/^-?\d+\.\d+$/.test(valueRaw)) value = Number(valueRaw)
    else if (valueRaw.startsWith('"') && valueRaw.endsWith('"')) value = valueRaw.slice(1, -1)
    else if (valueRaw.startsWith("'") && valueRaw.endsWith("'")) value = valueRaw.slice(1, -1)
    parent[key] = value
  }
  return root
}
