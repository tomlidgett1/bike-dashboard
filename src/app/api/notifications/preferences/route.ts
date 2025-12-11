// ============================================================
// NOTIFICATION PREFERENCES API
// ============================================================
// GET: Fetch user's notification preferences
// PATCH: Update user's notification preferences

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ============================================================
// Types
// ============================================================

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  email_frequency: 'instant' | 'smart' | 'digest' | 'critical_only';
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  created_at: string;
  updated_at: string;
}

interface UpdatePreferencesRequest {
  email_enabled?: boolean;
  email_frequency?: 'instant' | 'smart' | 'digest' | 'critical_only';
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

// ============================================================
// GET: Fetch user's notification preferences
// ============================================================
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Fetch preferences
    const { data: preferences, error: fetchError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      // If no preferences exist, create default ones
      if (fetchError.code === 'PGRST116') {
        const { data: newPreferences, error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: user.id,
            email_enabled: true,
            email_frequency: 'smart',
            quiet_hours_enabled: false,
            quiet_hours_start: '22:00',
            quiet_hours_end: '08:00',
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating preferences:', insertError);
          return NextResponse.json(
            { error: 'Failed to create notification preferences' },
            { status: 500 }
          );
        }

        return NextResponse.json({ preferences: newPreferences });
      }

      console.error('Error fetching preferences:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Unexpected error in GET /api/notifications/preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH: Update user's notification preferences
// ============================================================
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse request body
    const body: UpdatePreferencesRequest = await request.json();

    // Validate email_frequency if provided
    if (body.email_frequency) {
      const validFrequencies = ['instant', 'smart', 'digest', 'critical_only'];
      if (!validFrequencies.includes(body.email_frequency)) {
        return NextResponse.json(
          { error: `Invalid email_frequency. Must be one of: ${validFrequencies.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate time format if provided
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (body.quiet_hours_start && !timeRegex.test(body.quiet_hours_start)) {
      return NextResponse.json(
        { error: 'Invalid quiet_hours_start format. Use HH:MM format (e.g., 22:00)' },
        { status: 400 }
      );
    }
    if (body.quiet_hours_end && !timeRegex.test(body.quiet_hours_end)) {
      return NextResponse.json(
        { error: 'Invalid quiet_hours_end format. Use HH:MM format (e.g., 08:00)' },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updateData: Partial<NotificationPreferences> = {};
    if (typeof body.email_enabled === 'boolean') {
      updateData.email_enabled = body.email_enabled;
    }
    if (body.email_frequency) {
      updateData.email_frequency = body.email_frequency;
    }
    if (typeof body.quiet_hours_enabled === 'boolean') {
      updateData.quiet_hours_enabled = body.quiet_hours_enabled;
    }
    if (body.quiet_hours_start) {
      updateData.quiet_hours_start = body.quiet_hours_start;
    }
    if (body.quiet_hours_end) {
      updateData.quiet_hours_end = body.quiet_hours_end;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Try to update existing preferences
    const { data: updatedPreferences, error: updateError } = await supabase
      .from('notification_preferences')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      // If no row exists, create one with the updates
      if (updateError.code === 'PGRST116') {
        const { data: newPreferences, error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: user.id,
            email_enabled: body.email_enabled ?? true,
            email_frequency: body.email_frequency ?? 'smart',
            quiet_hours_enabled: body.quiet_hours_enabled ?? false,
            quiet_hours_start: body.quiet_hours_start ?? '22:00',
            quiet_hours_end: body.quiet_hours_end ?? '08:00',
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating preferences:', insertError);
          return NextResponse.json(
            { error: 'Failed to create notification preferences' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          preferences: newPreferences,
          message: 'Notification preferences created',
        });
      }

      console.error('Error updating preferences:', updateError);
      return NextResponse.json(
        { error: 'Failed to update notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      preferences: updatedPreferences,
      message: 'Notification preferences updated',
    });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/notifications/preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

