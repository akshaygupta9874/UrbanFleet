import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Phone,
  Shield,
  Star,
  Car,
  MapPin,
  Clock,
  Route as RouteIcon,
  IndianRupee,
  X,
  Loader2,
  CheckCircle2,
  Navigation2,
  Sparkles,
  Radio,
  AlertTriangle,
} from "lucide-react";
import LoadingScreen from "./components/LoadingScreen";
import MapView from "./components/MapView";
import { appApi } from "./lib/api";
import { connectRiderSocket } from "./lib/socket";
import { createPaymentOrder, loadRazorpayCheckout, verifyPaymentSignature } from "./lib/payment";
import { useAuthContext } from "./context/authContext";

/**
 * RideDetails — Luxury Transit Map Edition (Full Width / Zero Animations / Lag-Free)
 */

type RideStatus =
  | "SEARCHING"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ARRIVING"
  | "STARTED"
  | "ARRIVED_AT_DESTINATION"
  | "COMPLETED"
  | "CANCELLED";

interface RidePoint {
  address: string;
  coordinates: { latitude: number; longitude: number };
}
interface FareBreakdown {
  baseFarePaise?: number;
  distanceFarePaise?: number;
  timeFarePaise?: number;
  surgePaise?: number;
  platformCommissionPaise?: number;
  driverEarningPaise?: number;
  totalPaise?: number;
}
interface DriverInfo {
  _id: string;
  firstName?: string;
  lastName?: string;
  vehicleNumber?: string | null;
  phone?: string;
  user?: { firstName?: string; lastName?: string; phone?: string };
  vehicle?: { registrationNumber?: string; model?: string; color?: string };
}
interface Ride {
  _id: string;
  pickup: RidePoint;
  destination: RidePoint;
  fare: { estimated: number; final?: number | null; breakdown?: FareBreakdown | null };
  distance: { estimated: number | null; actual?: number | null };
  duration: { estimated: number | null; actual?: number | null };
  status: RideStatus;
  paymentStatus?: "PENDING" | "PAID" | "CAPTURED" | "FAILED" | "REFUNDED";
  driver?: DriverInfo | null;
}

const DISPLAY_FONT = "'Fraunces', Georgia, serif";
const BODY_FONT = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif";
const MONO_FONT = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace";

const STATUS_STEPS: { key: RideStatus; label: string }[] = [
  { key: "SEARCHING", label: "Searching" },
  { key: "DRIVER_ASSIGNED", label: "Assigned" },
  { key: "DRIVER_ARRIVING", label: "Arriving" },
  { key: "STARTED", label: "On trip" },
  { key: "ARRIVED_AT_DESTINATION", label: "Arrived" },
  { key: "COMPLETED", label: "Complete" },
];

const STATUS_META: Record<RideStatus, { title: string; subtitle: string; accent: string }> = {
  SEARCHING: { title: "Finding your driver…", subtitle: "Matching you with the nearest luxury ride", accent: "#b8722c" },
  DRIVER_ASSIGNED: { title: "Driver assigned", subtitle: "Your driver is preparing to head over", accent: "#c58a3a" },
  DRIVER_ARRIVING: { title: "Driver is arriving", subtitle: "Head to your pickup spot", accent: "#d4a359" },
  STARTED: { title: "You're on your way", subtitle: "Sit back and enjoy the journey", accent: "#6b3a12" },
  ARRIVED_AT_DESTINATION: {
    title: "Arrived at destination",
    subtitle: "Payment is required before trip completion",
    accent: "#c58a3a",
  },
  COMPLETED: { title: "Trip complete", subtitle: "Thanks for riding with UrbanFleet", accent: "#10b981" },
  CANCELLED: { title: "Ride cancelled", subtitle: "This trip is no longer active", accent: "#e11d48" },
};

function formatPaiseToRupee(amount: number | null | undefined): string {
  if (amount == null) return "0.00";
  const rupees = amount > 1000 ? amount / 100 : amount;
  return rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Stylized Ride Booking Transit & Fleet Map Background (Static & Lag-Free) ----------
function TransitMapBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden w-full h-full">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#fff7e6_0%,#f5e6c8_45%,#dfba78_75%,#b8722c_100%)] w-full h-full" />
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-30"
      >
        <defs>
          <linearGradient id="highwayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3a1f0a" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#b8722c" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#7a4416" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd88a" stopOpacity="1" />
            <stop offset="100%" stopColor="#c58a3a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="80" y="80" width="280" height="180" rx="12" fill="#ebd19c" opacity="0.6" />
        <rect x="400" y="80" width="350" height="220" rx="12" fill="#dfba78" opacity="0.6" />
        <rect x="800" y="60" width="560" height="260" rx="16" fill="#e5c589" opacity="0.6" />
        <rect x="60" y="320" width="300" height="240" rx="12" fill="#dfba78" opacity="0.6" />
        <rect x="390" y="340" width="380" height="280" rx="16" fill="#ebd19c" opacity="0.6" />
        <rect x="810" y="360" width="550" height="200" rx="12" fill="#dfba78" opacity="0.6" />
        <rect x="80" y="600" width="320" height="220" rx="16" fill="#e5c589" opacity="0.6" />
        <rect x="430" y="660" width="340" height="160" rx="12" fill="#ebd19c" opacity="0.6" />
        <rect x="810" y="600" width="550" height="220" rx="16" fill="#dfba78" opacity="0.6" />

        <path d="M -50 150 C 400 120, 800 280, 1490 120" fill="none" stroke="url(#highwayGrad)" strokeWidth="12" strokeLinecap="round" opacity="0.8" />
        <path d="M 150 -50 C 200 400, 450 600, 200 950" fill="none" stroke="url(#highwayGrad)" strokeWidth="10" strokeLinecap="round" opacity="0.8" />
        <path d="M 750 -50 C 550 350, 950 550, 1450 750" fill="none" stroke="url(#highwayGrad)" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
        <path d="M -50 550 C 500 480, 850 750, 1490 650" fill="none" stroke="url(#highwayGrad)" strokeWidth="10" strokeLinecap="round" opacity="0.8" />

        <g stroke="#fff4dc" strokeWidth="4" opacity="0.75" strokeLinecap="round">
          <line x1="380" y1="0" x2="380" y2="900" />
          <line x1="790" y1="0" x2="790" y2="900" />
          <line x1="0" y1="300" x2="1440" y2="300" />
          <line x1="0" y1="580" x2="1440" y2="580" />
          <line x1="200" y1="0" x2="200" y2="900" />
          <line x1="600" y1="0" x2="600" y2="900" />
          <line x1="1100" y1="0" x2="1100" y2="900" />
        </g>

        {[
          { x: 310, y: 150, type: "car" },
          { x: 550, y: 220, type: "car" },
          { x: 920, y: 180, type: "hub" },
          { x: 230, y: 440, type: "car" },
          { x: 620, y: 480, type: "dest" },
          { x: 1050, y: 450, type: "car" },
          { x: 350, y: 720, type: "car" },
          { x: 880, y: 680, type: "hub" },
        ].map((pt, idx) => (
          <g key={`fleet-${idx}`} transform={`translate(${pt.x} ${pt.y})`}>
            <circle r={pt.type === "hub" ? 24 : 14} fill="url(#nodeGlow)" opacity={pt.type === "hub" ? 0.7 : 0.4} />
            <circle r={pt.type === "hub" ? 8 : 5} fill="#3a1f0a" stroke="#ffd88a" strokeWidth={2.5} />
          </g>
        ))}
      </svg>
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#f5e6c8]/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-[#b8722c]/50 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(58,31,10,0.35)_100%)]" />
    </div>
  );
}

function TicketButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "success" | "danger" | "ghost";
  className?: string;
  type?: "button" | "submit";
}) {
  const styles: Record<string, string> = {
    primary: "bg-gradient-to-br from-[#3a1f0a] via-[#6b3a12] to-[#2e1808] text-[#ffe9be] border border-[#c58a3a]/40 shadow-[0_12px_30px_-10px_rgba(58,31,10,0.6)]",
    success: "bg-emerald-600 text-white border border-emerald-700/40 shadow-[0_12px_30px_-10px_rgba(16,185,129,0.4)]",
    danger: "bg-rose-600 text-white border border-rose-700/40 shadow-[0_12px_30px_-10px_rgba(225,29,72,0.4)]",
    ghost: "bg-[#fffaf0] text-[#3a1f0a] border border-[#7a4416]/20 hover:bg-[#fff4dc]",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-2xl px-6 py-3.5 text-sm font-semibold transition-all shadow-sm hover:opacity-95 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8722c] focus-visible:ring-offset-2 ${styles[variant]} ${className}`}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}

function TicketStamp({ label, sublabel, tone }: { label: string; sublabel: string; tone: "complete" | "void" }) {
  const color = tone === "complete" ? "#047857" : "#be123c";
  const pathId = tone === "complete" ? "stampArcComplete" : "stampArcVoid";
  return (
    <div className="relative mx-auto grid h-28 w-28 place-items-center" style={{ color }}>
      <svg
        viewBox="0 0 140 140"
        className="absolute inset-0 h-full w-full"
        style={{ filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.08))" }}
      >
        <defs>
          <path id={pathId} d="M 15 70 A 55 55 0 1 1 125 70" fill="none" />
        </defs>
        <circle cx="70" cy="70" r="62" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="3 4" opacity="0.85" />
        <circle cx="70" cy="70" r="50" fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
        <text fontSize="10.5" fontWeight="700" letterSpacing="2" fill={color} opacity="0.9">
          <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
            {label} • {label} •
          </textPath>
        </text>
      </svg>
      <div className="relative grid h-12 w-12 place-items-center rounded-full border-2" style={{ borderColor: color }}>
        {tone === "complete" ? <CheckCircle2 className="h-6 w-6" /> : <X className="h-6 w-6" />}
      </div>
      <span className="sr-only">{sublabel}</span>
    </div>
  );
}

function JourneyStepper({ status }: { status: RideStatus }) {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  const activeIdx = idx === -1 ? 0 : idx;
  const progress = STATUS_STEPS.length > 1 ? activeIdx / (STATUS_STEPS.length - 1) : 0;
  return (
    <div className="relative rounded-2xl border border-[#7a4416]/20 bg-[#fffaf0]/80 px-3 py-4 shadow-sm w-full">
      <div className="absolute left-7 right-7 top-[34px] h-[2px] bg-[#7a4416]/20" />
      <div
        className="absolute left-7 top-[34px] h-[2px] bg-gradient-to-r from-[#3a1f0a] via-[#b8722c] to-emerald-600 transition-all duration-500"
        style={{ width: `calc(${progress} * (100% - 3.5rem))` }}
      />
      <div className="relative flex items-start justify-between w-full">
        {STATUS_STEPS.map((s, i) => {
          const done = i <= activeIdx && status !== "CANCELLED";
          const current = i === activeIdx && status !== "CANCELLED";
          return (
            <div key={s.key} className="flex flex-col items-center gap-1.5" style={{ width: `${100 / STATUS_STEPS.length}%` }}>
              <div
                className={`grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-bold ${
                  done ? "border-[#3a1f0a] bg-gradient-to-br from-[#3a1f0a] to-[#2e1808] text-[#ffd88a]" : "border-[#7a4416]/30 bg-[#fffaf0] text-[#7a4416]"
                } ${current ? "ring-4 ring-[#b8722c]/20" : ""}`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5 text-[#ffd88a]" /> : i + 1}
              </div>
              <span
                className={`text-center text-[9px] font-bold uppercase tracking-wider ${
                  current ? "text-[#3a1f0a]" : "text-[#7a4416]/70"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriverCard({
  firstName,
  lastName,
  vehicleNo,
  phone,
}: {
  firstName: string;
  lastName: string;
  vehicleNo: string;
  phone?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#c58a3a]/40 bg-gradient-to-br from-[#fffaf0] via-[#fff4dc] to-[#f7e2b8] p-4 shadow-md w-full">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#b8722c]/20 blur-2xl" />
      <div className="relative flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div
              className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#3a1f0a] via-[#6b3a12] to-[#2e1808] text-lg font-bold text-[#ffd88a] shadow-md border border-[#c58a3a]/40"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {firstName?.[0]?.toUpperCase() || "D"}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-[#fffaf0] bg-emerald-500 text-white shadow">
              <Shield className="h-3 w-3" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-[#2e1808]" style={{ fontFamily: DISPLAY_FONT }}>
              {firstName} {lastName}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#6b3a12]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fffaf0] px-2 py-0.5 font-semibold text-[#3a1f0a] border border-[#7a4416]/20 shadow-sm">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                4.9
              </span>
              <span>•</span>
              <span className="truncate font-semibold">{vehicleNo}</span>
            </div>
          </div>
        </div>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#3a1f0a] via-[#6b3a12] to-[#2e1808] text-[#ffd88a] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8722c]"
            aria-label="Call driver"
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  delay?: number;
}) {
  return (
    <div className="w-full relative overflow-hidden rounded-2xl border border-[#7a4416]/20 bg-[#fffaf0] p-3.5 text-center shadow-sm">
      <div className="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-[#7a4416]/10 text-[#b8722c] border border-[#7a4416]/20">{icon}</div>
      <p className="mt-2 text-sm font-bold text-[#2e1808]">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a4416]">{label}</p>
    </div>
  );
}

export default function RideDetails() {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();

  const [ride, setRide] = useState<Ride | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const { user } = useAuthContext();

  const fetchRideDetails = async (id?: string) => {
    try {
      const endpoint = id ? `/ride/${id}` : "/ride/current";
      const response = await appApi.get<{ message: string; ride: Ride }>(endpoint);
      const currentRide = response.data.ride;
      if (currentRide) {
        setRide(currentRide);
        return currentRide;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const currentRide = await fetchRideDetails(rideId);
        if (cancelled || !currentRide) {
          if (!cancelled && !currentRide) setError("Unable to load ride details.");
          return;
        }
        if (currentRide?.pickup && currentRide?.destination) {
          const pLat = currentRide.pickup.coordinates.latitude;
          const pLon = currentRide.pickup.coordinates.longitude;
          const dLat = currentRide.destination.coordinates.latitude;
          const dLon = currentRide.destination.coordinates.longitude;
          const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY || "";
          const url = `https://api.geoapify.com/v1/routing?waypoints=${pLat},${pLon}|${dLat},${dLon}&mode=drive&apiKey=${apiKey}`;
          const routeRes = await fetch(url);
          const routeData = await routeRes.json();
          if (!cancelled && routeData?.features?.[0]?.geometry?.coordinates) {
            const coords = routeData.features[0].geometry.coordinates;
            const flatCoords: [number, number][] = [];
            coords.forEach((line: [number, number][]) => {
              line.forEach(([lon, lat]) => flatCoords.push([lat, lon]));
            });
            setRoutePolyline(flatCoords);
          }
        }
      } catch {
        if (!cancelled) setError("Unable to load ride details.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  useEffect(() => {
    const s = connectRiderSocket({
      onReady: () => setToast("Connected to live updates"),
      onError: (m: string) => setToast(m),
      onRideAccepted: async () => {
        setToast("Driver has accepted your ride");
        await fetchRideDetails(rideId);
      },
      onDriverLocation: (payload: any) => {
        if (payload?.latitude != null && payload?.longitude != null) {
          setDriverLocation({ latitude: payload.latitude, longitude: payload.longitude });
        }
      },
      onDriverArrived: () => {
        setRide((p) => (p ? { ...p, status: "DRIVER_ARRIVING" } : p));
        setToast("Driver has arrived at pickup");
      },
      onRideStarted: () => {
        setRide((p) => (p ? { ...p, status: "STARTED" } : p));
        setToast("Ride started");
      },
      onRideArrivedAtDestination: () => {
        setRide((p) => (p ? { ...p, status: "ARRIVED_AT_DESTINATION" } : p));
        setToast("Driver has arrived at your destination");
      },
      onRideCompleted: () => {
        setRide((p) => (p ? { ...p, status: "COMPLETED" } : p));
        setToast("Ride complete");
      },
      onRideCancelled: (payload: any) => {
        setRide((p) => (p ? { ...p, status: "CANCELLED" } : p));
        setToast(`Ride cancelled by ${payload.cancelledBy.toLowerCase()}`);
      },
      onNoDriversAvailable: () => setToast("No drivers available yet"),
    });

    if (s) {
      const originalOnMessage = s.onmessage;
      s.onmessage = async (event) => {
        if (originalOnMessage) originalOnMessage.call(s, event);
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.event === "server:driver-location" && parsed?.data) {
            const { latitude, longitude } = parsed.data;
            if (latitude != null && longitude != null) {
              setDriverLocation({ latitude, longitude });
            }
          }
          if (parsed?.event === "server:ride-accepted" || parsed?.event === "server:driver-assigned") {
            await fetchRideDetails(rideId);
          }
        } catch {
          /* ignore */
        }
      };
    }

    socketRef.current = s;
    return () => s?.close();
  }, [rideId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleCancel() {
    if (!ride) return;
    setIsCancelling(true);
    try {
      await appApi.patch(`/ride/${ride._id}/cancel`, {
        cancellationReason: "Rider cancelled from ride details",
      });
      setRide((p) => (p ? { ...p, status: "CANCELLED" } : p));
      setShowCancelConfirm(false);
    } catch {
      setError("Unable to cancel ride. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function handlePayNow() {
    if (!ride || !user?._id) {
      setError("Unable to start payment from this ride right now.");
      return;
    }
    if (ride.status !== "ARRIVED_AT_DESTINATION") {
      setError("Payment is only available after your driver arrives at the destination.");
      return;
    }
    if (ride.paymentStatus && ride.paymentStatus !== "PENDING") {
      setError("This ride payment has already been processed.");
      return;
    }

    let currentRide = ride;
    try {
      const response = await appApi.get<{ message: string; ride: Ride }>(
        `/ride/${currentRide._id}/fare-preview`
      );
      currentRide = response.data.ride;
      setRide(currentRide);
    } catch {
      setError("Unable to calculate the final fare. Please try again.");
      return;
    }

    if (!currentRide.fare.breakdown) {
      setError("Ride fare breakdown is not available for payment.");
      return;
    }

    setIsPaying(true);
    setError("");
    setToast("");

    try {
      const paymentOrder = await createPaymentOrder({
        rideId: currentRide._id,
        driverId: currentRide.driver?._id ?? "",
        fareBreakdown: {
          baseFarePaise: currentRide.fare.breakdown?.baseFarePaise ?? 0,
          distanceFarePaise: currentRide.fare.breakdown?.distanceFarePaise ?? 0,
          timeFarePaise: currentRide.fare.breakdown?.timeFarePaise ?? 0,
          surgePaise: currentRide.fare.breakdown?.surgePaise ?? 0,
          platformCommissionPaise: currentRide.fare.breakdown?.platformCommissionPaise ?? 0,
          driverEarningPaise: currentRide.fare.breakdown?.driverEarningPaise ?? 0,
          totalPaise: currentRide.fare.breakdown?.totalPaise ?? 0,
        },
        idempotencyKey: `${currentRide._id}-${user._id}`,
      });

      const Razorpay = await loadRazorpayCheckout();
      const options = {
        key: paymentOrder.razorpayKeyId,
        amount: paymentOrder.amountPaise,
        currency: paymentOrder.currency,
        order_id: paymentOrder.gatewayOrderId,
        name: "UrbanFleet Payment",
        description: "Complete your ride payment",
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyResult = await verifyPaymentSignature(response);
            setRide((current) =>
              current ? { ...current, paymentStatus: verifyResult.status as Ride["paymentStatus"] } : current
            );
            setToast("Payment verified successfully.");
          } catch {
            setError("Payment succeeded, but verification failed. Please contact support.");
          }
        },
        prefill: {
          name: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
          email: user?.email,
        },
        theme: { color: "#3a1f0a" },
        modal: {
          ondismiss: () =>
            setToast("Payment window closed. You can retry this ride payment anytime."),
        },
      };

      const razorpayInstance = new Razorpay(options);
      razorpayInstance.open();
    } catch {
      setError("Unable to launch payment checkout. Please try again later.");
    } finally {
      setIsPaying(false);
    }
  }

  const mapPath = useMemo(
    () =>
      routePolyline.length > 0
        ? routePolyline.map(([lat, lng]) => ({ lat, lng }))
        : ride
          ? [
              { lat: ride.pickup.coordinates.latitude, lng: ride.pickup.coordinates.longitude },
              { lat: ride.destination.coordinates.latitude, lng: ride.destination.coordinates.longitude },
            ]
          : [],
    [routePolyline, ride]
  );

  if (isLoading) {
    return <LoadingScreen label="Loading ride" sublabel="Fetching your trip details" />;
  }

  if (!ride || error) {
    return (
      <main
        className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6 py-10 bg-[#f5e6c8] text-[#2e1808]"
        style={{ fontFamily: BODY_FONT }}
      >
        <TransitMapBackground />
        <section className="relative z-10 w-full max-w-md overflow-hidden rounded-[2.5rem] border border-[#fff4dc]/70 bg-gradient-to-b from-[#fffaf0]/95 via-[#fff4dc]/90 to-[#f7e2b8]/90 p-8 text-center shadow-2xl backdrop-blur-2xl">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#3a1f0a] via-[#6b3a12] to-[#2e1808] text-[#ffd88a]">
            <Car className="h-6 w-6" />
          </div>
          <p className="text-xl font-bold tracking-tight text-[#2e1808]" style={{ fontFamily: DISPLAY_FONT }}>
            {error || "No active ride found"}
          </p>
          <p className="mt-2 text-sm font-medium text-[#6b3a12]">Head back to your dashboard to book a new ride.</p>
          <TicketButton variant="primary" className="mt-6 w-full" onClick={() => navigate("/dashboard")}>
            Back to dashboard
          </TicketButton>
        </section>
      </main>
    );
  }

  const statusMeta = STATUS_META[ride.status];
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === ride.status);
  const progressFraction = STATUS_STEPS.length > 1 ? Math.max(0, stepIndex) / (STATUS_STEPS.length - 1) : 0;
  const isTerminal = ride.status === "COMPLETED" || ride.status === "CANCELLED";
  const paymentPending = ride.paymentStatus === "PENDING" || ride.paymentStatus === undefined;

  const driverFirstName = ride.driver?.firstName || ride.driver?.user?.firstName || "Assigned Driver";
  const driverLastName = ride.driver?.lastName || ride.driver?.user?.lastName || "";
  const vehicleNo =
    ride.driver?.vehicleNumber ||
    ride.driver?.vehicle?.registrationNumber ||
    ride.driver?.vehicle?.model ||
    "Vehicle Details Pending";
  const driverPhone = ride.driver?.phone || ride.driver?.user?.phone;

  const activeFareValue = ride.fare.final ?? ride.fare.estimated ?? 0;
  const activeDistance = ride.distance.actual ?? ride.distance.estimated ?? 0;
  const activeDuration = ride.duration.actual ?? ride.duration.estimated ?? 0;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#f5e6c8] text-[#2e1808]" style={{ fontFamily: BODY_FONT }}>
      <TransitMapBackground />

      {/* Toast Notification */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-[#7a4416]/25 bg-[#fffaf0]/95 px-4 py-2 text-xs font-semibold text-[#3a1f0a] shadow-xl backdrop-blur-xl">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
            </span>
            {toast}
          </div>
        </div>
      )}

      <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 py-6 space-y-6">
        
        {/* Header Bar */}
        <header className="sticky top-4 z-50 w-full">
          <div className="w-full rounded-[2rem] border border-[#fff4dc]/70 bg-gradient-to-b from-[#fffaf0]/90 via-[#fff4dc]/85 to-[#f7e2b8]/85 backdrop-blur-xl shadow-xl px-4 sm:px-8 py-3.5 flex items-center justify-between">
            <button
              onClick={() => navigate("/dashboard")}
              className="grid h-12 w-12 place-items-center rounded-2xl border border-[#7a4416]/25 bg-[#fffaf0]/95 text-[#3a1f0a] shadow-xl backdrop-blur-xl transition hover:bg-[#fff4dc]"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-[#b8722c]" />
            </button>

            <div
              className="flex items-center gap-2 rounded-full border border-[#7a4416]/25 bg-[#fffaf0]/95 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#3a1f0a] shadow-lg backdrop-blur-xl"
              style={{ fontFamily: MONO_FONT }}
            >
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              Ride #{ride._id.slice(-6)}
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#7a4416]/25 bg-[#fffaf0]/95 text-[#3a1f0a] shadow-xl backdrop-blur-xl">
              <Navigation2 className="h-5 w-5 text-[#b8722c]" />
            </div>
          </div>
        </header>

        {/* RESPONSIVE FULL-WIDTH GRID */}
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start w-full">
          
          {/* LEFT COLUMN: Map Hero Panel (Span 7 on Laptop) */}
          <section className="lg:col-span-7 flex flex-col w-full">
<div className="relative h-[320px] sm:h-[420px] lg:h-[640px] w-full overflow-hidden rounded-[2.5rem] border border-[#fff4dc]/70 shadow-2xl">
  <MapView
    center={
      driverLocation
        ? {
            lat: driverLocation.latitude,
            lng: driverLocation.longitude,
          }
        : {
            lat: ride.pickup.coordinates.latitude,
            lng: ride.pickup.coordinates.longitude,
          }
    }
    markers={[
      {
        position: {
          lat: ride.pickup.coordinates.latitude,
          lng: ride.pickup.coordinates.longitude,
        },
        label: "P",
        title: "Pickup",
      },
      {
        position: {
          lat: ride.destination.coordinates.latitude,
          lng: ride.destination.coordinates.longitude,
        },
        label: "D",
        title: "Destination",
      },
      ...(driverLocation
        ? [
            {
              position: {
                lat: driverLocation.latitude,
                lng: driverLocation.longitude,
              },
              label: "🚗",
              title: "Driver",
            },
          ]
        : []),
    ]}
    path={mapPath}
  />
</div>
          </section>

          {/* RIGHT COLUMN: Ticket Body & Controls (Span 5 on Laptop) */}
          <section className="lg:col-span-5 relative space-y-6 overflow-hidden rounded-[2.5rem] border border-[#fff4dc]/70 bg-gradient-to-b from-[#fffaf0]/95 via-[#fff4dc]/90 to-[#f7e2b8]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl w-full">
            
            {/* Headline */}
            <div className="relative flex items-start justify-between gap-3 w-full">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: statusMeta.accent }}>
                  {ride.status.replace(/_/g, " ")}
                </p>
                <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-[#2e1808] sm:text-3xl" style={{ fontFamily: DISPLAY_FONT }}>
                  {statusMeta.title}
                </h1>
                <p className="mt-1 text-sm font-medium text-[#6b3a12]">{statusMeta.subtitle}</p>
              </div>
              {isTerminal ? (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-900 border border-emerald-500/30 shadow-inner">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#3a1f0a] via-[#6b3a12] to-[#2e1808] text-[#ffd88a] shadow-md border border-[#c58a3a]/40">
                  {ride.status === "SEARCHING" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Sparkles className="h-5 w-5" />
                  )}
                </div>
              )}
            </div>

            {/* Journey Stepper */}
            {!isTerminal || ride.status === "COMPLETED" ? <JourneyStepper status={ride.status} /> : null}

            {/* Terminal Stamp */}
            {ride.status === "COMPLETED" && (
              <div className="flex justify-center py-2">
                <TicketStamp label="TRIP COMPLETE" sublabel="Trip completed successfully" tone="complete" />
              </div>
            )}
            {ride.status === "CANCELLED" && (
              <div className="flex justify-center py-2">
                <TicketStamp label="RIDE VOID" sublabel="This ride was cancelled" tone="void" />
              </div>
            )}

            {/* Driver Card */}
            {ride.driver && (
              <DriverCard firstName={driverFirstName} lastName={driverLastName} vehicleNo={vehicleNo} phone={driverPhone} />
            )}

            {/* Trip Stops */}
            <div className="relative overflow-hidden rounded-2xl border border-[#7a4416]/20 bg-[#fffaf0] p-4 shadow-sm w-full">
              <div className="relative flex flex-col gap-3 w-full">
                <Stop color="saddle" label="Pickup" value={ride.pickup.address} />
                <div className="absolute left-[13px] top-[26px] bottom-[26px] w-6 -translate-x-1/2">
                  <svg className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 overflow-visible">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="100%"
                      stroke="#b8722c"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  </svg>
                  {!isTerminal && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 grid h-6 w-6 place-items-center rounded-full bg-[#3a1f0a] text-[#ffd88a] shadow-md ring-2 ring-[#fffaf0]"
                      style={{ top: `${Math.min(88, progressFraction * 100)}%` }}
                    >
                      <Car className="h-3 w-3" />
                    </div>
                  )}
                </div>
                <Stop color="brass" square label="Drop-off" value={ride.destination.address} />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 w-full">
              <StatTile
                icon={<IndianRupee className="h-4 w-4" />}
                label="Fare"
                value={<>₹{formatPaiseToRupee(activeFareValue)}</>}
              />
              <StatTile
                icon={<Clock className="h-4 w-4" />}
                label="ETA"
                value={<>{Math.round(activeDuration)}m</>}
              />
              <StatTile
                icon={<RouteIcon className="h-4 w-4" />}
                label="Distance"
                value={<>{activeDistance.toFixed(1)} km</>}
              />
            </div>

            {/* Fare Breakdown */}
            {ride.status === "COMPLETED" && ride.fare.breakdown && (
              <div className="overflow-hidden rounded-2xl border border-dashed border-[#7a4416]/30 bg-[#fffaf0]/80 p-4 shadow-sm w-full">
                <p className="mb-3 text-sm font-bold text-[#2e1808]" style={{ fontFamily: DISPLAY_FONT }}>
                  Fare Breakdown
                </p>
                <div className="space-y-2 text-xs font-semibold text-[#6b3a12] w-full">
                  {[
                    ["Base Fare", ride.fare.breakdown.baseFarePaise],
                    ["Distance Fare", ride.fare.breakdown.distanceFarePaise],
                    ["Time Fare", ride.fare.breakdown.timeFarePaise],
                    ...(ride.fare.breakdown.surgePaise ? [["Surge Charge", ride.fare.breakdown.surgePaise]] : []),
                  ].map(([label, amount]) =>
                    amount != null ? (
                      <Row key={label as string} label={label as string} value={`₹${formatPaiseToRupee(amount as number)}`} />
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Payment Note */}
            {ride.status === "ARRIVED_AT_DESTINATION" && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-900 shadow-sm w-full">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-bold">Payment is required before the trip can be finalized.</p>
                  <p className="mt-0.5 text-amber-900/80">
                    {paymentPending ? "Your payment remains pending until completed." : "Payment has been captured successfully."}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-2 w-full">
              {ride.status === "ARRIVED_AT_DESTINATION" && (
                <TicketButton variant="primary" className="w-full h-14 text-base" onClick={handlePayNow} disabled={isPaying}>
                  {isPaying && <Loader2 className="h-5 w-5 animate-spin" />}
                  {isPaying ? "Preparing payment…" : "Pay now"}
                </TicketButton>
              )}
              {isTerminal ? (
                <TicketButton
                  variant={ride.status === "COMPLETED" ? "success" : "primary"}
                  className="w-full h-14 text-base"
                  onClick={() => navigate("/dashboard")}
                >
                  Back to dashboard
                </TicketButton>
              ) : (
                <TicketButton variant="ghost" className="w-full h-12 text-sm !shadow-sm font-semibold" onClick={() => setShowCancelConfirm(true)}>
                  Cancel ride
                </TicketButton>
              )}
            </div>
          </section>

        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelConfirm && (
        <div
          onClick={() => setShowCancelConfirm(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-[2.5rem] border border-[#fff4dc]/70 bg-gradient-to-b from-[#fffaf0] via-[#fff4dc] to-[#f7e2b8] p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-500/15 text-rose-700 border border-rose-500/30">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight text-[#2e1808]" style={{ fontFamily: DISPLAY_FONT }}>
                    Cancel this ride?
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#6b3a12]">Frequent cancellations may affect your rider priority score.</p>
                </div>
              </div>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fffaf0] text-[#3a1f0a] border border-[#7a4416]/20 transition hover:bg-[#fff4dc]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 w-full">
              <TicketButton variant="ghost" className="flex-1 !px-4 !py-3 text-sm font-semibold" onClick={() => setShowCancelConfirm(false)}>
                Keep ride
              </TicketButton>
              <TicketButton
                variant="danger"
                className="flex-1 !px-4 !py-3 text-sm font-semibold"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? "Cancelling…" : "Yes, cancel"}
              </TicketButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                               */
/* ---------------------------------------------------------------------- */

function Stop({
  color,
  square,
  label,
  value,
}: {
  color: "saddle" | "brass";
  square?: boolean;
  label: string;
  value: string;
}) {
  const dotBase =
    color === "saddle"
      ? "bg-[#3a1f0a] shadow-[0_0_10px_rgba(58,31,10,0.45)]"
      : "bg-[#b8722c] shadow-[0_0_10px_rgba(184,114,44,0.45)]";

  return (
    <div className="relative z-10 flex items-start gap-3.5 w-full">
      <div className="relative mt-1 grid h-6 w-6 place-items-center">
        {color === "saddle" && <span className="absolute h-6 w-6 rounded-full bg-[#3a1f0a]/25" />}
        <span className={`relative h-3 w-3 ${dotBase} ${square ? "rotate-45 rounded-[2px]" : "rounded-full"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a4416]">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-[#2e1808]" style={{ fontFamily: "'Fraunces', Georgia, serif" }} title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between w-full">
      <span className="text-[#6b3a12]">{label}</span>
      <span className="font-extrabold text-[#2e1808]">{value}</span>
    </div>
  );
}