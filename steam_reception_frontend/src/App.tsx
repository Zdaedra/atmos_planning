import { Navigate, Route, Routes } from "react-router-dom";

import { getToken } from "./lib/api";
import Login from "./pages/Login";
import Reception from "./pages/Reception";

function PrivateRoute({ children }: { children: React.ReactNode }) {
    if (!getToken()) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<PrivateRoute><Reception /></PrivateRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
