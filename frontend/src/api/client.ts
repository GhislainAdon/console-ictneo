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
    list: () => request<{ clusters: string[] }>('/clusters'),
    create: (name: string, k8s_version: string) =>
      request<{ ok: boolean; stdout: string; stderr: string }>('/clusters', {
        method: 'POST',
        body: JSON.stringify({ name, k8s_version }),
      }),
    remove: (name: string) =>
      request<{ ok: boolean; stdout: string; stderr: string }>(`/clusters/${name}`, {
        method: 'DELETE',
      }),
  },
}
