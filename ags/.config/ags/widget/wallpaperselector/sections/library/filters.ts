export function fuzzyThemeFilter(themes: string[], query: string): string[] {
    if (!query || query.trim() === "") return themes
    const q = query.toLowerCase().replace(/\s+/g, "")
    return themes.filter((theme) => {
        const value = theme.toLowerCase()
        let qIndex = 0
        for (
            let index = 0;
            index < value.length && qIndex < q.length;
            index++
        ) {
            if (value[index] === q[qIndex]) qIndex++
        }
        return qIndex === q.length
    })
}
