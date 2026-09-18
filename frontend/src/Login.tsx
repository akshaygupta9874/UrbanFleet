import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, MapPin, Navigation, ShieldCheck } from "lucide-react";
import api from "./apiInterceptor";
import { AxiosError } from "axios";
import { useAuthContext, type User } from "./context/authContext";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import CityMapBackground from "./components/CityMapBackground";

/* ============================================================
   GOLDEN BROWN — Premium Ride Booking Login
   Built using the exact same tone, components, and layout 
   as the Signup page.
   ============================================================ */

// ---------- Form animation ----------
const containerVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.3,
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};

// ---------- Golden-brown animated city map background ----------

// ============================================================
// CAR GLYPH
// ============================================================
function CarGlyph() {
  return (
    <g>
      <ellipse cx={0} cy={0.8} rx={12} ry={4.2} fill="#1c0f05" opacity={0.16} />
      <rect
        x={-11}
        y={-5.5}
        width={22}
        height={11}
        rx={4}
        fill="#D9A521"
        stroke="#1c0f05"
        strokeWidth={1}
      />
      <rect x={-8} y={-6.3} width={3} height={1.6} rx={0.8} fill="#1c0f05" opacity={0.5} />
      <rect x={-8} y={4.7} width={3} height={1.6} rx={0.8} fill="#1c0f05" opacity={0.5} />
      <rect x={5} y={-6.3} width={3} height={1.6} rx={0.8} fill="#1c0f05" opacity={0.5} />
      <rect x={5} y={4.7} width={3} height={1.6} rx={0.8} fill="#1c0f05" opacity={0.5} />
      <rect x={1} y={-4} width={7} height={8} rx={2} fill="#1c0f05" opacity={0.55} />
      <circle cx={10.5} cy={-3} r={1} fill="#fff4dc" />
      <circle cx={10.5} cy={3} r={1} fill="#fff4dc" />
      <circle cx={-10.5} cy={-3} r={0.8} fill="#7a4416" />
      <circle cx={-10.5} cy={3} r={0.8} fill="#7a4416" />
    </g>
  );
}

// ============================================================
// RIDER GLYPH
// ============================================================
function RiderGlyph() {
  return (
    <g>
      <path
        d="
          M0,0
          C-8,-10 -9.5,-16 -9.5,-19.5
          C-9.5,-25 -5.2,-29 0,-29
          C5.2,-29 9.5,-25 9.5,-19.5
          C9.5,-16 8,-10 0,0 Z
        "
        fill="#D9A521"
        stroke="#1c0f05"
        strokeWidth={1}
      />
      <circle cx={0} cy={-21} r={2.3} fill="#1c0f05" />
      <path
        d="
          M-3.4,-16.3
          C-3.4,-19 3.4,-19 3.4,-16.3
          L3.4,-13.8
          C3.4,-12.6 -3.4,-12.6 -3.4,-13.8 Z
        "
        fill="#1c0f05"
      />
      <path
        d="M-6.2,-25 C-4.6,-27.3 -1.6,-28.8 1.4,-28.8"
        stroke="#F2CD7C"
        strokeWidth={1}
        fill="none"
        opacity={0.6}
        strokeLinecap="round"
      />
    </g>
  );
}

// ============================================================
// DETERMINISTIC HASH
// ============================================================
function hash(i: number, j: number, salt: number) {
  const v = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

// ============================================================
// TYPES
// ============================================================
type Point = {
  x: number;
  y: number;
};

type RideConfig = {
  points: Point[];
  pickupIndex: number;
  destIndex: number;
  duration: number;
  startDelay: number;
};

// ============================================================
// DISTANCE / TIMING CALCULATOR
// ============================================================
function computeRide(
  points: Point[],
  pickupIndex: number,
  destIndex: number,
  duration: number,
  pickupPause: number,
  dropoffPause: number
) {
  const dist = [0];
  for (let i = 1; i < points.length; i++) {
    dist.push(
      dist[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y
        )
    );
  }

  const total = dist[dist.length - 1];
  const pickupDistance = dist[pickupIndex];
  const destinationDistance = dist[destIndex];

  const pickupFrac = pickupDistance / total;
  const destFrac = destinationDistance / total;

  const movingDuration = duration - pickupPause - dropoffPause;
  const speed = total / movingDuration;

  const pickupArrivalTime = pickupDistance / speed;
  const pickupEndTime = pickupArrivalTime + pickupPause;
  const destinationArrivalTime =
    pickupEndTime + (destinationDistance - pickupDistance) / speed;
  const destinationEndTime = destinationArrivalTime + dropoffPause;

  return {
    d: "M " + points.map((p) => `${p.x} ${p.y}`).join(" L "),
    keyPoints: [0, pickupFrac, pickupFrac, destFrac, destFrac, 1].join(";"),
    keyTimes: [
      0,
      pickupArrivalTime / duration,
      pickupEndTime / duration,
      destinationArrivalTime / duration,
      destinationEndTime / duration,
      1,
    ].join(";"),
    duration,
    pickup: points[pickupIndex],
    dest: points[destIndex],
    pickupStartFrac: pickupArrivalTime / duration,
    pickupEndFrac: pickupEndTime / duration,
    destStartFrac: destinationArrivalTime / duration,
    destEndFrac: destinationEndTime / duration,
  };
}

// ============================================================
// CITY MAP BACKGROUND
// ============================================================
function LegacyCityMapBackground() {
  const prefersReducedMotion = useReducedMotion();

  const verticals = useMemo(
    () => [70, 160, 260, 340, 430, 540, 620, 720, 820, 900, 1000, 1120],
    []
  );
  const horizontals = useMemo(
    () => [70, 150, 260, 330, 430, 500, 610, 700],
    []
  );
  const blockTones = ["#e8c98b", "#dbb271", "#efd8a3", "#cf9d55"];

  // Completely disjoint, non-intersecting routes spread across all city sectors
  const rideConfigs = useMemo<RideConfig[]>(
    () => [
      // 1. Top-Left Sector
      {
        points: [
          { x: -50, y: 70 },
          { x: 160, y: 70 },
          { x: 430, y: 70 },
          { x: 430, y: 260 },
          { x: 540, y: 260 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 21,
        startDelay: 0,
      },
      // 2. Top-Right Sector
      {
        points: [
          { x: 1250, y: 70 },
          { x: 1000, y: 70 },
          { x: 720, y: 70 },
          { x: 720, y: 150 },
          { x: 1250, y: 150 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 23,
        startDelay: 3,
      },
      // 3. Middle-West Sector
      {
        points: [
          { x: 70, y: -50 },
          { x: 70, y: 150 },
          { x: 70, y: 330 },
          { x: 260, y: 330 },
          { x: 260, y: 500 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 20,
        startDelay: 6,
      },
      // 4. Middle-East Sector
      {
        points: [
          { x: 1000, y: -50 },
          { x: 1000, y: 150 },
          { x: 1000, y: 330 },
          { x: 820, y: 330 },
          { x: 820, y: 500 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 22,
        startDelay: 9,
      },
      // 5. Bottom-Left Sector
      {
        points: [
          { x: -50, y: 610 },
          { x: 160, y: 610 },
          { x: 340, y: 610 },
          { x: 340, y: 700 },
          { x: 620, y: 700 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 24,
        startDelay: 12,
      },
      // 6. Bottom-Right Sector
      {
        points: [
          { x: 1250, y: 610 },
          { x: 1120, y: 610 },
          { x: 900, y: 610 },
          { x: 900, y: 700 },
          { x: 1250, y: 700 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 22,
        startDelay: 15,
      },
      // 7. Center Core Sector
      {
        points: [
          { x: 540, y: 870 },
          { x: 540, y: 610 },
          { x: 540, y: 430 },
          { x: 620, y: 430 },
          { x: 620, y: 260 },
        ],
        pickupIndex: 1,
        destIndex: 3,
        duration: 25,
        startDelay: 18,
      },
    ],
    []
  );

  const rides = useMemo(
    () =>
      rideConfigs.map((ride) => ({
        ...ride,
        ...computeRide(
          ride.points,
          ride.pickupIndex,
          ride.destIndex,
          ride.duration,
          1.8,
          1.2
        ),
      })),
    [rideConfigs]
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_15%,#fff7e6_0%,#f5e6c8_35%,#e6c893_65%,#c99a5a_100%)]" />

      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(rgba(80,45,15,0.35) 1px, transparent 1px), radial-gradient(rgba(80,45,15,0.2) 1px, transparent 1px)",
          backgroundSize: "3px 3px, 7px 7px",
          backgroundPosition: "0 0, 1px 2px",
        }}
      />

      <motion.div
        className="absolute -left-40 top-0 h-[560px] w-[560px] rounded-full bg-[#D9A521]/30 blur-[130px]"
        animate={
          prefersReducedMotion
            ? undefined
            : {
                x: [0, 60, -20, 0],
                y: [0, 40, -30, 0],
                scale: [1, 1.15, 0.9, 1],
              }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-40 bottom-0 h-[560px] w-[560px] rounded-full bg-[#7a4416]/35 blur-[130px]"
        animate={
          prefersReducedMotion
            ? undefined
            : {
                x: [0, -60, 30, 0],
                y: [0, -40, 30, 0],
                scale: [1, 0.9, 1.2, 1],
              }
        }
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.svg
        viewBox="0 0 1200 820"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        animate={
          prefersReducedMotion
            ? undefined
            : {
                x: [0, -24, 0, 18, 0],
                y: [0, 10, 0, -8, 0],
              }
        }
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <radialGradient id="markerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F2CD7C" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#F2CD7C" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="hatch"
            width={6}
            height={6}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#7a4416" strokeWidth="1" />
          </pattern>
        </defs>

        {/* CITY BLOCKS */}
        {verticals.slice(0, -1).map((vx, i) =>
          horizontals.slice(0, -1).map((hy, j) => {
            const vx2 = verticals[i + 1];
            const hy2 = horizontals[j + 1];
            const pad = 5 + hash(i, j, 4) * 5;
            const w = vx2 - vx - pad * 2;
            const h = hy2 - hy - pad * 2;
            const bx = vx + pad;
            const by = hy + pad;
            const cx = bx + w / 2;
            const cy = by + h / 2;
            const jx = (hash(i, j, 1) - 0.5) * 8;
            const jy = (hash(i, j, 2) - 0.5) * 8;
            const rot = (hash(i, j, 3) - 0.5) * 7;
            const fill = blockTones[(i + j) % 4];
            const hatched = (i * 3 + j) % 7 === 0;

            return (
              <g
                key={`b-${i}-${j}`}
                transform={`translate(${jx} ${jy}) rotate(${rot} ${cx} ${cy})`}
              >
                <rect
                  x={bx + 2}
                  y={by + 2}
                  width={w}
                  height={h}
                  rx={4}
                  fill="#1c0f05"
                  opacity={0.16}
                />
                <rect
                  x={bx}
                  y={by}
                  width={w}
                  height={h}
                  rx={4}
                  fill={fill}
                  opacity={0.6}
                  stroke="#F2CD7C"
                  strokeOpacity={0.18}
                  strokeWidth={1}
                />
                {hatched && (
                  <rect
                    x={bx}
                    y={by}
                    width={w}
                    height={h}
                    rx={4}
                    fill="url(#hatch)"
                    opacity={0.3}
                  />
                )}
              </g>
            );
          })
        )}

        {/* RIVER */}
        <path
          d="
            M -50 700
            C 150 650, 350 760, 620 690
            S 1050 560, 1250 620
            L 1250 820
            L -50 820 Z
          "
          fill="#a0611f"
          opacity="0.32"
        />
        <path
          d="
            M -50 680
            C 150 630, 350 740, 620 670
            S 1050 540, 1250 600
          "
          fill="none"
          stroke="#F2CD7C"
          strokeOpacity="0.25"
          strokeWidth={1.5}
        />
        <rect
          x={332}
          y={655}
          width={16}
          height={55}
          rx={3}
          fill="#fff4dc"
          stroke="#1c0f05"
          strokeWidth={1}
          opacity={0.9}
        />
        <rect
          x={812}
          y={655}
          width={16}
          height={55}
          rx={3}
          fill="#fff4dc"
          stroke="#1c0f05"
          strokeWidth={1}
          opacity={0.9}
        />

        {/* VERTICAL STREETS */}
        {verticals.map((vx, i) =>
          i === 5 ? (
            <path
              key="v-jog-base"
              d="M 540 -20 L 540 330 L 552 342 L 552 900"
              stroke="#fff4dc"
              strokeWidth={8}
              fill="none"
            />
          ) : (
            <line
              key={`v-${vx}`}
              x1={vx}
              y1={-20}
              x2={vx}
              y2={900}
              stroke="#fff4dc"
              strokeWidth={i % 3 === 0 ? 13 : 8}
            />
          )
        )}

        {/* HORIZONTAL STREETS */}
        {horizontals.map((hy, j) => (
          <line
            key={`h-${hy}`}
            x1={-20}
            y1={hy}
            x2={1220}
            y2={hy}
            stroke="#fff4dc"
            strokeWidth={j % 3 === 0 ? 13 : 8}
          />
        ))}

        {/* ROAD MARKINGS */}
        {verticals.map((vx, i) =>
          i === 5 ? (
            <path
              key="v-jog-dash"
              d="M 540 -20 L 540 330 L 552 342 L 552 900"
              stroke="#6b3a12"
              strokeWidth={1}
              strokeDasharray="6 10"
              opacity={0.5}
              fill="none"
            />
          ) : (
            <line
              key={`vs-${vx}`}
              x1={vx}
              y1={-20}
              x2={vx}
              y2={900}
              stroke="#6b3a12"
              strokeWidth={1}
              strokeDasharray="6 10"
              opacity={0.5}
            />
          )
        )}
        {horizontals.map((hy) => (
          <line
            key={`hs-${hy}`}
            x1={-20}
            y1={hy}
            x2={1220}
            y2={hy}
            stroke="#6b3a12"
            strokeWidth={1}
            strokeDasharray="6 10"
            opacity={0.5}
          />
        ))}

        {/* CENTRAL ROUNDABOUT */}
        <g transform="translate(620 409)">
          <circle r={46} fill="none" stroke="#fff4dc" strokeWidth={10} opacity={0.9} />
          <circle
            r={46}
            fill="none"
            stroke="#6b3a12"
            strokeWidth={1}
            strokeDasharray="6 8"
            opacity={0.4}
          />
          <circle r={30} fill="#e8c98b" stroke="#1c0f05" strokeWidth={1} opacity={0.7} />
          <circle r={30} fill="url(#hatch)" opacity={0.25} />
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <line
                key={`spoke-${deg}`}
                x1={Math.cos(rad) * 30}
                y1={Math.sin(rad) * 30}
                x2={Math.cos(rad) * 46}
                y2={Math.sin(rad) * 46}
                stroke="#fff4dc"
                strokeWidth={4}
              />
            );
          })}
        </g>

        {/* RIDES */}
        {rides.map((ride, idx) => (
          <g key={`ride-${idx}`}>
            {/* RIDER */}
            <g transform={`translate(${ride.pickup.x} ${ride.pickup.y})`}>
              <circle cx={0} cy={-14} r={18} fill="url(#markerGlow)" />
              {!prefersReducedMotion && (
                <motion.circle
                  fill="none"
                  stroke="#F2CD7C"
                  strokeWidth={2}
                  animate={{
                    r: [0, 8, 20, 8, 0],
                    opacity: [0, 0.6, 0, 0.6, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: idx * 0.4,
                  }}
                />
              )}
              {!prefersReducedMotion ? (
                <motion.g
                  initial={{ opacity: 1 }}
                  animate={{
                    opacity: [1, 1, 0, 0, 1],
                  }}
                  transition={{
                    duration: ride.duration,
                    times: [
                      0,
                      Math.max(0, ride.pickupStartFrac - 0.001),
                      ride.pickupStartFrac,
                      ride.destEndFrac,
                      1,
                    ],
                    repeat: Infinity,
                    delay: ride.startDelay,
                    ease: "linear",
                  }}
                >
                  <RiderGlyph />
                </motion.g>
              ) : (
                <RiderGlyph />
              )}
            </g>

            {/* DESTINATION PULSE */}
            {!prefersReducedMotion && (
              <motion.circle
                cx={ride.dest.x}
                cy={ride.dest.y}
                fill="none"
                stroke="#D9A521"
                strokeWidth={2}
                animate={{
                  r: [0, 0, 10, 30, 0],
                  opacity: [0, 0, 0.9, 0, 0],
                }}
                transition={{
                  duration: ride.duration,
                  times: [
                    0,
                    Math.max(0, ride.destStartFrac - 0.02),
                    ride.destStartFrac,
                    Math.min(1, ride.destStartFrac + 0.06),
                    1,
                  ],
                  repeat: Infinity,
                  delay: ride.startDelay,
                  ease: "easeOut",
                }}
              />
            )}

            {/* CAR */}
            {!prefersReducedMotion && (
              <g>
                <g transform="scale(1.15)">
                  <circle r={13} fill="#F2CD7C" opacity={0.22} />
                  <CarGlyph />
                </g>
                <animateMotion
                  dur={`${ride.duration}s`}
                  begin={`${ride.startDelay}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                  calcMode="linear"
                  path={ride.d}
                  keyPoints={ride.keyPoints}
                  keyTimes={ride.keyTimes}
                />
              </g>
            )}
          </g>
        ))}
      </motion.svg>

      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#f5e6c8]/95 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#c99a5a]/60 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(28,15,5,0.35)_100%)]" />
    </div>
  );
}

void LegacyCityMapBackground;
// ---------- Golden Welcome Ticker ----------
function WelcomePill() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#7a4416]/25 bg-gradient-to-r from-[#fff4dc]/90 via-[#ffe4b0]/90 to-[#fff4dc]/90 px-4 py-2 text-xs font-semibold text-[#3a1f0a] shadow-[0_8px_24px_-8px_rgba(122,68,22,0.4)] backdrop-blur-md"
    >
      <motion.span
        animate={{ rotate: [0, 15, -15, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles size={14} className="text-[#b8722c]" />
      </motion.span>
      <span className="tracking-wide">Welcome back · Sign in to continue your journey</span>
    </motion.div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { checkAuthentication, establishSession, isAuthenticated, loading } = useAuthContext();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsSubmitting(true);

    try {
      const { data } = await api.post<{ message: string }>("/login", {
        email,
        password,
      });
      setStatus(data.message);
      setShowOtp(true);
    } catch (error) {
      setStatus(error instanceof AxiosError ? error.response?.data.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    setStatus("");
    setIsSubmitting(true);

    try {
      const { data } = await api.post<{ message: string }>("/verify-otp", {
        email,
        otp,
      });
      setStatus(data.message);
      await checkAuthentication();
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setStatus(error instanceof AxiosError ? error.response?.data.message : "OTP verification failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      setStatus("Google did not return a credential. Please try again.");
      return;
    }

    setStatus("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ accessToken: string; user: User }>("/google", {
        credential: credentialResponse.credential,
      });
      establishSession(data.accessToken, data.user);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setStatus(error instanceof AxiosError ? error.response?.data.message : "Google sign-in failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-xl border border-[#7a4416]/20 bg-[#fffaf0]/95 px-5 py-3.5 text-base text-[#2e1808] outline-none transition-all duration-300 placeholder:text-[#7a4416]/45 focus:border-transparent focus:ring-2 focus:ring-[#b8722c] focus:shadow-[0_0_0_4px_rgba(184,114,44,0.15)]";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f5e6c8] font-sans text-[#2e1808]">
      <CityMapBackground />

      {/* Floating traveling car badge (upper corner) */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="pointer-events-none absolute left-6 top-6 z-10 hidden items-center gap-2 rounded-full border border-[#7a4416]/20 bg-[#fffaf0]/70 px-3 py-1.5 text-[11px] font-semibold text-[#3a1f0a] shadow-sm backdrop-blur-md sm:inline-flex"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live · 3,240 riders on the road
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.1, duration: 0.8 }}
        className="pointer-events-none absolute right-6 top-6 z-10 hidden items-center gap-2 rounded-full border border-[#7a4416]/20 bg-[#fffaf0]/70 px-3 py-1.5 text-[11px] font-semibold text-[#3a1f0a] shadow-sm backdrop-blur-md sm:inline-flex"
      >
        <ShieldCheck size={12} className="text-[#b8722c]" />
        Bank-grade encryption
      </motion.div>

      {/* Main Form Content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-8">
        <WelcomePill />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative w-full max-w-[460px] overflow-hidden rounded-[2rem] border border-[#fff4dc]/70 bg-gradient-to-b from-[#fffaf0]/90 via-[#fff4dc]/85 to-[#f7e2b8]/85 p-8 pt-10 shadow-[0_40px_100px_-24px_rgba(80,40,10,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-2xl md:p-10"
        >
          {/* Perforation ticket-edge dots */}
          <div className="pointer-events-none absolute left-0 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={`pl-${i}`} className="h-2 w-2 rounded-full bg-[#f5e6c8]" />
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-1/2 flex translate-x-1/2 -translate-y-1/2 flex-col gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={`pr-${i}`} className="h-2 w-2 rounded-full bg-[#f5e6c8]" />
            ))}
          </div>

          {/* Brass top rail */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[#c58a3a] to-transparent" />

          {/* Moving brass sheen */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-y-10 -left-1/3 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-[#fff2cc]/80 to-transparent"
            animate={{ x: ["0%", "460%"] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", repeatDelay: 3.5 }}
          />

          {/* Aura ring behind card (only visible on focus) */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-r from-[#b8722c] via-[#f4b860] to-[#7a4416] opacity-0 blur-2xl transition duration-700"
            animate={{ opacity: focusedField ? 0.45 : 0 }}
          />

          {/* Route pin badge — top of card */}
          <motion.div
            variants={itemVariants}
            className="mb-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#3a1f0a] to-[#7a4416] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#ffd88a] shadow-[0_8px_20px_-8px_rgba(58,31,10,0.6)]"
          >
            <MapPin size={12} />
            Welcome back
          </motion.div>

          <motion.h2
            variants={itemVariants}
            className="mb-2 bg-gradient-to-br from-[#2e1808] via-[#6b3a12] to-[#b8722c] bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl"
          >
            Sign in to ride
          </motion.h2>
          <motion.p variants={itemVariants} className="mb-8 text-sm font-medium text-[#6b3a12]/80">
            Enter your credentials to continue your journey.
          </motion.p>

          <motion.form variants={itemVariants} className="relative mb-6 space-y-4" onSubmit={handleLogin}>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#7a4416] via-[#f4b860] to-[#b8722c] blur transition duration-500"
              animate={{ opacity: focusedField ? 0.35 : 0 }}
            />

            {/* Email */}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={() => setFocusedField("contact")}
              onBlur={() => setFocusedField(null)}
              required
              className={`${inputBase} py-4 text-lg`}
            />

            {/* Password */}
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              required
              className={`${inputBase} py-4 text-lg`}
            />

            {/* Primary CTA — brass gradient with shine sweep and glow */}
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#3a1f0a] via-[#6b3a12] to-[#2e1808] py-4 text-lg font-semibold text-[#ffe9be] shadow-[0_18px_40px_-12px_rgba(58,31,10,0.7),inset_0_1px_0_rgba(255,216,138,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-14px_rgba(58,31,10,0.85),inset_0_1px_0_rgba(255,216,138,0.5)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {/* Brass inner rim */}
              <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#c58a3a]/40" />
              {/* Shine sweep */}
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[#ffd88a]/60 to-transparent transition-transform duration-1000 group-hover:translate-x-[460%]" />
              <span className="relative z-10 inline-flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <motion.span
                      className="inline-block h-3 w-3 rounded-full border-2 border-[#ffd88a]/40 border-t-[#ffd88a]"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                    />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Navigation size={16} className="text-[#ffd88a]" />
                    Continue
                  </>
                )}
              </span>
            </motion.button>
          </motion.form>

          {showOtp && (
            <motion.div variants={itemVariants} className="mb-6 space-y-4">
              <input
                type="text"
                placeholder="Enter email OTP"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                required
                className={`${inputBase} py-4 text-lg`}
              />
              <motion.button
                type="button"
                disabled={isSubmitting || !otp}
                whileTap={{ scale: 0.98 }}
                onClick={handleVerifyOtp}
                className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#7a4416] via-[#9a581e] to-[#3a1f0a] py-3.5 text-base font-semibold text-[#ffe9be] shadow-md transition-all hover:opacity-95 disabled:opacity-60"
              >
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  {isSubmitting ? "Verifying..." : "Verify OTP"}
                </span>
              </motion.button>
            </motion.div>
          )}

          <AnimatePresence>
            {status && (
              <motion.p
                key={status}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-6 rounded-xl border border-[#7a4416]/20 bg-[#fffaf0]/90 px-4 py-3 text-center text-sm font-medium text-[#3a1f0a] shadow-sm backdrop-blur-md"
              >
                {status}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Links Row */}
          <motion.div variants={itemVariants} className="mb-6 flex justify-between text-sm">
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="group relative font-semibold text-[#6b3a12] transition-colors hover:text-[#3a1f0a]"
            >
              Don't have an account?{" "}
              <span className="relative inline-block">
                Sign up
                <span className="absolute inset-x-0 -bottom-0.5 h-px scale-x-100 bg-gradient-to-r from-[#7a4416] via-[#c58a3a] to-[#7a4416] transition-transform duration-300 group-hover:scale-x-110" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              className="group relative font-semibold text-[#6b3a12] transition-colors hover:text-[#3a1f0a]"
            >
              <span className="relative inline-block">
                Forgot password?
                <span className="absolute inset-x-0 -bottom-0.5 h-px scale-x-100 bg-gradient-to-r from-[#7a4416] via-[#c58a3a] to-[#7a4416] transition-transform duration-300 group-hover:scale-x-110" />
              </span>
            </button>
          </motion.div>

          {/* Divider */}
          <motion.div variants={itemVariants} className="mb-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7a4416]/40 to-transparent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b3a12]/70">
              or continue with
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7a4416]/40 to-transparent" />
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6 flex w-full justify-center">
            <div className="mx-auto flex w-full max-w-[360px] items-center justify-center overflow-hidden rounded-full border border-[#7a4416]/20 bg-[#fffaf0]/70 p-1 shadow-[0_10px_24px_-16px_rgba(58,31,10,0.65)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-18px_rgba(58,31,10,0.75)]">
              <GoogleLogin
                onSuccess={handleGoogleLogin}
                onError={() => setStatus("Google sign-in could not be started. Please try again.")}
                text="continue_with"
                theme="outline"
                size="large"
                shape="pill"
                logo_alignment="center"
                width="100%"
              />
            </div>
          </motion.div>
          {/* Social Buttons
          <motion.div variants={itemVariants} className="mb-6 flex gap-3">
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/60 transition-transform duration-700 group-hover:translate-x-[420%]" />
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </button>

            <button className="group relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-xl border border-[#7a4416]/20 bg-[#fffaf0]/90 py-3.5 text-base font-medium text-[#3a1f0a] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#fffaf0] hover:shadow-md active:scale-[0.98]">
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/60 transition-transform duration-700 group-hover:translate-x-[420%]" />
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
              >
                <path d="M17.05 13.57c-.02-2.12 1.73-3.15 1.81-3.2-1-1.47-2.55-1.68-3.11-1.7-1.33-.14-2.58.78-3.26.78-.68 0-1.71-.76-2.81-.74-1.42.02-2.73.82-3.46 2.1-1.49 2.58-.38 6.4 1.07 8.5.71 1.03 1.55 2.18 2.68 2.14 1.09-.04 1.5-.7 2.81-.7 1.3 0 1.69.7 2.83.68 1.16-.02 1.88-1.07 2.58-2.1 1.13-1.65 1.6-3.25 1.62-3.34-.03-.01-2.73-1.04-2.76-3.42zM15.1 6.3c.6-.73 1.01-1.75.9-2.77-.88.04-1.95.59-2.56 1.32-.54.65-.99 1.69-.87 2.7 1 .08 2.01-.52 2.53-1.25z" />
              </svg>
              Apple
            </button>
          </motion.div> */}

          {/* Disclaimer */}
          <motion.p
            variants={itemVariants}
            className="text-center text-[11px] leading-relaxed text-[#6b3a12]/65"
          >
            By proceeding, you consent to get calls, WhatsApp or SMS messages, including by automated means, from Ride and its affiliates to the number provided.
          </motion.p>

          {/* Brass bottom rail */}
          <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[#c58a3a] to-transparent" />
        </motion.div>
      </main>
    </div>
  );
}
