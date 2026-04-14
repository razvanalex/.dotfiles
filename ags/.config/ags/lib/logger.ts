/**
 * A structured Logger utility to provide consistent logging across the AGS application.
 * Supports scoped logging to identify the source of each message.
 */

export class Logger {
    private readonly scope: string | null;

    constructor(scope: string | null = null) {
        this.scope = scope;
    }

    private format(level: string, message: any, ...args: any[]): string {
        const timestamp = new Date().toLocaleTimeString("en-US", {
            hour12: false,
        });
        let formattedMessage = message;

        // If message is an object (like an Error), stringify it or use its message
        if (typeof message === "object") {
            if (message instanceof Error) {
                formattedMessage = message.stack || message.message;
            } else {
                try {
                    formattedMessage = JSON.stringify(message, null, 2);
                } catch (_e) {
                    formattedMessage = String(message);
                }
            }
        }

        const scopePart = this.scope ? ` [${this.scope}]` : "";
        const prefix = `[${timestamp}] [${level}]${scopePart}`;
        return `${prefix} ${formattedMessage}${args.length > 0 ? ` ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}` : ""}`;
    }

    info(message: any, ...args: any[]): void {
        console.log(this.format("INFO", message, ...args));
    }

    warn(message: any, ...args: any[]): void {
        console.warn(this.format("WARN", message, ...args));
    }

    error(message: any, ...args: any[]): void {
        console.error(this.format("ERROR", message, ...args));
    }

    debug(message: any, ...args: any[]): void {
        // Only log debug if needed; could be gated by an environment variable
        console.log(this.format("DEBUG", message, ...args));
    }

    // Static compatibility layer
    private static readonly _defaultInstance = new Logger();

    static info(message: any, ...args: any[]): void {
        Logger._defaultInstance.info(message, ...args);
    }

    static warn(message: any, ...args: any[]): void {
        Logger._defaultInstance.warn(message, ...args);
    }

    static error(message: any, ...args: any[]): void {
        Logger._defaultInstance.error(message, ...args);
    }

    static debug(message: any, ...args: any[]): void {
        Logger._defaultInstance.debug(message, ...args);
    }

    /**
     * Creates a new scoped logger instance.
     * @param scope The name of the module or component (e.g., 'Bluetooth', 'Wallpaper')
     */
    static withScope(scope: string): Logger {
        return new Logger(scope);
    }
}

export default Logger;
