import type { CSSProperties } from "react";

/** Matches store home Genie progress indicators (homev2-chat). */
export const genieProgressShimmerClassName =
  "text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite]";

export const genieProgressShimmerStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #a3a3a3 0%, #a3a3a3 38%, #525252 50%, #a3a3a3 62%, #a3a3a3 100%)",
  backgroundSize: "220% 100%",
  WebkitTextFillColor: "transparent",
};

/** Live-step variant from store home — stronger contrast on coloured backgrounds. */
export const genieProgressShimmerDarkStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #737373 0%, #737373 38%, #171717 50%, #737373 62%, #737373 100%)",
  backgroundSize: "220% 100%",
  WebkitTextFillColor: "transparent",
};
