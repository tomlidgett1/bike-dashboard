"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DiplomaVerified,
  Help,
  Logout,
  Settings,
  Shop,
  SquareArrowRightUp,
} from "@/components/layout/app-sidebar/sidebar-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StoreSidebarLogo } from "@/components/layout/app-sidebar/store-sidebar-logo";
import { topbarIconButtonClass } from "@/components/layout/topbar-nav-pills";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function TopbarUserMenu() {
  const { profile } = useUserProfile();
  const router = useRouter();

  const name = profile?.business_name || profile?.name || "Your store";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/marketplace");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(topbarIconButtonClass, "overflow-hidden !p-0")}
          aria-label="Account menu"
        >
          <span className="flex size-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
            <StoreSidebarLogo
              logoUrl={profile?.logo_url}
              alt={name}
              className="size-full"
              iconClassName="size-4"
              priority={false}
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-60 rounded-md">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {name}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {profile?.user_id ? (
            <DropdownMenuItem asChild className="gap-2">
              <Link
                href={`/marketplace/store/${profile.user_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Shop className="size-4" />
                View my store
                <SquareArrowRightUp className="ml-auto size-3.5 text-muted-foreground" />
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/settings/store">
              <Settings className="size-4" />
              Storefront settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/settings">
              <DiplomaVerified className="size-4" />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/marketplace/help">
              <Help className="size-4" />
              Help &amp; support
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <Logout className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
