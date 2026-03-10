"use client";
import { useEffect, useRef, useState } from "react";
import { QueueEntry, Player } from "@/types";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { removePlayersFromQueue } from "@/lib/queue";

interface Props {
  queue: QueueEntry[];
  players: Player[];
  onReorder: (reordered: QueueEntry[]) => void;
  emptyText?: string;
}

function SortableItem({
  index,
  entry,
  player,
  onRemove,
}: {
  index: number;
  entry: QueueEntry;
  player?: Player;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        height: 64,
      }}
      className="flex items-center gap-2 bg-white rounded-xl shadow border border-gray-100"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center px-3 text-gray-300 cursor-grab active:cursor-grabbing select-none h-full"
        style={{ touchAction: "none" }}
      >
        <svg width="16" height="24" viewBox="0 0 16 24" fill="currentColor">
          <circle cx="5" cy="6" r="2" /><circle cx="11" cy="6" r="2" />
          <circle cx="5" cy="12" r="2" /><circle cx="11" cy="12" r="2" />
          <circle cx="5" cy="18" r="2" /><circle cx="11" cy="18" r="2" />
        </svg>
      </div>

      <span className="text-gray-400 font-bold w-7 text-lg text-center">{index + 1}</span>
      <span className="flex-1 text-xl font-semibold truncate">{player?.name ?? "..."}</span>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="flex items-center justify-center w-10 h-full text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-r-xl transition-colors text-xl"
      >
        ✕
      </button>
    </div>
  );
}

export default function QueueList({ queue, players, onReorder, emptyText }: Props) {
  const [localQueue, setLocalQueue] = useState(queue);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) {
      setLocalQueue(queue);
    }
  }, [queue]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );
  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const handleDragEnd = (event: DragEndEvent) => {
    draggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localQueue.findIndex((e) => e.id === active.id);
    const newIndex = localQueue.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(localQueue, oldIndex, newIndex);

    setLocalQueue(reordered);
    onReorder(reordered);
  };

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => { draggingRef.current = true; }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { draggingRef.current = false; }}
      >
        <SortableContext items={localQueue.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {localQueue.map((entry, idx) => (
            <SortableItem
              key={entry.id}
              index={idx}
              entry={entry}
              player={getPlayer(entry.playerId)}
              onRemove={() => removePlayersFromQueue([entry.id])}
            />
          ))}
        </SortableContext>
      </DndContext>
      {localQueue.length === 0 && (
        <div className="text-center text-gray-400 py-8 text-xl">
          {emptyText ?? "대기열이 비어 있습니다"}
        </div>
      )}
    </div>
  );
}
