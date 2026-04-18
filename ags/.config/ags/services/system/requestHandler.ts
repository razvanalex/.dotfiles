import brightness from "./Brightness";

export async function handleSystemRequest(argv: string[], res: (response: any) => void) {
    if (argv[0] === "brightness") {
        let valStr = argv[1];
        if (valStr === "--") valStr = argv[2];

        const val = parseFloat(valStr);
        if (Number.isNaN(val)) return res(`invalid value: ${valStr}`);

        if (valStr.startsWith("+") || valStr.startsWith("-")) {
            brightness.screen_value += val;
        } else {
            brightness.screen_value = val;
        }
        return res(String(brightness.screen_value));
    }

    return false; // Not handled
}
