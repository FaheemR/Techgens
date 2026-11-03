import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Directives" };

export default function ChatPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChatView />
    </Suspense>
  );
}
