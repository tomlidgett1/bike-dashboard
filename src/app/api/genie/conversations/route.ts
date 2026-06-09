import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/genie/conversations — list user's conversations (most recent first)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('genie_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ conversations: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}

// POST /api/genie/conversations — upsert a conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, messages } = await request.json()

    // Auto-title from first user message
    const firstUser = messages.find((m: any) => m.role === 'user')
    const title = firstUser
      ? firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '')
      : 'Conversation'

    const payload = {
      user_id: user.id,
      title,
      messages,
      updated_at: new Date().toISOString(),
    }

    let result
    if (id) {
      const { data, error } = await supabase
        .from('genie_conversations')
        .upsert({ id, ...payload }, { onConflict: 'id' })
        .select('id')
        .single()
      if (error) throw error
      result = data
    } else {
      const { data, error } = await supabase
        .from('genie_conversations')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      result = data
    }

    return NextResponse.json({ id: result.id })
  } catch {
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}
