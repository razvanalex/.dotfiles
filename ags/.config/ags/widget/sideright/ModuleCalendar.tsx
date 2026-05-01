import { createState, onCleanup } from "ags";
import { Gtk } from "ags/gtk4";
import userOptions from "services/options/Options";
import { getCalendarLayout } from "./CalendarLayout";
import TodoWidget from "./TodoWidget";

function getDateInXMonthsTime(x: number) {
    var currentDate = new Date();
    var targetMonth = currentDate.getMonth() + x;
    var targetYear = currentDate.getFullYear();
    targetYear += Math.floor(targetMonth / 12);
    targetMonth = ((targetMonth % 12) + 12) % 12;
    return new Date(targetYear, targetMonth, 1);
}

const weekDays = [
    { day: "Mo", today: 0 },
    { day: "Tu", today: 0 },
    { day: "We", today: 0 },
    { day: "Th", today: 0 },
    { day: "Fr", today: 0 },
    { day: "Sa", today: 0 },
    { day: "Su", today: 0 },
];

function CalendarDayButton({
    day,
    today,
}: {
    day: string | number;
    today: number;
}) {
    return (
        <button
            class={`sidebar-calendar-btn ${today === 1 ? "sidebar-calendar-btn-today" : today === -1 ? "sidebar-calendar-btn-othermonth" : ""}`}
        >
            <overlay>
                <box />
                <label
                    halign={Gtk.Align.CENTER}
                    class="txt-smallie txt-semibold sidebar-calendar-btn-txt"
                    label={String(day)}
                />
            </overlay>
        </button>
    );
}

function CalendarWeekDay({ day }: { day: string }) {
    return (
        <label
            class="sidebar-calendar-btn sidebar-calendar-header-day txt-smallie txt-semibold"
            label={day}
            halign={Gtk.Align.CENTER}
            valign={Gtk.Align.CENTER}
        />
    );
}

function CalendarWidget() {
    const [monthShift, setMonthShift] = createState(0);

    const calendarData = monthShift.as((shift) => {
        const newDate = shift === 0 ? new Date() : getDateInXMonthsTime(shift);
        return {
            layout: getCalendarLayout(newDate, shift === 0),
            date: newDate,
        };
    });

    return (
        <box
            orientation={Gtk.Orientation.VERTICAL}
            class="spacing-v-5"
            $={(self: Gtk.Box) => {
                const scrollController = new Gtk.EventControllerScroll();
                scrollController.set_flags(
                    Gtk.EventControllerScrollFlags.VERTICAL,
                );
                const scrollId = scrollController.connect(
                    "scroll",
                    (_, _dx: number, dy: number) => {
                        if (dy > 0) setMonthShift(monthShift.get() + 1);
                        else if (dy < 0) setMonthShift(monthShift.get() - 1);
                        return true;
                    },
                );
                self.add_controller(scrollController);
                onCleanup(() => scrollController.disconnect(scrollId));
            }}
        >
            <box class="spacing-h-5 sidebar-calendar-header">
                <button
                    class="txt txt-large sidebar-calendar-monthyear-btn"
                    onClicked={() => setMonthShift(0)}
                    label={calendarData.as(
                        (d) =>
                            `${monthShift.get() === 0 ? "" : "• "}${d.date.toLocaleString("default", { month: "long" })} ${d.date.getFullYear()}`,
                    )}
                />
                <box hexpand />
                <box class="spacing-h-5">
                    <button
                        class="sidebar-calendar-monthshift-btn"
                        onClicked={() => setMonthShift(monthShift.get() - 1)}
                    >
                        <label
                            class="icon-material txt-norm"
                            label="chevron_left"
                        />
                    </button>
                    <button
                        class="sidebar-calendar-monthshift-btn"
                        onClicked={() => setMonthShift(monthShift.get() + 1)}
                    >
                        <label
                            class="icon-material txt-norm"
                            label="chevron_right"
                        />
                    </button>
                </box>
            </box>
            <box orientation={Gtk.Orientation.VERTICAL} class="spacing-v-5">
                <box homogeneous class="spacing-h-5">
                    {weekDays.map((day) => (
                        <CalendarWeekDay day={day.day} />
                    ))}
                </box>
                <box
                    orientation={Gtk.Orientation.VERTICAL}
                    class="spacing-v-5"
                    $={(self: Gtk.Box) => {
                        const update = (shift: number) => {
                            const newDate =
                                shift === 0
                                    ? new Date()
                                    : getDateInXMonthsTime(shift);
                            const layout = getCalendarLayout(
                                newDate,
                                shift === 0,
                            );
                            let child = self.get_first_child();
                            while (child) {
                                const next = child.get_next_sibling();
                                self.remove(child);
                                child = next;
                            }
                            layout.forEach((row) => {
                                const rowBox = (
                                    <box class="spacing-h-5" homogeneous>
                                        {row.map((day) => (
                                            <CalendarDayButton
                                                day={day.day}
                                                today={day.today}
                                            />
                                        ))}
                                    </box>
                                ) as unknown as Gtk.Widget;
                                self.append(rowBox);
                            });
                        };
                        const unsub = monthShift.subscribe(() =>
                            update(monthShift.get()),
                        );
                        onCleanup(unsub);
                        update(monthShift.get());
                    }}
                />
            </box>
        </box>
    );
}

export default function ModuleCalendar() {
    const [activeTab, setActiveTab] = createState("calendar");

    return (
        <box
            class="sidebar-group spacing-h-5"
            vexpand={activeTab.as((t) => t === "todo")}
        >
            <box
                valign={Gtk.Align.CENTER}
                homogeneous
                orientation={Gtk.Orientation.VERTICAL}
                class="sidebar-navrail spacing-v-10"
            >
                <button
                    class={activeTab.as(
                        (t) =>
                            `button-minsize sidebar-navrail-btn txt-small spacing-h-5 ${t === "calendar" ? "sidebar-navrail-btn-active" : ""}`,
                    )}
                    onClicked={() => setActiveTab("calendar")}
                >
                    <box
                        orientation={Gtk.Orientation.VERTICAL}
                        class="spacing-v-5"
                    >
                        <label
                            class="txt icon-material txt-huge"
                            label="calendar_month"
                        />
                        <label class="txt txt-smallie" label="Calendar" />
                    </box>
                </button>
                <button
                    class={activeTab.as(
                        (t) =>
                            `button-minsize sidebar-navrail-btn txt-small spacing-h-5 ${t === "todo" ? "sidebar-navrail-btn-active" : ""}`,
                    )}
                    onClicked={() => setActiveTab("todo")}
                >
                    <box
                        orientation={Gtk.Orientation.VERTICAL}
                        class="spacing-v-5"
                    >
                        <label
                            class="txt icon-material txt-huge"
                            label="done_outline"
                        />
                        <label class="txt txt-smallie" label="To Do" />
                    </box>
                </button>
            </box>
            <stack
                visibleChildName={activeTab}
                transitionType={Gtk.StackTransitionType.SLIDE_UP_DOWN}
                transitionDuration={userOptions.animations.durationLarge}
                interpolateSize={true}
            >
                <box $type="named" name="calendar">
                    <CalendarWidget />
                </box>
                <box $type="named" name="todo">
                    <TodoWidget />
                </box>
            </stack>
        </box>
    );
}
