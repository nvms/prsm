import { WorldState } from "../../ngn";

export type Particle = {
  x: number;
  y: number;
  size: number;
  color: string;
  colorStart: string;
  colorEnd: string;
  lifetime: number;
  speedX: number;
  speedY: number;
  scaleX: number;
  scaleY: number;
  onInit?: (particle: Particle, state: WorldState) => void;
  onRemove?: (particle: Particle, state: WorldState) => void;
  onUpdate?: (particle: Particle, state: WorldState) => void;
};

export enum ColorEasing {
  LINEAR = "linear",
  EASE_IN = "easeIn",
  EASE_OUT = "easeOut",
  EASE_IN_OUT = "easeInOut",
}

export type FadeEasing = ColorEasing;

type BlendMode =
  | "color"
  | "color-burn"
  | "color-dodge"
  | "copy"
  | "darken"
  | "destination-atop"
  | "destination-in"
  | "destination-out"
  | "destination-over"
  | "difference"
  | "exclusion"
  | "hard-light"
  | "hue"
  | "lighten"
  | "lighter"
  | "luminosity"
  | "multiply"
  | "overlay"
  | "saturation"
  | "screen"
  | "soft-light"
  | "source-atop"
  | "source-in"
  | "source-out"
  | "source-over"
  | "xor";

export type ParticleEmitterOptions = {
  x?: number; // X position
  y?: number; // Y position
  maxParticles?: number; // Max number of particles
  rate?: number; // Particles per second
  lifetime?: number; // Lifetime of each particle
  lifetimeVariation?: number; // Variation in lifetime
  size?: number; // Size of each particle
  sizeVariation?: number; // Variation in size
  colorStart?: string | string[]; // Start color
  colorEnd?: string | string[]; // End color
  colorEasing?: ColorEasing; // Easing function for color
  fadeOutEasing?: FadeEasing;
  speed?: number; // Speed of each particle
  speedVariation?: number; // Variation in speed
  angle?: number; // Angle of emission
  spread?: number; // Spread of emission
  gravity?: { x: number; y: number }; // Gravity affecting the particles
  blendMode?: BlendMode; // Blend mode
  canvas: HTMLCanvasElement; // Canvas to draw on
  burst?: boolean; // If true, emit all particles at once and then stop
  /** Per-particle initialization callback. */
  onInit?: (particle: Particle, state: WorldState) => void; // Callback for particle initialization
  /** Per-particle update callback. */
  onUpdate?: (particle: Particle, state: WorldState) => void; // Callback for particle update
  /** Per-particle removal callback. */
  onRemove?: (particle: Particle, state: WorldState) => void; // Callback for particle removal
};

const getDefaultParticleEmitterOptions = (opts: Partial<ParticleEmitterOptions>): ParticleEmitterOptions => ({
  ...opts,
  x: opts.x ?? 0,
  y: opts.y ?? 0,
  maxParticles: opts.maxParticles ?? 100,
  rate: opts.rate ?? 1,
  lifetime: opts.lifetime ?? 1000,
  lifetimeVariation: opts.lifetimeVariation ?? 0,
  size: opts.size ?? 5,
  sizeVariation: opts.sizeVariation ?? 0,
  colorStart: opts.colorStart ?? "#000000",
  colorEnd: opts.colorEnd ?? "#000000",
  colorEasing: opts.colorEasing ?? ColorEasing.LINEAR,
  angle: opts.angle ?? 0,
  spread: opts.spread ?? 0,
  gravity: opts.gravity ?? { x: 0, y: 0 },
  speed: opts.speed ?? 0.1,
  speedVariation: opts.speedVariation ?? 0,
  canvas: opts.canvas,
  burst: opts.burst ?? false,
});

export type ParticleEmitter = {
  particles: Particle[];
  update: (state: WorldState) => void;
  destroy: () => void;
  pause: () => void;
  resume: () => void;
  x: number;
  y: number;
};

export type ParticleSystemOptions = {
  x: number;
  y: number;
  canvas: HTMLCanvasElement;
  // A property to determine whether or not it starts immediately
  start?: boolean;
};

const interpolateColor = (colorStart: string, colorEnd: string, factor: number, easing: ColorEasing): string => {
  switch (easing) {
    case ColorEasing.EASE_IN:
      factor = Math.pow(factor, 2);
      break;
    case ColorEasing.EASE_OUT:
      factor = 1 - Math.pow(1 - factor, 2);
      break;
    case ColorEasing.EASE_IN_OUT:
      if (factor < 0.5) {
        factor = 2 * Math.pow(factor, 2);
      } else {
        factor = 1 - 2 * Math.pow(1 - factor, 2);
      }
      break;
    case ColorEasing.LINEAR:
    default:
      // No adjustment needed for linear
      break;
  }

  // Assuming colorStart and colorEnd are in the format "#RRGGBB"
  const color1 = parseInt(colorStart.slice(1), 16);
  const color2 = parseInt(colorEnd.slice(1), 16);

  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const hexToRgb = (hex: string): string => {
  const color = parseInt(hex.slice(1), 16);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `${r}, ${g}, ${b}`;
};

export const createParticleEmitter = (opts: ParticleEmitterOptions): ParticleEmitter => {
  opts = getDefaultParticleEmitterOptions(opts);
  const particles = [];
  let timeSinceLastEmission = 0;
  const emissionInterval = 1 / opts.rate;
  const lifetimeVariation = opts.lifetimeVariation ?? 0;
  const context = opts.canvas.getContext("2d");
  const angleInRadians = opts.angle * (Math.PI / 180);
  let dead = false;
  let paused = false;

  const update = (state: WorldState) => {
    if (dead) return;

    context.globalCompositeOperation = opts.blendMode ?? "source-over";

    const { loopDelta } = state.time;

    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      const lifeFactor = particle.lifetime / opts.lifetime;
      let opacity = 1;

      particle.color = interpolateColor(particle.colorStart, particle.colorEnd, 1 - lifeFactor, opts.colorEasing);

      if (opts.fadeOutEasing) {
        switch (opts.fadeOutEasing) {
          case ColorEasing.EASE_IN:
            opacity = Math.pow(lifeFactor, 2);
            break;
          case ColorEasing.EASE_OUT:
            opacity = 1 - Math.pow(1 - lifeFactor, 2);
            break;
          case ColorEasing.EASE_IN_OUT:
            if (lifeFactor < 0.5) {
              opacity = 2 * Math.pow(lifeFactor, 2);
            } else {
              opacity = 1 - 2 * Math.pow(1 - lifeFactor, 2);
            }
            break;
          case ColorEasing.LINEAR:
          default:
            opacity = lifeFactor;
            break;
        }
      }

      if (!paused) {
        particle.x += particle.speedX * loopDelta;
        particle.y += particle.speedY * loopDelta;

        particle.speedX += (opts.gravity.x * loopDelta) / 1000;
        particle.speedY += (opts.gravity.y * loopDelta) / 1000;

        particle.lifetime -= state.time.loopDelta;

        if (opts.onUpdate) {
          opts.onUpdate(particle, state);
        }

        if (particle.onUpdate) {
          particle.onUpdate(particle, state);
        }
      }

      if (particle.lifetime <= 0) {
        if (opts.onRemove) {
          opts.onRemove(particle, state);
        }

        if (particle.onRemove) {
          particle.onRemove(particle, state);
        }

        particles.splice(i, 1);
      } else {
        context.fillStyle = `rgba(${hexToRgb(particle.color)}, ${opacity})`;
        context.beginPath();
        // context.arc(particle.x * particle.scaleX, particle.y * particle.scaleY, particle.size, 0, Math.PI * 2);
        // draw a rectangel instead:
        context.rect(particle.x * particle.scaleX, particle.y * particle.scaleY, particle.size, particle.size);
        context.closePath();
        context.fill();
      }
    }

    const emitParticle = () => {
      const lifetimeVariationAmount = lifetimeVariation ? opts.lifetime * lifetimeVariation * Math.random() : 0;
      const particleLifetime = opts.lifetime + lifetimeVariationAmount * (Math.random() < 0.5 ? -1 : 1);
      const colorStart = Array.isArray(opts.colorStart) ? opts.colorStart[Math.floor(Math.random() * opts.colorStart.length)] : opts.colorStart;
      const colorEnd = Array.isArray(opts.colorEnd) ? opts.colorEnd[Math.floor(Math.random() * opts.colorEnd.length)] : opts.colorEnd;
      const particle = spawnParticle({
        x: opts.x,
        y: opts.y,
        colorStart: colorStart,
        colorEnd: colorEnd,
        color: colorStart,
        lifetime: particleLifetime,
        size: Math.max(0, opts.size + (Math.random() - 0.5) * opts.sizeVariation),
        speedX: opts.speed * (Math.sin(angleInRadians) + (Math.random() - 0.5) * opts.spread),
        speedY: -opts.speed * (Math.cos(angleInRadians) + (Math.random() - 0.5) * opts.spread),
        scaleX: 1,
        scaleY: 1,
      });

      if (opts.onInit) {
        opts.onInit(particle, state);
      }

      if (particle.onInit) {
        particle.onInit(particle, state);
      }
    };

    if (!paused) {
      if (opts.burst && timeSinceLastEmission === 0) {
        for (let i = 0; i < opts.maxParticles; i++) {
          emitParticle();
        }

        timeSinceLastEmission = -1;
      } else if (!opts.burst) {
        timeSinceLastEmission += loopDelta;

        while (timeSinceLastEmission >= emissionInterval && particles.length < opts.maxParticles) {
          emitParticle();
          timeSinceLastEmission -= emissionInterval;
        }
      }
    }

    if (opts.burst && particles.length === 0) {
      destroy();
    }

    context.globalCompositeOperation = "source-over";
  };

  const destroy = () => {
    dead = true;
    particles.length = 0;
    return;
  };

  const spawnParticle = (p: Particle): Particle => {
    particles.push(p);
    return p;
  };

  const pause = () => {
    paused = true;
  };

  const resume = () => {
    paused = false;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      resume();
    } else {
      pause();
    }
  });

  return {
    particles,
    update,
    destroy,
    pause,
    resume,
    set x(value: number) {
      opts.x = value;
    },
    get x() {
      return opts.x;
    },
    set y(value: number) {
      opts.y = value;
    },
    get y() {
      return opts.y;
    },
  };
};

export const createParticleSystem = (opts: ParticleSystemOptions) => {
  let _x = opts.x;
  let _y = opts.y;
  const emitters: ParticleEmitter[] = [];
  const startImmediately = opts.start ?? true;

  const update = (state: WorldState) => {
    emitters.forEach((emitter) => {
      emitter.update(state);
    });
  };

  const destroy = () => {
    emitters.forEach((emitter) => {
      emitter.destroy();
    });
  };

  const createEmitter = (opts: ParticleEmitterOptions): ParticleEmitter => {
    const emitter = createParticleEmitter({
      ...opts,
      /* x: _x, */
      /* y: _y, */
    });
    emitters.push(emitter);

    if (!startImmediately) {
      emitter.pause();
    }

    return emitter;
  };

  const pause = () => {
    emitters.forEach((emitter) => {
      emitter.pause();
    });
  };

  const start = () => {
    emitters.forEach((emitter) => {
      emitter.resume();
    });
  };

  return {
    update,
    destroy,
    createEmitter,
    pause,
    start,
    set x(value: number) {
      _x = value;
    },
    get x() {
      return _x;
    },
    set y(value: number) {
      _y = value;
    },
    get y() {
      return _y;
    },
    get numParticles() {
      return emitters.reduce((acc, emitter) => acc + emitter.particles.length, 0);
    },
  };
};
