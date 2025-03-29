export default (canvas) => {
    const CONSTS = {
        PREDICTION_BUFFER_MS: 100, // Allow client to be 100ms ahead

        inputCooldown: 100, // ms
        INTERPOLATION_AMOUNT: 0.2, // Lower = smoother but less responsive
        INTERPOLATION_DELAY: 100, // ms - buffer for smoother interpolation
        PLAYER_WIDTH: 50,
        PLAYER_HEIGHT: 100,
        MOVEMENT_SPEED: 5, // Pixels per frame
        FLOOR_HEIGHT: 40,
        JUMP_VELOCITY: -15, // Negative because y-axis increases downward
        GRAVITY: 0.8,
        MAX_HORIZONTAL_VELOCITY: 8, // Maximum horizontal speed
        AIR_RESISTANCE: 0, // How quickly velocity decreases in air
        GROUND_FRICTION: 0, // How quickly velocity decreases on ground

        // Add these new constants for fighting mechanics
        PUNCH_DURATION: 300, // milliseconds
        KICK_DURATION: 400, // milliseconds
        ARM_WIDTH: 30, // pixels
        ARM_HEIGHT: 10, // pixels
        ARM_Y_OFFSET: 30, // 70px from top of 100px character
        LEG_WIDTH: 35, // pixels
        LEG_HEIGHT: 8, // pixels
        LEG_Y_OFFSET: 70, // Position from top of character
    };
    if (canvas) {
        CONSTS.FLOOR_Y = canvas.height - CONSTS.FLOOR_HEIGHT;
    }

    return CONSTS;
};
