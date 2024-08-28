export type CreateCanvasOptions = Partial<{
  width: number;
  height: number;
  fullscreen: boolean;
  target: HTMLElement;
}>;

export const createCanvas = (options: CreateCanvasOptions) => {
  const canvas = document.createElement("canvas");
  const { target, fullscreen } = options;
  const { body } = window.document;

  if (target && fullscreen) {
    options.target = null;
  } else if (!target && !fullscreen) {
    options.fullscreen = true;
  }

  if (fullscreen) {
    Object.assign(canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
    });
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    body.appendChild(canvas);
    Object.assign(body.style, {
      margin: "0",
      padding: "0",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });
  }

  if (target) {
    target.appendChild(canvas);
    target.style.overflow = "hidden";
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const existingMeta = window.document.querySelector(`meta[name="viewport"]`);
  if (existingMeta) {
    Object.assign(existingMeta, {
      content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0",
    });
  } else {
    const meta = Object.assign(window.document.createElement("meta"), {
      name: "viewport",
      content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0",
    });
    window.document.head.appendChild(meta);
  }

  return canvas;
};
