import { Monitor } from "lucide-react";
import Link from "next/link";

/**
 * Store settings are desktop-only — block the management UI on small screens.
 */
export function StoreSettingsMobileGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-12 md:hidden">
        <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-8 text-center">
          <Monitor className="mx-auto h-12 w-12 text-gray-400" strokeWidth={1.5} />
          <h1 className="mt-4 text-lg font-semibold text-gray-900">
            Store settings need a larger screen
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Please open this page on a computer to manage your bike store settings.
          </p>
          <Link
            href="/marketplace"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[#ffde59] px-4 text-sm font-semibold text-gray-900 transition-colors hover:bg-[#f0cf45]"
          >
            Back to marketplace
          </Link>
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 md:block">{children}</div>
    </>
  );
}
