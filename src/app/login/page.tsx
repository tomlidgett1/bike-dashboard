'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bike, Mail, Lock, Loader2, Store, User } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [accountType, setAccountType] = useState<'individual' | 'bicycle_store'>('individual')
  const router = useRouter()
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'login') {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        
        // Fetch user profile to determine redirect
        if (authData.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('bicycle_store, account_type')
            .eq('user_id', authData.user.id)
            .single()
          
          // Redirect based on account type and verification status
          // Only verified bicycle stores (account_type = 'bicycle_store' AND bicycle_store = true) go to settings
          if (profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true) {
            // Verified bike store -> go to settings/dashboard
            router.push('/settings')
          } else {
            // Individual users OR unverified stores -> go to marketplace
            router.push('/marketplace')
          }
          router.refresh()
        }
      } else {
        // Sign up the user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (authError) throw authError
        
        // Create user profile with account type (bicycle_store always false initially)
        if (authData.user) {
          const { error: profileError } = await supabase
            .from('users')
            .insert({
              user_id: authData.user.id,
              email: email,
              account_type: accountType,
              bicycle_store: false, // Always false until admin approves
              name: '',
              phone: '',
              first_name: '',
              last_name: '',
              business_name: '',
              store_type: '',
              address: '',
              website: '',
              preferences: {},
              onboarding_completed: false,
              email_notifications: true,
              order_alerts: true,
              inventory_alerts: true,
              marketing_emails: false,
            })
          
          if (profileError) {
            console.error('Error creating profile:', profileError)
          }
          
          // Redirect to onboarding immediately (no email verification required)
          router.push(`/onboarding?type=${accountType}`)
          router.refresh()
          return
        }
      }
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg mb-4">
            <Bike className="w-8 h-8 text-gray-900 dark:text-white" />
          </div>
          <div className="flex items-center justify-center">
            <Image 
              src="/yj.svg" 
              alt="Yellow Jersey" 
              width={300} 
              height={60}
              className="h-16"
            />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleAuth} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 rounded-md"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 rounded-md"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Account Type Selection (Signup Only) */}
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="accountType" className="text-sm font-medium">
                  Account Type
                </Label>
                <Select value={accountType} onValueChange={(value: 'individual' | 'bicycle_store') => setAccountType(value)} disabled={loading}>
                  <SelectTrigger className="h-12 rounded-md bg-white">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-md">
                    <SelectItem value="individual" className="rounded-md">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>Individual Seller</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="bicycle_store" className="rounded-md">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4" />
                        <span>Bicycle Store</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {accountType === 'bicycle_store' 
                    ? 'Store accounts require admin verification before approval'
                    : 'Perfect for selling your personal bikes'}
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-white border border-gray-200 dark:border-gray-700 dark:bg-gray-900 rounded-xl p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-medium rounded-md"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <>{mode === 'login' ? 'Sign In' : 'Create Account'}</>
              )}
            </Button>
          </form>

          {/* Toggle Mode */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError(null)
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              disabled={loading}
            >
              {mode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <span className="font-semibold">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <span className="font-semibold">Sign in</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}





