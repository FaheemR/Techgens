import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="This part of the command center doesn't exist (yet)."
      action={
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          Back to dashboard
        </Link>
      }
    />
  );
}
