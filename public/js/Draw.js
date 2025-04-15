// import CONSTS from "/js/contants.js";
import CONSTS from "http://localhost:3000/js/contants.js";

const {
    PREDICTION_BUFFER_MS,
    inputCooldown,
    INTERPOLATION_AMOUNT,
    INTERPOLATION_DELAY,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    MOVEMENT_SPEED,
    FLOOR_HEIGHT,
    JUMP_VELOCITY,
    GRAVITY,
    AIR_RESISTANCE,
    GROUND_FRICTION,
    PUNCH_DURATION,
    KICK_DURATION,
    ARM_WIDTH,
    ARM_HEIGHT,
    ARM_Y_OFFSET,
    LEG_WIDTH,
    LEG_HEIGHT,
    LEG_Y_OFFSET,
} = CONSTS();

export function DrawPlayer(ctx, player) {
    // Draw player rectangle
    ctx.fillStyle = player.color || "#FF0000"; // Default to red if no color
    ctx.fillRect(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
}

export function DrawPunch(ctx, player) {
    ctx.fillStyle = "#FF9999"; // Lighter color for the arm

    // Position arm based on facing direction
    if (player.facing === "right") {
        ctx.fillRect(
            player.x + PLAYER_WIDTH, // Start at right edge of player
            player.y + ARM_Y_OFFSET, // Position at 70px from top (30px from top of 100px character)
            ARM_WIDTH,
            ARM_HEIGHT
        );
    } else {
        ctx.fillRect(
            player.x - ARM_WIDTH, // Start at left edge and extend left
            player.y + ARM_Y_OFFSET,
            ARM_WIDTH,
            ARM_HEIGHT
        );
    }
}

export function DrawInitialScene(canvas, ctx) {
    const { FLOOR_HEIGHT, FLOOR_Y } = CONSTS(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw floor
    ctx.fillStyle = "#8B4513"; // Brown floor
    ctx.fillRect(0, FLOOR_Y, canvas.width, FLOOR_HEIGHT);

    // Draw grass on top of floor
    ctx.fillStyle = "#228B22"; // Forest green
    ctx.fillRect(0, FLOOR_Y, canvas.width, 5);

    // Draw loading text
    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Connecting to server...", canvas.width / 2, canvas.height / 2);
}

export function DrawKick(ctx, player) {
    ctx.fillStyle = "#FF9999"; // Lighter color for the leg

    // Position leg based on facing direction
    if (player.facing === "right") {
        ctx.fillRect(
            player.x + PLAYER_WIDTH, // Start at right edge of player
            player.y + LEG_Y_OFFSET, // Position at lower part of character
            LEG_WIDTH,
            LEG_HEIGHT
        );
    } else {
        ctx.fillRect(
            player.x - LEG_WIDTH, // Start at left edge and extend left
            player.y + LEG_Y_OFFSET,
            LEG_WIDTH,
            LEG_HEIGHT
        );
    }
}

export function DrawFaceDirection(ctx, player) {
    ctx.fillStyle = "black";
    const midY = player.y + PLAYER_HEIGHT / 2;

    if (player.facing === "right") {
        // Draw triangle pointing right
        ctx.beginPath();
        ctx.moveTo(player.x + PLAYER_WIDTH, midY);
        ctx.lineTo(player.x + PLAYER_WIDTH - 15, midY - 10);
        ctx.lineTo(player.x + PLAYER_WIDTH - 15, midY + 10);
        ctx.closePath();
        ctx.fill();
    } else {
        // facing left
        // Draw triangle pointing left
        ctx.beginPath();
        ctx.moveTo(player.x, midY);
        ctx.lineTo(player.x + 15, midY - 10);
        ctx.lineTo(player.x + 15, midY + 10);
        ctx.closePath();
        ctx.fill();
    }

    // Draw eyes to indicate facing direction
    ctx.fillStyle = "white";
    if (player.facing === "right") {
        // Right-facing eyes
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_WIDTH - 15, player.y + 30, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_WIDTH - 30, player.y + 30, 5, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_WIDTH - 13, player.y + 30, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_WIDTH - 28, player.y + 30, 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Left-facing eyes
        ctx.beginPath();
        ctx.arc(player.x + 15, player.y + 30, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(player.x + 30, player.y + 30, 5, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(player.x + 13, player.y + 30, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(player.x + 28, player.y + 30, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function DrawYou(ctx, player) {
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.strokeRect(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);

    // Add "YOU" label
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("YOU", player.x + PLAYER_WIDTH / 2, player.y - 10);
}

export function DrawFloor(ctx, canvas) {
    let FLOOR_Y = canvas.height - FLOOR_HEIGHT;

    ctx.fillStyle = "#8B4513"; // Brown floor
    ctx.fillRect(0, FLOOR_Y, canvas.width, FLOOR_HEIGHT);

    // Draw grass on top of floor
    ctx.fillStyle = "#228B22"; // Forest green
    ctx.fillRect(0, FLOOR_Y, canvas.width, 5);
}
