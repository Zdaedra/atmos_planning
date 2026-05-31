import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import Layout from "@/components/Layout";
import { fetchBookingByCode, qrPngUrl } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/tz";

export default function Success() {
    const { code = "" } = useParams<{ code: string }>();
    const { data, isLoading, error } = useQuery({
        queryKey: ["booking-by-code", code],
        queryFn: () => fetchBookingByCode(code),
        enabled: !!code,
    });

    if (isLoading) {
        return <Layout subtitle="Loading"><div className="text-ink/50 text-sm">Loading…</div></Layout>;
    }
    if (error || !data) {
        return (
            <Layout subtitle="Booking not found">
                <h2 className="font-display text-3xl mb-3">Booking not found</h2>
                <p className="text-ink/60 mb-6">The code <code className="font-mono">{code}</code> didn't match anything.</p>
                <Link to="/" className="underline">← Back to booking</Link>
            </Layout>
        );
    }

    return (
        <Layout subtitle="You're in">
            <div className="text-center mb-8">
                <div className="font-display text-4xl mb-2">See you soon.</div>
                <div className="text-ink/60 text-sm uppercase tracking-widest">Show this QR at the entrance</div>
            </div>

            <div className="bg-bone rounded-3xl shadow-card border border-ink/5 p-8 flex flex-col items-center">
                <div className="bg-sand-100 p-4 rounded-2xl">
                    <img
                        src={qrPngUrl(data.qr_token)}
                        alt={`QR code for booking ${data.code}`}
                        className="w-56 h-56"
                    />
                </div>
                <div className="font-mono text-base mt-5 tracking-[0.3em] text-ink/70">{data.code}</div>
            </div>

            <div className="mt-8 text-center space-y-1">
                <div className="font-display text-2xl">{fmtDate(data.slot_starts_at)}</div>
                <div className="text-ink/60">{fmtTime(data.slot_starts_at)} – {fmtTime(data.slot_ends_at)}</div>
            </div>

            <div className="my-8 h-px bg-ink/10" />

            <p className="text-sm text-ink/60 text-center">
                Confirmation sent to <span className="font-medium text-ink">{data.guest_email}</span>
            </p>

            <div className="mt-8 text-center">
                <Link to="/" className="underline text-sm text-ink/70 hover:text-ink">
                    Book another session →
                </Link>
            </div>
        </Layout>
    );
}
