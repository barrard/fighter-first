const BASE_STATS = {
    width: 50,
    height: 100,
    movementSpeed: 5,
    jumpVelocity: -15,
    punchDuration: 300,
    kickDuration: 400,
};

const createCharacter = (id, name, color, stats = {}) => ({
    id,
    name,
    color,
    stats: { ...BASE_STATS, ...stats },
});

const CHARACTERS = [
    createCharacter(1, "Knight", "#3b82f6", { width: 74, height: 90, movementSpeed: 0.5, jumpVelocity: -7 }),
    createCharacter(2, "Mage", "#8b5cf6", { width: 28, height: 125, movementSpeed: 14.5, jumpVelocity: -27 }),
    createCharacter(3, "Archer", "#22c55e", { width: 46, height: 102, movementSpeed: 5.5 }),
    createCharacter(4, "Paladin", "#eab308", { width: 58, height: 115, movementSpeed: 4.2, punchDuration: 350 }),
    createCharacter(5, "Rogue", "#6b7280", { width: 45, height: 98, movementSpeed: 6 }),
    createCharacter(6, "Berserker", "#ef4444", { width: 60, height: 118, movementSpeed: 4.3, kickDuration: 450 }),
    createCharacter(7, "Druid", "#10b981", { width: 52, height: 108, jumpVelocity: -16 }),
    createCharacter(8, "Monk", "#f59e0b", { width: 48, height: 103, movementSpeed: 5.8 }),
    createCharacter(9, "Ninja", "#1e293b", { width: 44, height: 100, movementSpeed: 6.2, jumpVelocity: -18 }),
    createCharacter(10, "Samurai", "#f43f5e", { width: 55, height: 112, movementSpeed: 4.8 }),
    createCharacter(11, "Witch", "#8b5cf6", { width: 47, height: 104, jumpVelocity: -17 }),
    createCharacter(12, "Pirate", "#06b6d4", { width: 53, height: 109, movementSpeed: 5.1 }),
];

export default CHARACTERS;
