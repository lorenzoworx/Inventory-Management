import { useEffect, useRef, type RefObject } from "react";
import { storeListSchema, type Transfer } from "@ims/contracts";
import { useResource } from "./use-resource";

type RouteTransfer = Pick<
  Transfer,
  | "id"
  | "sourceId"
  | "destinationId"
  | "number"
  | "sourceName"
  | "destinationName"
  | "status"
  | "totalUnits"
>;
type Status = Transfer["status"];
export type JourneyHistory = RefObject<Map<number, Status>>;
const position: Record<Status, number> = {
  PENDING: 130,
  IN_TRANSIT: 420,
  RECEIVED: 710,
  CANCELLED: 130,
};
const explanation: Record<Status, string> = {
  PENDING: "At source · stock remains available until dispatch",
  IN_TRANSIT: "On the way · excluded from stock on hand at both locations",
  RECEIVED: "At destination · added to destination stock on hand",
  CANCELLED: "Cancelled · no stock moved",
};
export function Building({ warehouse = false }: { warehouse?: boolean }) {
  return (
    <svg
      viewBox="0 0 90 70"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d={
          warehouse
            ? "M8 28L45 5l37 23v37H8Z"
            : "M12 28h66v37H12ZM7 28l8-18h60l8 18Z"
        }
      />
      <path
        d={
          warehouse
            ? "M25 65V32h40v33M25 42h40M25 51h40"
            : "M24 65V40h18v25m13-25h12v14H55Z"
        }
      />
    </svg>
  );
}
export function TransferJourney({
  transfer,
  history,
}: {
  transfer: RouteTransfer;
  history: JourneyHistory;
}) {
  const locations = useResource("/api/stores?pageSize=100", storeListSchema);
  const stores =
    locations.state.phase === "ready" ? locations.state.data.items : [];
  const parcel = useRef<SVGGElement>(null);
  useEffect(() => {
    const previous = history.current.get(transfer.id);
    history.current.set(transfer.id, transfer.status);
    if (history.current.size > 200)
      history.current.delete(history.current.keys().next().value!);
    if (
      previous &&
      previous !== transfer.status &&
      previous !== "CANCELLED" &&
      transfer.status !== "CANCELLED" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      parcel.current?.animate?.(
        [
          {
            transform: `translateX(${position[previous] - position[transfer.status]}px)`,
          },
          { transform: "translateX(0)" },
        ],
        { duration: 600, easing: "ease-out" },
      );
    }
  }, [transfer.id, transfer.status, history]);
  const x = position[transfer.status];
  return (
    <section
      className="route-board"
      aria-label={`Route for ${transfer.number}`}
    >
      <div className="route-heading">
        <h2>From shelf to shelf</h2>
        <span>Route diagram · not a geographic map</span>
      </div>
      <div className="route-endpoints">
        <div>
          <Building
            warehouse={
              stores.find((store) => store.id === transfer.sourceId)?.kind ===
              "WAREHOUSE"
            }
          />
          <strong>{transfer.sourceName}</strong>
          <span>Source</span>
        </div>
        <span className="route-units">
          {transfer.totalUnits} units
          <br />
          <small>{transfer.number}</small>
        </span>
        <div>
          <Building
            warehouse={
              stores.find((store) => store.id === transfer.destinationId)
                ?.kind === "WAREHOUSE"
            }
          />
          <strong>{transfer.destinationName}</strong>
          <span>Destination</span>
        </div>
      </div>
      <svg
        className="route-track"
        viewBox="0 0 840 90"
        role="img"
        aria-label={explanation[transfer.status]}
      >
        <path
          d="M130 45H710"
          stroke="#9aa99e"
          strokeWidth="2"
          strokeDasharray="5 7"
        />
        <circle cx="130" cy="45" r="6" fill="#2f5d46" />
        <circle cx="710" cy="45" r="6" fill="#2f5d46" />
        {transfer.status !== "CANCELLED" && (
          <g ref={parcel} className="route-parcel">
            <rect
              x={x - 23}
              y="22"
              width="46"
              height="46"
              rx="2"
              fill="#c9a27e"
              stroke="#73563c"
            />
            <path d={`M${x} 22v46m-23-34h46`} stroke="#73563c" />
            <rect x={x - 16} y="44" width="16" height="12" fill="#fffdf7" />
          </g>
        )}
      </svg>
      <p className={`route-caption state-${transfer.status.toLowerCase()}`}>
        {explanation[transfer.status]}
      </p>
    </section>
  );
}
