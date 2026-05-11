import { useState } from "react";
import { format, addDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskFeed } from "@/components/overview/TaskFeed";
import { RightSidebar } from "@/components/overview/RightSidebar";
import { DaySummaryDrill } from "@/components/DaySummaryDrill";

export default function OverviewPage() {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateKey = format(selectedDate, "yyyy-MM-dd");

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-6 max-w-[1200px]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              title="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[180px] justify-start gap-2 font-normal">
                  <CalendarIcon className="w-4 h-4" />
                  {isToday(selectedDate) ? "Today" : format(selectedDate, "EEE, MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              title="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!isToday(selectedDate) && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>
                Today
              </Button>
            )}
          </div>
        </div>
        <DaySummaryDrill dateKey={dateKey} />
        <TaskFeed filter={activeFilter} dateKey={dateKey} />
      </div>
      <RightSidebar dateKey={dateKey} />
    </div>
  );
}
