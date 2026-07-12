import type { Metadata } from "next";
import { getMyGaragePayload } from "@/lib/crm/my-garage";
import { MyGarageClient } from "./my-garage-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Garage | Yellow Jersey",
  description: "Your bikes, workshop updates and bike-store relationship.",
  robots: { index: false, follow: false },
};

async function loadMyGarage(token: string) {
  try {
    return { payload: await getMyGaragePayload(token), error: null };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : "My Garage is unavailable.",
    };
  }
}

export default async function MyGaragePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-10">
        <section className="w-full max-w-md rounded-md bg-white p-6 text-center ring-1 ring-black/[0.06]">
          <h1 className="text-lg font-semibold text-gray-900">My Garage link required</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Ask your bike store to send you a fresh My Garage link.
          </p>
        </section>
      </main>
    );
  }

  const result = await loadMyGarage(token);
  if (result.payload) {
    const payload = result.payload;
    return <MyGarageClient token={token} payload={payload} />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-10">
      <section className="w-full max-w-md rounded-md bg-white p-6 text-center ring-1 ring-black/[0.06]">
        <h1 className="text-lg font-semibold text-gray-900">My Garage is unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{result.error}</p>
      </section>
    </main>
  );
}
