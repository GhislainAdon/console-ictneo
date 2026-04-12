import { create } from 'zustand'
import type { Project } from '../api/client'

interface SelectedState {
  project: Project | null
  setProject: (p: Project | null) => void
}

export const useSelected = create<SelectedState>((set) => ({
  project: null,
  setProject: (project) => set({ project }),
}))
