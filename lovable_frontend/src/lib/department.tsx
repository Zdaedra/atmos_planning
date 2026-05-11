import { createContext, useContext, useState, ReactNode } from "react";

export type Department = "maintenance" | "service";

interface Ctx {
    department: Department;
    setDepartment: (d: Department) => void;
}

const DepartmentContext = createContext<Ctx | undefined>(undefined);

const STORAGE_KEY = "atmos.department";

function readStoredDepartment(): Department {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === "maintenance" || v === "service") return v;
        // Migrate legacy value
        if (v === "refreshments") {
            localStorage.setItem(STORAGE_KEY, "service");
            return "service";
        }
    } catch { /* ignore */ }
    return "maintenance";
}

export function DepartmentProvider({ children }: { children: ReactNode }) {
    const [department, setDepartmentState] = useState<Department>(readStoredDepartment);

    // Persist synchronously inside the setter so the global fetch-patch reads
    // the new value immediately when react-query refetches after a switch.
    const setDepartment = (d: Department) => {
        try { localStorage.setItem(STORAGE_KEY, d); } catch { /* ignore */ }
        setDepartmentState(d);
    };

    return (
        <DepartmentContext.Provider value={{ department, setDepartment }}>
            {children}
        </DepartmentContext.Provider>
    );
}

export function useDepartment(): Ctx {
    const ctx = useContext(DepartmentContext);
    if (!ctx) throw new Error("useDepartment must be used inside DepartmentProvider");
    return ctx;
}
