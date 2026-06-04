import { redirect } from "next/navigation";

/** Online product intake now lives under Optimise → Online products. */
export default function StoreOnlineProductsPage() {
  redirect("/optimize?workflow=online");
}
