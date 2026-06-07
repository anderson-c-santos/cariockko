import { Sidebar } from "@/components/Sidebar";
import { ContentProducerChat } from "@/components/ContentProducer/ContentProducerChat";

export const dynamic = "force-dynamic";

export default function CreateLessonsPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 flex flex-col md:px-8 md:py-8 px-0 py-0 pb-24 md:pb-8">
        <ContentProducerChat />
      </main>
    </div>
  );
}
