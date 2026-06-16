"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useSellModal } from "@/components/providers/sell-modal-provider";
import type { ListingPhotoDraft } from "./listing-photos-panel";

const AuthModal = dynamic(
  () => import("@/components/marketplace/auth-modal").then((mod) => mod.AuthModal),
  { ssr: false }
);
const FacebookImportModal = dynamic(
  () => import("./facebook-import-modal").then((mod) => mod.FacebookImportModal),
  { ssr: false }
);
const MobileUploadMethodDialog = dynamic(
  () => import("./mobile-upload-method-dialog").then((mod) => mod.MobileUploadMethodDialog),
  { ssr: false }
);
const TextUploadDialog = dynamic(
  () => import("./text-upload-dialog").then((mod) => mod.TextUploadDialog),
  { ssr: false }
);
const BulkUploadSheet = dynamic(
  () => import("./bulk-upload-sheet").then((mod) => mod.BulkUploadSheet),
  { ssr: false }
);
const CreateListingDialog = dynamic(
  () => import("./create-listing-dialog").then((mod) => mod.CreateListingDialog),
  { ssr: false }
);
const QuickUploadSheet = dynamic(
  () => import("./quick-upload-sheet").then((mod) => mod.QuickUploadSheet),
  { ssr: false }
);

function openSellFlow(
  user: ReturnType<typeof useAuth>["user"],
  setSellRequirementModalOpen: (open: boolean) => void,
  setMobileUploadMethodOpen: (open: boolean) => void,
  setCreateListingDialogOpen: (open: boolean) => void
) {
  if (!user) {
    setSellRequirementModalOpen(true);
    return;
  }
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
    setMobileUploadMethodOpen(true);
  } else {
    setCreateListingDialogOpen(true);
  }
}

/** Renders listing CTAs and registers `openSellModal` for dashboard / non-marketplace pages. */
export function SellModalHost() {
  const router = useRouter();
  const { user } = useAuth();
  const { registerHandler } = useSellModal();

  const [sellRequirementModalOpen, setSellRequirementModalOpen] = React.useState(false);
  const [facebookModalOpen, setFacebookModalOpen] = React.useState(false);
  const [textUploadDialogOpen, setTextUploadDialogOpen] = React.useState(false);
  const [mobileUploadMethodOpen, setMobileUploadMethodOpen] = React.useState(false);
  const [bulkUploadSheetOpen, setBulkUploadSheetOpen] = React.useState(false);
  const [createListingDialogOpen, setCreateListingDialogOpen] = React.useState(false);
  const [quickUploadMode, setQuickUploadMode] = React.useState<"guided" | "form" | null>(null);
  const [quickUploadPhotoDraft, setQuickUploadPhotoDraft] = React.useState<ListingPhotoDraft | null>(null);

  const requireAuthOr = React.useCallback(
    (action: () => void) => {
      if (user) action();
      else setSellRequirementModalOpen(true);
    },
    [user]
  );

  React.useEffect(() => {
    registerHandler(() => {
      openSellFlow(user, setSellRequirementModalOpen, setMobileUploadMethodOpen, setCreateListingDialogOpen);
    });
  }, [registerHandler, user]);

  return (
    <>
      <AuthModal open={sellRequirementModalOpen} onOpenChange={setSellRequirementModalOpen} />

      <FacebookImportModal
        isOpen={facebookModalOpen}
        onClose={() => setFacebookModalOpen(false)}
        onComplete={(formData, images) => {
          sessionStorage.setItem("facebookImportData", JSON.stringify({ formData, images }));
          setFacebookModalOpen(false);
          router.push("/marketplace/sell?mode=manual&ai=true");
        }}
      />

      <CreateListingDialog
        open={createListingDialogOpen}
        onOpenChange={setCreateListingDialogOpen}
        onStartSingleListing={(mode, photoDraft) => {
          requireAuthOr(() => {
            setQuickUploadPhotoDraft(photoDraft);
            setQuickUploadMode(mode);
          });
        }}
        onSelectText={() => setTextUploadDialogOpen(true)}
        onSelectFacebook={() => requireAuthOr(() => setFacebookModalOpen(true))}
        onSelectBulk={() => requireAuthOr(() => setBulkUploadSheetOpen(true))}
      />

      <QuickUploadSheet
        isOpen={quickUploadMode !== null}
        mode={quickUploadMode ?? "guided"}
        photoDraft={quickUploadPhotoDraft}
        onClose={() => {
          setQuickUploadMode(null);
          setQuickUploadPhotoDraft(null);
        }}
      />

      <MobileUploadMethodDialog
        isOpen={mobileUploadMethodOpen}
        onClose={() => setMobileUploadMethodOpen(false)}
        onSelectGuided={(photoDraft) => {
          requireAuthOr(() => {
            setQuickUploadPhotoDraft(photoDraft);
            setQuickUploadMode("guided");
          });
        }}
        onSelectQuickUpload={(photoDraft) => {
          requireAuthOr(() => {
            setQuickUploadPhotoDraft(photoDraft);
            setQuickUploadMode("form");
          });
        }}
        onSelectText={() => setTextUploadDialogOpen(true)}
        onSelectFacebook={() => requireAuthOr(() => setFacebookModalOpen(true))}
        onSelectBulk={() => requireAuthOr(() => setBulkUploadSheetOpen(true))}
      />

      <TextUploadDialog
        isOpen={textUploadDialogOpen}
        onClose={() => setTextUploadDialogOpen(false)}
      />

      <BulkUploadSheet
        isOpen={bulkUploadSheetOpen}
        onClose={() => setBulkUploadSheetOpen(false)}
        onComplete={() => setBulkUploadSheetOpen(false)}
      />
    </>
  );
}
