import { useState, useEffect, useRef } from 'react'
import { supabase, supabaseInitError } from '../lib/supabase'

export interface AuthUser {
  id: string
  username: string
  role: string
  first_login: boolean
  email?: string // ✅ Made optional
  title: 'Mr' | 'Mrs' | 'Ms' | 'Dr' // ✅ New
  first_name: string // ✅ New
  last_name: string // ✅ New
  employee_id?: string // ✅ New
  phone_number: string // ✅ New
}

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine) // Track online status
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const initRef = useRef(false)

  // Helper function to ensure role is always a string
  const normalizeRole = (role: any): string => {
    if (typeof role === 'string') return role
    if (typeof role === 'object' && role?.name) return role.name
    if (typeof role === 'object' && role?.role) return role.role
    return 'Sales Rep' // Default fallback
  }

  // Create user from session data (fallback approach)
  const createUserFromSession = (session: any): AuthUser => {
    return {
      id: session.user.id,
      username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User',
      role: normalizeRole(session.user.user_metadata?.role) || 'Sales Rep',
      first_login: session.user.user_metadata?.first_login !== undefined ? session.user.user_metadata.first_login : true,
      email: session.user.email || undefined,
      title: session.user.user_metadata?.title || 'Mr', // ✅ Default or handle as needed
      first_name: session.user.user_metadata?.first_name || 'First Name', // ✅ Default or handle as needed
      last_name: session.user.user_metadata?.last_name || 'Last Name', // ✅ Default or handle as needed
      employee_id: session.user.user_metadata?.employee_id || undefined,
      phone_number: session.user.phone || session.user.user_metadata?.phone_number || 'N/A', // ✅ Use session.user.phone if available
    }
  }

  useEffect(() => {
    // Check for supabase initialization error first
    if (supabaseInitError) {
      console.error('useAuth: Supabase initialization error detected:', supabaseInitError)
      setConnectionError(supabaseInitError)
      setLoading(false)
      return
    }

    // Prevent multiple initializations
    if (initRef.current) return
    initRef.current = true

    console.log('useAuth: Initializing authentication...')
    
    let mounted = true
    let authSubscription: any = null

    // Immediate timeout to prevent hanging
    const immediateTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.log('useAuth: Force clearing loading state after 2 seconds')
        setLoading(false)
      }
    }, 2000)

    const processUser = async (session: any) => {
      if (!mounted) return

      if (session?.user) {
        console.log('useAuth: Processing user session')
        const sessionUser = createUserFromSession(session)
        setUser(sessionUser)
        setConnectionError(null)
        setLoading(false)

        // Background database enhancement (non-blocking)
        setTimeout(async () => {
          if (!mounted) return
          try {
            const { data } = await supabase
              .from('users')
              .select('username, role, first_login, email, title, first_name, last_name, employee_id, phone_number')
              .eq('id', session.user.id)
              .maybeSingle()

            if (mounted && data) {
              setUser(prev => prev ? {
                ...prev,
                username: data.username || prev.username,
                role: normalizeRole(data.role) || prev.role,
                first_login: data.first_login !== undefined ? data.first_login : prev.first_login,
                email: data.email || prev.email,
                title: data.title || prev.title,
                first_name: data.first_name || prev.first_name,
                last_name: data.last_name || prev.last_name,
                employee_id: data.employee_id || prev.employee_id,
                phone_number: data.phone_number || prev.phone_number,
              } : null)
            }
          } catch (error) {
            console.warn('useAuth: Background DB query failed (non-critical):', error)
          }
        }, 100)
      } else {
        console.log('useAuth: No session found')
        setUser(null)
        setConnectionError(null)
        setLoading(false)
      }
    }

    const initAuth = async () => {
      try {
        console.log('useAuth: Setting up auth listener...')
        
        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('useAuth: Auth state changed:', event)
          clearTimeout(immediateTimeout)
          await processUser(session)
        })
        authSubscription = subscription

        // Quick initial session check (no timeout, just let it resolve naturally)
        console.log('useAuth: Checking initial session...')
        
        // Use a simple approach - just get the session without complex timeout logic
        supabase.auth.getSession()
          .then(({ data: { session }, error }) => {
            if (!mounted) return
            
            if (error) {
              console.warn('useAuth: Initial session check error:', error.message)
             // Clear any stale session data if there's an authentication error
             supabase.auth.signOut().catch(() => {
               // Ignore signOut errors as we're already in an error state
             })
              setUser(null)
              setLoading(false)
              return
            }
            
           // If no session exists, ensure we clear any stale data
           if (!session) {
             supabase.auth.signOut().catch(() => {
               // Ignore signOut errors as this is just cleanup
             })
           }
           
            console.log('useAuth: Initial session result:', !!session)
            clearTimeout(immediateTimeout)
            processUser(session)
          })
          .catch((error) => {
            console.warn('useAuth: Session check failed:', error.message)
            if (mounted) {
             // Clear any stale session data on session check failure
             supabase.auth.signOut().catch(() => {
               // Ignore signOut errors as we're already in an error state
             })
              clearTimeout(immediateTimeout)
              setUser(null)
              setLoading(false)
            }
          })

      } catch (error: any) {
        console.error('useAuth: Setup failed:', error)
        if (mounted) {
          clearTimeout(immediateTimeout)
          setUser(null)
          setLoading(false)
        }
      }
    }

    // Network status listeners
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    initAuth()

    return () => {
      console.log('useAuth: Cleanup')
      mounted = false
      initRef.current = false
      clearTimeout(immediateTimeout)
      
      // Cleanup network listeners
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      
      if (authSubscription) {
        // Ensure unsubscribe is called correctly
        // Supabase client's onAuthStateChange returns an object with an unsubscribe method
        // if (typeof authSubscription.unsubscribe === 'function') {
        authSubscription.unsubscribe()
        // }
      }
    }
  }, [])

  const login = async (credential: string, password: string) => {
    try {
      setConnectionError(null)
      console.log('useAuth: Attempting login with username:', credential)

      const username = credential.trim();

      // Query the public.users table to find the associated email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email') // Only select email, as phone login is being removed
        .eq('username', username)
        .maybeSingle();

      if (userError) throw userError;
      if (!userData || !userData.email) {
        // If no user found with that username, or user has no email, consider it invalid credentials
        throw new Error('Invalid username or password.');
      }

      // Use the retrieved email for signInWithPassword
      const { error } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: password
      });

      if (error) throw error
      return true
    } catch (error: any) {
      console.error('useAuth: Login error:', error)
      throw error
    }
  }

  const signup = async (userData: {
    title: 'Mr' | 'Mrs' | 'Ms' | 'Dr'
    first_name: string
    last_name: string
    employee_id?: string
    email?: string // ✅ Optional
    phone_number: string
    username: string
    password: string
  }) => {
    try {
      setConnectionError(null)
      console.log('useAuth: Attempting signup')

      // Supabase Auth signUp requires either email or phone.
      // If email is provided, use it. Otherwise, use phone number.
      const authIdentifier = userData.email?.trim() || userData.phone_number.trim();
      const authOptions: any = { password: userData.password };

      if (userData.email?.trim()) {
        authOptions.email = userData.email.trim();
      } else {
        authOptions.phone = userData.phone_number.trim();
      }

      const { data, error } = await supabase.auth.signUp({
        ...authOptions,
        options: {
          data: {
            username: userData.username.trim(),
            role: 'Sales Rep',
            first_login: true,
            title: userData.title,
            first_name: userData.first_name,
            last_name: userData.last_name,
            employee_id: userData.employee_id,
            phone_number: userData.phone_number,
          }
        }
      })

      if (error) throw error
      if (!data.user) throw new Error('Signup failed. No user returned.')

      // Background database record creation
      setTimeout(() => {
        supabase.from('users').insert([{
          id: data.user.id,
          username: userData.username.trim(),
          email: userData.email?.trim(),
          role: 'Sales Rep',
          first_login: true,
          title: userData.title,
          first_name: userData.first_name,
          last_name: userData.last_name,
          employee_id: userData.employee_id,
          phone_number: userData.phone_number,
        }]).then(({ error }) => {
          if (error) {
            console.warn('useAuth: DB record creation failed (non-critical):', error.message)
          }
        })
      }, 100)

      return true
    } catch (error: any) {
      console.error('useAuth: Signup error:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      console.log('useAuth: Logging out...')
      
      // Only attempt logout if there's an active user session
      if (user) {
        const { error } = await supabase.auth.signOut()
        if (error && !error.message.toLowerCase().includes('session')) {
          console.warn('useAuth: Logout warning:', error.message)
        }
      }
      
      // Always clear local state regardless of API call result
      setUser(null)
      setConnectionError(null)
    } catch (error) {
      console.warn('useAuth: Logout error (non-critical):', error)
      // Ensure local state is cleared even if logout fails
      setUser(null)
      setConnectionError(null)
    }
  }

  return { user, loading, login, signup, logout, connectionError, isOnline }
}