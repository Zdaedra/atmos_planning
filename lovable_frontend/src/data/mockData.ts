export const kpiData = {
  totalTasks: 124,
  completed: 86,
  remaining: 38,
  completionRate: 69,
  staffOnShift: 4,
  carryOver: 12,
};

export const overdueTasks = [
  { id: "1", name: "Clean Main Lobby", dueTime: "Until 11:00", done: false },
  { id: "2", name: "Check Boiler Valves", dueTime: "Until 11:00", done: false },
  { id: "3", name: "Preline DRo Maintenance", dueTime: "Until 09:00", done: false },
];

export const dailyTasks = [
  { id: "4", name: "High Pressure Wash Deck", timeOfDay: "Morning", done: true },
  { id: "5", name: "Check Steam Dome", timeOfDay: "Morning", done: true },
  { id: "6", name: "Sanitize Pool Filters", timeOfDay: "Afternoon", done: false },
  { id: "7", name: "Restock Towel Station", timeOfDay: "Anytime", done: false },
  { id: "8", name: "Inspect Fire Exits", timeOfDay: "Evening", done: true },
];

export const longTermTasks = [
  { id: "9", name: "Deep Clean HVAC Ducts", frequency: "Monthly", timeOfDay: "Morning", done: false },
  { id: "10", name: "Calibrate Water Sensors", frequency: "Bi-weekly", timeOfDay: "Afternoon", done: false },
  { id: "11", name: "Replace Air Filters", frequency: "Weekly", timeOfDay: "Anytime", done: true },
];

export const projectTasks = [
  { id: "12", name: "Install New Signage", timeOfDay: "Morning", done: false },
  { id: "13", name: "Paint Corridor B", timeOfDay: "Afternoon", done: false },
];

export const staffOnShift = [
  { id: "1", name: "Alexey Supervisor", role: "Lead Supervisor", avatar: "", online: true },
  { id: "2", name: "Natasha Kowalsky", role: "Supervisor", avatar: "", online: true },
  { id: "3", name: "Victor Martinez", role: "Supervisor", avatar: "", online: true },
  { id: "4", name: "Daniel Vinogradov", role: "Supervisor", avatar: "", online: false },
];

export const aiAlerts = [
  { id: "1", task: "Montclase inspection", time: "4:30:05" },
  { id: "2", task: "Emato Cone check", time: "4:30:26" },
  { id: "3", task: "Boiler pressure log", time: "Yesterday 17:00" },
];

export const taskTemplates = [
  { id: "1", name: "Clean Main Lobby", category: "Daily", frequency: "Daily", timeConstraint: "Morning" },
  { id: "2", name: "Check Boiler Valves", category: "Daily", frequency: "Daily", timeConstraint: "Morning" },
  { id: "3", name: "Inspect Pool Area", category: "Weekly", frequency: "Weekly", timeConstraint: "Afternoon" },
  { id: "4", name: "Deep Clean Benches", category: "Weekly", frequency: "Weekly", timeConstraint: "Anytime" },
  { id: "5", name: "HVAC Filter Replacement", category: "Monthly", frequency: "Monthly", timeConstraint: "Morning" },
  { id: "6", name: "Fire Safety Audit", category: "Monthly", frequency: "Monthly", timeConstraint: "Anytime" },
  { id: "7", name: "Restock First Aid Kits", category: "Bi-weekly", frequency: "Bi-weekly", timeConstraint: "Anytime" },
];

export const supervisors = [
  { id: "1", name: "Alexey Supervisor", email: "alexey@email.com", password: "password123", role: "Supervisor" },
  { id: "2", name: "Natasha Kowalsky", email: "natasha@email.com", password: "dotteelerd10240", role: "Supervisor" },
  { id: "3", name: "Victor Martinez", email: "victor@email.com", password: "autemoieord1208", role: "Supervisor" },
  { id: "4", name: "Daniel Vinogradov", email: "daniel@email.com", password: "password123", role: "Supervisor" },
];

export const calendarTasks: Record<string, Array<{ time: string; name: string; tag: string }>> = {
  "2026-03-15": [
    { time: "08:00", name: "Clean Main Lobby", tag: "Routine" },
    { time: "11:00", name: "Check Boiler Valves", tag: "Routine" },
    { time: "12:00", name: "Inspect Pool Area", tag: "Daytime" },
    { time: "15:00", name: "Deep Clean Benches", tag: "Daytime" },
  ],
  "2026-03-16": [
    { time: "09:00", name: "HVAC Maintenance", tag: "Routine" },
    { time: "14:00", name: "Safety Inspection", tag: "Anytime" },
  ],
  "2026-03-17": [
    { time: "08:00", name: "Morning Lobby Sweep", tag: "Routine" },
    { time: "10:00", name: "Pool Chemical Test", tag: "Routine" },
    { time: "13:00", name: "Restroom Deep Clean", tag: "Daytime" },
  ],
  "2026-03-22": [
    { time: "08:00", name: "Clean Main Lobby", tag: "Routine" },
    { time: "11:00", name: "Check Boiler Valves", tag: "Routine" },
    { time: "12:00", name: "Inspect Pool Area", tag: "Daytime" },
    { time: "15:00", name: "Deep Clean Benches", tag: "Daytime" },
  ],
};

export const unassignedTasks = [
  { id: "u1", name: "Clean Main Lobby", time: "08:00", tag: "Routine" },
  { id: "u2", name: "Check Boiler Valves", time: "11:00", tag: "Routine" },
  { id: "u3", name: "Inspect Pool Area", time: "13:30", tag: "Daytime" },
  { id: "u4", name: "Deep Clean Benches", time: "15:00", tag: "Anytime" },
];
