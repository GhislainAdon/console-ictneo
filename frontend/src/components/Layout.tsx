import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api/client'

const NAV = [
  { to: '/', label: 'Overview', icon: '◉' },
  { to: '/projects', label: 'Projects', icon: '▤' },
  { to: '/cluster', label: 'Cluster', icon: '⬢' },
  { to: '/explorer', label: 'Resource Explorer', icon: '◎' },
  { to: '/resources', label: 'Resource Forge', icon: '◈' },
  { to: '/helm', label: 'Helm Builder', icon: '⎈' },
  { to: '/helm-manager', label: 'Helm Manager', icon: '⌘' },
]

export function Layout() {
  const [clock, setClock] = useState(new Date())
  const [health, setHealth] = useState<{ docker: boolean; kind: boolean } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    api.clusters.health().then(setHealth).catch(() => setHealth({ docker: false, kind: false }))
  }, [])

  return (
    <div className="app-shell">
      <div className="scanline" />
      <aside className="sidebar">
        <div className="brand">
          CLOUD·ICTNEO
          <small>K8s Command Console v0.1</small>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            <span style={{ width: 14, display: 'inline-block' }}>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div>DOCKER: {health?.docker ? 'ONLINE' : '—'}</div>
          <div>KIND:   {health?.kind ? 'READY' : '—'}</div>
          <div style={{ marginTop: 6, color: 'var(--glow)' }}>
            {clock.toISOString().replace('T', ' ').substring(0, 19)} UTC
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>◢ CLOUD-ICTNEO CONTROL ◣</h1>
          <div className="status">
            <span className="badge success pulse">SYS ONLINE</span>
            <span className="mono">sess-{clock.getTime().toString(16).slice(-6)}</span>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
