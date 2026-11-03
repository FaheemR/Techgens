import type { Metadata } from "next";
import { JobTranscriptView } from "@/components/activity/job-transcript";

export const metadata: Metadata = { title: "Job transcript" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobTranscriptView id={id} />;
}
