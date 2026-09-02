"use client";
import { useState } from "react";
import { Player } from "@/types";
import { addPlayer } from "@/lib/db";
import { runFirestoreSessionMutation } from "@/lib/firestoreSessionReset";

interface Props {
  players: Player[];
}

export default function PlayerList({ players }: Props) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    const request = runFirestoreSessionMutation(() => addPlayer(name.trim(), gender));
    if (!request) return;
    setLoading(true);
    await request;
    setName("");
    setLoading(false);
  };

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 border border-gray-300 rounded-xl px-4 text-2xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          style={{ height: 64 }}
        />
        <button
          onClick={() => setGender(gender === "M" ? "F" : "M")}
          className={`px-5 rounded-xl text-2xl font-bold ${gender === "M" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"}`}
          style={{ height: 64 }}
        >
          {gender}
        </button>
        <button
          onClick={handleAdd}
          disabled={loading}
          className="bg-blue-500 text-white px-6 rounded-xl text-2xl font-bold disabled:opacity-50"
          style={{ height: 64 }}
        >
          등록
        </button>
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow border border-gray-100"
          >
            <span className="text-2xl font-semibold">{p.name}</span>
            <span className="text-xl text-gray-500">
              {p.gender} · {p.gamesPlayed}게임
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
