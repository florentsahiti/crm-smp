import { redirect } from "next/navigation";

/** Break swaps ("Pausentausch") were removed at the client's request; old links go to "Mein Plan". */
export default function SwapsPage() {
  redirect("/dashboard/my-schedule");
}
