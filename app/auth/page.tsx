"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

export default function Auth() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        // You would typically save fullName and phoneNumber to Firestore here
      }
      router.push("/dialer");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-x-hidden border-x border-gray-100 dark:border-gray-800 shadow-sm bg-background-light dark:bg-background-dark font-display text-[#1a1a1a] dark:text-white transition-colors duration-200">
      {/* iOS Status Bar Spacer */}
      <div className="h-[44px] w-full"></div>

      {/* Top App Bar */}
      <div className="flex items-center px-4 py-2 justify-between">
        <button className="text-[#1a1a1a] dark:text-white flex size-10 shrink-0 items-center justify-start hover:opacity-70 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>arrow_back_ios</span>
        </button>
        <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">Get Started</h2>
      </div>

      {/* Content Area */}
      <div className="flex flex-col flex-1 px-6 pt-12">
        {/* Welcome Text */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {isLogin ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-[#b33a3a] dark:text-[#ff4d6a]/70 text-base">
            {isLogin ? "Sign in to your virtual number." : "Sign up to get your South African virtual number."}
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            <span className="block sm:inline text-sm">{error}</span>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div className="flex flex-col w-full">
              <p className="text-[#1a1a1a] dark:text-white text-sm font-medium leading-normal pb-2">Full Name</p>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="flex w-full rounded-lg text-[#1a1a1a] dark:text-white focus:outline-0 focus:ring-1 focus:ring-primary border border-[#f0d2d2] dark:border-gray-700 bg-white dark:bg-[#241010] h-14 placeholder:text-[#b33a3a]/50 p-4 text-base transition-all"
                placeholder="John Doe"
                type="text"
              />
            </div>
          )}

          <div className="flex flex-col w-full">
            <p className="text-[#1a1a1a] dark:text-white text-sm font-medium leading-normal pb-2">Email Address</p>
            <input
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex w-full rounded-lg text-[#1a1a1a] dark:text-white focus:outline-0 focus:ring-1 focus:ring-primary border border-[#f0d2d2] dark:border-gray-700 bg-white dark:bg-[#241010] h-14 placeholder:text-[#b33a3a]/50 p-4 text-base transition-all"
              placeholder="name@example.com"
              type="email"
            />
          </div>

          <div className="flex flex-col w-full">
            <p className="text-[#1a1a1a] dark:text-white text-sm font-medium leading-normal pb-2">Password</p>
            <input
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex w-full rounded-lg text-[#1a1a1a] dark:text-white focus:outline-0 focus:ring-1 focus:ring-primary border border-[#f0d2d2] dark:border-gray-700 bg-white dark:bg-[#241010] h-14 placeholder:text-[#b33a3a]/50 p-4 text-base transition-all"
              placeholder="••••••••"
              type="password"
            />
          </div>

          {!isLogin && (
            <div className="flex flex-col w-full">
              <p className="text-[#1a1a1a] dark:text-white text-sm font-medium leading-normal pb-2">Phone Number</p>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-[#1a1a1a] dark:text-white font-medium">+27</span>
                <input
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="flex w-full rounded-lg text-[#1a1a1a] dark:text-white focus:outline-0 focus:ring-1 focus:ring-primary border border-[#f0d2d2] dark:border-gray-700 bg-white dark:bg-[#241010] h-14 placeholder:text-[#b33a3a]/50 pl-14 p-4 text-base transition-all"
                  placeholder="00 000 0000"
                  type="tel"
                />
              </div>
            </div>
          )}

          {!isLogin && (
            <div className="mt-6">
              <p className="text-[#b33a3a] text-xs font-normal leading-relaxed text-center">
                  By signing up, you agree to our
                  <a className="underline hover:text-primary mx-1" href="#">Terms of Service</a> and
                  <a className="underline hover:text-primary mx-1" href="#">Privacy Policy</a>.
              </p>
            </div>
          )}

          <div className="mt-8">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary py-4 rounded-xl flex items-center justify-center group transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-white text-lg font-bold">
                {loading ? "Please wait..." : (isLogin ? "Log In" : "Create Account")}
              </span>
            </button>

            <div className="mt-6 text-center">
              <p className="text-sm text-[#b33a3a]">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[#1a1a1a] dark:text-white font-semibold hover:underline"
                >
                  {isLogin ? "Sign Up" : "Log In"}
                </button>
              </p>
            </div>
          </div>
        </form>
      </div>

      {/* iOS Home Indicator Spacer */}
      <div className="h-[34px] w-full"></div>
    </div>
  );
}
