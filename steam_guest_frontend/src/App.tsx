import { Route, Routes } from "react-router-dom";

import Landing from "./pages/Landing";
import Success from "./pages/Success";
import Cancel from "./pages/Cancel";
import StaffLogin from "./pages/staff/Activate";
import StaffScan from "./pages/staff/Scan";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/success/:code" element={<Success />} />
            <Route path="/cancel/:token" element={<Cancel />} />
            {/* /staff = password login. /staff/scan = the actual camera screen.
                Old /staff/activate/:token magic-link URL kept as alias so any
                lingering bookmarks land on the password prompt cleanly. */}
            <Route path="/staff" element={<StaffLogin />} />
            <Route path="/staff/activate/:token" element={<StaffLogin />} />
            <Route path="/staff/scan" element={<StaffScan />} />
            <Route path="*" element={
                <div className="min-h-screen flex items-center justify-center p-6 text-center">
                    <div>
                        <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
                        <a href="/" className="underline">← Back to booking</a>
                    </div>
                </div>
            } />
        </Routes>
    );
}
