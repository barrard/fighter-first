const BASE_STATS = {
    width: 50,
    height: 100,
    movementSpeed: 5,
    jumpVelocity: -15,
    punchDuration: 300,
    kickDuration: 400,
    // Combat stats
    health: 100,
    punchDamage: 10,
    kickDamage: 15,
    punchKnockback: 8,
    kickKnockback: 12,
    punchActiveStart: 3,  // frames after attack starts when hitbox becomes active
    punchActiveEnd: 8,
    kickActiveStart: 5,
    kickActiveEnd: 12,
};

const createCharacter = (id, name, color, stats = {}) => ({
    id,
    name,
    color,
    stats: { ...BASE_STATS, ...stats },
});

const CHARACTERS = [
    createCharacter(1, "Knight", "#3b82f6", {
        width: 74, height: 90, movementSpeed: 0.5, jumpVelocity: -7,
        health: 120, punchDamage: 12, kickDamage: 18, punchKnockback: 10, kickKnockback: 15
    }),
    createCharacter(2, "Mage", "#8b5cf6", {
        width: 28, height: 125, movementSpeed: 14.5, jumpVelocity: -27,
        health: 70, punchDamage: 8, kickDamage: 12
    }),
    createCharacter(3, "Archer", "#22c55e", { width: 46, height: 102, movementSpeed: 5.5 }),
    createCharacter(4, "Paladin", "#eab308", {
        width: 58, height: 115, movementSpeed: 4.2, punchDuration: 350,
        health: 110, punchDamage: 11, kickDamage: 16, jumpVelocity: -13, punchKnockback: 9, kickKnockback: 14
    }),
    createCharacter(5, "Rogue", "#6b7280", {
        width: 45, height: 98, movementSpeed: 6,jumpVelocity: -20,
        punchDamage: 8, kickDamage: 12, punchActiveStart: 2, punchActiveEnd: 6
    }),
    createCharacter(6, "Berserker", "#ef4444", {jumpVelocity: -12,
        width: 60, height: 118, movementSpeed: 4.3, kickDuration: 450,
        health: 90, punchDamage: 14, kickDamage: 20, punchKnockback: 12, kickKnockback: 18
    }),
    createCharacter(7, "Druid", "#10b981", { width: 52, height: 108, jumpVelocity: -16 }),
    createCharacter(8, "Monk", "#f59e0b", {
        width: 48, height: 103, movementSpeed: 5.8,jumpVelocity: -19,
        punchDamage: 9, kickDamage: 13, punchActiveStart: 2, kickActiveStart: 3
    }),
    createCharacter(9, "Ninja", "#1e293b", {
        width: 44, height: 100, movementSpeed: 6.2, jumpVelocity: -18,
        punchDamage: 7, kickDamage: 11, punchActiveStart: 1, punchActiveEnd: 5
    }),
    createCharacter(10, "Samurai", "#f43f5e", {
        width: 55, height: 112, movementSpeed: 4.8,
        punchDamage: 13, kickDamage: 17, punchKnockback: 6, kickKnockback: 10, jumpVelocity: -14
    }),
    createCharacter(11, "Witch", "#8b5cf6", { width: 47, height: 104, jumpVelocity: -17, movementSpeed: 5.3 }),
    createCharacter(12, "Pirate", "#06b6d4", { width: 53, height: 109, movementSpeed: 5.1, jumpVelocity: -15 }),
];

export default CHARACTERS;
