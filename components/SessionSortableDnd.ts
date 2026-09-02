"use client";

import { createElement, type ComponentProps, type ReactNode } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { getSessionDragState } from "../lib/sessionReset.ts";

type DndContextProps = ComponentProps<typeof DndContext>;
type SortableContextProps = ComponentProps<typeof SortableContext>;

type Props = Omit<DndContextProps, "children" | "sensors"> & {
  children: ReactNode;
  disabled: boolean;
  items: SortableContextProps["items"];
  sensors: DndContextProps["sensors"];
  strategy?: SortableContextProps["strategy"];
};

export default function SessionSortableDnd({
  children,
  disabled,
  items,
  sensors,
  strategy,
  ...dndProps
}: Props) {
  const dragState = getSessionDragState(sensors, disabled);

  return createElement(
    DndContext,
    { ...dndProps, sensors: dragState.sensors },
    createElement(
      SortableContext,
      { items, strategy, disabled: dragState.disabled, children }
    )
  );
}
