// ============================================================
// n8n Webhook Client for Instagram Posting
// ============================================================
// Sends data to n8n webhook which handles Instagram posting

interface N8nWebhookPayload {
  productId: string;
  title: string;
  price: number;
  URLIMAGE: string;
  caption: string;
  description?: string;
}

interface N8nWebhookResponse {
  success: boolean;
  message?: string;
  scenarioExecutionId?: string;
  [key: string]: any;
}

/**
 * n8n webhook client for posting to Instagram
 */
export class InstagramClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Send data to n8n webhook to trigger Instagram posting
   * 
   * @param imageUrl - Publicly accessible image URL
   * @param caption - Post caption/text
   * @param productId - Product ID for tracking
   * @param title - Product title
   * @param price - Product price
   * @param description - Product description
   */
  async postImage(
    imageUrl: string,
    caption: string,
    productId: string,
    title: string,
    price: number,
    description?: string
  ): Promise<{ scenarioExecutionId: string; status: string }> {
    try {
      console.log('[n8n] Sending data to webhook...');
      console.log('[n8n] Webhook URL:', this.webhookUrl);
      console.log('[n8n] Payload:', {
        productId,
        title,
        price,
        URLIMAGE: imageUrl,
        captionLength: caption.length,
      });

      const payload: N8nWebhookPayload = {
        productId,
        title,
        price,
        URLIMAGE: imageUrl,
        caption,
        description,
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // n8n webhooks return 200 for successful triggers
      if (!response.ok) {
        throw new Error(
          `n8n webhook error: ${response.status} ${response.statusText}`
        );
      }

      let result: N8nWebhookResponse;
      
      // Try to parse response from n8n
      const responseText = await response.text();
      if (responseText) {
        try {
          result = JSON.parse(responseText);
        } catch {
          // If response is not JSON, treat as success
          result = {
            success: true,
            message: responseText || 'Webhook triggered successfully',
          };
        }
      } else {
        // Empty response from n8n usually means success
        result = {
          success: true,
          message: 'Webhook triggered successfully',
        };
      }

      console.log('[n8n] Webhook response:', result);

      // Generate a pseudo execution ID if not provided
      const executionId = result.scenarioExecutionId || 
                         result.executionId || 
                         result.id ||
                         `n8n_${Date.now()}`;

      return {
        scenarioExecutionId: executionId,
        status: 'triggered',
      };
    } catch (error) {
      console.error('[n8n] Error triggering webhook:', error);
      throw error;
    }
  }

  /**
   * Validate that the webhook URL is configured
   */
  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.webhookUrl || this.webhookUrl === '') {
        console.error('[n8n] Webhook URL not configured');
        return false;
      }

      // Check if URL is valid
      try {
        new URL(this.webhookUrl);
      } catch {
        console.error('[n8n] Invalid webhook URL format');
        return false;
      }

      // Optionally send a test ping to verify webhook is reachable
      // Note: This will trigger the workflow, so only do if needed
      console.log('[n8n] Webhook URL is configured and valid');
      return true;
    } catch (error) {
      console.error('[n8n] Error validating webhook:', error);
      return false;
    }
  }

  /**
   * Send a test payload to verify the webhook is working
   * Use this to test your n8n workflow setup
   */
  async sendTestPayload(): Promise<boolean> {
    try {
      const testPayload: N8nWebhookPayload = {
        productId: 'test-123',
        title: 'Test Product',
        price: 99.99,
        imageUrl: 'https://via.placeholder.com/1080',
        caption: 'This is a test post from Yellow Jersey 🚴‍♂️',
        description: 'Test description',
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      console.log('[n8n] Test webhook response:', {
        status: response.status,
        ok: response.ok,
      });

      return response.ok;
    } catch (error) {
      console.error('[n8n] Error sending test payload:', error);
      return false;
    }
  }
}

/**
 * Factory function to create an Instagram client with environment variables
 */
export function createInstagramClient(): InstagramClient {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error(
      'n8n webhook URL not configured. Set N8N_WEBHOOK_URL in .env.local'
    );
  }

  return new InstagramClient(webhookUrl);
}

/**
 * Generate Instagram caption from product details
 */
export function generateCaption(
  title: string,
  price: number,
  description?: string
): string {
  const formattedPrice = `$${price.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
  
  // Base caption
  let caption = `${title} / ${formattedPrice} - live now on Yellow Jersey 🚴‍♂️\n\n`;
  
  // Add description if provided (truncate to keep caption reasonable)
  if (description) {
    const truncatedDesc = description.length > 150 
      ? description.substring(0, 150) + '...' 
      : description;
    caption += truncatedDesc + '\n\n';
  }
  
  // Add call to action and hashtags
  caption += `Shop now at yellowjersey.com.au\n\n`;
  caption += `#cycling #bike #bicycle #yellowjersey #cyclinglife #bikeshop #cyclinggear #roadbike #mountainbike #gravel`;
  
  return caption;
}
