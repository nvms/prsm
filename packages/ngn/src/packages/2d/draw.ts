export type Vector2 = {
  x: number;
  y: number;
};

const fastRound = (num: number): number => ~~(0.5 + num);

const fastRoundVector2 = (v: Vector2): Vector2 => ({
  x: fastRound(v.x),
  y: fastRound(v.y),
});

export const createDraw = (context: CanvasRenderingContext2D) => {
  const text = (v: Vector2, text: string, color: string = "black", size: number = 16) => {
    v = fastRoundVector2(v);
    context.save();
    context.fillStyle = color;
    context.font = `${size}px sans-serif`;
    context.fillText(text, v.x, v.y);
    context.restore();
  };

  const line = (from: Vector2, to: Vector2, color: string = "black", lineWidth: number = 1) => {
    from = fastRoundVector2(from);
    to = fastRoundVector2(to);
    context.save();
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = color; // Use the color parameter
    context.lineWidth = lineWidth;
    context.stroke();
    context.closePath();
    context.restore();
  };

  const rectangle = (pos: Vector2, dimensions: Vector2, color: string = "black", lineWidth: number = 1) => {
    pos = fastRoundVector2(pos);
    dimensions = fastRoundVector2(dimensions);
    context.save();
    context.beginPath();
    context.rect(pos.x, pos.y, dimensions.x, dimensions.y);
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();
    context.closePath();
    context.restore();
  };

  const circle = (pos: Vector2, radius: number = 25, color: string = "black", lineWidth: number = 1) => {
    pos = fastRoundVector2(pos);
    context.save();
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.arc(pos.x, pos.y, radius, 0, Math.PI * 2, true);
    context.stroke();
    context.closePath();
    context.restore();
  };

  return {
    text,
    line,
    rectangle,
    circle,
  };
};
