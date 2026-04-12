import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api/client'
import { useSelected } from '../store/selected'

type FormState = Record<string, string>

const FIELDS: Record<string, { key: string; label: string; default?: string; placeholder?: string }[]> = {
  Deployment: [
    { key: 'name', label: 'Name', default: 'api' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'image', label: 'Image', default: 'nginx:stable' },
    { key: 'replicas', label: 'Replicas', default: '2' },
    { key: 'port', label: 'Container Port', default: '80' },
  ],
  StatefulSet: [
    { key: 'name', label: 'Name', default: 'db' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'image', label: 'Image', default: 'postgres:16' },
    { key: 'replicas', label: 'Replicas', default: '3' },
    { key: 'port', label: 'Container Port', default: '5432' },
    { key: 'storage', label: 'Storage', default: '10Gi' },
  ],
  DaemonSet: [
    { key: 'name', label: 'Name', default: 'log-agent' },
    { key: 'namespace', label: 'Namespace', default: 'kube-system' },
    { key: 'image', label: 'Image', default: 'fluent/fluent-bit:latest' },
    { key: 'port', label: 'Port', default: '2020' },
  ],
  Service: [
    { key: 'name', label: 'Name', default: 'api' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'type', label: 'Type', default: 'ClusterIP' },
    { key: 'port', label: 'Port', default: '80' },
    { key: 'targetPort', label: 'Target Port', default: '80' },
  ],
  Ingress: [
    { key: 'name', label: 'Name', default: 'api-ing' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'host', label: 'Host', default: 'api.example.com' },
    { key: 'service', label: 'Service', default: 'api' },
    { key: 'port', label: 'Port', default: '80' },
    { key: 'tls', label: 'TLS (true/false)', default: 'true' },
  ],
  ConfigMap: [
    { key: 'name', label: 'Name', default: 'app-config' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
  ],
  Secret: [
    { key: 'name', label: 'Name', default: 'app-secret' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
  ],
  PersistentVolumeClaim: [
    { key: 'name', label: 'Name', default: 'data-pvc' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'storage', label: 'Storage', default: '5Gi' },
    { key: 'storageClassName', label: 'StorageClass', default: 'local-path' },
  ],
  Job: [
    { key: 'name', label: 'Name', default: 'migrate' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'image', label: 'Image', default: 'busybox' },
  ],
  CronJob: [
    { key: 'name', label: 'Name', default: 'backup' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'image', label: 'Image', default: 'busybox' },
    { key: 'schedule', label: 'Cron Schedule', default: '0 2 * * *' },
  ],
  HorizontalPodAutoscaler: [
    { key: 'name', label: 'Name', default: 'api-hpa' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'targetName', label: 'Target Deployment', default: 'api' },
    { key: 'minReplicas', label: 'Min Replicas', default: '2' },
    { key: 'maxReplicas', label: 'Max Replicas', default: '10' },
    { key: 'targetCPU', label: 'CPU Target (%)', default: '70' },
  ],
  NetworkPolicy: [
    { key: 'name', label: 'Name', default: 'api-np' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'selector', label: 'Pod Selector', default: 'api' },
  ],
  ServiceAccount: [
    { key: 'name', label: 'Name', default: 'api-sa' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
  ],
  Role: [
    { key: 'name', label: 'Name', default: 'api-role' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
  ],
  RoleBinding: [
    { key: 'name', label: 'Name', default: 'api-binding' },
    { key: 'namespace', label: 'Namespace', default: 'default' },
    { key: 'serviceAccount', label: 'ServiceAccount', default: 'api-sa' },
    { key: 'role', label: 'Role', default: 'api-role' },
  ],
}

export function ResourceForge() {
  const { project } = useSelected()
  const [kinds, setKinds] = useState<string[]>([])
  const [kind, setKind] = useState<string>('Deployment')
  const [form, setForm] = useState<FormState>({})
  const [yaml, setYaml] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.catalog.resources().then((r) => setKinds(r.kinds))
  }, [])

  useEffect(() => {
    const fields = FIELDS[kind] || []
    const base: FormState = {}
    for (const f of fields) base[f.key] = f.default ?? ''
    if (project && 'namespace' in base && !base.namespace) base.namespace = project.name
    setForm(base)
    setYaml('')
    setErr(null)
  }, [kind, project])

  const generate = async () => {
    setErr(null)
    try {
      const spec: Record<string, unknown> = { ...form }
      if (spec.tls !== undefined) spec.tls = spec.tls === 'true'
      if (spec.replicas !== undefined) spec.replicas = Number(spec.replicas)
      if (spec.port !== undefined) spec.port = Number(spec.port)
      if (spec.targetPort !== undefined) spec.targetPort = Number(spec.targetPort)
      if (spec.minReplicas !== undefined) spec.minReplicas = Number(spec.minReplicas)
      if (spec.maxReplicas !== undefined) spec.maxReplicas = Number(spec.maxReplicas)
      if (spec.targetCPU !== undefined) spec.targetCPU = Number(spec.targetCPU)
      const res = await api.generate.resource(kind, spec)
      setYaml(res.yaml)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(yaml)
  }

  const fields = FIELDS[kind] || []

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid"
      style={{ gridTemplateColumns: '0.8fr 1.2fr' }}
    >
      <div className="panel">
        <div className="panel-title">Resource Forge</div>
        <div className="stack">
          <div>
            <label>Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <label>{f.label}</label>
              <input
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
          {err && <div className="error-banner">{err}</div>}
          <button className="primary" onClick={generate}>▸ Forge Manifest</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          YAML Preview
          {yaml && <button onClick={copy} style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 10 }}>COPY</button>}
        </div>
        {yaml ? (
          <pre className="yaml">{yaml}</pre>
        ) : (
          <p className="dim mono">Configure the form on the left and click FORGE.</p>
        )}
      </div>
    </motion.div>
  )
}
