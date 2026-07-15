import React, { useEffect, useState } from 'react'
import OSDesktopShell from './components/os/OSDesktopShell'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import EngineerApprovalDialog from './components/workbench/EngineerApprovalDialog'
import Login from './components/Login'
import { kernel } from './core/runtime/Kernel'
import { supabase } from './supabase'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      kernel.setUser({
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User'
      })
    }
  }, [session])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-emerald-500 font-mono text-sm">
        [Auth] Checking session...
      </div>
    )
  }

  if (!session) {
    return <Login onLoginSuccess={() => { }} />
  }

  return (
    <ErrorBoundary>
      <OSDesktopShell />
      <EngineerApprovalDialog />
    </ErrorBoundary>
  )
}