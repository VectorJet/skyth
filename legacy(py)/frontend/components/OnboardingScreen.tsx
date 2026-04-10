"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Logo } from "./icons";
import { ArrowRight, Sparkles } from "lucide-react";

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("");
  const { onboardUser } = useUser();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFinish = async () => {
    setIsSubmitting(true);
    // Use the nickname or fallback to "Friend" (though input requires value)
    const finalName = nickname.trim() || "Friend";
    await onboardUser(finalName);
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-color p-4">
      <Card className="w-full max-w-lg border-border-color bg-surface-color shadow-2xl relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent-color/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <CardHeader className="text-center space-y-4 pt-10">
            <div className="mx-auto w-16 h-16 bg-surface border border-border-color rounded-2xl flex items-center justify-center shadow-lg mb-2">
              <Logo className="w-10 h-10 fill-accent-color" />
            </div>
            <CardTitle className="text-3xl font-bold text-primary-text">Welcome to Skyth</CardTitle>
            <CardDescription className="text-lg">Let's set up your personal AI workspace.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 py-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nickname" className="text-base">What should I call you?</Label>
                <Input
                  id="nickname"
                  placeholder="Your Name or Nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="text-lg h-12 bg-input-bg border-border-color focus-visible:ring-accent-color"
                  autoFocus
                />
                <p className="text-xs text-secondary-text">This helps the AI personalize its responses to you.</p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end pt-4 pb-8">
            <Button 
              onClick={handleFinish} 
              disabled={!nickname.trim() || isSubmitting}
              className="w-full sm:w-auto text-base px-8 h-12 rounded-full shadow-lg hover:shadow-accent-color/20 transition-all"
            >
              {isSubmitting ? "Setting up..." : "Get Started"} 
              {!isSubmitting && <ArrowRight className="ml-2 w-5 h-5" />}
            </Button>
          </CardFooter>
        </div>
      </Card>
    </div>
  );
}