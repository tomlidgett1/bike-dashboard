"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

      // Sign out locally then redirect — auth user is already deleted server-side
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
        <Button variant="destructive" className="rounded-md gap-2">
          <Trash2 className="h-4 w-4" />
          Delete Account
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-base font-semibold">
              Delete your account
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>This action is <span className="font-semibold text-foreground">permanent and cannot be undone</span>. Deleting your account will:</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>Remove all your products from the marketplace</li>
                <li>Delete your store profile and business information</li>
                <li>Disconnect your Lightspeed and Stripe integrations</li>
                <li>Delete all your messages and notifications</li>
              </ul>
              <p className="text-xs">Product catalogue data (canonical products) is shared across the platform and will not be affected.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="delete-confirm" className="text-sm font-medium">
            Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            className="rounded-md font-mono"
            disabled={deleting}
            autoComplete="off"
          />
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            className="rounded-md"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-md"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete my account
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
