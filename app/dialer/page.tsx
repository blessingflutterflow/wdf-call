"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Device } from "@twilio/voice-sdk";
import { auth } from "../../lib/firebase";
import { normalizeDialed } from "../../lib/phone";
import { onAuthStateChanged, signOut } from "firebase/auth";

// DTMF Frequencies (Row, Column)
const DTMF_FREQS: Record<string, [number, number]> = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
};

export default function Dialer() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState("Initializing...");
  const [device, setDevice] = useState<any>(null);
  const [call, setCall] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Formatting call timer
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push("/auth");
      else setUser(currentUser);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    // Web Audio API for dialer sounds
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass();
    }

    const setupDevice = async () => {
      try {
        // Request specific mic permission
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          setStatus("Microphone permission denied");
          return;
        }

        const res = await fetch("/api/token", { method: "POST" });
        const { token } = await res.json();

        const newDevice = new Device(token, {
          logLevel: 1,
          edge: "ashburn",
        });

        newDevice.register();

        newDevice.on("registered", () => setStatus("Ready"));
        newDevice.on("error", (err: any) => setStatus(`Error: ${err.message}`));

        setDevice(newDevice);
      } catch (err: any) {
        setStatus(`Setup Error: ${err.message}`);
      }
    };

    setupDevice();

    return () => {
      if (device) device.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user]);

  const playDTMF = (key: string) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    // Resume context if suspended
    if (ctx.state === "suspended") ctx.resume();

    const freqs = DTMF_FREQS[key];
    if (!freqs) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.frequency.value = freqs[0];
    osc2.frequency.value = freqs[1];

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Fade out volume slightly to prevent popping
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc1.start();
    osc2.start();

    setTimeout(() => {
      osc1.stop();
      osc2.stop();
    }, 150);
  };

  const handleKeyPress = (key: string) => {
    if (call) {
      call.sendDigits(key);
    } else {
      playDTMF(key);
      setPhoneNumber(prev => prev + key);
    }
  };

  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleContacts = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const contacts = await (navigator as any).contacts.select(props, opts);
        if (contacts.length > 0 && contacts[0].tel && contacts[0].tel.length > 0) {
          // clean up spaces and dashes
          let selectedNumber = contacts[0].tel[0].replace(/[\s-()]/g, '');
          setPhoneNumber(selectedNumber);
        }
      } catch (ex) {
        console.error("Contacts picker error:", ex);
      }
    } else {
      alert("Contact picking is only supported on some mobile browsers (like Chrome for Android).");
    }
  };

  const handlePointerDown = (key: string) => {
    if (key === "0") {
      longPressTimerRef.current = setTimeout(() => {
        playDTMF("0");
        setPhoneNumber(prev => prev + "+");
        longPressTimerRef.current = null;
      }, 500); // 500ms long press
    }
  };

  const handlePointerUp = (key: string) => {
    // If it's "0" and the timer hasn't fired yet, it's a short press
    if (key === "0") {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        handleKeyPress(key);
      }
    } else {
      handleKeyPress(key);
    }
  };

  const handlePointerLeave = (key: string) => {
    if (key === "0" && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCall = async () => {
    if (!device || !phoneNumber) return;

    // Accept SA numbers dialled without a country code (e.g. 0821234567),
    // same behaviour as the Flutter app.
    const dest = normalizeDialed(phoneNumber);
    if (!dest) {
      setStatus("Invalid number");
      return;
    }
    setPhoneNumber(dest);

    try {
      setStatus("Calling...");
      const params = { To: dest };
      const outCall = await device.connect({ params });

      outCall.on("accept", () => {
        setStatus("Call Active");
        setCallDuration(0);
        timerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      });

      outCall.on("disconnect", () => {
        setStatus("Ready");
        setCall(null);
        if (timerRef.current) clearInterval(timerRef.current);
      });

      outCall.on("error", () => {
        setStatus("Ready");
        setCall(null);
        if (timerRef.current) clearInterval(timerRef.current);
      });

      setCall(outCall);
    } catch (err: any) {
      setStatus(`Call failed`);
    }
  };

  const handleHangup = () => {
    if (call) {
      call.disconnect();
      setCall(null);
    } else if (device) {
      device.disconnectAll();
    }
    setStatus("Ready");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const toggleMute = () => {
    if (call) {
      const isCurrentlyMuted = call.isMuted();
      call.mute(!isCurrentlyMuted);
      setIsMuted(!isCurrentlyMuted);
    }
  };

  // ----- ACTIVE CALL UI -----
  if (status === "Calling..." || status === "Call Active" || call) {
    return (
      <div className="relative flex h-screen w-screen flex-col bg-[#0e0c0c] text-white overflow-hidden font-display transition-colors">
        {/* Safe Area Top */}
        <div className="flex items-center p-6 justify-between mt-8">
          <div className="text-white/40 flex size-10 shrink-0 items-center justify-center cursor-pointer">
            {/* Optional Minimize icon */}
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm">shield</span>
            <span className="text-white/40 text-[10px] font-bold tracking-[0.2em] uppercase">Secure Line</span>
          </div>
          <div className="size-10"></div>
        </div>

        {/* Contact Info Middle */}
        <div className="flex flex-col items-center justify-center flex-1 px-6 -mt-12">
          <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/10 shadow-2xl">
            <span className="material-symbols-outlined text-4xl text-white/20">person</span>
          </div>
          <h1 className="text-white tracking-tight text-3xl font-semibold leading-tight text-center pb-2">
            {phoneNumber}
          </h1>
          <p className="text-white/60 text-lg font-medium tracking-wider">
            {status}
          </p>
          {status === "Call Active" && (
            <div className="mt-4">
              <h2 className="text-primary text-xl font-medium tabular-nums tracking-widest animate-pulse">
                {formatTime(callDuration)}
              </h2>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="pb-24 px-8">
          <div className="max-w-md mx-auto flex items-center justify-around">
            <button onClick={toggleMute} className="flex flex-col items-center group">
              <div className={`rounded-full p-5 border transition-colors ${isMuted ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white group-active:bg-white/10'}`}>
                <span className="material-symbols-outlined text-[28px]">
                  {isMuted ? "mic_off" : "mic"}
                </span>
              </div>
            </button>
            <button onClick={handleHangup} className="flex flex-col items-center focus:outline-none focus:ring-4 focus:ring-red-500/50 rounded-full">
              <div className="rounded-full bg-red-500 hover:bg-red-600 p-6 shadow-lg shadow-red-500/30 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-white text-[32px] rotate-[135deg]">call_end</span>
              </div>
            </button>
            <button className="flex flex-col items-center group opacity-50 cursor-not-allowed">
              <div className="rounded-full bg-white/5 p-5 border border-white/10">
                <span className="material-symbols-outlined text-white text-[28px]">volume_up</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- MAIN DIALER UI -----
  return (
    <div className="bg-background-light dark:bg-background-dark text-[#1a1a1a] dark:text-white h-screen w-screen flex flex-col font-display overflow-hidden select-none">

      {/* Top Header */}
      <header className="flex items-center justify-between px-6 pt-6 pb-2">
        <button onClick={() => signOut(auth)} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
          <span className="material-symbols-outlined text-2xl">logout</span>
          <span className="text-sm font-medium">Log Out</span>
        </button>
        <div className="flex flex-col items-end">
          <div className="flex items-center bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
            <div className="w-2 h-2 rounded-full mr-2 animate-pulse bg-primary"></div>
            <span className="text-primary font-bold text-xs tracking-tight leading-none truncate max-w-[120px]">
              {status}
            </span>
          </div>
        </div>
      </header>

      {/* Number Display Screen Area */}
      <div className="flex flex-col items-center justify-end py-6 px-6 h-[160px]">
        <h1 className="text-[#1a1a1a] dark:text-white tracking-widest text-[40px] font-medium leading-tight text-center tabular-nums min-h-[48px]">
          {phoneNumber || <span className="text-gray-300 dark:text-gray-700 select-none">Dial Number</span>}
        </h1>
      </div>

      {/* Dialpad Grid Area */}
      <div className="flex-1 flex flex-col justify-start pt-4 px-10 relative z-10">
        <div className="grid grid-cols-3 gap-y-6 gap-x-8 max-w-[320px] mx-auto w-full">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(key => (
            <button
              key={key}
              onPointerDown={() => handlePointerDown(key)}
              onPointerUp={() => handlePointerUp(key)}
              onPointerLeave={() => handlePointerLeave(key)}
              onContextMenu={(e) => { if (key === "0") e.preventDefault(); }}
              className="flex flex-col aspect-square items-center justify-center rounded-full bg-white/60 dark:bg-white/5 border border-gray-100 dark:border-white/5 shadow-sm active:bg-gray-200 dark:active:bg-white/10 active:scale-95 transition-all text-3xl font-light tabular-nums focus:outline-none"
            >
              <span>{key}</span>
              {key === "0" && <span className="text-[10px] text-gray-400 mt-1 leading-none font-medium text-center">+(hold)</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Action Button Row */}
      <div className="flex items-center justify-center pb-10 px-10 relative z-20">
        <div className="w-1/3 flex justify-center">
          <button
            onClick={handleContacts}
            className="text-primary hover:text-red-700 dark:hover:text-[#ff4d6a] active:scale-90 transition-all focus:outline-none h-16 w-16 rounded-full flex flex-col items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-3xl">contacts</span>
            <span className="text-[10px] font-medium leading-none">Contacts</span>
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <button
            onClick={handleCall}
            disabled={!phoneNumber || status !== "Ready"}
            className="flex size-20 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 hover:bg-[#ff2d55] active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus:ring-4 focus:ring-primary/40"
          >
            <span className="material-symbols-outlined text-white text-3xl font-bold">call</span>
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <button
            onClick={handleBackspace}
            disabled={!phoneNumber}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white active:scale-90 transition-all disabled:opacity-0 focus:outline-none h-16 w-16 rounded-full flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-3xl">backspace</span>
          </button>
        </div>
      </div>
    </div>
  );
}
