import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  taskCounts?: Record<string, number>;
};

function Calendar({ className, classNames, showOutsideDays = true, taskCounts = {}, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-12 font-normal text-[0.8rem]",
        row: "flex w-full mt-2 gap-1",
        cell: "h-12 w-12 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-12 w-12 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary/80 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground focus:bg-primary/80 focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        DayContent: ({ date, activeModifiers }: any) => {
          // Check if this specific day has a task count mapping
          // Because date comes as midnight local time, safely convert to YYYY-MM-DD
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;

          const count = taskCounts[dateStr];
          const isSelected = activeModifiers?.selected;

          return (
            <div className={`relative flex flex-col items-center justify-center w-full h-full pointer-events-none ${isSelected ? 'text-white' : ''}`}>
              <span className={count > 0 ? "mb-3" : ""}>{date.getDate()}</span>
              {count > 0 && (
                <div className="absolute bottom-[2px] flex flex-col items-center pointer-events-auto" title={`${count} task${count === 1 ? '' : 's'}`}>
                  <div className={`w-4 h-[2px] rounded-full mb-[1px] ${isSelected ? 'bg-white' : 'bg-primary'}`} />
                  <span className={`text-[8px] font-medium leading-none ${isSelected ? 'text-white' : 'text-muted-foreground'}`}>
                    {count}
                  </span>
                </div>
              )}
            </div>
          );
        }
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
