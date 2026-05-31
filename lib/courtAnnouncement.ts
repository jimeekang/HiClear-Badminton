import type { Court, Player } from "@/types";

function getName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? "";
}

function getCourtLabel(name: string): string {
  const trimmed = name.trim();
  const code = trimmed.replace(/^코트\s*/i, "").trim();

  const vipCode = code.match(/^vip\s*([12])$/i)?.[1];
  if (vipCode) return `VIP ${vipCode === "1" ? "one" : "two"} 코트`;

  const numericCode = code.match(/^(\d+)\s*(?:번)?$/)?.[1];
  if (numericCode) return `${toKoreanNumber(Number(numericCode))}번 코트`;

  if (code.length > 0) return `${code} 코트`;
  return trimmed;
}

function toKoreanNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return String(value);

  const units = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const places = [
    { value: 100, label: "백" },
    { value: 10, label: "십" },
  ];

  let rest = value;
  let text = "";

  for (const place of places) {
    const digit = Math.floor(rest / place.value);
    if (digit > 0) text += `${digit === 1 ? "" : units[digit]}${place.label}`;
    rest %= place.value;
  }

  if (rest > 0) text += units[rest];
  return text || units[value] || String(value);
}

export function getCourtAnnouncement(court: Court, players: Player[]): string | null {
  if (court.teamA.length !== 2 || court.teamB.length !== 2) return null;

  const names = [...court.teamA, ...court.teamB].map((id) => getName(players, id));
  if (names.some((name) => name.length === 0)) return null;

  return `${getCourtLabel(court.name)}, ${names.join(", ")} 들어가세요.`;
}

export function getCourtsAnnouncement(courts: Court[], players: Player[]): string | null {
  const announcements = courts
    .map((court) => getCourtAnnouncement(court, players))
    .filter((text): text is string => text !== null);

  if (announcements.length === 0) return null;
  return `전체 코트 안내입니다. ${announcements.join(" ")}`;
}
