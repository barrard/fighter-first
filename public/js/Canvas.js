import {
    DrawPlayer,
    DrawPunch,
    DrawKick,
    DrawFaceDirection,
    DrawYou,
    DrawFloor,
    DrawInitialScene,
} from "http://localhost:3000/js/Draw.js";
import CONSTS from "http://localhost:3000/js/contants.js";
export default class Canvas {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");

        // Game elements
        this.status = document.getElementById("status");

        DrawInitialScene(this.canvas, this.ctx);
        this.init();
    }

    init() {
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
            MAX_HORIZONTAL_VELOCITY,
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
        } = CONSTS(this.canvas);
        this.FLOOR_HEIGHT = FLOOR_HEIGHT;
        // Initial resize and event listener

        this.resizeCanvas();
        window.addEventListener("resize", this.resizeCanvas);
    }

    // Set canvas to full screen
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Update floor position after resize
        this.FLOOR_Y = this.canvas.height - this.FLOOR_HEIGHT;

        // Debug
        console.log(`Canvas resized: ${this.canvas.width}x${this.canvas.height}, Floor Y: ${this.FLOOR_Y}`);
    }
}
