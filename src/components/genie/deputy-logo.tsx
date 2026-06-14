import { cn } from "@/lib/utils";

/**
 * Deputy mark — self-contained inline SVG (no binary asset). A coral rounded
 * tile with a white "D", echoing Deputy's brand colour. Scales cleanly from the
 * 14px pill chip to the 16px progress avatar.
 */
export function DeputyLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block", className)}
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="6" fill="#FB5B5A" />
      <path
        d="M7.4 6.2h4.05c3.4 0 5.75 2.32 5.75 5.8 0 3.48-2.35 5.8-5.75 5.8H7.4V6.2Zm3.95 9.1c1.78 0 2.95-1.28 2.95-3.3 0-2.02-1.17-3.3-2.95-3.3h-1.0v6.6h1.0Z"
        fill="#ffffff"
      />
    </svg>
  );
}
