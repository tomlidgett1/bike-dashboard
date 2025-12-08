import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const productId = searchParams.get('product_id');
    const changeType = searchParams.get('change_type'); // 'increase', 'decrease', 'activated', 'deactivated', 'all'

    // Build query
    let query = supabase
      .from('inventory_stock_update_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (productId) {
      query = query.eq('product_id', productId);
    }

    if (changeType && changeType !== 'all') {
      switch (changeType) {
        case 'increase':
          query = query.gt('qoh_change', 0);
          break;
        case 'decrease':
          query = query.lt('qoh_change', 0);
          break;
        case 'activated':
          query = query.eq('old_is_active', false).eq('new_is_active', true);
          break;
        case 'deactivated':
          query = query.eq('old_is_active', true).eq('new_is_active', false);
          break;
      }
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: logs, error: logsError, count } = await query;

    if (logsError) {
      console.error('Error fetching inventory logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    // Get stats
    const { data: stats } = await supabase
      .from('inventory_stock_update_logs')
      .select('qoh_change, old_is_active, new_is_active')
      .eq('user_id', user.id);

    const statistics = {
      total: count || 0,
      increases: stats?.filter(s => s.qoh_change > 0).length || 0,
      decreases: stats?.filter(s => s.qoh_change < 0).length || 0,
      activated: stats?.filter(s => s.old_is_active === false && s.new_is_active === true).length || 0,
      deactivated: stats?.filter(s => s.old_is_active === true && s.new_is_active === false).length || 0,
    };

    return NextResponse.json({
      success: true,
      logs: logs || [],
      count: count || 0,
      statistics,
      pagination: {
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });

  } catch (error) {
    console.error('Inventory logs API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

