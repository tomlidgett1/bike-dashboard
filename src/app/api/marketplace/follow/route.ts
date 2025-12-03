/**
 * User Follow API
 * 
 * POST: Follow or unfollow a user
 * - If not following, creates a follow
 * - If already following, removes the follow (toggle behavior)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Prevent self-follow
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot follow yourself' },
        { status: 400 }
      );
    }

    // Check if already following
    const { data: existingFollow } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', userId)
      .single();

    if (existingFollow) {
      // Already following - unfollow
      const { error: deleteError } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      if (deleteError) {
        console.error('[Follow API] Error unfollowing:', deleteError);
        return NextResponse.json(
          { error: 'Failed to unfollow user' },
          { status: 500 }
        );
      }

      // Get updated follower count
      const { count } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      return NextResponse.json({
        success: true,
        action: 'unfollowed',
        isFollowing: false,
        followerCount: count || 0,
      });
    } else {
      // Not following - create follow
      const { error: insertError } = await supabase
        .from('user_follows')
        .insert({
          follower_id: user.id,
          following_id: userId,
        });

      if (insertError) {
        console.error('[Follow API] Error following:', insertError);
        return NextResponse.json(
          { error: 'Failed to follow user' },
          { status: 500 }
        );
      }

      // Get updated follower count
      const { count } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      return NextResponse.json({
        success: true,
        action: 'followed',
        isFollowing: true,
        followerCount: count || 0,
      });
    }
  } catch (error) {
    console.error('[Follow API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

