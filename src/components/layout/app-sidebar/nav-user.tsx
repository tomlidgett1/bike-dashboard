"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DiplomaVerified,
  Help,
  Logout,
  Settings,
  Shop,
  SortVertical,
  SquareArrowRightUp,
} from "./sidebar-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { createClient } from "@/lib/supabase/client";
import { StoreSidebarLogo } from "./store-sidebar-logo";

export function NavUser() {
  const { isMobile } = useSidebar();
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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!",
              )}
            >
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
                <StoreSidebarLogo logoUrl={profile?.logo_url} alt={name} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Bike store
                </span>
              </div>
              <SortVertical className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
