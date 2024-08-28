import { pulse } from "./misc";
import { createWorld, type WorldState } from "./ngn";
import { create2D } from "./packages/2d";
import { ColorEasing, createParticleSystem, Particle } from "./packages/emitter";

const { canvas, draw } = create2D({ canvas: { fullscreen: true } });

const particleSystem = createParticleSystem({
  x: canvas.width / 2,
  y: canvas.height / 2,
  canvas,
});

const emitter = particleSystem.createEmitter({
  x: canvas.width / 2,
  y: canvas.height / 2,
  maxParticles: 100,
  rate: 0.1,
  lifetime: 1000,
  lifetimeVariation: 0.2,
  size: 20,
  sizeVariation: 10,
  colorStart: ["#FF0000", "#ff5100"],
  colorEnd: "#222222",
  colorEasing: ColorEasing.EASE_IN,
  fadeOutEasing: ColorEasing.EASE_OUT,
  speed: 0.1,
  speedVariation: 1,
  angle: 0,
  spread: 0.75,
  gravity: { x: 0, y: 0 },
  canvas,
  burst: false,

  onInit: (particle: Particle, state: WorldState) => {
    particle.x += Math.random() < 0.5 ? -6 : 6;
    particle.y += Math.random() < 0.5 ? -6 : 6;

    if (!(Math.random() < 0.02)) {
      return;
    }

    particle.size = 15;
    particle.speedY = -0.3;
    particle.lifetime = 1000;
    particle.colorEnd = "#ff0000";

    particle.onRemove = () => {
      particleSystem.createEmitter({
        x: particle.x,
        y: particle.y,
        maxParticles: 3,
        lifetimeVariation: 0.2,
        size: 3,
        sizeVariation: 2,
        colorStart: ["#FF0000", "#ff5100"],
        colorEnd: "#222222",
        colorEasing: ColorEasing.EASE_IN,
        fadeOutEasing: ColorEasing.EASE_OUT,
        speed: 0.02,
        speedVariation: 1,
        spread: 6,
        angle: 180,
        canvas,
        burst: true,
      });
    };

    particle.onUpdate = () => {
      particle.size = Math.max(0, particle.size + 0.25);
    };
  },
  onUpdate: (particle: Particle, state: WorldState) => {
    particle.size = Math.max(0, particle.size - 0.35);
    const v = pulse(state.time.elapsed, 0.25, -1, 1);
    particle.x += v * 1;
  },
  onRemove: (particle: Particle, state: WorldState) => {},
});

const { addSystem, start, step, defineMain } = createWorld();

const clearCanvasSystem = () => {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#111";
  context.fillRect(0, 0, canvas.width, canvas.height);
};

const fpsDrawSystem = (state: WorldState) => {
  draw.text({ x: 10, y: 20 }, `FPS: ${state.time.fps.toFixed(2)}`, "white");
};

const particleCountSystem = (state: WorldState) => {
  draw.text({ x: 10, y: 40 }, `Particle count: ${particleSystem.numParticles}`, "white");
};

const particlePositionSystem = (state: WorldState) => {
  const { time } = state;
  const xPos = pulse(time.elapsed, 0.25, canvas.width / 2 - 100, canvas.width / 2 + 100);
  // const yPos = pulse(time.elapsed, 0.25, canvas.height / 2 - 100, canvas.height / 2 + 100);
  emitter.x = xPos;
  // emitter.y = yPos;
};

addSystem(clearCanvasSystem, fpsDrawSystem, particleCountSystem, particlePositionSystem, particleSystem);

defineMain(() => {
  step();
});

start();

const container = document.createElement("div");
container.style.position = "fixed";
container.style.bottom = "0";
container.style.left = "0";
container.style.padding = "10px";
container.style.display = "flex";
container.style.justifyContent = "space-between";
container.style.alignItems = "center";
document.body.appendChild(container);

const pauseButton = document.createElement("button");
pauseButton.innerText = "Pause";
pauseButton.onclick = () => {
  particleSystem.pause();
};
container.appendChild(pauseButton);

const startButton = document.createElement("button");
startButton.innerText = "Start";
startButton.style.marginLeft = "5px";
startButton.onclick = () => {
  particleSystem.start();
};
container.appendChild(startButton);

const destroyButton = document.createElement("button");
destroyButton.innerText = "Destroy";
destroyButton.style.marginLeft = "5px";
destroyButton.onclick = () => {
  particleSystem.destroy();
};
container.appendChild(destroyButton);
