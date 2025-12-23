"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Link2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FacebookImportModal } from "./facebook-import-modal";
import { SmartUploadModal } from "./smart-upload-modal";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Step 0: Upload Method Choice
// ============================================================

interface UploadMethodChoiceProps {
  onSelectSmart: () => void;
  onSelectFacebook: () => void;
  onFacebookImportComplete?: (formData: any, images: ListingImage[]) => void;
  onSmartUploadComplete?: (formData: any, imageUrls: string[]) => void;
}

export function UploadMethodChoice({ 
  onSelectSmart, 
  onSelectFacebook,
  onFacebookImportComplete,
  onSmartUploadComplete
}: UploadMethodChoiceProps) {
  const router = useRouter();
  const [showFacebookModal, setShowFacebookModal] = React.useState(false);
  const [showSmartUploadModal, setShowSmartUploadModal] = React.useState(false);

  const handleFacebookComplete = (formData: any, images: ListingImage[]) => {
    setShowFacebookModal(false);
    if (onFacebookImportComplete) {
      onFacebookImportComplete(formData, images);
    }
  };

  const handleSmartUploadComplete = (formData: any, imageUrls: string[]) => {
    setShowSmartUploadModal(false);
    if (onSmartUploadComplete) {
      onSmartUploadComplete(formData, imageUrls);
    }
  };

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-gray-900">Create Your Listing</h2>
        <p className="text-sm text-gray-600">Choose your preferred method</p>
      </div>

      {/* Choice Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Smart Upload */}
        <motion.button
          type="button"
          onClick={() => setShowSmartUploadModal(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-left"
        >
          <Card className="h-full p-6 rounded-md border-2 border-gray-900 bg-white hover:shadow-lg transition-all">
            <div className="space-y-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-1">
                  Smart Upload
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  AI-Powered Analysis
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Upload photos and AI detects your product details automatically.
                </p>
              </div>
            </div>
          </Card>
        </motion.button>

        {/* Facebook Import */}
        <motion.button
          type="button"
          onClick={() => setShowFacebookModal(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-left"
        >
          <Card className="h-full p-6 rounded-md border-2 border-blue-200 bg-white hover:border-blue-300 hover:shadow-lg transition-all">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Link2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">
                    Import from Facebook
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Instant Import
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Paste a Facebook Marketplace link to auto-fill all details.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </motion.button>

        {/* Bulk Upload */}
        <motion.button
          type="button"
          onClick={() => router.push('/marketplace/sell?mode=bulk')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-left"
        >
          <Card className="h-full p-6 rounded-md border-2 border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg transition-all">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Upload className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">
                    Bulk Upload
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Multiple Items
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    List multiple products at once with AI-powered detection.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </motion.button>
      </div>

      {/* Facebook Import Modal */}
      <FacebookImportModal
        isOpen={showFacebookModal}
        onClose={() => setShowFacebookModal(false)}
        onComplete={handleFacebookComplete}
      />

      {/* Smart Upload Modal */}
      <SmartUploadModal
        isOpen={showSmartUploadModal}
        onClose={() => setShowSmartUploadModal(false)}
        onComplete={handleSmartUploadComplete}
      />
    </div>
    </>
  );
}
