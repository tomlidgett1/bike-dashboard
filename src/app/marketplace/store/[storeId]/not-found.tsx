import Link from "next/link";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// Store Not Found Page
// ============================================================

export default function StoreNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-6">
        <div className="rounded-full bg-gray-100 p-6 mb-6 inline-flex">
          <Store className="h-16 w-16 text-gray-400" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Store Not Found
        </h1>
        
        <p className="text-gray-600 mb-8">
          The store you're looking for doesn't exist or has been removed from the marketplace.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/marketplace?view=stores">
            <Button className="rounded-md">
              Browse All Stores
            </Button>
          </Link>
          
          <Link href="/marketplace">
            <Button variant="outline" className="rounded-md">
              View All Products
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

