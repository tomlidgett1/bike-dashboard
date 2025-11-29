'use client';

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function TestDialogPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dialog Component Test</h1>
      
      <Dialog>
        <DialogTrigger asChild>
          <Button>Click Me to Test Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Dialog</DialogTitle>
            <DialogDescription>
              If you can see this, the Dialog component is working correctly! ✅
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm">This confirms:</p>
            <ul className="list-disc list-inside mt-2 text-sm space-y-1">
              <li>Dialog component is properly installed</li>
              <li>Dialog animations work</li>
              <li>Dialog overlay works</li>
              <li>Dialog can be closed (click X or outside)</li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
      
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h2 className="font-semibold mb-2">What This Tests:</h2>
        <p className="text-sm">
          If this simple dialog works, but the Images button doesn't, 
          then the issue is likely that your products don't have 
          canonical_product_id set yet.
        </p>
      </div>
    </div>
  );
}





