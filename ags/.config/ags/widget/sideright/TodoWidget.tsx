import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import userOptions from "../../lib/userOptions"
import todoService, { type TodoItem } from "../../lib/todo"
import { For } from "ags"

function TodoItemComponent({ item, index, isDone }: { item: TodoItem; index: number; isDone: boolean }) {
    const [revealed, setRevealed] = createState(true)
    const [animated, setAnimated] = createState(false)

    const handleCheck = () => {
        setAnimated(true)
        setTimeout(() => {
            setRevealed(false)
        }, 200)
        setTimeout(() => {
            if (isDone) {
                todoService.uncheck(index)
            } else {
                todoService.check(index)
            }
        }, 350)
    }

    const handleDelete = () => {
        setAnimated(true)
        setTimeout(() => {
            setRevealed(false)
        }, 200)
        setTimeout(() => {
            todoService.remove(index)
        }, 350)
    }

    return (
        <revealer
            revealChild={revealed}
            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
            transitionDuration={userOptions.animations.durationLarge}
        >
            <box>
                <box class={animated.as(a => `sidebar-todo-item spacing-h-5 ${a ? 'sidebar-todo-crosser-crossed' : ''}`)}
                >
                    <box orientation={Gtk.Orientation.VERTICAL} hexpand>
                        <label
                            hexpand
                            halign={Gtk.Align.START}
                            wrap
                            selectable
                            class="txt txt-small sidebar-todo-txt"
                            label={item.content}
                        />
                        <box class="spacing-h-5 sidebar-todo-actions" halign={Gtk.Align.END}>
                            <button
                                class="txt sidebar-todo-item-action"
                                onClicked={handleCheck}
                                tooltipText={isDone ? "Uncheck" : "Check"}
                            >
                                <label class="icon-material txt-norm" label={isDone ? "remove_done" : "check"} />
                            </button>
                            <button
                                class="txt sidebar-todo-item-action"
                                onClicked={handleDelete}
                                tooltipText="Delete"
                            >
                                <label class="icon-material txt-norm" label="delete_forever" />
                            </button>
                        </box>
                    </box>
                </box>
            </box>
        </revealer>
    )
}

function TodoList({ isDone }: { isDone: boolean }) {
    const [todos, setTodos] = createState<TodoItem[]>(todoService.getTodos)

    // Subscribe to todo updates
    todoService.subscribe((newTodos) => {
        setTodos(newTodos)
    })

    return (
        <stack
            visibleChildName={todos.as((allTodos: TodoItem[]) => {
                const filtered = allTodos.filter(todo => todo.done === isDone)
                return filtered.length > 0 ? "list" : "empty"
            })}
            transitionType={Gtk.StackTransitionType.CROSSFADE}
            transitionDuration={userOptions.animations.durationLarge}
            vexpand
        >
            <box $type="named" name="empty" homogeneous>
                <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} class="txt spacing-v-10">
                    <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5 txt-subtext">
                        <label class="icon-material txt-gigantic" label={isDone ? "checklist" : "check_circle"} />
                        <label class="txt-small" label={isDone ? "Finished tasks will go here" : "Nothing here!"} />
                    </box>
                </box>
            </box>
            <box $type="named" name="list" orientation={Gtk.Orientation.VERTICAL}>
                <scrolledwindow
                    vexpand
                    hscrollbarPolicy={Gtk.PolicyType.NEVER}
                    vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                >
                    <box
                        orientation={Gtk.Orientation.VERTICAL}
                        class="spacing-v-5"
                    >
                        <For each={todos.as((allTodos: TodoItem[]) => 
                            allTodos.map((todo, i) => ({ ...todo, originalIndex: i })).filter((todo: any) => todo.done === isDone)
                        )}>
                            {(item: any) => (
                                <TodoItemComponent item={item} index={item.originalIndex} isDone={isDone} />
                            )}
                        </For>
                    </box>
                </scrolledwindow>
            </box>
        </stack>
    )
}

function UndoneTodoList() {
    const [showInput, setShowInput] = createState(false)
    const [inputText, setInputText] = createState("")

    const handleAdd = () => {
        if (inputText.get().trim()) {
            todoService.add(inputText.get())
            setInputText("")
            setShowInput(false)
        }
    }

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5" vexpand>
            <TodoList isDone={false} />
            <box class="spacing-h-5" halign={Gtk.Align.END}>
                <revealer
                    revealChild={showInput.as(s => !s)}
                    transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
                    transitionDuration={userOptions.animations.durationLarge}
                >
                    <button
                        class="txt-small sidebar-todo-new"
                        onClicked={() => setShowInput(true)}
                    >
                        <label label="+ New task" />
                    </button>
                </revealer>
                <revealer
                    revealChild={showInput}
                    transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
                    transitionDuration={userOptions.animations.durationLarge}
                >
                    <entry
                        class="sidebar-todo-entry txt-small"
                        placeholderText="Add a task..."
                        text={inputText}
                        onNotify={(self: any) => {
                            setInputText(self.text)
                        }}
                        onActivate={() => handleAdd()}
                    />
                </revealer>
                <revealer
                    revealChild={showInput}
                    transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
                    transitionDuration={userOptions.animations.durationLarge}
                >
                    <button
                        class="txt-norm icon-material sidebar-todo-add"
                        onClicked={handleAdd}
                    >
                        <label label="arrow_upward" />
                    </button>
                </revealer>
                <revealer
                    revealChild={showInput}
                    transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
                    transitionDuration={userOptions.animations.durationLarge}
                >
                    <button
                        class="txt-norm icon-material sidebar-todo-add"
                        onClicked={() => {
                            setShowInput(false)
                            setInputText("")
                        }}
                    >
                        <label label="close" />
                    </button>
                </revealer>
            </box>
        </box>
    )
}

export default function TodoWidget() {
    const [activeTab, setActiveTab] = createState(0)

    return (
        <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5" vexpand>
            <box halign={Gtk.Align.CENTER} class="sidebar-icontabswitcher">
                <button
                    class={activeTab.as(t => `sidebar-iconbutton ${t === 0 ? "sidebar-button-active" : ""}`)}
                    onClicked={() => setActiveTab(0)}
                    tooltipText="Unfinished"
                >
                    <label class="icon-material txt-norm" label="format_list_bulleted" />
                </button>
                <button
                    class={activeTab.as(t => `sidebar-iconbutton ${t === 1 ? "sidebar-button-active" : ""}`)}
                    onClicked={() => setActiveTab(1)}
                    tooltipText="Done"
                >
                    <label class="icon-material txt-norm" label="task_alt" />
                </button>
            </box>
            <stack
                vexpand
                visibleChildName={activeTab.as(i => `todo-${i}`)}
                transitionType={Gtk.StackTransitionType.SLIDE_LEFT_RIGHT}
            >
                <box $type="named" name="todo-0" orientation={Gtk.Orientation.VERTICAL}>
                    <UndoneTodoList />
                </box>
                <box $type="named" name="todo-1" orientation={Gtk.Orientation.VERTICAL}>
                    <TodoList isDone={true} />
                </box>
            </stack>
        </box>
    )
}

