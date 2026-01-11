import { readFile, writeFile } from "ags/file"
import GLib from "gi://GLib"
import { execAsync } from "ags/process"

export interface TodoItem {
    content: string
    done: boolean
}

class TodoService {
    private todoPath: string
    private todos: TodoItem[] = []
    private listeners: Set<(todos: TodoItem[]) => void> = new Set()

    constructor() {
        this.todoPath = `${GLib.get_user_state_dir()}/ags/user/todo.json`
        this.load()
    }

    private async load() {
        try {
            const content = await readFile(this.todoPath)
            this.todos = JSON.parse(content)
        } catch {
            // File doesn't exist or is invalid, create new file
            try {
                // Ensure directory exists
                const dir = this.todoPath.substring(0, this.todoPath.lastIndexOf('/'))
                try {
                    await execAsync(`mkdir -p "${dir}"`)
                } catch {
                    // Directory might already exist
                }
                await writeFile("[]", this.todoPath)
                this.todos = []
            } catch (e) {
                console.error("Failed to create todo file:", e)
                this.todos = []
            }
        }
        this.notify()
    }

    private async save() {
        try {
            await writeFile(JSON.stringify(this.todos), this.todoPath)
        } catch (e) {
            console.error("Failed to save todos:", e)
        }
    }

    private notify() {
        this.listeners.forEach(listener => listener([...this.todos]))
    }

    subscribe(listener: (todos: TodoItem[]) => void): () => void {
        this.listeners.add(listener)
        // Call immediately with current state
        listener([...this.todos])
        // Return unsubscribe function
        return () => this.listeners.delete(listener)
    }

    get getTodos(): TodoItem[] {
        return [...this.todos]
    }

    add(content: string) {
        if (!content.trim()) return
        this.todos.push({ content: content.trim(), done: false })
        this.save()
        this.notify()
    }

    check(index: number) {
        if (index >= 0 && index < this.todos.length) {
            this.todos[index].done = true
            this.save()
            this.notify()
        }
    }

    uncheck(index: number) {
        if (index >= 0 && index < this.todos.length) {
            this.todos[index].done = false
            this.save()
            this.notify()
        }
    }

    remove(index: number) {
        if (index >= 0 && index < this.todos.length) {
            this.todos.splice(index, 1)
            this.save()
            this.notify()
        }
    }
}

// Create singleton instance
const todoService = new TodoService()

export default todoService
