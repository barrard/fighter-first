// routes/users.js
import express from "express";
// import createDOMPurify from "dompurify";
// import { JSDOM } from "jsdom";
import xss from "xss";
// const window = new JSDOM("").window;
// const DOMPurify = createDOMPurify(window);

const router = express.Router();

router.get("/current", (req, res) => {
    const encodedUsername = req.cookies.username;
    const username = encodedUsername ? decodeURIComponent(encodedUsername) : null;
    res.json({ username: username });
});

router.post("/set-name", (req, res) => {
    const { username } = req.body;
    // Sanitize the username with xss
    // const sanitizedUsername = xss(username);
    const encodedUsername = encodeURIComponent(username);

    // Set the cookie with the username
    res.cookie("username", encodedUsername, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    });

    res.json({ success: true });
});

export default router;
