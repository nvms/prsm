import { WorldState } from "../ngn";

interface LogEntry {
  message: string;
}

interface ExpiringLogEntry extends LogEntry {
  lifetime: number;
  start: Date;
}

const MAX_LOGS = 256;

type LogSystem = {
  expiringLogs: ExpiringLogEntry[];
  allLogs: LogEntry[];
  update: (w: WorldState) => void;
  log: (message: string) => void;
};

const createLogSystem = (options: Partial<{ maxLifetime: number }> = { maxLifetime: 10_000 }): LogSystem => {
  const logSystem: LogSystem = {
    expiringLogs: [],
    allLogs: [],
    update(world: WorldState) {
      if (!this.expiringLogs.length) return;

      this.expiringLogs.forEach((log, index) => {
        log.lifetime -= world.time.delta;

        if (log.lifetime < 0) {
          this.expiringLogs.splice(index, 1);
        }
      });
    },
    log(message: string) {
      this.expiringLogs.push({
        message,
        lifetime: options.maxLifetime,
        start: new Date(),
      });
      this.allLogs.push({ message });
    },
  };

  // bind so that `this` in update refers to logSystem
  logSystem.update = logSystem.update.bind(logSystem);
  logSystem.log = logSystem.log.bind(logSystem);

  logSystem.allLogs.push = function () {
    if (this.length >= MAX_LOGS) this.shift();
    return Array.prototype.push.apply(this, arguments);
  };

  return logSystem;
};

export { createLogSystem };
