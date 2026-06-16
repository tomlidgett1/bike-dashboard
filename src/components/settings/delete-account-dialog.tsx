"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canDelete = confirmation === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete account. Please try again.");
        setDeleting(false);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setDeleting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!deleting) {
      setOpen(next);
      if (!next) {
        setConfirmation("");
        setError(null);
      }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />
          Delete Account
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <AlertDialogHeader className="px-4 pt-4 pb-3">
          <AlertDialogTitle className="text-sm font-semibold">
            Delete your account
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            This is permanent and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Separator />

        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
            This will permanently
          </p>
          <ul className="space-y-1">
            {[
              "Remove all your products from the marketplace",
              "Delete your store profile and business information",
              "Disconnect your Lightspeed and Stripe integrations",
              "Delete all your messages and notifications",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-2.5">
            Shared catalogue data will not be affected.
          </p>
        </div>

        <Separator />

        <div className="px-4 py-3 space-y-1.5">
          <Label htmlFor="delete-confirm" className="text-xs font-medium">
            Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            className="h-8 text-sm font-mono"
            disabled={deleting}
            autoComplete="off"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <Separator />

        <AlertDialogFooter className="px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete my account
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
