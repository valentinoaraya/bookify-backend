export const generateRandomId = () => {
    const part1 = Date.now().toString(35)
    const part2 = Date.now().toString(36).slice(2)
    return part1 + part2
}