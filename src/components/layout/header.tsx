"use client";

import { MobileSidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, Loader2 } from "lucide-react";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import Image from "next/image";
import { MessagesDropdown } from "./messages-dropdown";

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { isSyncing, formattedLastSync } = useSyncStatus();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const getUserInitials = () => {
    if (profile?.name) {
      const names = profile.name.split(' ');
      if (names.length >= 2) {
        return (names[0].charAt(0) + names[1].charAt(0)).toUpperCase();
      }
      return profile.name.charAt(0).toUpperCase();
    }
    if (!user?.email) return "U";
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:px-6">
      <MobileSidebar />
      
      <div className="flex flex-1 items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {description && (
            <p className="hidden text-sm text-muted-foreground sm:block">
              {description}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Sync Status Indicator */}
          {isSyncing ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white dark:bg-card border border-border">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-foreground">
                Syncing inventory...
              </span>
            </div>
          ) : formattedLastSync !== 'Never' && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-white dark:bg-card border border-border">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-xs text-muted-foreground">
                Last sync: {formattedLastSync}
              </span>
            </div>
          )}
          
          {user && <MessagesDropdown />}
          
          <ThemeToggle />
          
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  {profile?.logo_url ? (
                    <div className="relative h-8 w-8 rounded-full overflow-hidden">
                      <Image
                        src={profile.logo_url}
                        alt={profile.business_name || "Logo"}
                        fill
                        className="object-cover"
                        priority
                        sizes="32px"
                      />
                    </div>
                  ) : (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Account</p>
                    <p className="text-xs leading-none text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <User className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 dark:text-red-400">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}

