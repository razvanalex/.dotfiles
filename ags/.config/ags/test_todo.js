const { readFile, writeFile } = await import("ags/file");
const GLib = await import("gi://GLib");

async function testTodoService() {
    const todoPath = `${GLib.get_user_state_dir()}/ags/user/todo.json`;
    console.log(`Todo file path: ${todoPath}`);
    
    try {
        const content = await readFile(todoPath);
        const todos = JSON.parse(content);
        console.log(`Current todos: ${JSON.stringify(todos, null, 2)}`);
    } catch (e) {
        console.log(`No existing todos: ${e}`);
    }
}

testTodoService();
