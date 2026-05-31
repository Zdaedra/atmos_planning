import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import Layout from "@/components/Layout";
import { apiErrorMessage, cancelBookingByToken } from "@/lib/api";

export default function Cancel() {
    const { token = "" } = useParams<{ token: string }>();
    const [done, setDone] = useState(false);

    const mut = useMutation({
        mutationFn: () => cancelBookingByToken(token),
        onSuccess: () => setDone(true),
        onError: (e) => toast.error(apiErrorMessage(e, "Cancel failed")),
    });

    if (done) {
        return (
            <Layout subtitle="Cancelled">
                <h2 className="font-display text-3xl mb-3">Booking cancelled</h2>
                <p className="text-ink/60 mb-8">The spot is now available for other guests.</p>
                <Link to="/" className="underline">← Book another session</Link>
            </Layout>
        );
    }

    return (
        <Layout subtitle="Cancel booking">
            <h2 className="font-display text-3xl mb-2">Cancel this booking?</h2>
            <p className="text-ink/60 mb-8">This will release your spot for someone else.</p>

            <div className="space-y-3">
                <button
                    onClick={() => mut.mutate()}
                    disabled={mut.isPending}
                    className="w-full py-4 rounded-2xl bg-wood-600 text-bone font-medium disabled:opacity-50 hover:bg-wood-700 transition-colors shadow-card"
                >
                    {mut.isPending ? "Cancelling…" : "Yes, cancel"}
                </button>
                <Link to="/" className="block text-center text-sm underline text-ink/60">
                    Keep my booking
                </Link>
            </div>
        </Layout>
    );
}
