"use client";

import { useCallback, useEffect, useState } from "react";
import { getCourtVoiceSettings } from "@/lib/courtVoiceSettings";

function canUseSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

export function useCourtVoice() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!canUseSpeech()) return;

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  return useCallback((text: string): boolean => {
    if (!canUseSpeech()) return false;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const settings = getCourtVoiceSettings(
      voices.length > 0 ? voices : window.speechSynthesis.getVoices()
    );

    utterance.lang = settings.lang;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    if (settings.voice) utterance.voice = settings.voice;

    window.speechSynthesis.speak(utterance);
    return true;
  }, [voices]);
}
