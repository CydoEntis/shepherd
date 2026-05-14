import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../../store/root.store'
import { getUiState, setUiState } from '../../workspace/workspace.service'

export interface OpenFile {
  path: string
  root: string
  hasChanges: boolean
}

export interface UseFileTabsReturn {
  openFiles: OpenFile[]
  activeFilePath: string | null
  setActiveFilePath: (path: string | null) => void
  handleFileClick: (path: string, xy: string | undefined) => void
  handleCloseFile: (path: string) => void
}

export function useFileTabs(): UseFileTabsReturn {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    getUiState().then((state) => {
      setOpenFiles(state.openFiles.map((f) => ({ ...f, hasChanges: false })))
      setActiveFilePath(state.activeFilePath)
      loaded.current = true
    })
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    setUiState({ openFiles: openFiles.map(({ path, root }) => ({ path, root })) })
  }, [openFiles])

  useEffect(() => {
    if (!loaded.current) return
    setUiState({ activeFilePath })
  }, [activeFilePath])

  const handleFileClick = useCallback((path: string, xy: string | undefined): void => {
    const root = useStore.getState().settings.projectRoot
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === path)) return prev
      return [...prev, { path, root, hasChanges: xy !== undefined }]
    })
    setActiveFilePath(path)
  }, [])

  const handleCloseFile = (path: string): void => {
    setOpenFiles((prev) => {
      const remaining = prev.filter((f) => f.path !== path)
      setActiveFilePath((cur) => cur !== path ? cur : remaining.at(-1)?.path ?? null)
      return remaining
    })
  }

  return { openFiles, activeFilePath, setActiveFilePath, handleFileClick, handleCloseFile }
}
