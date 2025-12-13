"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  Package,
  CheckCircle2,
  Loader2,
  X,
  HelpCircle,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpStepCategory } from "./help-step-category";
import { HelpStepDetails } from "./help-step-details";
import { HelpStepFaqs } from "./help-step-faqs";
import { HelpStepConfirm } from "./help-step-confirm";
import { TicketStatusBadge } from "./ticket-status-badge";

// ============================================================
// Types
// ============================================================

export interface OrderHelpWizardProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: {
    id: string;
    order_number: string;
    status: string;
    funds_status?: string;
    total_amount: number;
    item_price: number;
    shipping_cost: number;
    purchase_date: string;
    product: {
      id: string;
      description?: string;
      display_name?: string;
      primary_image_url?: string;
      cached_image_url?: string;
    };
    seller: {
      user_id: string;
      name?: string;
      business_name?: string;
      logo_url?: string;
    };
  };
  onTicketCreated?: (ticketNumber: string) => void;
}

export interface WizardFormData {
  category: string;
  subcategory: string;
  description: string;
  requestedResolution: string;
  attachments: { url: string; fileName: string; fileType: string }[];
}

type WizardStep = "context" | "category" | "details" | "faqs" | "confirm";

const STEPS: WizardStep[] = ["context", "category", "details", "faqs", "confirm"];

const STEP_TITLES: Record<WizardStep, string> = {
  context: "Your Order",
  category: "What's the issue?",
  details: "Tell us more",
  faqs: "Before you submit",
  confirm: "Review & Submit",
};

// ============================================================
// Helper Functions
// ============================================================

function getProductImage(product: OrderHelpWizardProps["purchase"]["product"]): string | null {
  if (product.cached_image_url) return product.cached_image_url;
  if (product.primary_image_url) return product.primary_image_url;
  return null;
}

function getProductName(product: OrderHelpWizardProps["purchase"]["product"]): string {
  return product.display_name || product.description || "Product";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getFundsStatusLabel(status?: string): { label: string; color: string } {
  switch (status) {
    case "held":
      return { label: "Protected", color: "bg-green-500" };
    case "disputed":
      return { label: "Under Review", color: "bg-amber-500" };
    case "released":
    case "auto_released":
      return { label: "Released", color: "bg-gray-400" };
    case "refunded":
      return { label: "Refunded", color: "bg-blue-500" };
    default:
      return { label: "Unknown", color: "bg-gray-400" };
  }
}

// ============================================================
// Order Context Component (Step 1)
// ============================================================

function OrderContext({ purchase }: { purchase: OrderHelpWizardProps["purchase"] }) {
  const productImage = getProductImage(purchase.product);
  const productName = getProductName(purchase.product);
  const sellerName = purchase.seller?.business_name || purchase.seller?.name || "Seller";
  const fundsStatus = getFundsStatusLabel(purchase.funds_status);

  return (
    <div className="space-y-4">
      {/* Product Card */}
      <div className="bg-white rounded-md border border-gray-200 p-4">
        <div className="flex gap-4">
          <div className="relative h-20 w-20 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
            {productImage ? (
              <Image
                src={productImage}
                alt={productName}
                fill
                className="object-cover"
                sizes="80px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 line-clamp-2">{productName}</h3>
            <p className="text-sm text-gray-500 mt-1">{sellerName}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              ${purchase.total_amount.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div className="bg-white rounded-md border border-gray-200 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Order Number</span>
          <code className="text-sm font-medium">#{purchase.order_number}</code>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Purchase Date</span>
          <span className="text-sm font-medium">{formatDate(purchase.purchase_date)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Order Status</span>
          <Badge variant="outline" className="rounded-md capitalize">
            {purchase.status}
          </Badge>
        </div>
      </div>

      {/* Protection Status */}
      <div className="bg-white rounded-md border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-full", fundsStatus.color)}>
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Buyer Protection: {fundsStatus.label}</p>
            <p className="text-sm text-gray-500">
              {purchase.funds_status === "held"
                ? "Your payment is protected while we help resolve any issues."
                : "We're here to help with any questions about your order."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Wizard Component
// ============================================================

export function OrderHelpWizard({
  isOpen,
  onClose,
  purchase,
  onTicketCreated,
}: OrderHelpWizardProps) {
  const [currentStep, setCurrentStep] = React.useState<WizardStep>("context");
  const [formData, setFormData] = React.useState<WizardFormData>({
    category: "",
    subcategory: "",
    description: "",
    requestedResolution: "",
    attachments: [],
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [createdTicket, setCreatedTicket] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [faqResolved, setFaqResolved] = React.useState(false);

  const stepIndex = STEPS.indexOf(currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      setCurrentStep("context");
      setFormData({
        category: "",
        subcategory: "",
        description: "",
        requestedResolution: "",
        attachments: [],
      });
      setCreatedTicket(null);
      setError(null);
      setFaqResolved(false);
    }
  }, [isOpen]);

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleFaqResolve = (resolved: boolean) => {
    setFaqResolved(resolved);
    if (resolved) {
      onClose();
    } else {
      handleNext();
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case "context":
        return true;
      case "category":
        return formData.category !== "";
      case "details":
        return formData.description.trim().length >= 10;
      case "faqs":
        return true;
      case "confirm":
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Generate subject from category
      const categoryLabels: Record<string, string> = {
        item_not_received: "Item Not Received",
        item_not_as_described: "Item Not as Described",
        damaged: "Damaged Item",
        wrong_item: "Wrong Item Received",
        refund_request: "Refund Request",
        shipping_issue: "Shipping Issue",
        general_question: "General Question",
      };

      const subject = categoryLabels[formData.category] || "Support Request";

      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: purchase.id,
          category: formData.category,
          subcategory: formData.subcategory || null,
          subject,
          description: formData.description,
          requestedResolution: formData.requestedResolution || null,
          attachments: formData.attachments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create ticket");
      }

      setCreatedTicket(data.ticket.ticket_number);
      onTicketCreated?.(data.ticket.ticket_number);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success State
  if (createdTicket) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="sm:max-w-md rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
          fullScreenMobile
        >
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Ticket Created Successfully
            </h2>
            <p className="text-gray-500 mb-4">
              Your support ticket has been submitted. We'll respond within 24-48 hours.
            </p>
            <div className="bg-gray-100 rounded-md px-4 py-2 mb-6">
              <p className="text-sm text-gray-500">Ticket Number</p>
              <p className="font-mono font-bold text-lg">{createdTicket}</p>
            </div>
            <Button onClick={onClose} className="w-full rounded-md">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg rounded-md p-0 gap-0 overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
        fullScreenMobile
        showCloseButton={false}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={isFirstStep ? onClose : handleBack}
                className="h-8 w-8 rounded-md"
              >
                {isFirstStep ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              </Button>
              <div>
                <DialogHeader className="p-0">
                  <DialogTitle className="text-base font-semibold">
                    {STEP_TITLES[currentStep]}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-gray-500">
                  Step {stepIndex + 1} of {STEPS.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 bg-gray-50 min-h-[300px] max-h-[60vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === "context" && <OrderContext purchase={purchase} />}
              {currentStep === "category" && (
                <HelpStepCategory
                  selectedCategory={formData.category}
                  onSelectCategory={(cat) => setFormData((prev) => ({ ...prev, category: cat }))}
                />
              )}
              {currentStep === "details" && (
                <HelpStepDetails
                  category={formData.category}
                  formData={formData}
                  onUpdate={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
                />
              )}
              {currentStep === "faqs" && (
                <HelpStepFaqs
                  category={formData.category}
                  onResolved={handleFaqResolve}
                />
              )}
              {currentStep === "confirm" && (
                <HelpStepConfirm
                  purchase={purchase}
                  formData={formData}
                  error={error}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 sm:px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {currentStep === "faqs" ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleFaqResolve(true)}
                className="flex-1 rounded-md"
              >
                Yes, this helped
              </Button>
              <Button onClick={() => handleFaqResolve(false)} className="flex-1 rounded-md">
                No, I still need help
              </Button>
            </div>
          ) : isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full rounded-md h-11"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Ticket"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="w-full rounded-md h-11"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

