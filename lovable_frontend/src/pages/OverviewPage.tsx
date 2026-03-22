import { useState } from "react";
import { KpiCards } from "@/components/overview/KpiCards";
import { TaskFeed } from "@/components/overview/TaskFeed";
import { RightSidebar } from "@/components/overview/RightSidebar";

export default function OverviewPage() {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-6 max-w-[1200px]">
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <KpiCards active={activeFilter} setActive={setActiveFilter} />
        <TaskFeed filter={activeFilter} />
      </div>
      <RightSidebar />
    </div>
  );
}
