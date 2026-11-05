import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/session";

// Landing spot for sessions whose employee was deleted or deactivated: clear the cookie, go to login.
export async function GET() {
  await deleteSession();
  redirect("/login");
}
