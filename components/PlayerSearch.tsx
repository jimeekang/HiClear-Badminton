"use client";
import { useState } from "react";
import { Player } from "@/types";
import { addPlayerToQueue } from "@/lib/queue";

interface Props {
  players: Player[];
  queuePlayerIds: string[];
}

export default function PlayerSearch({ players, queuePlayerIds }: Props) {
  const [search, setSearch] = useState("");

  const filtered = players.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) && !queuePlayerIds.includes(p.id)
  );

  return (
    <div>
      <input
        type="text"
        placeholder="이름 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow border border-gray-100"
          >
            <span className="text-2xl">
              {p.name} <span className="text-gray-400">({p.gender})</span>
            </span>
            <button
              onClick={() => addPlayerToQueue(p.id)}
              className="bg-blue-500 text-white px-4 rounded-xl text-xl font-bold"
              style={{ height: 48 }}
            >
              추가
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
