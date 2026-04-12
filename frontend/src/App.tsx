import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Overview } from './pages/Overview'
import { Projects } from './pages/Projects'
import { Cluster } from './pages/Cluster'
import { ResourceForge } from './pages/ResourceForge'
import { HelmBuilder } from './pages/HelmBuilder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/cluster" element={<Cluster />} />
          <Route path="/resources" element={<ResourceForge />} />
          <Route path="/helm" element={<HelmBuilder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
