/**
 * Admin Database Tables API
 * 
 * GET /api/admin/database/tables - List all tables in the database
 * GET /api/admin/database/tables?table=table_name - Get schema for a specific table
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

// List of admin user IDs that can access this endpoint
const ADMIN_USER_IDS = [
  // Add your admin user IDs here
]

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    // For now, allow any authenticated user - you can add admin check later
    // if (!ADMIN_USER_IDS.includes(user.id)) {
    //   return NextResponse.json(
    //     { error: 'Forbidden. Admin access required.' },
    //     { status: 403 }
    //   )
    // }

    const serviceClient = createServiceRoleClient()
    const searchParams = request.nextUrl.searchParams
    const tableName = searchParams.get('table')

    if (tableName) {
      // Get schema for a specific table
      const { data: columns, error } = await serviceClient.rpc('get_table_columns', {
        p_table_name: tableName
      })

      if (error) {
        // Fallback: try to get columns using information_schema
        const { data: schemaColumns, error: schemaError } = await serviceClient
          .from('information_schema.columns')
          .select('column_name, data_type, is_nullable, column_default, character_maximum_length')
          .eq('table_schema', 'public')
          .eq('table_name', tableName)
          .order('ordinal_position')

        if (schemaError) {
          return NextResponse.json(
            { error: `Failed to get table schema: ${schemaError.message}` },
            { status: 500 }
          )
        }

        return NextResponse.json({
          table: tableName,
          columns: schemaColumns || []
        })
      }

      return NextResponse.json({
        table: tableName,
        columns: columns || []
      })
    }

    // Get list of all tables
    const { data: tables, error } = await serviceClient.rpc('get_public_tables')

    if (error) {
      // Fallback: try to get tables using information_schema
      const { data: schemaTables, error: schemaError } = await serviceClient
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE')
        .order('table_name')

      if (schemaError) {
        return NextResponse.json(
          { error: `Failed to list tables: ${schemaError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        tables: (schemaTables || []).map(t => t.table_name)
      })
    }

    // The RPC returns an array of { table_name: string } objects
    // Extract just the table names as strings
    const tableNames = (tables || []).map((t: { table_name: string } | string) => 
      typeof t === 'string' ? t : t.table_name
    )

    return NextResponse.json({
      tables: tableNames
    })

  } catch (error) {
    console.error('Database tables API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

