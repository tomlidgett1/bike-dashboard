"use client";

import * as React from "react";
import { Mail, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HelpContactCardProps {
  className?: string;
  compact?: boolean;
}

export function HelpContactCard({ className, compact }: HelpContactCardProps) {
  const handleEmailClick = () => {
    window.location.href = "mailto:support@yellowjersey.com.au?subject=Support%20Request";
  };

  if (compact) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-4", className)}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Mail className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Need more help?</p>
            <p className="text-xs text-gray-500">We typically respond within 24h</p>
          </div>
        </div>
        <Button
          onClick={handleEmailClick}
          variant="outline"
          size="sm"
          className="w-full rounded-md"
        >
          <Mail className="h-4 w-4 mr-2" />
          Email Support
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-md border border-gray-200 p-5", className)}>
      <h3 className="text-base font-semibold text-gray-900 mb-4">Contact Support</h3>
      
      <div className="space-y-4">
        {/* Email Support */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Mail className="h-5 w-5 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Email Support</p>
            <p className="text-xs text-gray-500 mb-2">
              Send us an email and we'll get back to you
            </p>
            <button
              onClick={handleEmailClick}
              className="text-sm text-gray-700 hover:text-gray-900 font-medium flex items-center gap-1 cursor-pointer"
            >
              support@yellowjersey.com.au
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Response Time */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Clock className="h-5 w-5 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Response Time</p>
            <p className="text-xs text-gray-500">
              We typically respond within 24-48 hours during business days
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleEmailClick}
        className="w-full mt-4 rounded-md"
      >
        <Mail className="h-4 w-4 mr-2" />
        Email Support
      </Button>
    </div>
  );
}
