const CERT_CONFIG = {
    name: {
        x: 0.494,      // 50% width (Center)
        y: 0.69,    // 70.5% height
        fontSize: "bold 80px arial",
        color: "#000"
    },
    score: {
        x: 0.5,
        y: 0.745,    // 77.5% height
        fontSize: "bold 80px arial",
        color: "#000"
    },
    date: {
        x: 0.583,
        y: 0.796,    // 84.5% height
        fontSize: "bold 80px arial",
        color: "#000"
    },
    debug_collision: false // Set to true to show red collision boxes
};

const COLLISION_CONFIG = {
    player: { width: 0.49, height: 0.49 },
    egg: { width: 0.5, height: 0.8 },
    item: { width: 0.6, height: 0.6 }
};
