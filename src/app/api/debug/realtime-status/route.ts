// Temporary debug route to check realtime configuration
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Check which tables are in the supabase_realtime publication
    const { data: publicationTables, error: pubError } = await supabase.rpc(
      'get_realtime_tables'
    ).maybeSingle();

    // Fallback: try raw query
    const { data: rawTables, error: rawError } = await supabase
      .from('pg_publication_tables')
      .select('*');

    // Check auth status
    const { data: { user } } = await supabase.auth.getUser();

    // Test if we can select from messages
    const { count: messageCount, error: messageError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      status: 'ok',
      authenticated: !!user,
      userId: user?.id,
      publicationTables,
      pubError: pubError?.message,
      rawTables,
      rawError: rawError?.message,
      messageCount,
      messageError: messageError?.message,
      env: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET',
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
      }
    });
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
