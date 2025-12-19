// ============================================================
// SMS Broadcast API - Send SMS
// ============================================================
// Test endpoint for sending SMS via SMS Broadcast API

import { NextRequest, NextResponse } from 'next/server';

const SMS_API_URL = 'https://api.smsbroadcast.com.au/api.php';
const SMS_USERNAME = 'accounts@ashburtoncycles.com.au';
const SMS_PASSWORD = 'Ashburton1';
const SMS_FROM = 'AshyCycles';

interface SendSmsRequest {
  to: string;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendSmsRequest = await request.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    // Clean phone number - remove spaces and ensure format
    const cleanPhone = to.replace(/\s+/g, '').replace(/^\+61/, '0');

    // Build API URL
    const params = new URLSearchParams({
      username: SMS_USERNAME,
      password: SMS_PASSWORD,
      from: SMS_FROM,
      to: cleanPhone,
      message: message.substring(0, 160), // Limit to 160 chars
    });

    const apiUrl = `${SMS_API_URL}?${params.toString()}`;

    console.log('[SMS API] Sending SMS to:', cleanPhone);
    console.log('[SMS API] Message:', message.substring(0, 50) + '...');

    // Send request to SMS Broadcast
    const response = await fetch(apiUrl);
    const result = await response.text();

    console.log('[SMS API] Result:', result);

    if (result.includes('Your message was sent')) {
      return NextResponse.json({
        success: true,
        message: 'SMS sent successfully',
        result,
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: result,
          message: 'SMS sending failed',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[SMS API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}

