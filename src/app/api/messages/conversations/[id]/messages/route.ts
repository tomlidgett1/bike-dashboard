// ============================================================
// SEND MESSAGE API ROUTE
// ============================================================
// POST: Send a new message with optional image attachments

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SendMessageResponse } from '@/lib/types/message';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: 'Not a participant in this conversation' },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const content = formData.get('content') as string;
    const attachmentFiles = formData.getAll('attachments') as File[];

    if (!content || content.trim() === '') {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Validate attachments
    if (attachmentFiles.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 images per message' },
        { status: 400 }
      );
    }

    // Create message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
        message_type: 'user',
      })
      .select()
      .single();

    if (messageError || !message) {
      console.error('Error creating message:', messageError);
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      );
    }

    // Upload attachments if any
    const attachments = [];
    if (attachmentFiles.length > 0) {
      for (const file of attachmentFiles) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          continue; // Skip non-image files
        }

        // Validate file size (5MB limit)
        if (file.size > 5 * 1024 * 1024) {
          console.warn(`File ${file.name} exceeds 5MB limit, skipping`);
          continue;
        }

        // Generate storage path
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storagePath = `${user.id}/${conversationId}/${message.id}/${fileName}`;

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error('Error uploading attachment:', uploadError);
          continue; // Skip this file but continue with others
        }

        // Get image dimensions if possible (for UI optimization)
        let width = null;
        let height = null;
        if (typeof Image !== 'undefined') {
          try {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            await new Promise((resolve) => {
              img.onload = () => {
                width = img.width;
                height = img.height;
                URL.revokeObjectURL(objectUrl);
                resolve(null);
              };
              img.src = objectUrl;
            });
          } catch (err) {
            console.warn('Could not get image dimensions:', err);
          }
        }

        // Create attachment record
        const { data: attachment, error: attachmentError } = await supabase
          .from('message_attachments')
          .insert({
            message_id: message.id,
            storage_path: storagePath,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            width,
            height,
          })
          .select()
          .single();

        if (!attachmentError && attachment) {
          attachments.push(attachment);
        }
      }
    }

    // Fetch sender details
    const { data: sender } = await supabase
      .from('users')
      .select('user_id, name, business_name, logo_url')
      .eq('user_id', user.id)
      .single();

    // Build response
    const response: SendMessageResponse = {
      message: {
        ...message,
        attachments,
        sender: sender || undefined,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Unexpected error sending message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}




