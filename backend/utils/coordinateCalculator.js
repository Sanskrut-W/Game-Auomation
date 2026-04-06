function getCenter(x1, y1, x2, y2) {
    return {
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2)
    };
}
module.exports = { getCenter };
