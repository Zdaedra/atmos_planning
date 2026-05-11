const API_URL = "https://api.trypranaextract.com";

export const getAuthToken = () => localStorage.getItem("access_token");

const request = async (endpoint: string, options: RequestInit = {}) => {
    const token = getAuthToken();
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
        cache: 'no-store',
        ...options,
        headers,
    });

    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem("access_token");
            window.location.href = "/"; // Send to login
        }
        throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
};

export const fetchMe = async () => {
    return request("/auth/me");
};

export const startShift = async () => {
    return request("/auth/shift/start", { method: "POST" });
};

export const fetchDashboardData = async (date?: string, userId?: number) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (userId !== undefined && userId !== null) params.set("user_id", String(userId));
    const qs = params.toString();
    return request(`/dashboard/${qs ? "?" + qs : ""}`);
};

export const fetchSupervisors = async () => {
    return request("/supervisors/");
};

export const fetchTaskTemplates = async () => {
    // In our backend, these are generic tasks/templates.
    return request("/tasks/templates/");
};

export const markTaskComplete = async (payload: { task_id: number; comments?: string; photo_data_base64?: string | null }) => {
    return request(`/tasks/${payload.task_id}/complete`, {
        method: "POST",
        body: JSON.stringify({
            comments: payload.comments,
            photo_data_base64: payload.photo_data_base64
        })
    });
};

export const bulkCompleteTasks = async (task_ids: number[]) => {
    return request("/tasks/bulk-complete", {
        method: "POST",
        body: JSON.stringify({ task_ids })
    });
};

export const revertTask = async (payload: { task_id: number; comments: string }) => {
    return request(`/tasks/${payload.task_id}/revert`, {
        method: "POST",
        body: JSON.stringify({ comments: payload.comments })
    });
};

export const createSupervisor = async (data: any) => {
    return request("/supervisors/", {
        method: "POST",
        body: JSON.stringify(data)
    });
};

export const fetchAllTasks = async () => {
    return request("/tasks/?limit=10000");
};

export const fetchTasksForUser = async (userId: number) => {
    return request(`/tasks/?limit=10000&assigned_user=${userId}`);
};

export const unassignTask = async (task_id: number) => {
    return request(`/tasks/templates/${task_id}`, {
        method: "PUT",
        body: JSON.stringify({ next_execution_date: null })
    });
};

export const fetchFailedTasks = async () => {
    return request("/tasks/failed");
};

export const fetchSupervisorShifts = async (userId: number) => {
    return request(`/stats/personnel/${userId}/shifts`);
};
