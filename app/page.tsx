"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    // Navigate to Auth screen after 2.5 seconds
    const timer = setTimeout(() => {
      router.push("/auth");
    }, 2500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center relative bg-primary overflow-hidden">
      {/* iOS Status Bar Placeholder (Visual only) */}
      <div className="absolute top-0 w-full px-8 pt-4 flex justify-between items-center opacity-80">
        <span className="text-[14px] font-semibold text-white/80">9:41</span>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-white/80">signal_cellular_4_bar</span>
          <span className="material-symbols-outlined text-[18px] text-white/80">wifi</span>
          <span className="material-symbols-outlined text-[20px] text-white/80">battery_full</span>
        </div>
      </div>

      {/* Main Logo Centerpiece */}
      <div className="flex items-center justify-center space-x-3 transition-transform duration-1000 scale-110">
        {/* The Dot Component */}
        <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce"></div>
        {/* Headline Text Component */}
        <h1 className="text-white text-[36px] font-bold tracking-tight leading-none">
          WDF Call
        </h1>
      </div>

      {/* iOS Home Indicator Placeholder (Visual only) */}
      <div className="absolute bottom-2 w-full flex justify-center">
        <div className="w-32 h-1.5 bg-white/20 rounded-full"></div>
      </div>
    </div>
  );
}
