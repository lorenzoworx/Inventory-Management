export function BinGauge({
  quantity,
  reorderPoint,
}: {
  quantity: number;
  reorderPoint: number;
}) {
  const scale = Math.max(quantity, reorderPoint * 2, 1);
  return (
    <span
      className="bin-gauge"
      role="img"
      aria-label={`${quantity} units on hand; reorder at ${reorderPoint}; scale 0 to ${scale} units`}
      title={`Scale: 0–${scale} units. Marker: reorder point.`}
    >
      <span style={{ width: `${(quantity / scale) * 100}%` }} />
      <i style={{ left: `${(reorderPoint / scale) * 100}%` }} />
    </span>
  );
}
