"use client";

import * as React from "react";
import Image from "next/image";
import { MapPin, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SettingsProfileHeaderProps {
  displayName: string;
  location?: string;
  avatarUrl?: string;
  onEditProfile: () => void;
  className?: string;
}

export function SettingsProfileHeader({
  displayName,
  location,
  avatarUrl,
  onEditProfile,
  className,
}: SettingsProfileHeaderProps) {
  const initials = displayName
    ? displayName.charAt(0).toUpperCase()
    : "?";

  return (
    <div className={cn("bg-white px-4 py-6", className)}>
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="relative mb-4">
          <div className="h-24 w-24 rounded-full border-4 border-white shadow-lg bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <span className="text-3xl font-bold text-gray-400">
                  {initials}
                </span>
              </div>
            )}
          </div>
          
          {/* Edit badge on avatar */}
          <button
            type="button"
            onClick={onEditProfile}
            className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-md hover:bg-gray-800 active:bg-gray-700 transition-colors"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>

        {/* Name */}
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {displayName || "Your Name"}
        </h2>

        {/* Location */}
        {location && (
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {location}
          </p>
        )}

        {/* Edit Profile Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onEditProfile}
          className="mt-4 rounded-md"
        >
          <Edit2 className="h-4 w-4 mr-2" />
          Edit Profile
        </Button>
      </div>
    </div>
  );
}

