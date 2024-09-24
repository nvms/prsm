// src/misc.ts
function pulse(time, freq = 1, min = 0, max = 1) {
  const halfRange = (max - min) / 2;
  return min + halfRange * (1 + Math.sin(2 * Math.PI * freq * time));
}

// src/ids.ts
var HEX = [];
for (let i = 0; i < 256; i++) {
  HEX[i] = (i + 256).toString(16).substring(1);
}
function pad(str, size) {
  const s = "000000" + str;
  return s.substring(s.length - size);
}
var SHARD_COUNT = 32;
function getCreateId(opts) {
  const len = opts.len || 16;
  let str = "";
  let num = 0;
  const discreteValues = 1679616;
  let current = opts.init + Math.ceil(discreteValues / 2);
  function counter() {
    current = current <= discreteValues ? current : 0;
    current++;
    return (current - 1).toString(16);
  }
  return () => {
    if (!str || num === 256) {
      str = "";
      num = (1 + len) / 2 | 0;
      while (num--)
        str += HEX[256 * Math.random() | 0];
      str = str.substring(num = 0, len);
    }
    const date = Date.now().toString(36);
    const paddedCounter = pad(counter(), 6);
    const hex = HEX[num++];
    const shardKey = parseInt(hex, 16) % SHARD_COUNT;
    return `ngn${date}${paddedCounter}${hex}${str}${shardKey}`;
  };
}

// src/ngn.ts
var createId = getCreateId({ init: 0, len: 4 });
var $eciMap = Symbol();
var $ceMap = Symbol();
var $eMap = Symbol();
var $queryResults = Symbol();
var $dirtyQueries = Symbol();
var $queryDependencies = Symbol();
var $systems = Symbol();
var $running = Symbol();
var $onEntityCreated = Symbol();
var $mainLoop = Symbol();
var createWorld = () => {
  const state = {
    [$eciMap]: {},
    [$ceMap]: {},
    [$eMap]: {},
    [$dirtyQueries]: /* @__PURE__ */ new Set(),
    [$queryDependencies]: /* @__PURE__ */ new Map(),
    [$queryResults]: {},
    [$systems]: [],
    [$mainLoop]: null,
    time: {
      elapsed: 0,
      delta: 0,
      loopDelta: 0,
      lastLoopDelta: 0,
      scale: 1,
      fps: 0
    },
    [$running]: false,
    [$onEntityCreated]: []
  };
  const defineMain2 = (callback) => {
    state[$mainLoop] = callback;
  };
  const start2 = () => {
    let then = 0;
    let accumulator = 0;
    const boundLoop = handler.bind(start2);
    let loopHandler = -1;
    const { time } = state;
    time.delta = 0;
    time.elapsed = 0;
    time.fps = 0;
    state[$running] = true;
    let raf = null;
    let craf = null;
    if (typeof window !== "undefined") {
      let now = performance.now();
      raf = (cb) => {
        return requestAnimationFrame((timestamp) => {
          now = timestamp;
          cb(now);
        });
      };
      craf = cancelAnimationFrame;
    } else {
      let now = 0;
      raf = (cb) => {
        return setTimeout(() => {
          now += 16.67;
          cb(now);
        }, 16.67);
      };
      craf = (id) => {
        clearTimeout(id);
      };
    }
    let xfps = 1;
    const xtimes = [];
    function handler(now) {
      if (!state[$running])
        return craf(loopHandler);
      while (xtimes.length > 0 && xtimes[0] <= now - 1e3) {
        xtimes.shift();
      }
      xtimes.push(now);
      xfps = xtimes.length;
      time.fps = xfps;
      time.delta = now - then;
      then = now;
      accumulator += time.delta * time.scale;
      const stepThreshold = 1e3 / (time.fps || 60);
      while (accumulator >= stepThreshold) {
        time.loopDelta = now - time.lastLoopDelta;
        time.lastLoopDelta = now;
        state[$mainLoop](state);
        accumulator -= stepThreshold;
      }
      time.elapsed += time.delta * 1e-3;
      loopHandler = raf(boundLoop);
    }
    loopHandler = raf(boundLoop);
    return () => state[$running] = false;
  };
  const stop = () => {
    state[$running] = false;
  };
  function step2() {
    for (const system of state[$systems]) {
      system(state);
    }
  }
  function addSystem2(...systems) {
    for (const system of systems) {
      if (typeof system === "function") {
        state[$systems].push(system);
      } else if (system.update && typeof system.update === "function") {
        state[$systems].push(system.update);
      } else {
        throw new Error(`Not a valid system: ${JSON.stringify(system)}`);
      }
    }
  }
  function removeSystem(...systems) {
    for (const system of systems) {
      if (typeof system === "function") {
        state[$systems] = state[$systems].filter((s) => s !== system);
      } else if (system.update && typeof system.update === "function") {
        state[$systems] = state[$systems].filter((s) => s !== system.update);
      } else {
        throw new TypeError("Parameter must be a function or an object with an update function.");
      }
    }
  }
  const getQuery = (queryConfig, queryName) => {
    if (!state[$dirtyQueries].has(queryName) && state[$queryResults][queryName]) {
      return state[$queryResults][queryName].results;
    }
    const { and = [], or = [], not = [], tag = [] } = queryConfig;
    const entities = Object.values(state[$eMap]).filter((entity) => {
      return (!not.length || !not.some((component) => entity.hasComponent(component))) && (!and.length || and.every((component) => entity.hasComponent(component))) && (!or.length || or.some((component) => entity.hasComponent(component))) && (!tag.length || tag.some((t) => entity.tag === t));
    });
    state[$queryResults][queryName] = {
      results: entities.map((entity) => {
        const result = { entity };
        entity.components.forEach((component) => {
          result[component.__ngn__.name] = component;
        });
        return result;
      })
    };
    state[$dirtyQueries].delete(queryName);
    return state[$queryResults][queryName].results;
  };
  const markQueryDirty = (queryName) => {
    state[$dirtyQueries].add(queryName);
  };
  const query = ({ and = [], or = [], not = [], tag = [] }) => {
    const validQuery = (c) => Object.prototype.hasOwnProperty.call(c, "name");
    if (![...and, ...or, ...not].every(validQuery))
      throw new Error("Invalid query");
    const queryName = ["and", ...and.map((c) => c.name), "or", ...or.map((c) => c.name), "not", ...not.map((c) => c.name), "tag", ...tag].join("");
    [...and, ...or, ...not].forEach((c) => {
      const dependencies = state[$queryDependencies].get(c.name) || /* @__PURE__ */ new Set();
      dependencies.add(queryName);
      state[$queryDependencies].set(c.name, dependencies);
    });
    tag.forEach((t) => {
      const tagKey = `tag:${t}`;
      const dependencies = state[$queryDependencies].get(tagKey) || /* @__PURE__ */ new Set();
      dependencies.add(queryName);
      state[$queryDependencies].set(tagKey, dependencies);
    });
    return (queryImpl) => queryImpl(getQuery({ and, or, not, tag }, queryName));
  };
  function destroyEntity(e) {
    const exists = state[$eMap][e.id];
    if (!exists)
      return false;
    const componentsToRemove = Object.keys(state[$eciMap][e.id]);
    componentsToRemove.forEach((componentName) => {
      state[$ceMap][componentName] = state[$ceMap][componentName].filter((id) => id !== e.id);
    });
    delete state[$eciMap][e.id];
    delete state[$eMap][e.id];
    componentsToRemove.forEach((componentName) => {
      const affectedQueries = state[$queryDependencies].get(componentName);
      if (affectedQueries) {
        affectedQueries.forEach(markQueryDirty);
      }
    });
    return true;
  }
  function onEntityCreated(fn) {
    if (typeof fn !== "function")
      return;
    state[$onEntityCreated].push(fn);
    return () => {
      state[$onEntityCreated] = state[$onEntityCreated].filter((f) => f !== fn);
    };
  }
  function createComponent(entity, component, defaults = {}) {
    if (state[$eciMap]?.[entity.id]?.[component.name] !== void 0)
      return entity;
    const affectedQueries = state[$queryDependencies].get(component.name);
    if (affectedQueries) {
      affectedQueries.forEach(markQueryDirty);
    }
    const componentInstance = component();
    if (componentInstance.onAttach && typeof componentInstance.onAttach === "function") {
      componentInstance.onAttach(entity);
    }
    entity.components.push(
      Object.assign(
        {},
        {
          ...componentInstance,
          ...defaults,
          __ngn__: {
            parent: entity.id,
            name: component.name
          }
        }
      )
    );
    state[$eciMap][entity.id] = state[$eciMap][entity.id] || {};
    state[$eciMap][entity.id][component.name] = entity.components.length - 1;
    state[$ceMap][component.name] = state[$ceMap][component.name] || [];
    state[$ceMap][component.name].push(entity.id);
    return entity;
  }
  function createEntity(spec = {}) {
    const id = spec.id ?? createId();
    const components = [];
    const tagKey = (t) => `tag:${t}`;
    function updateTagQueries(tagKey2) {
      const affectedQueries = state[$queryDependencies].get(tagKey2);
      if (affectedQueries) {
        affectedQueries.forEach(markQueryDirty);
      }
    }
    function addTag(t) {
      const previousTagKey = tagKey(this.tag);
      this.tag = t;
      updateTagQueries(tagKey(t));
      updateTagQueries(previousTagKey);
      return this;
    }
    function removeTag() {
      const previousTagKey = tagKey(this.tag);
      this.tag = "";
      updateTagQueries(previousTagKey);
      return this;
    }
    function getTag() {
      return this.tag;
    }
    function addComponent(c, defaults = {}) {
      return createComponent(this, c, defaults);
    }
    function hasComponent(component) {
      return state[$eciMap]?.[id]?.[component.name] !== void 0;
    }
    function getComponent(arg) {
      const index = state[$eciMap][id][arg.name];
      return components[index];
    }
    function removeComponent(component) {
      const name = typeof component === "string" ? component : component.name;
      const componentInstance = getComponent(typeof component === "string" ? { name } : component);
      if (componentInstance && componentInstance.onDetach && typeof componentInstance.onDetach === "function") {
        componentInstance.onDetach(this);
      }
      const affectedQueries = state[$queryDependencies].get(name);
      if (affectedQueries) {
        affectedQueries.forEach(markQueryDirty);
      }
      state[$eciMap][id][name] = void 0;
      state[$ceMap][name] = state[$ceMap][name].filter((e) => e !== id);
      const index = state[$eciMap][id][name];
      components.splice(index, 1);
      Object.keys(state[$eciMap][id]).forEach((componentName) => {
        if (state[$eciMap][id][componentName] > components.findIndex((c) => c.name === componentName)) {
          state[$eciMap][id][componentName]--;
        }
      });
      return this;
    }
    function destroy() {
      return destroyEntity(this);
    }
    const entity = Object.assign({}, spec, {
      id,
      components,
      addTag,
      removeTag,
      getTag,
      addComponent,
      hasComponent,
      getComponent,
      removeComponent,
      destroy
    });
    if (spec.id !== void 0 && state[$eMap][spec.id]) {
      migrateEntityId(spec.id, createId());
    }
    state[$eMap][id] = entity;
    state[$eciMap][id] = {};
    state[$onEntityCreated].forEach((fn) => {
      fn(entity);
    });
    return entity;
  }
  function migrateEntityId(oldId, newId) {
    const entity = state[$eMap][oldId];
    if (!entity)
      return;
    entity.id = newId;
    state[$eMap][newId] = entity;
    delete state[$eMap][oldId];
    state[$eciMap][newId] = state[$eciMap][oldId];
    delete state[$eciMap][oldId];
  }
  function getEntity(id) {
    return state[$eMap][id];
  }
  return {
    state,
    query,
    createEntity,
    getEntity,
    onEntityCreated,
    addSystem: addSystem2,
    removeSystem,
    start: start2,
    stop,
    step: step2,
    defineMain: defineMain2
  };
};

// src/packages/2d/canvas.ts
var createCanvas = (options) => {
  const canvas2 = document.createElement("canvas");
  const { target, fullscreen } = options;
  const { body } = window.document;
  if (target && fullscreen) {
    options.target = null;
  } else if (!target && !fullscreen) {
    options.fullscreen = true;
  }
  if (fullscreen) {
    Object.assign(canvas2.style, {
      position: "absolute",
      top: "0",
      left: "0"
    });
    canvas2.width = window.innerWidth;
    canvas2.height = window.innerHeight;
    body.appendChild(canvas2);
    Object.assign(body.style, {
      margin: "0",
      padding: "0",
      width: "100%",
      height: "100%",
      overflow: "hidden"
    });
  }
  if (target) {
    target.appendChild(canvas2);
    target.style.overflow = "hidden";
    canvas2.width = canvas2.offsetWidth;
    canvas2.height = canvas2.offsetHeight;
  }
  canvas2.width = canvas2.offsetWidth;
  canvas2.height = canvas2.offsetHeight;
  canvas2.style.width = "100%";
  canvas2.style.height = "100%";
  const existingMeta = window.document.querySelector(`meta[name="viewport"]`);
  if (existingMeta) {
    Object.assign(existingMeta, {
      content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"
    });
  } else {
    const meta = Object.assign(window.document.createElement("meta"), {
      name: "viewport",
      content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"
    });
    window.document.head.appendChild(meta);
  }
  return canvas2;
};

// src/packages/2d/draw.ts
var fastRound = (num) => ~~(0.5 + num);
var fastRoundVector2 = (v) => ({
  x: fastRound(v.x),
  y: fastRound(v.y)
});
var createDraw = (context) => {
  const text = (v, text2, color = "black", size = 16) => {
    v = fastRoundVector2(v);
    context.save();
    context.fillStyle = color;
    context.font = `${size}px sans-serif`;
    context.fillText(text2, v.x, v.y);
    context.restore();
  };
  const line = (from, to, color = "black", lineWidth = 1) => {
    from = fastRoundVector2(from);
    to = fastRoundVector2(to);
    context.save();
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
    context.closePath();
    context.restore();
  };
  const rectangle = (pos, dimensions, color = "black", lineWidth = 1) => {
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
  const circle = (pos, radius = 25, color = "black", lineWidth = 1) => {
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
    circle
  };
};

// src/packages/2d/create2d.ts
var create2D = (options) => {
  const { width = 800, height = 600, fullscreen = false, target = null } = options.canvas;
  const canvas2 = createCanvas({ width, height, fullscreen, target });
  const context = canvas2.getContext("2d");
  const draw2 = createDraw(context);
  const onWindowResize = () => {
    if (fullscreen) {
      canvas2.style.width = "100%";
      canvas2.style.height = "100%";
      canvas2.width = window.innerWidth;
      canvas2.height = window.innerHeight;
      return;
    }
    canvas2.width = canvas2.offsetWidth;
    canvas2.height = canvas2.offsetHeight;
  };
  window.addEventListener("resize", onWindowResize);
  const destroy = () => {
    window.removeEventListener("resize", onWindowResize);
    canvas2.parentElement.removeChild(canvas2);
  };
  return { canvas: canvas2, context, draw: draw2, destroy };
};

// src/packages/emitter/index.ts
var getDefaultParticleEmitterOptions = (opts) => ({
  ...opts,
  x: opts.x ?? 0,
  y: opts.y ?? 0,
  maxParticles: opts.maxParticles ?? 100,
  rate: opts.rate ?? 1,
  lifetime: opts.lifetime ?? 1e3,
  lifetimeVariation: opts.lifetimeVariation ?? 0,
  size: opts.size ?? 5,
  sizeVariation: opts.sizeVariation ?? 0,
  colorStart: opts.colorStart ?? "#000000",
  colorEnd: opts.colorEnd ?? "#000000",
  colorEasing: opts.colorEasing ?? "linear" /* LINEAR */,
  angle: opts.angle ?? 0,
  spread: opts.spread ?? 0,
  gravity: opts.gravity ?? { x: 0, y: 0 },
  speed: opts.speed ?? 0.1,
  speedVariation: opts.speedVariation ?? 0,
  canvas: opts.canvas,
  burst: opts.burst ?? false
});
var interpolateColor = (colorStart, colorEnd, factor, easing) => {
  switch (easing) {
    case "easeIn" /* EASE_IN */:
      factor = Math.pow(factor, 2);
      break;
    case "easeOut" /* EASE_OUT */:
      factor = 1 - Math.pow(1 - factor, 2);
      break;
    case "easeInOut" /* EASE_IN_OUT */:
      if (factor < 0.5) {
        factor = 2 * Math.pow(factor, 2);
      } else {
        factor = 1 - 2 * Math.pow(1 - factor, 2);
      }
      break;
    case "linear" /* LINEAR */:
    default:
      break;
  }
  const color1 = parseInt(colorStart.slice(1), 16);
  const color2 = parseInt(colorEnd.slice(1), 16);
  const r1 = color1 >> 16 & 255;
  const g1 = color1 >> 8 & 255;
  const b1 = color1 & 255;
  const r2 = color2 >> 16 & 255;
  const g2 = color2 >> 8 & 255;
  const b2 = color2 & 255;
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};
var hexToRgb = (hex) => {
  const color = parseInt(hex.slice(1), 16);
  const r = color >> 16 & 255;
  const g = color >> 8 & 255;
  const b = color & 255;
  return `${r}, ${g}, ${b}`;
};
var createParticleEmitter = (opts) => {
  opts = getDefaultParticleEmitterOptions(opts);
  const particles = [];
  let timeSinceLastEmission = 0;
  const emissionInterval = 1 / opts.rate;
  const lifetimeVariation = opts.lifetimeVariation ?? 0;
  const context = opts.canvas.getContext("2d");
  const angleInRadians = opts.angle * (Math.PI / 180);
  let dead = false;
  let paused = false;
  const update = (state) => {
    if (dead)
      return;
    context.globalCompositeOperation = opts.blendMode ?? "source-over";
    const { loopDelta } = state.time;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      const lifeFactor = particle.lifetime / opts.lifetime;
      let opacity = 1;
      particle.color = interpolateColor(particle.colorStart, particle.colorEnd, 1 - lifeFactor, opts.colorEasing);
      if (opts.fadeOutEasing) {
        switch (opts.fadeOutEasing) {
          case "easeIn" /* EASE_IN */:
            opacity = Math.pow(lifeFactor, 2);
            break;
          case "easeOut" /* EASE_OUT */:
            opacity = 1 - Math.pow(1 - lifeFactor, 2);
            break;
          case "easeInOut" /* EASE_IN_OUT */:
            if (lifeFactor < 0.5) {
              opacity = 2 * Math.pow(lifeFactor, 2);
            } else {
              opacity = 1 - 2 * Math.pow(1 - lifeFactor, 2);
            }
            break;
          case "linear" /* LINEAR */:
          default:
            opacity = lifeFactor;
            break;
        }
      }
      if (!paused) {
        particle.x += particle.speedX * loopDelta;
        particle.y += particle.speedY * loopDelta;
        particle.speedX += opts.gravity.x * loopDelta / 1e3;
        particle.speedY += opts.gravity.y * loopDelta / 1e3;
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
        colorStart,
        colorEnd,
        color: colorStart,
        lifetime: particleLifetime,
        size: Math.max(0, opts.size + (Math.random() - 0.5) * opts.sizeVariation),
        speedX: opts.speed * (Math.sin(angleInRadians) + (Math.random() - 0.5) * opts.spread),
        speedY: -opts.speed * (Math.cos(angleInRadians) + (Math.random() - 0.5) * opts.spread),
        scaleX: 1,
        scaleY: 1
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
  const spawnParticle = (p) => {
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
    set x(value) {
      opts.x = value;
    },
    get x() {
      return opts.x;
    },
    set y(value) {
      opts.y = value;
    },
    get y() {
      return opts.y;
    }
  };
};
var createParticleSystem = (opts) => {
  let _x = opts.x;
  let _y = opts.y;
  const emitters = [];
  const startImmediately = opts.start ?? true;
  const update = (state) => {
    emitters.forEach((emitter2) => {
      emitter2.update(state);
    });
  };
  const destroy = () => {
    emitters.forEach((emitter2) => {
      emitter2.destroy();
    });
  };
  const createEmitter = (opts2) => {
    const emitter2 = createParticleEmitter({
      ...opts2
      /* x: _x, */
      /* y: _y, */
    });
    emitters.push(emitter2);
    if (!startImmediately) {
      emitter2.pause();
    }
    return emitter2;
  };
  const pause = () => {
    emitters.forEach((emitter2) => {
      emitter2.pause();
    });
  };
  const start2 = () => {
    emitters.forEach((emitter2) => {
      emitter2.resume();
    });
  };
  return {
    update,
    destroy,
    createEmitter,
    pause,
    start: start2,
    set x(value) {
      _x = value;
    },
    get x() {
      return _x;
    },
    set y(value) {
      _y = value;
    },
    get y() {
      return _y;
    },
    get numParticles() {
      return emitters.reduce((acc, emitter2) => acc + emitter2.particles.length, 0);
    }
  };
};

// src/demo.ts
var { canvas, draw } = create2D({ canvas: { fullscreen: true } });
var particleSystem = createParticleSystem({
  x: canvas.width / 2,
  y: canvas.height / 2,
  canvas
});
var emitter = particleSystem.createEmitter({
  x: canvas.width / 2,
  y: canvas.height / 2,
  maxParticles: 100,
  rate: 0.1,
  lifetime: 1e3,
  lifetimeVariation: 0.2,
  size: 20,
  sizeVariation: 10,
  colorStart: ["#FF0000", "#ff5100"],
  colorEnd: "#222222",
  colorEasing: "easeIn" /* EASE_IN */,
  fadeOutEasing: "easeOut" /* EASE_OUT */,
  speed: 0.1,
  speedVariation: 1,
  angle: 0,
  spread: 0.75,
  gravity: { x: 0, y: 0 },
  canvas,
  burst: false,
  onInit: (particle, state) => {
    particle.x += Math.random() < 0.5 ? -6 : 6;
    particle.y += Math.random() < 0.5 ? -6 : 6;
    if (!(Math.random() < 0.02)) {
      return;
    }
    particle.size = 15;
    particle.speedY = -0.3;
    particle.lifetime = 1e3;
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
        colorEasing: "easeIn" /* EASE_IN */,
        fadeOutEasing: "easeOut" /* EASE_OUT */,
        speed: 0.02,
        speedVariation: 1,
        spread: 6,
        angle: 180,
        canvas,
        burst: true
      });
    };
    particle.onUpdate = () => {
      particle.size = Math.max(0, particle.size + 0.25);
    };
  },
  onUpdate: (particle, state) => {
    particle.size = Math.max(0, particle.size - 0.35);
    const v = pulse(state.time.elapsed, 0.25, -1, 1);
    particle.x += v * 1;
  },
  onRemove: (particle, state) => {
  }
});
var { addSystem, start, step, defineMain } = createWorld();
var clearCanvasSystem = () => {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111";
  context.fillRect(0, 0, canvas.width, canvas.height);
};
var fpsDrawSystem = (state) => {
  draw.text({ x: 10, y: 20 }, `FPS: ${state.time.fps.toFixed(2)}`, "white");
};
var particleCountSystem = (state) => {
  draw.text({ x: 10, y: 40 }, `Particle count: ${particleSystem.numParticles}`, "white");
};
var particlePositionSystem = (state) => {
  const { time } = state;
  const xPos = pulse(time.elapsed, 0.25, canvas.width / 2 - 100, canvas.width / 2 + 100);
  emitter.x = xPos;
};
addSystem(clearCanvasSystem, fpsDrawSystem, particleCountSystem, particlePositionSystem, particleSystem);
defineMain(() => {
  step();
});
start();
var container = document.createElement("div");
container.style.position = "fixed";
container.style.bottom = "0";
container.style.left = "0";
container.style.padding = "10px";
container.style.display = "flex";
container.style.justifyContent = "space-between";
container.style.alignItems = "center";
document.body.appendChild(container);
var pauseButton = document.createElement("button");
pauseButton.innerText = "Pause";
pauseButton.onclick = () => {
  particleSystem.pause();
};
container.appendChild(pauseButton);
var startButton = document.createElement("button");
startButton.innerText = "Start";
startButton.style.marginLeft = "5px";
startButton.onclick = () => {
  particleSystem.start();
};
container.appendChild(startButton);
var destroyButton = document.createElement("button");
destroyButton.innerText = "Destroy";
destroyButton.style.marginLeft = "5px";
destroyButton.onclick = () => {
  particleSystem.destroy();
};
container.appendChild(destroyButton);
//# sourceMappingURL=demo.js.map
