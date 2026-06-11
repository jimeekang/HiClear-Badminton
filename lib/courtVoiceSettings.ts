export type CourtSpeechVoice = {
  name: string;
  lang: string;
  localService?: boolean;
};

type CourtVoiceSettings<T extends CourtSpeechVoice> = {
  lang: "ko-KR";
  rate: number;
  pitch: number;
  volume: number;
  voice: T | null;
};

const KOREAN_NAME_PATTERN = /korean|korea|한국|대한민국/i;

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace("_", "-");
}

function isKoreanVoice(voice: CourtSpeechVoice): boolean {
  const lang = normalizeLang(voice.lang);
  return lang === "ko" || lang.startsWith("ko-");
}

function scoreVoice(voice: CourtSpeechVoice): number {
  const name = voice.name.toLowerCase();
  const lang = normalizeLang(voice.lang);
  let score = 0;

  if (lang === "ko-kr") score += 50;
  else if (lang.startsWith("ko")) score += 40;
  if (/natural|online|neural/.test(name)) score += 30;
  if (/google|microsoft/.test(name)) score += 15;
  if (/sunhi|heami|korean|korea/.test(name) || /한국|대한민국/.test(voice.name)) score += 10;
  if (voice.localService === false) score += 5;

  return score;
}

export function selectNaturalKoreanVoice<T extends CourtSpeechVoice>(voices: readonly T[]): T | null {
  const koreanVoices = voices.filter(isKoreanVoice);
  if (koreanVoices.length === 0) return null;

  return [...koreanVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

export function getCourtVoiceSettings<T extends CourtSpeechVoice>(
  voices: readonly T[] = []
): CourtVoiceSettings<T> {
  return {
    lang: "ko-KR",
    rate: 0.78,
    pitch: 1,
    volume: 1,
    voice: selectNaturalKoreanVoice(voices),
  };
}
