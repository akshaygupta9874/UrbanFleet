import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants, AnimatePresence } from "framer-motion";
import { Sparkles, MapPin, Navigation, ShieldCheck } from "lucide-react";
import api from "./apiInterceptor";
import { AxiosError } from "axios";
import { useAuthContext } from "./context/authContext";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";

/* ============================================================
   GOLDEN BROWN — Premium Ride Booking Signup
   Same implementation & API as your original.
   Only visuals, animations and micro-interactions upgraded.
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
function CityMapBackground() {
  const verticals = useMemo(
    () => [60, 140, 230, 320, 410, 500, 600, 700, 820, 940, 1060, 1180, 1300],
    [],
  );
  const horizontals = useMemo(() => [60, 140, 230, 330, 430, 540, 640, 740, 840], []);

  const pins = useMemo(
    () => [
      { x: 220, y: 200, delay: 0.2 },
      { x: 760, y: 140, delay: 1.1 },
      { x: 1080, y: 520, delay: 0.6 },
      { x: 340, y: 640, delay: 1.6 },
      { x: 980, y: 300, delay: 2.0 },
      { x: 540, y: 420, delay: 0.9 },
    ],
    [],
  );

  const routes = useMemo(
    () => [
      { d: "M -40 230 L 410 230 L 410 430 L 940 430 L 940 230 L 1380 230", dur: 14, delay: 0, color: "#3a1f0a" },
      { d: "M 1380 540 L 820 540 L 820 740 L 320 740 L 320 540 L -40 540", dur: 18, delay: 2, color: "#4a2a12" },
      { d: "M 140 -40 L 140 330 L 600 330 L 600 640 L 1060 640 L 1060 900", dur: 16, delay: 4, color: "#2e1808" },
    ],
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Warm parchment base with rich golden brown */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_15%,#fff7e6_0%,#f5e6c8_35%,#e6c893_65%,#c99a5a_100%)]" />

      {/* Subtle grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(rgba(80,45,15,0.35) 1px, transparent 1px), radial-gradient(rgba(80,45,15,0.2) 1px, transparent 1px)",
          backgroundSize: "3px 3px, 7px 7px",
          backgroundPosition: "0 0, 1px 2px",
        }}
      />

      {/* Drifting ambient brass/amber glows */}
      <motion.div
        className="absolute -left-40 top-0 h-[560px] w-[560px] rounded-full bg-[#f4b860]/40 blur-[130px]"
        animate={{ x: [0, 60, -20, 0], y: [0, 40, -30, 0], scale: [1, 1.15, 0.9, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-40 bottom-0 h-[560px] w-[560px] rounded-full bg-[#b8722c]/40 blur-[130px]"
        animate={{ x: [0, -60, 30, 0], y: [0, -40, 30, 0], scale: [1, 0.9, 1.2, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#ffd88a]/30 blur-[110px]"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* City map SVG panning slowly */}
      <motion.svg
        viewBox="0 0 1340 880"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        animate={{ x: [0, -24, 0, 18, 0], y: [0, 10, 0, -8, 0] }}
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="brassRoute" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7a4416" />
            <stop offset="50%" stopColor="#c58a3a" />
            <stop offset="100%" stopColor="#7a4416" />
          </linearGradient>
          <radialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd88a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffd88a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* City blocks (warm tones) */}
        {verticals.slice(0, -1).map((vx, i) =>
          horizontals.slice(0, -1).map((hy, j) => (
            <rect
              key={`b-${i}-${j}`}
              x={vx + 6}
              y={hy + 6}
              width={verticals[i + 1] - vx - 12}
              height={horizontals[j + 1] - hy - 12}
              fill={
                (i + j) % 4 === 0
                  ? "#e8c98b"
                  : (i + j) % 4 === 1
                  ? "#dbb271"
                  : (i + j) % 4 === 2
                  ? "#efd8a3"
                  : "#cf9d55"
              }
              rx={3}
              opacity={0.55}
            />
          )),
        )}

        {/* River-ish diagonal (amber tint) */}
        <path
          d="M -50 720 C 200 660, 420 780, 700 700 S 1200 560, 1400 620 L 1400 880 L -50 880 Z"
          fill="#a0611f"
          opacity="0.35"
        />

        {/* Streets — creamy */}
        {verticals.map((vx) => (
          <line key={`v-${vx}`} x1={vx} y1={-20} x2={vx} y2={900} stroke="#fff4dc" strokeWidth={10} />
        ))}
        {horizontals.map((hy) => (
          <line key={`h-${hy}`} x1={-20} y1={hy} x2={1360} y2={hy} stroke="#fff4dc" strokeWidth={10} />
        ))}

        {/* Lane stripes — deep brass */}
        {verticals.map((vx) => (
          <line
            key={`vs-${vx}`}
            x1={vx}
            y1={-20}
            x2={vx}
            y2={900}
            stroke="#6b3a12"
            strokeWidth={1}
            strokeDasharray="6 10"
            opacity={0.55}
          />
        ))}
        {horizontals.map((hy) => (
          <line
            key={`hs-${hy}`}
            x1={-20}
            y1={hy}
            x2={1360}
            y2={hy}
            stroke="#6b3a12"
            strokeWidth={1}
            strokeDasharray="6 10"
            opacity={0.55}
          />
        ))}

        {/* Animated brass routes being traced */}
        {routes.map((r, idx) => (
          <g key={`route-${idx}`}>
            <path d={r.d} stroke={r.color} strokeOpacity={0.22} strokeWidth={5} fill="none" strokeLinecap="round" />
            <motion.path
              d={r.d}
              stroke="url(#brassRoute)"
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray="80 1600"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: [-1680, 0] }}
              transition={{ duration: r.dur, delay: r.delay, repeat: Infinity, ease: "linear" }}
            />
            {/* Traveling cab dot */}
            <motion.circle r={8} fill="#3a1f0a" stroke="#ffd88a" strokeWidth={3}>
              <animateMotion dur={`${r.dur}s`} repeatCount="indefinite" begin={`${r.delay}s`} rotate="auto" path={r.d} />
            </motion.circle>
          </g>
        ))}

        {/* Pulsing amber pickup pins */}
        {pins.map((p, i) => (
          <g key={`pin-${i}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r={28} fill="url(#pinGlow)" />
            <motion.circle
              r={6}
              fill="#c58a3a"
              opacity={0.6}
              animate={{ r: [6, 28, 6], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.4, delay: p.delay, repeat: Infinity, ease: "easeOut" }}
            />
            <circle r={5} fill="#3a1f0a" />
            <circle r={2} fill="#fff4dc" />
          </g>
        ))}
      </motion.svg>

      {/* Top/Bottom fades for legibility */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#f5e6c8]/95 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#c99a5a]/60 to-transparent" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(60,30,8,0.35)_100%)]" />
    </div>
  );
}

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
      <span className="tracking-wide">Now cruising in Kolkata · Join millions of premium riders</span>
    </motion.div>
  );
}

export default function SignupPage() {
  const navigate = useNavigate();
  const { checkAuthentication, isAuthenticated, loading } = useAuthContext();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsSubmitting(true);

    try {
      const { data } = await api.post<{ message: string }>("/register", {
        firstName,
        lastName,
        email,
        password,
      });
      setStatus(data.message);
    } catch (error) {
      setStatus(error instanceof AxiosError ? error.response?.data.message : "Signup failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignup(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      setStatus("Google did not return a credential. Please try again.");
      return;
    }

    setStatus("");
    setIsSubmitting(true);
    try {
      await api.post("/google", { credential: credentialResponse.credential });
      await checkAuthentication();
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setStatus(error instanceof AxiosError ? error.response?.data.message : "Google sign-up failed");
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
            Your journey starts here
          </motion.div>

          <motion.h2
            variants={itemVariants}
            className="mb-2 bg-gradient-to-br from-[#2e1808] via-[#6b3a12] to-[#b8722c] bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl"
          >
            Create an account
          </motion.h2>
          <motion.p variants={itemVariants} className="mb-8 text-sm font-medium text-[#6b3a12]/80">
            Enter your details to get moving in premium comfort.
          </motion.p>

          <motion.form variants={itemVariants} className="relative mb-6 space-y-4" onSubmit={handleSignup}>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#7a4416] via-[#f4b860] to-[#b8722c] blur transition duration-500"
              animate={{ opacity: focusedField ? 0.35 : 0 }}
            />

            {/* Name Grid */}
            <div className="relative grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                onFocus={() => setFocusedField("first")}
                onBlur={() => setFocusedField(null)}
                required
                className={inputBase}
              />
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                onFocus={() => setFocusedField("last")}
                onBlur={() => setFocusedField(null)}
                required
                className={inputBase}
              />
            </div>

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
                    Finding your route...
                  </>
                ) : (
                  <>
                    <Navigation size={16} className="text-[#ffd88a]" />
                    Agree and Continue
                  </>
                )}
              </span>
            </motion.button>
          </motion.form>

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

          {/* Divider */}
          <motion.div variants={itemVariants} className="mb-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7a4416]/40 to-transparent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b3a12]/70">
              or join with
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7a4416]/40 to-transparent" />
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6 flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSignup}
              onError={() => setStatus("Google sign-up could not be started. Please try again.")}
              text="signup_with"
              shape="pill"
              width="360"
            />
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
          </motion.div>
 */}
          {/* Sign in link */}
          <motion.div variants={itemVariants} className="mb-4 text-center">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="group relative text-sm font-semibold text-[#6b3a12] transition-colors hover:text-[#3a1f0a]"
            >
              Already have an account?{" "}
              <span className="relative inline-block">
                Sign in
                <span className="absolute inset-x-0 -bottom-0.5 h-px scale-x-100 bg-gradient-to-r from-[#7a4416] via-[#c58a3a] to-[#7a4416] transition-transform duration-300 group-hover:scale-x-110" />
              </span>
            </button>
          </motion.div>

          {/* Disclaimer */}
          <motion.p
            variants={itemVariants}
            className="text-center text-[11px] leading-relaxed text-[#6b3a12]/65"
          >
            By proceeding, you consent to our Terms of Service and Privacy Policy, and to receive
            communications from Ride and its affiliates.
          </motion.p>

          {/* Brass bottom rail */}
          <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[#c58a3a] to-transparent" />
        </motion.div>
      </main>
    </div>
  );
}
