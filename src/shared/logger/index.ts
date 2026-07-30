import pino from "pino"

const nodeEnv = process.env.NODE_ENV || "development"

export const logger = pino({
    level: nodeEnv === "test" ? "silent" : nodeEnv === "production" ? "info" : "debug",
    transport:
        nodeEnv === "development"
            ? {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "SYS:standard",
                      ignore: "pid,hostname",
                  },
              }
            : undefined,
})
