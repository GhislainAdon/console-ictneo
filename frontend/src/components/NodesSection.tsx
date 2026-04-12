import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type TargetNode, type SshAuth, type NodeRole, type OsFamily } from '../api/client'

interface Props {
  projectId: number
}

interface FormState {
  hostname: string
  address: string
  role: NodeRole
  os_family: OsFamily
  ssh_user: string
  ssh_port: string
  ssh_auth: SshAuth
  ssh_password: string
  ssh_key_path: string
  labels: string
}

const EMPTY: FormState = {
  hostname: '',
  address: '',
  role: 'worker',
  os_family: 'debian',
  ssh_user: 'root',
  ssh_port: '22',
  ssh_auth: 'agent',
  ssh_password: '',
  ssh_key_path: '',
  labels: '',
}

export function NodesSection({ projectId }: Props) {
  const [nodes, setNodes] = useState<TargetNode[]>([])
  const [form, setForm] = useState<FormState>(EMPTY)
  const [err, setErr] = useState<string | null>(null)
  const [terminalFor, setTerminalFor] = useState<number | null>(null)
  const [cmd, setCmd] = useState('uname -a')
  const [execOut, setExecOut] = useState<string>('')
  const [execBusy, setExecBusy] = useState(false)

  const refresh = () => api.nodes.list(projectId).then(setNodes).catch(() => setNodes([]))

  useEffect(() => {
    refresh()
  }, [projectId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      const payload = {
        hostname: form.hostname.trim(),
        address: form.address.trim(),
        role: form.role,
        os_family: form.os_family,
        ssh_user: form.ssh_user.trim() || 'root',
        ssh_port: Number(form.ssh_port) || 22,
        ssh_auth: form.ssh_auth,
        ssh_password: form.ssh_auth === 'password' ? form.ssh_password : null,
        ssh_key_path: form.ssh_auth === 'key' ? form.ssh_key_path.trim() : null,
        labels: form.labels.trim(),
      }
      await api.nodes.create(projectId, payload)
      setForm(EMPTY)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const runCmd = async (nodeId: number) => {
    setExecBusy(true)
    setExecOut('')
    try {
      const res = await api.nodes.exec(projectId, nodeId, cmd)
      setExecOut(
        `$ ${cmd}\n` +
          (res.stdout || '') +
          (res.stderr ? `\n[stderr]\n${res.stderr}` : '') +
          `\n[exit ${res.exit_code}]`
      )
    } catch (e) {
      setExecOut(`error: ${(e as Error).message}`)
    } finally {
      setExecBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Remove this node from the project?')) return
    await api.nodes.remove(projectId, id)
    refresh()
  }

  const authLabel = (n: TargetNode) => {
    if (n.ssh_auth === 'password') return 'PWD ***'
    if (n.ssh_auth === 'key') return `KEY ${n.ssh_key_path}`
    return 'AGENT / pre-configured'
  }

  return (
    <div className="panel">
      <div className="panel-title">Target Nodes · SSH access plane</div>

      <form onSubmit={submit} className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'end', marginBottom: 18 }}>
        <div>
          <label>Hostname</label>
          <input
            value={form.hostname}
            onChange={(e) => setForm({ ...form, hostname: e.target.value })}
            placeholder="srv-del-r740-2-1"
            required
          />
        </div>
        <div>
          <label>Address (IP / FQDN)</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="10.0.0.10"
          />
        </div>
        <div>
          <label>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as NodeRole })}>
            <option value="control-plane">control-plane</option>
            <option value="worker">worker</option>
          </select>
        </div>
        <div>
          <label>OS Family</label>
          <select
            value={form.os_family}
            onChange={(e) => setForm({ ...form, os_family: e.target.value as OsFamily })}
          >
            <option value="debian">debian (ubuntu / debian)</option>
            <option value="redhat">redhat (rhel / rocky / alma)</option>
          </select>
        </div>

        <div>
          <label>SSH User</label>
          <input value={form.ssh_user} onChange={(e) => setForm({ ...form, ssh_user: e.target.value })} />
        </div>
        <div>
          <label>SSH Port</label>
          <input value={form.ssh_port} onChange={(e) => setForm({ ...form, ssh_port: e.target.value })} />
        </div>
        <div>
          <label>Auth Mode</label>
          <select value={form.ssh_auth} onChange={(e) => setForm({ ...form, ssh_auth: e.target.value as SshAuth })}>
            <option value="agent">agent / pre-configured</option>
            <option value="password">password</option>
            <option value="key">key file</option>
          </select>
        </div>
        <div>
          {form.ssh_auth === 'password' && (
            <>
              <label>Password</label>
              <input
                type="password"
                value={form.ssh_password}
                onChange={(e) => setForm({ ...form, ssh_password: e.target.value })}
                required
              />
            </>
          )}
          {form.ssh_auth === 'key' && (
            <>
              <label>Key Path</label>
              <input
                value={form.ssh_key_path}
                onChange={(e) => setForm({ ...form, ssh_key_path: e.target.value })}
                placeholder="~/.ssh/id_ed25519"
                required
              />
            </>
          )}
          {form.ssh_auth === 'agent' && (
            <>
              <label>&nbsp;</label>
              <div className="mono dim" style={{ fontSize: 10, padding: '12px 0' }}>
                No credentials · ssh-agent / ~/.ssh/config
              </div>
            </>
          )}
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label>Labels</label>
          <input
            value={form.labels}
            onChange={(e) => setForm({ ...form, labels: e.target.value })}
            placeholder="zone=a,rack=42"
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          {err && <div className="error-banner" style={{ marginBottom: 10 }}>{err}</div>}
          <button className="primary" type="submit">▸ Register Node</button>
        </div>
      </form>

      <div className="stack" style={{ gap: 8 }}>
        <AnimatePresence>
          {nodes.map((n) => (
            <div key={n.id}>
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="toggle on"
                style={{ cursor: 'default' }}
              >
                <div className="dot" />
                <div className="meta">
                  <h3>
                    {n.hostname}
                    <span className="badge" style={{ marginLeft: 10 }}>{n.role}</span>
                    <span className="badge" style={{ marginLeft: 6 }}>{n.os_family}</span>
                    {n.labels && <span className="badge" style={{ marginLeft: 6 }}>{n.labels}</span>}
                  </h3>
                  <p>
                    {n.ssh_user}@{n.address || n.hostname}:{n.ssh_port} · {authLabel(n)}
                  </p>
                </div>
                <a
                  href={api.nodes.bootstrapUrl(projectId, n.id)}
                  download={`bootstrap-${n.hostname}.sh`}
                  style={{ textDecoration: 'none' }}
                >
                  <button type="button" style={{ padding: '6px 12px', fontSize: 10 }}>⤓ BOOTSTRAP</button>
                </a>
                <button
                  type="button"
                  onClick={() => setTerminalFor(terminalFor === n.id ? null : n.id)}
                  style={{ padding: '6px 12px', fontSize: 10 }}
                >
                  {terminalFor === n.id ? '▴ TERMINAL' : '▾ TERMINAL'}
                </button>
                <button className="danger" onClick={() => remove(n.id)} style={{ padding: '6px 12px', fontSize: 10 }}>
                  Remove
                </button>
              </motion.div>

              {terminalFor === n.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginTop: 8 }}
                >
                  <div style={{ padding: 12, border: '1px dashed var(--panel-edge)', background: 'rgba(0,10,25,0.4)' }}>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                      <input
                        value={cmd}
                        onChange={(e) => setCmd(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') runCmd(n.id) }}
                        placeholder="uname -a"
                      />
                      <button
                        className="primary"
                        type="button"
                        disabled={execBusy || !cmd.trim()}
                        onClick={() => runCmd(n.id)}
                        style={{ padding: '10px 14px', fontSize: 11 }}
                      >
                        {execBusy ? '…' : '▸ RUN'}
                      </button>
                    </div>
                    <pre className="yaml" style={{ maxHeight: 260, minHeight: 60 }}>
                      {execOut || `# one-shot SSH to ${n.ssh_user}@${n.address || n.hostname} via ${n.ssh_auth}\n# press Enter or RUN to execute`}
                    </pre>
                  </div>
                </motion.div>
              )}
            </div>
          ))}
        </AnimatePresence>
        {nodes.length === 0 && <p className="dim mono">No nodes declared yet.</p>}
      </div>
    </div>
  )
}
