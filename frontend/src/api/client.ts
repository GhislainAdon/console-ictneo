const BASE = '/api'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface Project {
  id: number
  name: string
  description: string
  k8s_version: string
  cert_provider: string
  domain: string
  addons: string[]
  addon_config: Record<string, unknown>
  status: string
  cluster_name: string | null
  created_at: string
  updated_at: string
}

export interface ProjectCreateInput {
  name: string
  description?: string
  k8s_version?: string
  cert_provider?: string
  domain?: string
  addons?: string[]
  addon_config?: Record<string, unknown>
}

export interface Addon {
  id: string
  name: string
  category: string
  description: string
  default?: boolean
  required?: boolean
}

export interface CertProvider {
  id: string
  name: string
  description: string
  fields: string[]
}

export type SshAuth = 'agent' | 'password' | 'key'
export type NodeRole = 'control-plane' | 'worker'
export type OsFamily = 'debian' | 'redhat'

export interface TargetNode {
  id: number
  project_id: number
  hostname: string
  address: string
  role: NodeRole
  os_family: OsFamily
  ssh_user: string
  ssh_port: number
  ssh_auth: SshAuth
  ssh_password: string | null
  ssh_key_path: string | null
  labels: string
  created_at: string
}

export interface TargetNodeInput {
  hostname: string
  address?: string
  role: NodeRole
  os_family: OsFamily
  ssh_user?: string
  ssh_port?: number
  ssh_auth: SshAuth
  ssh_password?: string | null
  ssh_key_path?: string | null
  labels?: string
}

export interface HelmRepo {
  name: string
  url: string
}

export interface Release {
  id: number
  project_id: number
  name: string
  repo_name: string
  repo_url: string
  chart: string
  version: string
  cluster: string
  namespace: string
  values_override: Record<string, unknown>
  status: string
  last_deployed_at: string | null
  created_at: string
  updated_at: string
}

export interface ReleaseInput {
  name: string
  repo_name: string
  repo_url: string
  chart: string
  version?: string
  cluster: string
  namespace: string
  values_override?: Record<string, unknown>
}

export interface K8sResource {
  name: string
  namespace: string
  age: string | null
  ready: string | null
  labels: Record<string, string>
}

export interface Namespace {
  name: string
  status: string
  created_at: string | null
}

export interface ClusterRecord {
  name: string
  source: 'kind' | 'external'
  k8s_version: string
  server_url: string | null
  created_at: string | null
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  projects: {
    list: () => request<Project[]>('/projects'),
    get: (id: number) => request<Project>(`/projects/${id}`),
    create: (body: ProjectCreateInput) =>
      request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: number,
      body: Partial<ProjectCreateInput> & { status?: string; cluster_name?: string | null }
    ) =>
      request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },

  catalog: {
    k8sVersions: () => request<{ versions: string[] }>('/catalog/k8s-versions'),
    certProviders: () => request<{ providers: CertProvider[] }>('/catalog/cert-providers'),
    addons: () => request<{ addons: Addon[] }>('/catalog/addons'),
    resources: () => request<{ kinds: string[] }>('/catalog/resources'),
  },

  generate: {
    helmPreview: (body: Record<string, unknown>) =>
      request<{ files: Record<string, string> }>('/generate/helm/preview', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    resource: (kind: string, spec: Record<string, unknown>) =>
      request<{ kind: string; yaml: string }>('/generate/resource', {
        method: 'POST',
        body: JSON.stringify({ kind, spec }),
      }),
    helmDownloadUrl: '/api/generate/helm/download',
  },

  clusters: {
    health: () => request<{ docker: boolean; kind: boolean }>('/clusters/health'),
    list: () => request<{ clusters: ClusterRecord[] }>('/clusters'),
    create: (name: string, k8s_version: string) =>
      request<{ ok: boolean; stdout: string; stderr: string }>('/clusters', {
        method: 'POST',
        body: JSON.stringify({ name, k8s_version }),
      }),
    remove: (name: string) =>
      request<{ ok: boolean; stdout: string; stderr: string }>(`/clusters/${name}`, {
        method: 'DELETE',
      }),
    registerExternal: (name: string, payload: string) =>
      request<ClusterRecord>('/clusters/external', {
        method: 'POST',
        body: JSON.stringify({ name, payload }),
      }),
    registerScriptUrl: '/api/clusters/register-script',
  },

  nodes: {
    list: (projectId: number) =>
      request<TargetNode[]>(`/projects/${projectId}/nodes`),
    create: (projectId: number, body: TargetNodeInput) =>
      request<TargetNode>(`/projects/${projectId}/nodes`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    remove: (projectId: number, nodeId: number) =>
      request<void>(`/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' }),
    bootstrapUrl: (projectId: number, nodeId: number) =>
      `/api/projects/${projectId}/nodes/${nodeId}/bootstrap.sh`,
    exec: (projectId: number, nodeId: number, command: string) =>
      request<{ ok: boolean; stdout: string; stderr: string; exit_code: number }>(
        `/projects/${projectId}/nodes/${nodeId}/exec`,
        { method: 'POST', body: JSON.stringify({ command }) }
      ),
  },

  helm: {
    repos: () => request<{ repos: HelmRepo[] }>('/helm/repos'),
    addRepo: (name: string, url: string) =>
      request<{ ok: boolean }>('/helm/repos', {
        method: 'POST',
        body: JSON.stringify({ name, url }),
      }),
    showValues: (repo_name: string, chart: string, version = '') =>
      request<{ values_yaml: string }>('/helm/values', {
        method: 'POST',
        body: JSON.stringify({ repo_name, chart, version }),
      }),
    showChart: (repo_name: string, chart: string, version = '') =>
      request<{ chart_yaml: string }>('/helm/chart', {
        method: 'POST',
        body: JSON.stringify({ repo_name, chart, version }),
      }),
  },

  releases: {
    listForProject: (projectId: number) =>
      request<Release[]>(`/projects/${projectId}/releases`),
    create: (projectId: number, body: ReleaseInput) =>
      request<Release>(`/projects/${projectId}/releases`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<ReleaseInput>) =>
      request<Release>(`/releases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: number) =>
      request<void>(`/releases/${id}`, { method: 'DELETE' }),
    deploy: (id: number) =>
      request<{ ok: boolean; stdout: string; stderr: string; release: Release }>(
        `/releases/${id}/deploy`,
        { method: 'POST' }
      ),
    uninstall: (id: number) =>
      request<{ ok: boolean; stdout: string; stderr: string }>(
        `/releases/${id}/uninstall`,
        { method: 'POST' }
      ),
    status: (id: number) => request<Record<string, unknown>>(`/releases/${id}/status`),
  },

  k8s: {
    kinds: (cluster: string) =>
      request<{ kinds: string[] }>(`/k8s/${cluster}/kinds`),
    list: (cluster: string, namespace: string, kind: string) =>
      request<{ ok: boolean; items: K8sResource[]; kind: string }>(
        `/k8s/${cluster}/${namespace}/${kind}`
      ),
    describe: (cluster: string, namespace: string, kind: string, name: string) =>
      request<{ ok: boolean; yaml: string }>(
        `/k8s/${cluster}/${namespace}/${kind}/${name}`
      ),
    delete: (cluster: string, namespace: string, kind: string, name: string) =>
      request<{ ok: boolean; stdout: string }>(
        `/k8s/${cluster}/${namespace}/${kind}/${name}`,
        { method: 'DELETE' }
      ),
    patch: (
      cluster: string,
      namespace: string,
      kind: string,
      name: string,
      patch: Record<string, unknown>
    ) =>
      request<{ ok: boolean; stdout: string }>(
        `/k8s/${cluster}/${namespace}/${kind}/${name}/patch`,
        { method: 'POST', body: JSON.stringify({ patch }) }
      ),
    exec: (
      cluster: string,
      namespace: string,
      pod: string,
      command: string,
      container?: string
    ) =>
      request<{ ok: boolean; stdout: string; stderr: string; exit_code: number }>(
        `/k8s/${cluster}/${namespace}/pod/${pod}/exec`,
        {
          method: 'POST',
          body: JSON.stringify({ command, container }),
        }
      ),
    logs: (cluster: string, namespace: string, pod: string, tail = 200) =>
      request<{ stdout: string }>(
        `/k8s/${cluster}/${namespace}/pod/${pod}/logs?tail=${tail}`
      ),
  },

  namespaces: {
    list: (cluster: string) =>
      request<{ namespaces: Namespace[] }>(`/clusters/${cluster}/namespaces`),
    create: (cluster: string, name: string) =>
      request<{ name: string; status: string }>(
        `/clusters/${cluster}/namespaces`,
        { method: 'POST', body: JSON.stringify({ name }) }
      ),
    remove: (cluster: string, name: string) =>
      request<void>(`/clusters/${cluster}/namespaces/${name}`, { method: 'DELETE' }),
  },
}
