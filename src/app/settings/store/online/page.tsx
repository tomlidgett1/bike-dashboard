import { redirect } from "next/navigation";

/** Product intake now lives under Optimise → CSV/Image. */
export default function StoreOnlineProductsPage() {
  redirect("/optimize?workflow=online");
}
