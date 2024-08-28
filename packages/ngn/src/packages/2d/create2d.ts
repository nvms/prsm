import { createCanvas, CreateCanvasOptions } from "./canvas";
import { createDraw } from "./draw";

type Create2DOptions = Partial<{
  canvas: CreateCanvasOptions;
}>;

export const create2D = (options: Create2DOptions) => {
  const { width = 800, height = 600, fullscreen = false, target = null } = options.canvas;
  const canvas = createCanvas({ width, height, fullscreen, target });
  const context = canvas.getContext("2d");
  const draw = createDraw(context);

  const onWindowResize = () => {
    if (fullscreen) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      return;
    }

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  };

  window.addEventListener("resize", onWindowResize);

  const destroy = () => {
    window.removeEventListener("resize", onWindowResize);
    canvas.parentElement.removeChild(canvas);
  };

  return { canvas, context, draw, destroy };
};
