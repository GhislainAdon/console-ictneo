import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Overview } from './pages/Overview'
import { Projects } from './pages/Projects'
import { Cluster } from './pages/Cluster'
import { ResourceForge } from './pages/ResourceForge'
import { HelmBuilder } from './pages/HelmBuilder'
import { HelmManager } from './pages/HelmManager'
import { ResourceExplorer } from './pages/ResourceExplorer'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/cluster" element={<Cluster />} />
          <Route path="/explorer" element={<ResourceExplorer />} />
          <Route path="/resources" element={<ResourceForge />} />
          <Route path="/helm" element={<HelmBuilder />} />
          <Route path="/helm-manager" element={<HelmManager />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
