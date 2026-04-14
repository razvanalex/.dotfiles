import GObject from "gi://GObject";
import { readFile, writeFile } from "ags/file";
import { ensureDirectory, PATHS } from "lib/constants";
import Logger from "lib/logger";

export interface TodoItem {
    content: string;
    done: boolean;
}

class TodoService extends GObject.Object {
    static {
        GObject.registerClass(
            {
                Signals: {
                    changed: {},
                    updated: {},
                },
            },
            TodoService,
        );
    }

    private todoPath: string;
    private _todos: TodoItem[] = [];

    constructor() {
        super();
        this.todoPath = PATHS.todo;
        this.load();
    }

    private async load() {
        try {
            const content = await readFile(this.todoPath);
            this._todos = JSON.parse(content);
        } catch {
            // File doesn't exist or is invalid, create new file
            try {
                ensureDirectory(this.todoPath);
                await writeFile("[]", this.todoPath);
                this._todos = [];
            } catch (e) {
                Logger.error("Failed to create todo file:", e);
                this._todos = [];
            }
        }
        this.emit("changed");
        this.emit("updated");
    }

    private async save() {
        try {
            ensureDirectory(this.todoPath);
            await writeFile(JSON.stringify(this._todos), this.todoPath);
        } catch (e) {
            Logger.error("Failed to save todos:", e);
        }
    }

    get todos(): TodoItem[] {
        return [...this._todos];
    }

    add(content: string) {
        if (!content.trim()) return;
        this._todos.push({ content: content.trim(), done: false });
        this.save();
        this.emit("changed");
        this.emit("updated");
    }

    check(index: number) {
        if (index >= 0 && index < this._todos.length) {
            this._todos[index].done = true;
            this.save();
            this.emit("changed");
            this.emit("updated");
        }
    }

    uncheck(index: number) {
        if (index >= 0 && index < this._todos.length) {
            this._todos[index].done = false;
            this.save();
            this.emit("changed");
            this.emit("updated");
        }
    }

    remove(index: number) {
        if (index >= 0 && index < this._todos.length) {
            this._todos.splice(index, 1);
            this.save();
            this.emit("changed");
            this.emit("updated");
        }
    }
}

const service = new TodoService();
export default service;
