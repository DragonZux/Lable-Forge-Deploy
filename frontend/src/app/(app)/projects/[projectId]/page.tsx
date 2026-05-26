'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ProjectRedirectPage() {
  const router = useRouter()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''

  useEffect(() => {
    router.replace(`/projects/${projectId}/dataset`)
  }, [projectId, router])

  return null
}
